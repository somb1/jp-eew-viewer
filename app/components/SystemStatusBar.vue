<template>
	<div
		class="pointer-events-none mb-5 flex w-fit max-w-[calc(100vw-1rem)] flex-col items-start gap-2 font-sans pl-[max(0.5rem,env(safe-area-inset-left))] pr-[env(safe-area-inset-right)]"
	>
		<div class="pointer-events-auto w-full relative z-50 touch-none">
			<div
				class="flex w-full items-center justify-between gap-2 sm:gap-3 rounded-full border border-white/10 bg-black/70 px-2.5 py-2 sm:px-3 text-white shadow-lg backdrop-blur-md transition-all hover:bg-black/80"
			>
				<div
					class="flex flex-1 items-center gap-1.5 sm:gap-2 overflow-hidden min-w-0"
				>
					<button
						@click="toggleReplaySettings"
						class="group flex flex-shrink-0 items-center gap-1.5 sm:gap-2 font-mono text-xs font-semibold rounded-full px-1.5 sm:px-2 py-1 transition-all outline-none text-left border border-transparent hover:bg-white/10 hover:border-white/5 active:scale-95"
						:class="
							isReplayMode
								? 'text-orange-300 bg-orange-500/10 border-orange-500/20'
								: 'text-gray-200'
						"
						title="리플레이 설정 열기"
					>
						<span class="relative flex h-2.5 w-2.5 flex-shrink-0">
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

						<span
							class="whitespace-nowrap tracking-wider flex items-center gap-1.5"
						>
							<span
								class="decoration-dashed underline decoration-white/30 underline-offset-4 decoration-2"
							>
								<span
									v-if="splitTime.date"
									class="hidden sm:inline mr-1 opacity-80"
								>
									{{ splitTime.date }}
								</span>
								<span>{{ splitTime.time }}</span>
							</span>

							<span
								v-if="isReplayMode"
								class="text-[9px] font-bold bg-orange-500/20 px-1.5 py-0.5 rounded-full text-orange-300"
							>
								-{{ replayOffset }}m
							</span>
						</span>
					</button>

					<div
						class="h-3 w-px bg-white/20 mx-0.5 flex-shrink-0"
					></div>

					<button
						@click="toggleSettings"
						class="flex flex-1 min-w-0 items-center gap-1 rounded px-1.5 py-0.5 text-[10px] sm:text-xs font-bold text-yellow-400/90 hover:bg-white/10 hover:text-yellow-300 transition-colors tracking-tight outline-none"
					>
						<span class="truncate block">
							{{ currentSettingsDisplay }}
						</span>

						<UIcon
							name="i-heroicons-chevron-down-20-solid"
							class="h-3 w-3 opacity-70 transition-transform duration-300 flex-shrink-0"
							:class="{ 'rotate-180': showSettings }"
						/>
					</button>
				</div>

				<div class="flex items-center gap-0.5 sm:gap-1 flex-shrink-0">
					<button
						@click="$emit('trigger-location')"
						class="group flex h-6 w-6 items-center justify-center rounded-full transition-all duration-300 hover:bg-white/10"
						:class="[
							locationActive
								? 'bg-white/5 text-green-400 shadow-[0_0_10px_rgba(74,222,128,0.2)]'
								: 'text-gray-400 hover:text-green-400',
						]"
						title="내 위치 찾기"
					>
						<UIcon
							name="i-heroicons-map-pin-20-solid"
							class="h-4 w-4 transition-transform group-hover:scale-110"
						/>
					</button>

					<button
						@click="$emit('toggle-notification')"
						class="group flex h-6 w-6 items-center justify-center rounded-full transition-all duration-300 hover:bg-white/10"
						:class="[
							notificationEnabled
								? 'bg-white/5 text-yellow-400'
								: 'text-gray-400 hover:text-yellow-400',
						]"
					>
						<UIcon
							:name="
								notificationEnabled
									? 'i-heroicons-bell-alert-20-solid'
									: 'i-heroicons-bell-slash-20-solid'
							"
							class="h-4 w-4 transition-transform group-hover:scale-110"
						/>
					</button>

					<div class="h-3 w-px bg-white/20 mx-0.5"></div>

					<button
						@click="$emit('sync')"
						:disabled="status === 'syncing' && !isReplayMode"
						class="group flex items-center gap-1.5 rounded-full px-1.5 sm:px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider transition-colors disabled:cursor-not-allowed disabled:opacity-50"
						:class="[
							isReplayMode
								? 'text-orange-400 hover:bg-orange-500/10 hover:text-orange-300'
								: 'text-gray-400 hover:bg-white/10 hover:text-white',
						]"
					>
						<template v-if="isReplayMode">
							<UIcon
								name="i-heroicons-forward-20-solid"
								class="h-3 w-3"
							/>
							<span>LIVE</span>
						</template>

						<template v-else>
							<svg
								xmlns="http://www.w3.org/2000/svg"
								viewBox="0 0 20 20"
								fill="currentColor"
								class="h-3 w-3 transition-transform duration-700 group-hover:rotate-180"
								:class="{
									'animate-spin': status === 'syncing',
								}"
							>
								<path
									fill-rule="evenodd"
									d="M15.312 11.424a5.5 5.5 0 01-9.201 2.466l-.312-.311h2.433a.75.75 0 000-1.5H3.989a.75.75 0 00-.75.75v4.242a.75.75 0 001.5 0v-2.43l.31.31a7 7 0 0011.712-3.138.75.75 0 00-1.449-.39zm1.23-3.723a.75.75 0 00.219-.53V2.929a.75.75 0 00-1.5 0v2.433l-.31-.31a7 7 0 00-11.712 3.138.75.75 0 001.449.39 5.5 5.5 0 019.201-2.466l.312.311H12.133a.75.75 0 000 1.5h4.242a.75.75 0 00.53-.219z"
									clip-rule="evenodd"
								/>
							</svg>
							<span class="hidden xs:inline">{{
								status === "syncing" ? "Syncing" : "Sync"
							}}</span>
							<span class="xs:hidden">{{
								status === "syncing" ? "..." : "Sync"
							}}</span>
						</template>
					</button>
				</div>
			</div>
		</div>

		<transition
			enter-active-class="transition ease-out duration-200"
			enter-from-class="opacity-0 -translate-y-2"
			enter-to-class="opacity-100 translate-y-0"
			leave-active-class="transition ease-in duration-150"
			leave-from-class="opacity-100 translate-y-0"
			leave-to-class="opacity-0 -translate-y-2"
		>
			<div
				v-if="showReplaySettings"
				class="pointer-events-auto mt-1 w-full rounded-lg border border-orange-500/30 bg-black/90 p-3 shadow-xl backdrop-blur-md z-40"
			>
				<div class="flex items-center justify-between mb-2">
					<div class="flex items-center gap-2">
						<span
							class="text-[11px] font-bold text-gray-400 flex items-center gap-1"
						>
							<UIcon
								name="i-heroicons-clock-20-solid"
								class="w-3 h-3"
							/>
							Replay
						</span>
						<span
							class="font-mono text-[11px] font-bold px-1.5 py-0.5 rounded bg-white/5"
							:class="
								isReplayMode
									? 'text-orange-400'
									: 'text-green-400'
							"
						>
							{{ isReplayMode ? `-${replayOffset}m` : "LIVE" }}
						</span>
					</div>
					<button
						@click="showReplaySettings = false"
						class="text-gray-500 hover:text-white transition-colors"
					>
						<UIcon
							name="i-heroicons-x-mark-20-solid"
							class="w-4 h-4"
						/>
					</button>
				</div>

				<div class="relative w-full flex items-center h-6 mb-1 px-1">
					<USlider
						v-model="timelineValue"
						:min="0"
						:max="60"
						:step="1"
						size="xl"
						:ui="{
							track: 'bg-gray-700/50 w-full',
							range: 'bg-gradient-to-r from-orange-900/50 to-orange-500',
							/* 2. 썸(핸들)이 커졌으므로 그림자 효과도 살짝 키워주면 좋습니다 */
							thumb: 'bg-white ring-2 ring-orange-500 shadow-[0_0_10px_rgba(249,115,22,0.8)] transition-transform hover:scale-110',
						}"
					/>
				</div>

				<div
					class="relative flex items-center justify-between text-xs text-gray-400 font-mono font-medium mt-2 px-1 h-5"
				>
					<span class="z-10">60m Ago</span>

					<transition
						enter-active-class="transition duration-200 ease-out"
						enter-from-class="opacity-0 scale-90"
						enter-to-class="opacity-100 scale-100"
						leave-active-class="transition duration-150 ease-in"
						leave-from-class="opacity-100 scale-100"
						leave-to-class="opacity-0 scale-90"
					>
						<div
							v-if="isReplayMode"
							class="absolute inset-0 flex items-center justify-center gap-1.5 text-orange-400/90 font-bold whitespace-nowrap pointer-events-none"
						>
							<UIcon
								name="i-heroicons-bell-slash-20-solid"
								class="w-3.5 h-3.5"
							/>
							<span>알림 차단됨</span>
						</div>
						<div
							v-else
							class="absolute inset-0 flex items-center justify-center text-green-500/40 pointer-events-none"
						>
							Real-time Data
						</div>
					</transition>

					<span
						class="z-10"
						:class="{ 'text-green-400 font-bold': !isReplayMode }"
					>
						Live
					</span>
				</div>
			</div>
		</transition>

		<transition
			enter-active-class="transition ease-out duration-200"
			enter-from-class="opacity-0 -translate-y-2"
			enter-to-class="opacity-100 translate-y-0"
			leave-active-class="transition ease-in duration-150"
			leave-from-class="opacity-100 translate-y-0"
			leave-to-class="opacity-0 -translate-y-2"
		>
			<div
				v-if="showSettings"
				class="pointer-events-auto w-full rounded-xl border border-white/10 bg-black/80 p-4 shadow-xl backdrop-blur-md z-30"
			>
				<div
					class="flex items-center justify-between mb-3 border-b border-white/10 pb-2"
				>
					<span
						class="text-xs sm:text-sm font-bold text-gray-300 flex items-center gap-1"
					>
						<UIcon
							name="i-heroicons-adjustments-horizontal-20-solid"
							class="w-3 h-3"
						/>
						데이터 시각화 설정
					</span>
					<button
						@click="showSettings = false"
						class="text-gray-500 hover:text-white"
					>
						<UIcon
							name="i-heroicons-x-mark-20-solid"
							class="w-4 h-4"
						/>
					</button>
				</div>

				<div class="flex gap-3">
					<div class="space-y-1.5 flex-[1.5]">
						<label
							class="text-[10px] sm:text-xs font-bold text-gray-400 uppercase tracking-wider pl-1"
							>Data Type</label
						>
						<div class="relative">
							<select
								v-model="proxyType"
								class="w-full appearance-none rounded-lg bg-white/5 border border-white/10 px-3 py-2 text-xs sm:text-sm text-white focus:border-yellow-500 focus:outline-none focus:ring-1 focus:ring-yellow-500 transition-colors hover:bg-white/10 cursor-pointer"
							>
								<option
									v-for="(label, key) in TYPE_LABELS"
									:key="key"
									:value="key"
									class="bg-gray-900 text-white"
								>
									{{ label }}
								</option>
							</select>
							<div
								class="pointer-events-none absolute inset-y-0 right-0 flex items-center px-2 text-gray-400"
							>
								<UIcon
									name="i-heroicons-chevron-up-down-20-solid"
									class="h-3 w-3"
								/>
							</div>
						</div>
					</div>

					<div class="space-y-1.5 flex-1">
						<label
							class="text-[10px] sm:text-xs font-bold text-gray-400 uppercase tracking-wider pl-1"
							>Source</label
						>
						<div
							class="flex gap-2 rounded-lg bg-white/5 p-1 border border-white/10 h-[34px]"
						>
							<button
								v-for="(label, key) in SOURCE_LABELS"
								:key="key"
								@click="proxySource = key"
								class="flex-1 rounded text-xs sm:text-sm font-medium transition-all"
								:class="
									proxySource === key
										? 'bg-gray-600 text-white shadow-md'
										: 'text-gray-400 hover:text-white hover:bg-white/5'
								"
							>
								{{ key === "s" ? "지표" : "지중" }}
							</button>
						</div>
					</div>
				</div>
			</div>
		</transition>

		<div
			class="pointer-events-auto w-full transition-all duration-300 touch-none"
		>
			<div
				v-if="status === 'error'"
				class="flex items-center justify-center gap-2 rounded-lg border border-red-500/50 bg-red-950/80 p-2.5 text-red-100 backdrop-blur shadow-lg"
			>
				<UIcon
					name="i-heroicons-exclamation-circle-20-solid"
					class="h-4 w-4 text-red-400"
				/>
				<span class="text-xs font-bold tracking-wide">수신 오류</span>
			</div>

			<div
				v-else-if="!eewData"
				class="flex items-center justify-center rounded-lg border border-gray-800 bg-gray-900/80 p-2.5 text-gray-400 backdrop-blur shadow-lg"
			>
				<div
					class="mr-2 h-1.5 w-1.5 animate-pulse rounded-full bg-gray-500"
				></div>
				<span class="text-xs font-medium tracking-wide"
					>대기 중...</span
				>
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
						<span
							class="text-[0.55rem] font-bold opacity-90 leading-none mb-0.5"
							>진도</span
						>
						<span
							class="font-mono text-2xl font-black leading-none tracking-tighter shadow-black drop-shadow-sm"
							>{{ displayIntensity }}</span
						>
					</div>

					<div class="flex min-w-0 flex-1 flex-col justify-center">
						<div class="flex items-center gap-2 mb-1">
							<span
								class="flex-shrink-0 rounded px-1.5 py-0.5 text-[10px] font-bold text-white shadow-sm"
								:class="isCancel ? 'bg-gray-500' : 'bg-red-600'"
							>
								{{ isCancel ? "취소" : "속보" }}
								<span class="opacity-75"
									>|
									{{
										isFinal
											? "최종"
											: `#${eewData.report_num}`
									}}</span
								>
							</span>
							<span
								class="truncate text-lg font-bold leading-tight text-white drop-shadow-md"
								>{{ eewData.region_name }}</span
							>
						</div>
						<div
							class="flex items-center gap-3 text-xs font-medium text-gray-300"
						>
							<span class="font-mono text-gray-400">{{
								formatOriginTime(eewData.origin_time).split(
									" "
								)[1]
							}}</span>
							<div class="h-3 w-px bg-gray-700"></div>
							<div class="flex items-baseline gap-1">
								<span
									:class="
										isCancel
											? 'text-gray-500'
											: 'text-yellow-500'
									"
									>M</span
								>
								<span class="font-mono font-bold text-white">{{
									eewData.magunitude
								}}</span>
							</div>
							<div class="h-3 w-px bg-gray-700"></div>
							<div class="flex items-baseline gap-1">
								<span class="text-gray-500">깊이</span>
								<span class="font-mono font-bold text-white">{{
									eewData.depth
								}}</span>
							</div>
						</div>
					</div>
				</div>
			</div>
		</div>
	</div>
</template>

<script setup lang="ts">
import { useScrollLock } from "@vueuse/core"; // [추가]

// =========================================================================================
// [추가 기능] 팝업 활성화 시 스크롤/터치 잠금
// =========================================================================================
const isLocked = useScrollLock(document.body);

// =========================================================================================
// 1. 상수 정의
// =========================================================================================
const DISPLAY_TYPE_LABELS: Record<string, string> = {
	jma: "진도",
	acmap: "PGA",
	vcmap: "PGV",
	dcmap: "Disp",
	rsp0125: "0.125Hz",
	rsp0250: "0.25Hz",
	rsp0500: "0.5Hz",
	rsp1000: "1.0Hz",
	rsp2000: "2.0Hz",
	rsp4000: "4.0Hz",
};

const TYPE_LABELS: Record<string, string> = {
	jma: "실시간 진도 (Shindo)",
	acmap: "최대 가속도 (PGA)",
	vcmap: "최대 속도 (PGV)",
	dcmap: "최대 변위 (Disp)",
	rsp0125: "0.125Hz 속도 응답",
	rsp0250: "0.25Hz 속도 응답",
	rsp0500: "0.5Hz 속도 응답",
	rsp1000: "1.0Hz 속도 응답",
	rsp2000: "2.0Hz 속도 응답",
	rsp4000: "4.0Hz 속도 응답",
};

const SOURCE_LABELS: Record<string, string> = {
	s: "지표 (Surface)",
	b: "지중 (Borehole)",
};

// =========================================================================================
// 2. Props & Emits
// =========================================================================================

const props = withDefaults(
	defineProps<{
		eewData: any;
		currentTime: string;
		status: string;
		notificationEnabled?: boolean;
		locationActive?: boolean;
		currentType: string;
		currentSource: string;
		replayOffset?: number;
	}>(),
	{
		replayOffset: 0,
	}
);

const emit = defineEmits<{
	(e: "sync"): void;
	(e: "toggle-notification"): void;
	(e: "trigger-location"): void;
	(e: "update:currentType", value: string): void;
	(e: "update:currentSource", value: string): void;
	(e: "update:replayOffset", value: number): void;
}>();

// =========================================================================================
// 3. 상태 변수 (State)
// =========================================================================================

const showSettings = ref(false);
const showReplaySettings = ref(false);

const toggleSettings = (e?: Event) => {
	if (e) e.stopPropagation();
	showSettings.value = !showSettings.value;
};

const toggleReplaySettings = (e?: Event) => {
	if (e) e.stopPropagation();
	showReplaySettings.value = !showReplaySettings.value;
};

// =========================================================================================
// 4. V-Model Proxies
// =========================================================================================

const proxyType = computed({
	get: () => props.currentType || "acmap",
	set: (val) => emit("update:currentType", val),
});

const proxySource = computed({
	get: () => props.currentSource || "s",
	set: (val) => emit("update:currentSource", val),
});

const proxyReplayOffset = computed({
	get: () => props.replayOffset || 0,
	set: (val) => emit("update:replayOffset", val),
});

// =========================================================================================
// 5. Computed Properties
// =========================================================================================

const timelineValue = computed({
	get: () => 60 - props.replayOffset,
	set: (val) => emit("update:replayOffset", 60 - val),
});

const isReplayMode = computed(() => (props.replayOffset || 0) > 0);

const splitTime = computed(() => {
	if (!props.currentTime) return { date: "", time: "Connecting..." };
	const parts = props.currentTime.split(" ");
	const date = parts.slice(0, -1).join(" ");
	const time = parts[parts.length - 1];
	return { date, time };
});

const currentSettingsDisplay = computed(() => {
	const type = DISPLAY_TYPE_LABELS[props.currentType] || props.currentType;
	const source = props.currentSource === "s" ? "지표" : "지중";
	return `${type} · ${source}`;
});

// =========================================================================================
// 6. Computed Properties (EEW 데이터 파싱)
// =========================================================================================

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

// =========================================================================================
// 7. Helper Methods
// =========================================================================================

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

// 설정 창이나 리플레이 창 중 하나라도 열려있으면 스크롤 잠금
watch([showSettings, showReplaySettings], ([newSettings, newReplay]) => {
	isLocked.value = newSettings || newReplay;
});
</script>

<style scoped>
@import url("https://fonts.googleapis.com/css2?family=Noto+Sans+JP:wght@400;500;700;900&family=Roboto+Mono:wght@400;600&display=swap");

.font-sans {
	font-family: "Noto Sans JP", sans-serif;
}
.font-mono {
	font-family: "Roboto Mono", monospace;
}

/* [수정됨] xs 브레이크포인트 유틸리티 클래스 정의 */
@media (min-width: 380px) {
	.xs\:inline {
		display: inline !important;
	}
	.xs\:hidden {
		display: none !important;
	}
}
</style>
