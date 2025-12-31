<template>
	<div
		class="pointer-events-none mb-5 ml-2 flex w-[380px] max-w-[90vw] flex-col items-start gap-2 font-sans"
	>
		<div class="pointer-events-auto w-full">
			<div
				class="flex w-full items-center justify-between gap-3 rounded-full border border-white/10 bg-black/70 px-4 py-2 text-white shadow-lg backdrop-blur-md transition-all hover:bg-black/80"
			>
				<div class="flex items-center gap-2 font-mono text-xs font-semibold">
					<span class="relative flex h-2.5 w-2.5">
						<span
							v-if="status === 'live' || status === 'syncing'"
							class="absolute inline-flex h-full w-full rounded-full opacity-75"
							:class="{
								'bg-green-400': status === 'live',
								'bg-yellow-400': status === 'syncing',
							}"
						></span>
						<span
							class="relative inline-flex h-2.5 w-2.5 rounded-full"
							:class="{
								'bg-green-500': status === 'live',
								'bg-yellow-500': status === 'syncing',
								'bg-red-500': status === 'error',
								'bg-pink-500': status === 'test',
							}"
						></span>
					</span>
					<span class="tracking-wider text-gray-200">
						{{ currentTime || "Connecting..." }}
					</span>
				</div>

				<button
					@click="$emit('sync')"
					:disabled="status === 'syncing'"
					class="group flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-gray-400 transition-colors hover:bg-white/10 hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
				>
					<svg
						xmlns="http://www.w3.org/2000/svg"
						viewBox="0 0 20 20"
						fill="currentColor"
						class="h-3 w-3 transition-transform duration-700 group-hover:rotate-180"
						:class="{ 'animate-spin': status === 'syncing' }"
					>
						<path
							fill-rule="evenodd"
							d="M15.312 11.424a5.5 5.5 0 01-9.201 2.466l-.312-.311h2.433a.75.75 0 000-1.5H3.989a.75.75 0 00-.75.75v4.242a.75.75 0 001.5 0v-2.43l.31.31a7 7 0 0011.712-3.138.75.75 0 00-1.449-.39zm1.23-3.723a.75.75 0 00.219-.53V2.929a.75.75 0 00-1.5 0v2.433l-.31-.31a7 7 0 00-11.712 3.138.75.75 0 001.449.39 5.5 5.5 0 019.201-2.466l.312.311H12.133a.75.75 0 000 1.5h4.242a.75.75 0 00.53-.219z"
							clip-rule="evenodd"
						/>
					</svg>
					{{ status === "syncing" ? "Syncing" : "Sync" }}
				</button>
			</div>
		</div>

		<div class="pointer-events-auto w-full transition-all duration-300">
			<div
				v-if="status === 'error'"
				class="flex items-center justify-center gap-2 rounded-lg border border-red-500/50 bg-red-950/80 p-2.5 text-red-100 backdrop-blur shadow-lg"
			>
				<svg
					xmlns="http://www.w3.org/2000/svg"
					viewBox="0 0 24 24"
					fill="currentColor"
					class="h-4 w-4 text-red-400"
				>
					<path
						fill-rule="evenodd"
						d="M9.401 3.003c1.155-2 4.043-2 5.197 0l7.355 12.748c1.154 2-.29 4.5-2.599 4.5H4.645c-2.309 0-3.752-2.5-2.598-4.5L9.4 3.003zM12 8.25a.75.75 0 01.75.75v3.75a.75.75 0 01-1.5 0V9a.75.75 0 01.75-.75zm0 8.25a.75.75 0 100-1.5.75.75 0 000 1.5z"
						clip-rule="evenodd"
					/>
				</svg>
				<span class="text-xs font-bold tracking-wide">수신 오류</span>
			</div>

			<div
				v-else-if="!eewData"
				class="flex items-center justify-center rounded-lg border border-gray-800 bg-gray-900/80 p-2.5 text-gray-400 backdrop-blur shadow-lg"
			>
				<div class="mr-2 h-1.5 w-1.5 animate-pulse rounded-full bg-gray-500"></div>
				<span class="text-xs font-medium tracking-wide">대기 중...</span>
			</div>

			<div
				v-else-if="isEmptyResponse"
				class="hidden rounded-lg border border-gray-800 bg-black/40 p-2 text-center text-xs text-gray-500 backdrop-blur-sm shadow-sm"
			>
				<span>특이사항 없음</span>
			</div>

			<div
				v-else
				class="relative overflow-hidden rounded-xl border shadow-2xl backdrop-blur-md transition-all duration-300"
				:class="[
					isCancel
						? 'border-gray-600 bg-gray-800/90'
						: 'border-red-500/30 bg-gray-900/90 shadow-red-900/20',
				]"
			>
				<div
					class="absolute inset-y-0 left-0 w-1"
					:class="isCancel ? 'bg-gray-500' : 'bg-red-600'"
				></div>

				<div class="flex items-center gap-3 p-3 pl-4">
					<div
						class="flex h-12 w-12 flex-shrink-0 flex-col items-center justify-center rounded-lg shadow-sm"
						:class="[
							isCancel
								? 'bg-gray-600 text-gray-300'
								: 'bg-gradient-to-br from-yellow-400 to-orange-500 text-white',
						]"
					>
						<span class="text-[0.55rem] font-bold opacity-90 leading-none mb-0.5">진도</span>
						<span
							class="font-mono text-2xl font-black leading-none tracking-tighter shadow-black drop-shadow-sm"
						>
							{{ displayIntensity }}
						</span>
					</div>

					<div class="flex min-w-0 flex-1 flex-col justify-center">
						<div class="flex items-center gap-2 mb-1">
							<span
								class="flex-shrink-0 rounded px-1.5 py-0.5 text-[10px] font-bold text-white shadow-sm"
								:class="isCancel ? 'bg-gray-500' : 'bg-red-600'"
							>
								{{ isCancel ? "취소" : "속보" }}
								<span class="opacity-75">| {{ isFinal ? "최종" : `#${eewData.report_num}` }}</span>
							</span>
							<span
								class="truncate text-lg font-bold leading-tight text-white drop-shadow-md"
							>
								{{ eewData.region_name }}
							</span>
						</div>

						<div class="flex items-center gap-3 text-xs font-medium text-gray-300">
							<span class="font-mono text-gray-400">
                                {{ formatOriginTime(eewData.origin_time).split(" ")[1] }}
                            </span>
							<div class="h-3 w-px bg-gray-700"></div>
							<div class="flex items-baseline gap-1">
								<span :class="isCancel ? 'text-gray-500' : 'text-yellow-500'">M</span>
								<span class="font-mono font-bold text-white">{{ eewData.magunitude }}</span>
							</div>
							<div class="h-3 w-px bg-gray-700"></div>
							<div class="flex items-baseline gap-1">
								<span class="text-gray-500">깊이</span>
								<span class="font-mono font-bold text-white">{{ eewData.depth }}</span>
							</div>
						</div>
					</div>
				</div>
			</div>
		</div>
	</div>
</template>

<script setup lang="ts">
import { computed } from "vue";

const props = defineProps<{
	eewData: any;
	currentTime: string;
	status: string;
}>();

defineEmits<{
	(e: "sync"): void;
}>();

const isEmptyResponse = computed(() => {
	if (!props.eewData) return false;
	const msg = props.eewData.result?.message || "";
	return msg.includes("データがありません");
});

const isCancel = computed(() => {
	const val = props.eewData?.is_cancel;
	return val === "true" || val === true;
});

const isFinal = computed(() => {
	const val = props.eewData?.is_final;
	return val === "true" || val === true;
});

const displayIntensity = computed(() => {
	const val = props.eewData?.calcintensity;
	if (!val || val === "0") return "-";
	return val;
});

const formatOriginTime = (rawTime: string) => {
	if (!rawTime || rawTime.length < 14) return rawTime;
	const Y = rawTime.substring(0, 4);
	const M = rawTime.substring(4, 6);
	const D = rawTime.substring(6, 8);
	const h = rawTime.substring(8, 10);
	const m = rawTime.substring(10, 12);
	const s = rawTime.substring(12, 14);
	return `${Y}/${M}/${D} ${h}:${m}:${s}`;
};
</script>

<style scoped>
@import url("https://fonts.googleapis.com/css2?family=Noto+Sans+JP:wght@400;500;700;900&family=Roboto+Mono:wght@400;600&display=swap");

.font-sans {
	font-family: "Noto Sans JP", sans-serif;
}
.font-mono {
	font-family: "Roboto Mono", monospace;
}
</style>