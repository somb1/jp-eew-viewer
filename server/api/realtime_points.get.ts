import { defineEventHandler, getQuery, createError } from "h3";
import { Jimp } from "jimp";

// source에 따라 다른 관측소 데이터를 사용하기 위해 각각 import
// 지표(surface)용 데이터
import stationsS from "~/assets/stations_surface.json";
// 지중(borehole)용 데이터
import stationsB from "~/assets/stations_borehole.json";

// 허용된 파라미터 검증용
const VALID_TYPES = [
    "jma",
    "acmap",
    "vcmap",
    "dcmap",
    "rsp0125",
    "rsp0250",
    "rsp0500",
    "rsp1000",
    "rsp2000",
    "rsp4000",
];
const VALID_SOURCES = ["s", "b"];

export default defineEventHandler(async (event) => {
    const query = getQuery(event);

    const time = query.time as string;
    const type = (query.type as string);
    const source = (query.source as string);

    // 1. 파라미터 유효성 검사
    if (!time || time.length !== 14) {
        throw createError({
            statusCode: 400,
            message: "Invalid time format (YYYYMMDDHHmmss)",
        });
    }
    if (!VALID_TYPES.includes(type) || !VALID_SOURCES.includes(source)) {
        throw createError({
            statusCode: 400,
            message: `Invalid type or source. type: ${type}, source: ${source}`,
        });
    }

    // 소스(s/b)에 따라 사용할 관측소 리스트 선택
    // 파일이 없을 경우를 대비해 기본값(stationsS)을 설정하거나 예외처리하는 것이 좋지만,
    // 여기서는 요청하신 로직대로 분기합니다.
    const stations = source === "b" ? stationsB : stationsS;

    // 2. K-moni 이미지 URL 생성
    const dateDir = time.substring(0, 8);
    const fileType = `${type}_${source}`;
    const targetUrl = `http://www.kmoni.bosai.go.jp/data/map_img/RealTimeImg/${fileType}/${dateDir}/${time}.${fileType}.gif`;

    try {
        // 3. 이미지 다운로드 (ArrayBuffer로 받음)
        // [수정] 원본 요청 헤더 적용
        const imageBuffer = await $fetch<ArrayBuffer>(targetUrl, {
            responseType: "arrayBuffer",
            headers: {
                "Accept": "image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8",
                "Accept-Encoding": "gzip, deflate",
                "Accept-Language": "ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7",
                "Connection": "keep-alive",
                "Host": "www.kmoni.bosai.go.jp",
                "Referer": "http://www.kmoni.bosai.go.jp/",
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Safari/537.36",
            },
        });

        // 4. Jimp로 이미지 로드
        const image = await Jimp.read(Buffer.from(imageBuffer));

        // 5. 선택된 관측소 리스트를 순회하며 색상 추출
        const features = stations
            .filter((s: any) => s.x !== 0 && s.y !== 0) // 좌표가 0인(매핑 안 된) 관측소 무시
            .map((s: any) => {
                // (1) 해당 픽셀의 색상값(Int) 가져오기
                const colorInt = image.getPixelColor(s.x, s.y);

                // (2) 색상값을 CSS Hex String (#RRGGBB)으로 변환
                const r = (colorInt >>> 24) & 0xff;
                const g = (colorInt >>> 16) & 0xff;
                const b = (colorInt >>> 8) & 0xff;

                const hexColor =
                    "#" +
                    r.toString(16).padStart(2, "0") +
                    g.toString(16).padStart(2, "0") +
                    b.toString(16).padStart(2, "0");

                // (3) GeoJSON Feature 생성
                return {
                    type: "Feature",
                    geometry: {
                        type: "Point",
                        coordinates: [s.lon, s.lat], // GeoJSON은 [lng, lat] 순서
                    },
                    properties: {
                        code: s.code,
                        name: s.name,
                        color: hexColor,
                    },
                };
            });

        // 6. 결과 반환 (GeoJSON FeatureCollection)
        return {
            type: "FeatureCollection",
            features: features,
        };
    } catch (error: any) {
        // console.error(`Realtime Points Error (${targetUrl}):`, error);

        // 이미지 다운로드 실패(404 등) 시 빈 데이터 반환하여 클라이언트 중단 방지
        if (error.response?.status === 404) {
            return { type: "FeatureCollection", features: [] };
        }

        throw createError({
            statusCode: 500,
            message: "Failed to process realtime image",
        });
    }
});