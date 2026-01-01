import { defineEventHandler, getQuery, createError } from "h3";
import { Jimp } from "jimp";

// 관측소 데이터 import
import stationsS from "~/assets/stations_surface.json";
import stationsB from "~/assets/stations_borehole.json";

// 기존 EEW 응답 인터페이스
interface EEWResponse {
	result: { status: string; message: string; is_auth: boolean };
	report_time: string;
	region_code: string;
	request_time: string;
	region_name: string;
	longitude: string;
	is_cancel: boolean;
	depth: string;
	calcintensity: string;
	is_final: boolean;
	is_training: boolean;
	latitude: string;
	origin_time: string;
	security: { realm: string; hash: string };
	magunitude: string;
	report_num: string;
	request_hypo_type: string;
	report_id: string;
}

// [수정] 통합 응답 인터페이스: timestamp 필드 추가
interface CombinedResponse {
	timestamp: string; // 클라이언트가 요청한 시간(YYYYMMDDHHmmss)
	eew: EEWResponse | null;
	points: {
		type: "FeatureCollection";
		features: any[];
	};
}

export default defineEventHandler(async (event): Promise<CombinedResponse> => {
	const query = getQuery(event);
	const time = query.time as string;

	// 이미지 처리용 파라미터 (없으면 기본값 설정)
	const type = (query.type as string) || "acmap";
	const source = (query.source as string) || "s";

	// 필수 파라미터 검증
	if (!time || time.length !== 14) {
		throw createError({
			statusCode: 400,
			statusMessage: "Bad Request",
			message: "Time parameter is required (format: YYYYMMDDHHmmss)",
		});
	}

	// ---------------------------------------
	// 1. URL 준비
	// ---------------------------------------
	const eewUrl = `http://www.kmoni.bosai.go.jp/webservice/hypo/eew/${time}.json`;

	const dateDir = time.substring(0, 8);
	const fileType = `${type}_${source}`;
	const imgUrl = `http://www.kmoni.bosai.go.jp/data/map_img/RealTimeImg/${fileType}/${dateDir}/${time}.${fileType}.gif`;

	// ---------------------------------------
	// 2. 병렬 데이터 요청 함수 정의
	// ---------------------------------------

	// (1) EEW 데이터 가져오기
	const fetchEEW = async () => {
		try {
			return await $fetch<EEWResponse>(eewUrl, {
				method: "GET",
				headers: {
					Accept: "application/json, text/javascript, */*; q=0.01",
					"Accept-Encoding": "gzip, deflate",
					"Accept-Language": "ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7",
					Connection: "keep-alive",
					Referer: "http://www.kmoni.bosai.go.jp/",
					"User-Agent":
						"Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Safari/537.36",
					"X-Requested-With": "XMLHttpRequest",
				},
			});
		} catch (error) {
			console.error("EEW Fetch Error:", error);
			return null; // 실패 시 null 반환하여 전체 요청이 터지지 않게 함
		}
	};

	// (2) 이미지 가져오기 및 GeoJSON 변환
	const fetchPoints = async () => {
		try {
			// 소스에 따른 관측소 선택 (s: 지표, b: 시추공)
			const stations = source === "b" ? stationsB : stationsS;

			const imageBuffer = await $fetch<ArrayBuffer>(imgUrl, {
				responseType: "arrayBuffer",
				headers: {
					Accept: "image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8",
					"Accept-Encoding": "gzip, deflate",
					"Accept-Language": "ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7",
					Connection: "keep-alive",
					Host: "www.kmoni.bosai.go.jp",
					Referer: "http://www.kmoni.bosai.go.jp/",
					"User-Agent":
						"Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Safari/537.36",
				},
			});

			// Jimp로 이미지 파싱
			const image = await Jimp.read(Buffer.from(imageBuffer));

			// 관측소 좌표와 픽셀 매칭
			const features = stations
				.filter((s: any) => s.x !== 0 && s.y !== 0)
				.reduce((acc: any[], s: any) => {
					const colorInt = image.getPixelColor(s.x, s.y);
					const a = colorInt & 0xff;

					// 투명(데이터 없음)이면 스킵
					if (a === 0) return acc;

					const r = (colorInt >>> 24) & 0xff;
					const g = (colorInt >>> 16) & 0xff;
					const b = (colorInt >>> 8) & 0xff;

					const hexColor =
						"#" +
						r.toString(16).padStart(2, "0") +
						g.toString(16).padStart(2, "0") +
						b.toString(16).padStart(2, "0");

					acc.push({
						type: "Feature",
						geometry: {
							type: "Point",
							coordinates: [s.lon, s.lat],
						},
						properties: {
							code: s.code,
							name: s.name,
							color: hexColor,
						},
					});
					return acc;
				}, []);

			return { type: "FeatureCollection", features };
		} catch (error: any) {
			// 이미지가 없거나(404) 처리 실패 시 빈 GeoJSON 반환
			return { type: "FeatureCollection", features: [] };
		}
	};

	// ---------------------------------------
	// 3. 병렬 실행 및 응답 통합
	// ---------------------------------------
	const [eewData, pointsData] = await Promise.all([
		fetchEEW(),
		fetchPoints(),
	]);

	// [수정] timestamp 필드에 요청받은 time을 포함하여 반환
	return {
		timestamp: time,
		eew: eewData,
		points: pointsData as any,
	};
});
