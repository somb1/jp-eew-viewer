import { defineEventHandler, getQuery, createError } from "h3";

interface EEWResponse {
	result: {
		status: string;
		message: string;
		is_auth: boolean;
	};
	report_time: string;
	region_code: string;
	request_time: string;
	region_name: string;
	longitude: string;
	is_cancel: string;
	depth: string;
	calcintensity: string;
	is_final: string;
	is_training: string;
	latitude: string;
	origin_time: string;
	security: {
		realm: string;
		hash: string;
	};
	magunitude: string;
	report_num: string;
	request_hypo_type: string;
	report_id: string;
}

export default defineEventHandler(async (event): Promise<EEWResponse> => {
	const query = getQuery(event);
	const time = query.time as string;

	if (!time) {
		throw createError({
			statusCode: 400,
			statusMessage: "Bad Request",
			message: "Time parameter is required (format: YYYYMMDDHHmmss)",
		});
	}

	const targetUrl = `http://www.kmoni.bosai.go.jp/webservice/hypo/eew/${time}.json`;

	try {
		const response = await $fetch<EEWResponse>(targetUrl, {
			method: "GET",
			headers: {
				Accept: "application/json, text/javascript, */*; q=0.01", // JSON 우선
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
		console.error("K-moni EEW Proxy Error:", error);

		// 404 에러 등 처리 (데이터가 없는 시간대일 경우 등)
		throw createError({
			statusCode: error.response?.status || 500,
			statusMessage:
				error.response?.statusText || "Internal Server Error",
			message: "Failed to fetch EEW data",
		});
	}
});
