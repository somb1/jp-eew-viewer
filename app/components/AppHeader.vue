<template>
	<UHeader title="JP EEW Viewer" :toggle="false">
		<template #right>
			<UColorModeSwitch />
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
