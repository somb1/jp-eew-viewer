<template>
	<div ref="mapEl" class="map">
		<template v-if="isMapLoaded">
			<Teleport to="#system-status-portal">
				<SystemStatusBar
					:eew-data="eewData"
					:current-time="currentDisplayTime"
					:status="connectionStatus"
					@sync="handleManualSync"
				/>
			</Teleport>
		</template>
	</div>
</template>

<script setup lang="ts">
import { ref, onMounted, onBeforeUnmount, watch } from "vue";
import { useDocumentVisibility } from "@vueuse/core";

// 맵 및 EEW 관련 Composable 사용
const mapEl = ref<HTMLDivElement | null>(null);
const {
	// [제거됨] mouseLng, mouseLat
	initMap,
	destroyMap,
	updateStationPoints,
	isMapLoaded,
} = useEEWMap();

const {
	eewData,
	stationPointsData,
	currentDisplayTime,
	connectionStatus,
	handleManualSync,
	initEEW,
	stopEEW,
} = useEEWMonitor();

// 라이프사이클 관리
onMounted(() => {
	initEEW();
	if (mapEl.value) {
		initMap(mapEl.value);
	}
});

onBeforeUnmount(() => {
	stopEEW();
	destroyMap();
});

// 화면 가시성 변경 시 재동기화
const visibility = useDocumentVisibility();
watch(visibility, (current, previous) => {
	if (current === "visible" && previous === "hidden") {
		handleManualSync();
	}
});

// 관측소 데이터 업데이트
watch(stationPointsData, (newData) => {
	if (newData) {
		updateStationPoints(newData);
	}
});
</script>

<style scoped>
.map {
	width: 100%;
	height: calc(100dvh - 4rem); /* 헤더 제외 높이 */
	position: relative;
	background-color: #222;
	overflow: hidden;
}

/* [제거됨] .mouse-info CSS 삭제 */
</style>
