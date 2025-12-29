<template>
	<UApp>
		<Analytics/>
		<AppHeader />
		<NuxtPage />
	</UApp>
</template>

<script setup lang="ts">
	import { Analytics } from '@vercel/analytics/nuxt'
</script>