<template>
	<div
		class="pointer-events-none mb-5 ml-2 flex w-fit max-w-[95vw] flex-col items-start gap-2 font-sans"
	>
		<div class="pointer-events-auto w-full relative z-50">
			<div
				class="flex w-full items-center justify-between gap-3 rounded-full border border-white/10 bg-black/70 px-3 py-2 text-white shadow-lg backdrop-blur-md transition-all hover:bg-black/80"
			>
				<div
					class="flex flex-1 items-center gap-2 overflow-hidden font-mono text-xs font-semibold"
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
						class="whitespace-nowrap tracking-wider text-gray-200"
					>
						<span
							v-if="splitTime.date"
							class="hidden sm:inline mr-1"
							>{{ splitTime.date }}</span
						>
						<span>{{ splitTime.time }}</span>
					</span>

					<div
						class="h-3 w-px bg-white/20 mx-0.5 flex-shrink-0"
					></div>

					<button
						@click="toggleSettings"
						class="flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] sm:text-xs font-bold text-yellow-400/90 hover:bg-white/10 hover:text-yellow-300 transition-colors tracking-tight outline-none"
					>
						{{ currentSettingsDisplay }}
						<UIcon
							name="i-heroicons-chevron-down-20-solid"
							class="h-3 w-3 opacity-70 transition-transform duration-300"
							:class="{ 'rotate-180': showSettings }"
						/>
					</button>
				</div>

				<div class="flex items-center gap-1 flex-shrink-0">
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

					<div class="h-3 w-px bg-white/20"></div>

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
				v-if="showSettings"
				class="pointer-events-auto w-full rounded-xl border border-white/10 bg-black/80 p-4 shadow-xl backdrop-blur-md"
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

		<div class="pointer-events-auto w-full transition-all duration-300">
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
import { computed, ref } from "vue";

// =========================================================================================
// 1. 상수 정의 (라벨 및 옵션)
// =========================================================================================

// 상태바 상단에 표시될 짧은 라벨
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

// 설정 드롭다운에 표시될 전체 이름
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

// 데이터 소스 라벨
const SOURCE_LABELS: Record<string, string> = {
	s: "지표 (Surface)",
	b: "지중 (Borehole)",
};

// =========================================================================================
// 2. Props & Emits
// =========================================================================================

const props = defineProps<{
	eewData: any; // EEW 데이터 객체
	currentTime: string; // 현재 표시 시간 (문자열)
	status: string; // 시스템 상태 (live, syncing, error 등)
	notificationEnabled?: boolean; // 알림 활성화 여부
	locationActive?: boolean; // 위치 추적 활성화 여부
	currentType: string; // 현재 시각화 타입
	currentSource: string; // 현재 데이터 소스
}>();

const emit = defineEmits<{
	(e: "sync"): void; // 수동 동기화 요청
	(e: "toggle-notification"): void; // 알림 토글 요청
	(e: "trigger-location"): void; // 위치 찾기 요청
	(e: "update:currentType", value: string): void; // 타입 변경 (v-model)
	(e: "update:currentSource", value: string): void; // 소스 변경 (v-model)
}>();

// =========================================================================================
// 3. 상태 변수 (State)
// =========================================================================================

// 설정 패널 표시 여부
const showSettings = ref(false);

const toggleSettings = () => {
	showSettings.value = !showSettings.value;
};

// =========================================================================================
// 4. V-Model Proxies (양방향 바인딩 처리)
// =========================================================================================

// 상위 컴포넌트의 props를 수정하기 위한 computed get/set
const proxyType = computed({
	get: () => props.currentType || "acmap",
	set: (val) => emit("update:currentType", val),
});

const proxySource = computed({
	get: () => props.currentSource || "s",
	set: (val) => emit("update:currentSource", val),
});

// =========================================================================================
// 5. Computed Properties (UI 로직)
// =========================================================================================

/**
 * 날짜와 시간 텍스트 분리
 * - 모바일 등 좁은 화면에서 날짜를 숨기기 위해 분리해서 반환
 */
const splitTime = computed(() => {
	if (!props.currentTime) return { date: "", time: "Connecting..." };
	const parts = props.currentTime.split(" ");
	// "2025. 12. 31." 부분과 "16:02:33" 부분 분리
	const date = parts.slice(0, -1).join(" ");
	const time = parts[parts.length - 1];
	return { date, time };
});

/**
 * 현재 설정 상태 요약 텍스트 (예: "PGA · 지표")
 */
const currentSettingsDisplay = computed(() => {
	const type = DISPLAY_TYPE_LABELS[props.currentType] || props.currentType;
	const source = props.currentSource === "s" ? "지표" : "지중";
	return `${type} · ${source}`;
});

// =========================================================================================
// 6. Computed Properties (EEW 데이터 파싱)
// =========================================================================================

/**
 * 응답은 왔지만 실제 지진 데이터가 없는 경우 (빈 메시지 등)
 */
const isEmptyResponse = computed(() => {
	if (!props.eewData) return false;
	const msg = props.eewData.result?.message || "";
	return msg.includes("データがありません");
});

/**
 * 취소된 경보(Cancel) 여부
 */
const isCancel = computed(() => {
	const val = props.eewData?.is_cancel;
	return val === "true" || val === true;
});

/**
 * 최종보(Final) 여부
 */
const isFinal = computed(() => {
	const val = props.eewData?.is_final;
	return val === "true" || val === true;
});

/**
 * 진도 표시값 (0일 경우 대시(-)로 표시)
 */
const displayIntensity = computed(() => {
	const val = props.eewData?.calcintensity;
	if (!val || val === "0") return "-";
	return val;
});

// =========================================================================================
// 7. Helper Methods
// =========================================================================================

/**
 * YYYYMMDDHHmmss 형식을 사람이 읽기 쉬운 포맷으로 변환
 * @returns "YYYY/MM/DD HH:mm:ss"
 */
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
