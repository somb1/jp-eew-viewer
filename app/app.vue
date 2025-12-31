<template>
	<UApp :toaster="toaster">
		<Analytics/>
		<SpeedInsights/>
		<VitePwaManifest />
		<AppHeader />
		<NuxtPage />
	</UApp>
</template>

<script setup lang="ts">
import { Analytics } from '@vercel/analytics/nuxt'
import { SpeedInsights } from "@vercel/speed-insights/nuxt"
const toaster = { duration: 3000 }
</script>
