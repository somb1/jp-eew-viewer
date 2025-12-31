// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
	compatibilityDate: "2025-07-15",
	devtools: { enabled: true },
	modules: ["@nuxt/ui", "@vueuse/nuxt", "@vite-pwa/nuxt"],
	css: ["~/assets/css/main.css", "maplibre-gl/dist/maplibre-gl.css"],
	routeRules: {
		"/api/eew": {
			headers: { "Cache-Control": "public, s-maxage=3600, maxage=3600" },
		},
		"/api/latest": {
			headers: { "Cache-Control": "public, s-maxage=1, maxage=1" },
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
