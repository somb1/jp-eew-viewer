import { defineEventHandler, createError } from "h3";

interface LatestResponse {
	security: {
		realm: string;
		hash: string;
	};
	latest_time: string;
	request_time: string;
	result: {
		status: string;
		message: string;
	};
}

export default defineEventHandler(async (event): Promise<LatestResponse> => {
	const targetUrl =
		"http://www.kmoni.bosai.go.jp/webservice/server/pros/latest.json";

	const timestamp = Date.now();

	try {
		const response = await $fetch<LatestResponse>(targetUrl, {
			method: "GET",
			query: {
				_: timestamp,
			},
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
		console.error("K-moni Proxy Error:", error);

		throw createError({
			statusCode: error.response?.status || 500,
			statusMessage:
				error.response?.statusText || "Internal Server Error",
			message: "Failed to fetch data from K-moni",
		});
	}
});
