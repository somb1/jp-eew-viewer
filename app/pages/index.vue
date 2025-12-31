<template>
	<div ref="mapEl" class="map">
		<template v-if="isMapLoaded">
			<Teleport to="#system-status-portal">
				<SystemStatusBar
					:eew-data="eewData"
					:current-time="currentDisplayTime"
					:status="connectionStatus"
					@sync="handleManualSync"
					:notification-enabled="isNotificationEnabled"
					@request-permission="requestNotificationPermission"
				/>
			</Teleport>
		</template>
	</div>
</template>

<script setup lang="ts">
import { ref, onMounted, onBeforeUnmount, watch } from "vue";
import { useDocumentVisibility } from "@vueuse/core";

// Nuxt UI color mode hook
const colorMode = useColorMode();

// 맵 및 EEW 관련 Composable 사용
const mapEl = ref<HTMLDivElement | null>(null);
const {
	initMap,
	destroyMap,
	updateStationPoints,
	isMapLoaded,
	updateEEWVisuals, // [NEW] 가져오기
	changeMapStyle, // [NEW] 가져오기
} = useEEWMap();

const {
	eewData,
	stationPointsData,
	currentDisplayTime,
	connectionStatus,
	handleManualSync,
	initEEW,
	stopEEW,
	requestNotificationPermission,
	notificationPermission,
} = useEEWMonitor();

// 다크모드 여부 계산
const isDark = computed(() => {
	return colorMode.value === "dark";
});

// 라이프사이클 관리
onMounted(() => {
	initEEW();
	if (mapEl.value) {
		initMap(mapEl.value, isDark.value);
	}
});

onBeforeUnmount(() => {
	stopEEW();
	destroyMap();
});

// [NEW] 컬러 모드 변경 감지 -> 맵 스타일 업데이트
watch(isDark, (newVal) => {
	changeMapStyle(newVal);

	// 스타일 변경 후 'styledata' 이벤트가 발생하여 레이어가 다시 생성되지만,
	// 데이터는 비어있는 상태일 수 있습니다.
	// 현재 가지고 있는 데이터를 강제로 다시 주입하여 화면 깜빡임을 최소화합니다.
	if (stationPointsData.value) {
		// 약간의 딜레이가 필요할 수 있음 (map 'styledata' 이벤트 후 실행되어야 하므로)
		// 하지만 useEEWMap 내부 로직에 의존하거나, 데이터 watch가 다시 트리거되길 기다릴 수 있습니다.
		// 가장 확실한 방법은 MapLibre의 styledata 이벤트 안에서 데이터를 복구하는 것이지만,
		// Vue의 반응성을 이용해 강제 업데이트를 시도합니다.
		setTimeout(() => {
			if (isMapLoaded.value) {
				updateStationPoints(stationPointsData.value);
				updateEEWVisuals(eewData.value, currentDisplayTime.value);
			}
		}, 300); // 스타일 로딩 시간을 고려한 안전 장치
	}
});

// 화면 가시성 변경 시 재동기화
const visibility = useDocumentVisibility();
// [변경] 스마트 재동기화 로직
// Web Worker가 백그라운드에서 잘 돌았다면 재동기화 하지 않고,
// 절전 모드 등으로 인해 시간이 3초 이상 틀어졌을 때만 재동기화 함
watch(visibility, (current, previous) => {
    if (current === "visible" && previous === "hidden") {
        if (!currentDisplayTime.value) {
            handleManualSync();
            return;
        }

        const now = new Date();
        // currentDisplayTime은 "YYYY/MM/DD HH:mm:ss" 형식이므로 Date 객체로 변환
        const lastDisplayed = new Date(currentDisplayTime.value);

        // 시간 차이 계산 (밀리초 단위)
        const diff = now.getTime() - lastDisplayed.getTime();

        // 3000ms(3초) 이상 차이가 나면 워커가 멈췄던 것으로 간주하고 재동기화
        // (네트워크 딜레이 등을 고려해 여유 있게 3~5초 정도로 잡음)
        if (Math.abs(diff) > 3000) {
            console.log("Time drifted significantly. Resyncing...", diff);
            handleManualSync();
        } else {
            console.log("Worker kept time accurately. Skipping sync.");
        }
    }
});

// 관측소 데이터 업데이트
watch(stationPointsData, (newData) => {
	if (newData) {
		updateStationPoints(newData);
	}
});

// [NEW] 관측소 데이터뿐만 아니라 EEW 데이터 및 시간 변화 감지
// eewData나 currentDisplayTime이 바뀔 때마다 파동을 다시 그림
watch(
	[() => eewData.value, () => currentDisplayTime.value],
	([newEEW, newTime]) => {
		if (isMapLoaded.value) {
			updateEEWVisuals(newEEW, newTime);
		}
	}
);

// 권한이 'granted'이면 true
const isNotificationEnabled = computed(
	() => notificationPermission.value === "granted"
);
</script>

<style scoped>
/* 스타일 기존 유지 */
.map {
	width: 100%;
	height: calc(100dvh - var(--ui-header-height));
	position: relative;
	background-color: #222; /* 다크모드 배경 */
	overflow: hidden;
}

/* 라이트 모드일 때 배경색 조정이 필요하다면 아래 코드 추가 */
/* :root.light .map { background-color: #f0f0f0; } */
</style>
