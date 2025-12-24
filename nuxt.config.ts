// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
	compatibilityDate: "2025-07-15",
	devtools: { enabled: true },
	modules: ["@nuxt/ui"],
	css: ["~/assets/css/main.css", "maplibre-gl/dist/maplibre-gl.css"],
	routeRules: {
		"/api/**": { headers: { "Cache-Control": "public, s-maxage=60, maxage=60" } },
	},
});
