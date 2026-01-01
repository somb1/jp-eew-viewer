import { defineEventHandler, createError } from "h3";

// =========================================================================================
// 1. 타입 인터페이스 정의
// =========================================================================================

/**
 * K-moni 'latest.json' 응답 구조
 * - 현재 서버에서 제공하는 가장 최신 데이터의 기준 시각 정보를 담고 있습니다.
 */
interface LatestResponse {
	security: {
		realm: string;
		hash: string;
	};
	latest_time: string; // 최신 데이터 기준 시각 (YYYY/MM/DD HH:mm:ss)
	request_time: string; // 요청 시각
	result: {
		status: string;
		message: string;
	};
}

// =========================================================================================
// 2. 메인 핸들러
// =========================================================================================

export default defineEventHandler(async (event): Promise<LatestResponse> => {
	// -------------------------------------------------------------------------------------
	// 2.1. 요청 설정 (Target URL & Params)
	// -------------------------------------------------------------------------------------

	// K-moni의 최신 시각 정보 엔드포인트
	const targetUrl =
		"http://www.kmoni.bosai.go.jp/webservice/server/pros/latest.json";

	// 캐시 방지(Cache Busting)를 위한 타임스탬프
	const timestamp = Date.now();

	// -------------------------------------------------------------------------------------
	// 2.2. 프록시 요청 실행
	// -------------------------------------------------------------------------------------
	try {
		// K-moni 서버로 직접 요청 (CORS 우회 목적)
		const response = await $fetch<LatestResponse>(targetUrl, {
			method: "GET",
			// 쿼리 파라미터로 타임스탬프를 보내 브라우저나 CDN 캐싱을 방지함
			query: {
				_: timestamp,
			},
			// 브라우저인 척 위장하기 위한 헤더 설정
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

		return response;
	} catch (error: any) {
		// -------------------------------------------------------------------------------------
		// 2.3. 에러 처리
		// -------------------------------------------------------------------------------------
		console.error("K-moni Proxy Error:", error);

		// H3 에러 객체를 생성하여 클라이언트에 적절한 상태 코드와 메시지 전달
		throw createError({
			statusCode: error.response?.status || 500,
			statusMessage:
				error.response?.statusText || "Internal Server Error",
			message: "Failed to fetch data from K-moni",
		});
	}
});
