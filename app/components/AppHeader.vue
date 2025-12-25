<template>
	<UHeader>
		<template #title>
			<span class="font-bold">JP EEW Viewer</span>
		</template>

		<template #right>
			<ULocaleSelect v-model="locale" :locales="[en, ja, ko]" />
			<UColorModeSelect />
			<UTooltip text="Open on GitHub">
				<UButton
					color="neutral"
					variant="ghost"
					to="https://github.com/somb1/jp-eew-viewer"
					target="_blank"
					icon="i-simple-icons-github"
					aria-label="GitHub"
				/>
			</UTooltip>
		</template>
	</UHeader>
</template>

<script setup lang="ts">
import { en, ja, ko } from "@nuxt/ui/locale";

const locale = ref("en");

</script>
