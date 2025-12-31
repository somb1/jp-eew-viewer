<template>
	<div ref="mapEl" class="map">
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
					@sync="handleManualSync"
					@toggle-notification="toggleNotification"
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
	// [NEW] 가져오기
    triggerLocation,
    isLocationActive,
	locationError, // [NEW] 에러 상태 가져오기
	refreshMapLayout,
} = useEEWMap();

const {
	eewData,
	stationPointsData,
	currentDisplayTime,
	connectionStatus,
	handleManualSync,
	initEEW,
	stopEEW,
	toggleNotification, // [NEW] 가져오기
	isNotificationActive, // [NEW] 가져오기
	notificationPermission,
	monitorType, // [NEW]
	monitorSource, // [NEW]
} = useEEWMonitor();

// 다크모드 여부 계산
const isDark = computed(() => {
	return colorMode.value === "dark";
});

const toast = useToast(); // Toast 사용을 위해 가져오기 (없으면 const toast = useToast() 추가)

// [NEW] 위치 버튼 핸들러: 토스트 없이 기능만 실행
const handleLocationTrigger = () => {
    triggerLocation();
};

// [FIXED] 에러 감지 로직
watch(locationError, (err) => {
    if (!err) return;
    
    console.log("Location Error Caught in Watcher:", err); // 디버깅용

    if (err.code === 1) { // PERMISSION_DENIED
         toast.add({ 
             title: "위치 권한이 거부되었습니다.", 
             description: "브라우저 설정에서 위치 권한을 허용해주세요.", 
             icon: "i-heroicons-exclamation-triangle", 
         });
    } else if (err.code === 2 || err.code === 3) { // POSITION_UNAVAILABLE or TIMEOUT
         toast.add({ 
             title: "위치 확인 실패", 
             description: "현재 위치를 가져올 수 없습니다. (Code: " + err.code + ")", 
             icon: "i-heroicons-exclamation-circle", 
         });
    } else {
        // 기타 에러
        toast.add({ 
             title: "위치 오류", 
             description: err.message, 
             icon: "i-heroicons-exclamation-circle", 
         });
    }
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
watch(visibility, (current) => {
    if (current === "visible") {
        // Safari PWA 복귀 시 렌더링 멈춤 현상 해결을 위한 로직
        // 약간의 지연(300ms)을 주어 브라우저가 그래픽 리소스를 복구할 시간을 줌
        setTimeout(() => {
            if (isMapLoaded.value) {
                // 1. 맵 캔버스 크기 재계산 (멈춘 렌더링 루프 깨우기)
                refreshMapLayout();

                // 2. 가지고 있는 데이터 강제 재주입 (화면 갱신)
                if (stationPointsData.value) {
                    updateStationPoints(stationPointsData.value);
                }
                
                // 3. EEW 파동 데이터도 있다면 재주입
                if (eewData.value) {
                    updateEEWVisuals(eewData.value, currentDisplayTime.value);
                }
            }
        }, 300); 
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

// [MODIFIED] 최종 알림 상태 계산
// 브라우저 권한도 있고(granted) + 앱 내부 스위치도 켜져있어야(true) -> true
const finalNotificationState = computed(() => {
	return (
		notificationPermission.value === "granted" && isNotificationActive.value
	);
});
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
