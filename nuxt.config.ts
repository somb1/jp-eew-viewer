// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
	compatibilityDate: "2025-07-15",
	devtools: { enabled: true },
	modules: ["@nuxt/ui", "@vueuse/nuxt", "@vite-pwa/nuxt"],
	css: ["~/assets/css/main.css", "maplibre-gl/dist/maplibre-gl.css"],
	routeRules: {
        // [수정] headers 직접 설정 대신 swr 옵션 사용 (Vercel 최적화)
        // 이미 내부 코드(eew.get.ts)에서 K-moni 요청을 캐싱하고 있으므로,
        // 여기서는 '완성된 응답'을 Vercel 엣지에서 얼마나 잡고 있을지 설정합니다.
        "/api/eew": { 
            // 60초 동안 캐시 유지 (Time 값이 고정된 URL이므로 길게 잡아도 안전)
            // 에러 응답이 영구 캐싱되는 것을 막기 위해 1시간(3600)보다는 짧게 잡는 것을 권장합니다.
            swr: 60 
        },

        // [삭제 권장] 로직이 /api/eew로 통합되었으므로 더 이상 사용하지 않는다면 제거
        // "/api/realtime_points": { swr: 3600 },

        // [수정] 최신 시간 조회 (/api/latest)
        "/api/latest": { 
            // Vercel(Server) 측에서는 1초간 캐시 (ISR)
            swr: 1, 
            // 클라이언트(Browser) 측에서는 캐시하지 않음 (항상 서버에 물어보게 함)
            cache: { maxAge: 0 } 
        },
    },
	pwa: {
		manifest: {
			name: "Japan EEW Viewer",
			short_name: "JP EEW Viewer",
			description: "A viewer for Japan Earthquake Early Warnings (EEW)",
			icons: [
				{
					src: "/icon-192x192.png",
					sizes: "192x192",
					type: "image/png",
				},
				{
					src: "/icon-512x512.png",
					sizes: "512x512",
					type: "image/png",
				},
				{
					src: "/apple-touch-icon.png",
					sizes: "512x512",
					type: "image/png",
				},
				{
					src: "/apple-touch-icon-precomposed.png",
					sizes: "512x512",
					type: "image/png",
				},
			],
		},
		workbox: {
			navigateFallback: "/",
		},
		devOptions: {
			enabled: true,
			type: "module",
		},
	},
});
