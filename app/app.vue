<template>
	<UApp>
		<Analytics/>
		<VitePwaManifest />
		<AppHeader />
		<NuxtPage />
	</UApp>
</template>

<script setup lang="ts">
	import { Analytics } from '@vercel/analytics/nuxt'
</script>
