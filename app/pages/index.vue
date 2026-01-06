<template>
	<div ref="mapEl" class="map relative">
		<transition
			enter-active-class="transition duration-300 ease-out"
			enter-from-class="opacity-0"
			enter-to-class="opacity-100"
			leave-active-class="transition duration-200 ease-in"
			leave-from-class="opacity-100"
			leave-to-class="opacity-0"
		>
			<div
				v-if="isReplayMode"
				class="pointer-events-none absolute inset-0 z-[40] flex items-center justify-center overflow-hidden"
			>
				<div
					class="absolute inset-0 flex flex-wrap content-center justify-center gap-x-6 gap-y-8 lg:gap-32 opacity-5 rotate-[-15deg] scale-150 select-none"
				>
					<span
						v-for="n in watermarkCount"
						:key="n"
						class="text-lg lg:text-6xl font-black whitespace-nowrap leading-none transition-colors duration-300"
						:class="isDark ? 'text-white' : 'text-gray-900'"
					>
						REPLAY
					</span>
				</div>
			</div>
		</transition>

		<template v-if="isMapLoaded">
			<Teleport to="#system-status-portal">
				<SystemStatusBar
					:eew-data="eewData"
					:current-time="currentDisplayTime"
					:status="connectionStatus"
					:notification-enabled="finalNotificationState"
					:location-active="isLocationActive"
					@trigger-location="handleLocationTrigger"
					v-model:current-type="monitorType"
					v-model:current-source="monitorSource"
					v-model:replay-offset="replayOffsetMinutes"
					@sync="handleManualSync"
					@toggle-notification="toggleNotification"
				/>
			</Teleport>
		</template>
	</div>
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted, onBeforeUnmount } from "vue";
import { useDocumentVisibility } from "@vueuse/core";

// =========================================================================================
// 1. 초기화 및 Composable 사용
// =========================================================================================

// DOM 요소 참조
const mapEl = ref<HTMLDivElement | null>(null);

// Nuxt UI 훅
const colorMode = useColorMode();
const toast = useToast();

// [Map Logic] 지도 제어 및 시각화 관련 로직
const {
	initMap,
	destroyMap,
	isMapLoaded,
	updateStationPoints, // 관측소 포인트 업데이트
	updateEEWVisuals, // EEW 파동 및 진앙지 업데이트
	changeMapStyle, // 다크/라이트 모드 전환
	refreshMapLayout, // 맵 레이아웃 재계산 (렌더링 깨우기)
	triggerLocation, // 위치 찾기 시작
	isLocationActive, // 현재 위치 추적 활성화 여부
	locationError, // 위치 에러 상태
} = useEEWMap();

// [Monitor Logic] 데이터 폴링 및 상태 관리 로직
const {
	initEEW,
	stopEEW,
	eewData, // 지진 조기 경보 데이터
	stationPointsData, // 관측소 데이터
	currentDisplayTime, // 현재 시뮬레이션 시간
	connectionStatus, // 네트워크 연결 상태
	monitorType, // 시각화 타입 (PGA/PGV 등) - v-model
	monitorSource, // 데이터 소스 (지표/지중) - v-model

	// [리플레이 관련 상태]
	replayOffsetMinutes,
	isReplayMode, // 워터마크 표시 조건

	handleManualSync, // 수동 동기화 함수
	toggleNotification, // 알림 토글 함수
	isNotificationActive, // 앱 내 알림 설정 상태
	notificationPermission, // 브라우저 권한 상태
} = useEEWMonitor();

// =========================================================================================
// 2. Computed Properties (상태 계산)
// =========================================================================================

/**
 * 다크모드 활성화 여부
 * - Nuxt Color Mode 값에 따라 true/false 반환
 */
const isDark = computed(() => {
	return colorMode.value === "dark";
});

/**
 * 최종 알림 활성화 상태
 * - 브라우저 권한이 'granted'이고, 사용자가 앱 내 스위치를 켰을 때만 true
 */
const finalNotificationState = computed(() => {
	return (
		notificationPermission.value === "granted" && isNotificationActive.value
	);
});

// =========================================================================================
// 3. 이벤트 핸들러
// =========================================================================================

/**
 * 위치 버튼 클릭 핸들러
 * - SystemStatusBar에서 이벤트 발생 시 호출됨
 */
const handleLocationTrigger = () => {
	triggerLocation();
};

// =========================================================================================
// 4. Watchers (상태 감지 및 반응)
// =========================================================================================

/**
 * [위치 에러 감지]
 * - 위치 찾기 실패 시 Toast 알림 표시
 */
watch(locationError, (err) => {
	if (!err) return;

	// 에러 코드별 메시지 처리
	if (err.code === 1) {
		// PERMISSION_DENIED
		toast.add({
			title: "위치 권한이 거부되었습니다.",
			description: "브라우저 설정에서 위치 권한을 허용해주세요.",
			icon: "i-heroicons-exclamation-triangle",
		});
	} else if (err.code === 2 || err.code === 3) {
		// POSITION_UNAVAILABLE or TIMEOUT
		toast.add({
			title: "위치 확인 실패",
			description:
				"현재 위치를 가져올 수 없습니다. (Code: " + err.code + ")",
			icon: "i-heroicons-exclamation-circle",
		});
	} else {
		toast.add({
			title: "위치 오류",
			description: err.message,
			icon: "i-heroicons-exclamation-circle",
		});
	}
});

/**
 * [다크모드 변경 감지]
 * - 테마 변경 시 지도 스타일을 교체하고 데이터를 다시 그립니다.
 */
watch(isDark, (newVal) => {
	changeMapStyle(newVal);

	// [중요] 스타일이 변경('styledata' 이벤트)되면 기존 레이어가 초기화됩니다.
	// 따라서 화면 깜빡임을 최소화하기 위해 데이터를 강제로 다시 주입합니다.
	if (stationPointsData.value) {
		setTimeout(() => {
			if (isMapLoaded.value) {
				updateStationPoints(stationPointsData.value);
				updateEEWVisuals(eewData.value, currentDisplayTime.value);
			}
		}, 300); // 스타일 로딩 시간을 고려한 안전 지연
	}
});

/**
 * [페이지 가시성 변경 감지]
 * - Safari/iOS PWA에서 탭 전환 후 복귀 시 WebGL 렌더링이 멈추는 현상 해결
 */
const visibility = useDocumentVisibility();
watch(visibility, (current) => {
	if (current === "visible") {
		// 브라우저가 그래픽 리소스를 복구할 시간을 주기 위해 지연 실행
		setTimeout(() => {
			if (isMapLoaded.value) {
				// 1. 맵 캔버스 크기 재계산 (멈춘 렌더링 루프 깨우기)
				refreshMapLayout();

				// 2. 데이터 강제 재주입 (화면 갱신 보장)
				if (stationPointsData.value) {
					updateStationPoints(stationPointsData.value);
				}

				if (eewData.value) {
					updateEEWVisuals(eewData.value, currentDisplayTime.value);
				}
			}
		}, 300);
	}
});

/**
 * [관측소 데이터 업데이트]
 * - 서버에서 새로운 포인트 데이터가 오면 지도에 반영
 */
watch(stationPointsData, (newData) => {
	if (newData) {
		updateStationPoints(newData);
	}
});

/**
 * [EEW 파동 및 시각 업데이트]
 * - 지진 데이터(eewData)나 현재 시간(currentDisplayTime)이 변할 때마다
 * P파/S파의 반경을 재계산하여 애니메이션 효과를 줌
 */
watch(
	[() => eewData.value, () => currentDisplayTime.value],
	([newEEW, newTime]) => {
		if (isMapLoaded.value) {
			updateEEWVisuals(newEEW, newTime);
		}
	}
);

// =========================================================================================
// 5. Lifecycle Hooks (생명주기)
// =========================================================================================

onMounted(() => {
	// 1. 데이터 폴링 시작
	initEEW();

	// 2. 지도 초기화 (DOM이 준비된 후)
	if (mapEl.value) {
		initMap(mapEl.value, isDark.value);
	}
});

onBeforeUnmount(() => {
	// 메모리 누수 방지를 위한 정리
	stopEEW();
	destroyMap();
});

// =========================================================================================
// [수정됨] 리플레이 워터마크 개수 자동 계산 (반응형 기준 변경)
// =========================================================================================
const { width: windowWidth, height: windowHeight } = useWindowSize();

const watermarkCount = computed(() => {
	// 1. 화면 너비가 1024px(lg) 이상일 때만 '대형'으로 간주
	//    아이폰 가로모드는 보통 800~930px 사이이므로 '소형'으로 처리됨
	const isDesktop = windowWidth.value >= 1024;

	// 2. 텍스트 하나의 대략적인 점유 면적 (px²)
	//    Desktop(text-6xl + gap-32): 약 500x300px 정도 차지
	//    Mobile(text-lg + gap-6): 약 150x80px 정도 차지
	const ITEM_AREA = isDesktop ? 500 * 300 : 150 * 100;

	// 3. 현재 화면 면적
	const screenArea = windowWidth.value * windowHeight.value;

	// 4. 기본 필요 개수
	const baseCount = Math.ceil(screenArea / ITEM_AREA);

	// 5. 안전 계수 (빈 공간 방지)
	const SAFETY_FACTOR = 4;

	// 최소 50개는 보장
	return Math.max(50, baseCount * SAFETY_FACTOR);
});
</script>

<style scoped>
.map {
	width: 100%;
	/* 헤더 높이를 제외한 전체 화면 높이 사용 */
	height: calc(100dvh - var(--ui-header-height));
	position: relative;
	background-color: #222; /* 로딩 전 다크모드 배경색 */
	overflow: hidden;
}

/* (선택) 라이트 모드일 때 초기 배경색 */
/* :root.light .map { background-color: #f0f0f0; } */
</style>
