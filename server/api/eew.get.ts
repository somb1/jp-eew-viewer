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
 * - 외부 API의 필드명을 그대로 따릅니다.
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
	magunitude: string; // API 오타 유지 (magnitude가 아님)
	report_num: string;
	request_hypo_type: string;
	report_id: string;
}

/**
 * 클라이언트로 반환할 통합 응답 구조
 */
interface CombinedResponse {
	timestamp: string; // 요청 기준 시간 (YYYYMMDDHHmmss)
	eew: EEWResponse | null; // 지진 조기 경보 데이터
	points: {
		// 관측소 진도 색상 데이터 (GeoJSON)
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
	const time = query.time as string; // 필수: 기준 시간
	const type = (query.type as string) || "acmap"; // 옵션: 데이터 타입 (acmap=PGA 등)
	const source = (query.source as string) || "s"; // 옵션: 데이터 소스 (s=지표, b=지중)

	// 시간 파라미터 유효성 검사 (14자리 YYYYMMDDHHmmss)
	if (!time || time.length !== 14) {
		throw createError({
			statusCode: 400,
			statusMessage: "Bad Request",
			message: "Time parameter is required (format: YYYYMMDDHHmmss)",
		});
	}

	// -------------------------------------------------------------------------------------
	// 2.2. 외부 API URL 구성
	// -------------------------------------------------------------------------------------

	// EEW JSON 데이터 URL
	const eewUrl = `http://www.kmoni.bosai.go.jp/webservice/hypo/eew/${time}.json`;

	// 실시간 진도 이미지(GIF) URL 구성
	// 구조: .../RealTimeImg/{타입}_{소스}/{YYYYMMDD}/{YYYYMMDDHHmmss}.{타입}_{소스}.gif
	const dateDir = time.substring(0, 8);
	const fileType = `${type}_${source}`;
	const imgUrl = `http://www.kmoni.bosai.go.jp/data/map_img/RealTimeImg/${fileType}/${dateDir}/${time}.${fileType}.gif`;

	// 공통 헤더 설정 (브라우저 위장)
	const commonHeaders = {
		"Accept-Encoding": "gzip, deflate",
		"Accept-Language": "ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7",
		Connection: "keep-alive",
		Referer: "http://www.kmoni.bosai.go.jp/",
		"User-Agent":
			"Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Safari/537.36",
	};

	// -------------------------------------------------------------------------------------
	// 2.3. 데이터 페칭 함수 정의 (클로저)
	// -------------------------------------------------------------------------------------

	/**
	 * (1) EEW 데이터 가져오기
	 */
	const fetchEEW = async () => {
		try {
			return await $fetch<EEWResponse>(eewUrl, {
				method: "GET",
				headers: {
					...commonHeaders,
					Accept: "application/json, text/javascript, */*; q=0.01",
					"X-Requested-With": "XMLHttpRequest",
				},
			});
		} catch (error) {
			console.error("EEW Fetch Error:", error);
			return null; // 실패해도 전체 로직을 중단하지 않고 null 반환
		}
	};

	/**
	 * (2) 이미지 가져오기 및 GeoJSON 변환 (핵심 로직)
	 * - 이미지를 다운로드 받아 픽셀 색상을 분석하고,
	 * - 미리 정의된 관측소 좌표(JSON)와 매칭하여 GeoJSON Point를 생성합니다.
	 */
	const fetchPoints = async () => {
		try {
			// 요청된 소스 타입에 따라 관측소 목록 선택
			const stations = source === "b" ? stationsB : stationsS;

			// 이미지 데이터를 ArrayBuffer로 가져옴
			const imageBuffer = await $fetch<ArrayBuffer>(imgUrl, {
				responseType: "arrayBuffer",
				headers: {
					...commonHeaders,
					Accept: "image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8",
					Host: "www.kmoni.bosai.go.jp",
				},
			});

			// Jimp 라이브러리로 이미지 버퍼 파싱
			const image = await Jimp.read(Buffer.from(imageBuffer));

			// 관측소 좌표 데이터를 순회하며 이미지 픽셀 색상 추출
			const features = stations
				.filter((s: any) => s.x !== 0 && s.y !== 0) // 좌표가 유효한 관측소만
				.reduce((acc: any[], s: any) => {
					// 해당 관측소의 이미지 상 좌표(x, y)의 색상값을 가져옴 (Int32)
					const colorInt = image.getPixelColor(s.x, s.y);

					// Alpha 값 확인 (0이면 투명 = 데이터 없음)
					const a = colorInt & 0xff;
					if (a === 0) return acc;

					// 비트 연산으로 RGB 값 추출
					const r = (colorInt >>> 24) & 0xff;
					const g = (colorInt >>> 16) & 0xff;
					const b = (colorInt >>> 8) & 0xff;

					// RGB를 Hex 문자열(#RRGGBB)로 변환
					const hexColor =
						"#" +
						r.toString(16).padStart(2, "0") +
						g.toString(16).padStart(2, "0") +
						b.toString(16).padStart(2, "0");

					// GeoJSON Feature 생성 및 추가
					acc.push({
						type: "Feature",
						geometry: {
							type: "Point",
							coordinates: [s.lon, s.lat],
						},
						properties: {
							code: s.code,
							name: s.name,
							color: hexColor, // 지도 시각화에 사용될 색상
						},
					});
					return acc;
				}, []);

			return { type: "FeatureCollection", features };
		} catch (error: any) {
			// 이미지가 없거나(404) 처리 실패 시, 에러 대신 빈 GeoJSON 반환 (지도 표시에 문제 없도록)
			return { type: "FeatureCollection", features: [] };
		}
	};

	// -------------------------------------------------------------------------------------
	// 2.4. 병렬 실행 및 응답 반환
	// -------------------------------------------------------------------------------------

	// 두 요청을 병렬로 수행하여 응답 대기 시간 최소화
	const [eewData, pointsData] = await Promise.all([
		fetchEEW(),
		fetchPoints(),
	]);

	// 통합된 결과 반환
	return {
		timestamp: time,
		eew: eewData,
		points: pointsData as any,
	};
});
