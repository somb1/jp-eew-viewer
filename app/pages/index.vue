<template>
	<div ref="mapEl" class="map">
		<div class="mouse-info">
			<div>Lng: {{ mouseLng }}</div>
			<div>Lat: {{ mouseLat }}</div>
		</div>
	</div>
</template>

<script setup lang="ts">
import { ref, watch } from "vue";

/* --------------------
 * 지도 초기화
 * -------------------- */
const mapEl = ref<HTMLDivElement | null>(null);
const { map, isLoaded } = useMapBase(mapEl);

/* --------------------
 * 기능별 모듈 연결
 * -------------------- */
const { mouseLng, mouseLat, setupMouseTracking } = useMapMouse(map);
const { initRegionLayers, setupGeolocation } = useRegionLayer(map);

/* --------------------
 * 맵 로드 완료 시점 처리
 * -------------------- */
watch(isLoaded, (loaded) => {
	if (loaded) {
		setupMouseTracking(); // 마우스 추적 시작
		initRegionLayers(); // 레이어 추가
		setupGeolocation(); // 위치 추적 및 하이라이트 로직 시작
	}
});
</script>

<style scoped>
.map {
	width: 100%;
	height: calc(100vh - 4rem); /* 모바일 브라우저 대응 */
	height: calc(100dvh - 4rem);
	position: relative;
}

.mouse-info {
	color: #000;
	position: absolute;
	top: 10px;
	left: 50%;
	transform: translateX(-50%);
	background: rgba(255, 255, 255, 0.95);
	padding: 6px 10px;
	border-radius: 4px;
	font-size: 12px;
	pointer-events: none;
	z-index: 10;
}
</style>
