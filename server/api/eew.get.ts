// server/api/eew.get.ts
import { defineEventHandler, getQuery, createError } from "h3";
import { defineCachedFunction } from "#imports"; // Nitro 캐싱 유틸리티
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

// 통합 응답 인터페이스
interface CombinedResponse {
	timestamp: string;
	eew: EEWResponse | null;
	points: {
		type: "FeatureCollection";
		features: any[];
	};
}

// -----------------------------------------------------------------------
// 1. EEW 데이터 캐싱 함수 (Time 기준)
// -----------------------------------------------------------------------
const getCachedEEW = defineCachedFunction(async (time: string) => {
	const eewUrl = `http://www.kmoni.bosai.go.jp/webservice/hypo/eew/${time}.json`;

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
		return null;
	}
}, {
	maxAge: 1,
	swr: true,
	name: 'kmoni-eew',
	getKey: (time: string) => `eew:${time}`
});

// -----------------------------------------------------------------------
// 2. [NEW] 관측소 포인트 데이터 캐싱 함수 (Time + Type + Source 기준)
// Jimp 이미지 처리가 무거우므로 캐싱 효과가 매우 큽니다.
// -----------------------------------------------------------------------
const getCachedPoints = defineCachedFunction(async (time: string, type: string, source: string) => {
	const dateDir = time.substring(0, 8);
	const fileType = `${type}_${source}`;
	const imgUrl = `http://www.kmoni.bosai.go.jp/data/map_img/RealTimeImg/${fileType}/${dateDir}/${time}.${fileType}.gif`;

	try {
		// 소스에 따른 관측소 데이터 선택 (s: 지표, b: 시추공)
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
}, {
	maxAge: 1, 
	swr: true, 
	name: 'kmoni-points',
	// [중요] 세 가지 변수가 모두 같아야 캐시 히트
	getKey: (time: string, type: string, source: string) => `points:${time}:${type}:${source}`
});


// -----------------------------------------------------------------------
// 메인 핸들러
// -----------------------------------------------------------------------
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
	// 병렬 실행: 둘 다 캐시된 함수를 호출
	// ---------------------------------------
	const [eewData, pointsData] = await Promise.all([
		getCachedEEW(time),                  // EEW 데이터 (Time 기준 캐시)
		getCachedPoints(time, type, source), // Points 데이터 (Time+Type+Source 기준 캐시)
	]);

	return {
		timestamp: time,
		eew: eewData,
		points: pointsData as any,
	};
});