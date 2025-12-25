import { defineEventHandler, getQuery, createError } from "h3";
import { Jimp } from "jimp"; // [중요] 중괄호 {}를 사용하여 Named Import로 변경
import stations from "~/assets/stations_base1.json"; // 관측소 좌표 데이터

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
	const type = (query.type as string) || "jma";
	const source = (query.source as string) || "s";

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

	// 2. K-moni 이미지 URL 생성
	const dateDir = time.substring(0, 8);
	const fileType = `${type}_${source}`;
	const targetUrl = `http://www.kmoni.bosai.go.jp/data/map_img/RealTimeImg/${fileType}/${dateDir}/${time}.${fileType}.gif`;

	try {
		// 3. 이미지 다운로드 (ArrayBuffer로 받음)
		const imageBuffer = await $fetch<ArrayBuffer>(targetUrl, {
			responseType: "arrayBuffer",
			headers: {
				Referer: "http://www.kmoni.bosai.go.jp/",
				"User-Agent": "Mozilla/5.0",
			},
		});

		// 4. Jimp로 이미지 로드
		const image = await Jimp.read(Buffer.from(imageBuffer));

		// 5. 관측소 리스트를 순회하며 색상 추출
		const features = stations
			.filter((s: any) => s.x !== 0 && s.y !== 0) // 좌표가 0인(매핑 안 된) 관측소 무시
			.map((s: any) => {
				// (1) 해당 픽셀의 색상값(Int) 가져오기
				const colorInt = image.getPixelColor(s.x, s.y);

				// (2) 색상값을 CSS Hex String (#RRGGBB)으로 변환
				// Jimp 색상값은 0xRRGGBBAA 형태입니다.
				// 비트 연산으로 R, G, B 추출
				const r = (colorInt >>> 24) & 0xff;
				const g = (colorInt >>> 16) & 0xff;
				const b = (colorInt >>> 8) & 0xff;

				// #RRGGBB 형식으로 변환 (padStart로 0 채움)
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
		console.error(`Realtime Points Error (${targetUrl}):`, error);

		// 이미지 다운로드 실패(404 등) 시 빈 데이터라도 반환해야 클라이언트가 안 멈춤
		// 에러를 던지지 않고 빈 배열 반환 (선택 사항)
		if (error.response?.status === 404) {
			return { type: "FeatureCollection", features: [] };
		}

		throw createError({
			statusCode: 500,
			message: "Failed to process realtime image",
		});
	}
});
