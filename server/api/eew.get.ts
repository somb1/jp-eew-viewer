import { defineEventHandler, getQuery, createError } from "h3";
import { Jimp } from "jimp";

// [정적 데이터] 관측소 좌표 매핑 파일 (JSON)
import stationsS from "~/assets/stations_surface.json"; // 지표 (Surface)
import stationsB from "~/assets/stations_borehole.json"; // 지중 (Borehole)

// =========================================================================================
// 1. 타입 인터페이스 정의
// =========================================================================================

/**
 * K-moni EEW API 응답 구조
 */
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

/**
 * 클라이언트로 반환할 통합 응답 구조
 */
interface CombinedResponse {
	timestamp: string;
	eew: EEWResponse | null;
	points: {
		type: "FeatureCollection";
		features: any[];
	};
}

// =========================================================================================
// 2. 메인 핸들러
// =========================================================================================

export default defineEventHandler(async (event): Promise<CombinedResponse> => {
	// -------------------------------------------------------------------------------------
	// 2.1. 파라미터 파싱 및 검증
	// -------------------------------------------------------------------------------------
	const query = getQuery(event);
	const time = query.time as string;
	const type = (query.type as string) || "acmap";
	const source = (query.source as string) || "s";

	if (!time || time.length !== 14) {
		throw createError({
			statusCode: 400,
			statusMessage: "Bad Request",
			message: "Time parameter is required (format: YYYYMMDDHHmmss)",
		});
	}

	// -------------------------------------------------------------------------------------
	// 2.2. URL 및 헤더 구성 (L-moni 지원 추가)
	// -------------------------------------------------------------------------------------

	// EEW JSON 데이터 URL (항상 K-moni 사용)
	const eewUrl = `http://www.kmoni.bosai.go.jp/webservice/hypo/eew/${time}.json`;

	// 장주기 데이터('abrsp'로 시작) 여부 확인
	const isLmoni = type.startsWith("abrsp");

	let imgUrl = "";
	let imgHost = "";
	let imgReferer = "";

	const dateDir = time.substring(0, 8);

	const fileType = `${type}_${source}`;

	if (isLmoni) {
		// [L-moni] 장주기 지진동계급 데이터
		imgUrl = `https://www.lmoni.bosai.go.jp/monitor/data/data/map_img/RealTimeImg/${fileType}/${dateDir}/${time}.${fileType}.gif`;
		imgHost = "www.lmoni.bosai.go.jp";
		imgReferer = "https://www.lmoni.bosai.go.jp/";
	} else {
		// [K-moni] 일반 실시간 진도 데이터
		imgUrl = `http://www.kmoni.bosai.go.jp/data/map_img/RealTimeImg/${fileType}/${dateDir}/${time}.${fileType}.gif`;
		imgHost = "www.kmoni.bosai.go.jp";
		imgReferer = "http://www.kmoni.bosai.go.jp/";
	}

	// 공통 헤더 (Host, Referer 제외)
	const baseHeaders = {
		"Accept-Encoding": "gzip, deflate",
		"Accept-Language": "ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7",
		Connection: "keep-alive",
		"User-Agent":
			"Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Safari/537.36",
	};

	// -------------------------------------------------------------------------------------
	// 2.3. 데이터 페칭 함수 정의
	// -------------------------------------------------------------------------------------

	/**
	 * (1) EEW 데이터 가져오기 (K-moni)
	 */
	const fetchEEW = async () => {
		try {
			return await $fetch<EEWResponse>(eewUrl, {
				method: "GET",
				headers: {
					...baseHeaders,
					Referer: "http://www.kmoni.bosai.go.jp/",
					Accept: "application/json, text/javascript, */*; q=0.01",
					"X-Requested-With": "XMLHttpRequest",
				},
			});
		} catch (error) {
			console.error("EEW Fetch Error:", error);
			return null;
		}
	};

	/**
	 * (2) 이미지 가져오기 및 GeoJSON 변환
	 */
	const fetchPoints = async () => {
		try {
			// 요청된 소스 타입에 따라 관측소 목록 선택
			// (L-moni는 주로 지표 데이터이지만, 로직상 사용자가 선택한 소스 좌표에 매핑합니다)
			const stations = source === "b" ? stationsB : stationsS;

			const imageBuffer = await $fetch<ArrayBuffer>(imgUrl, {
				responseType: "arrayBuffer",
				headers: {
					...baseHeaders,
					Referer: imgReferer,
					Host: imgHost,
					Accept: "image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8",
				},
			});

			const image = await Jimp.read(Buffer.from(imageBuffer));

			const features = stations
				.filter((s: any) => s.x !== 0 && s.y !== 0)
				.reduce((acc: any[], s: any) => {
					const colorInt = image.getPixelColor(s.x, s.y);
					const a = colorInt & 0xff;
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
			return { type: "FeatureCollection", features: [] };
		}
	};

	// -------------------------------------------------------------------------------------
	// 2.4. 병렬 실행 및 응답 반환
	// -------------------------------------------------------------------------------------

	const [eewData, pointsData] = await Promise.all([
		fetchEEW(),
		fetchPoints(),
	]);

	return {
		timestamp: time,
		eew: eewData,
		points: pointsData as any,
	};
});
