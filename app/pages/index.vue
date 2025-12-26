<template>
	<div ref="mapEl" class="map">
		<div class="mouse-info">
			<div>Lng: {{ mouseLng }}</div>
			<div>Lat: {{ mouseLat }}</div>
		</div>

		<div class="eew-info" v-if="currentDisplayTime">
			<div class="header-row">
				<div class="title-group">
					<span class="status-badge" :class="connectionStatus"></span>
					<span class="info-title">EEW Monitor</span>
				</div>

				<button
					class="sync-btn"
					@click="handleManualSync"
					:disabled="connectionStatus === 'syncing'"
					title="서버 시간으로 동기화"
				>
					{{ connectionStatus === "syncing" ? "..." : "Sync" }}
				</button>
			</div>

			<div class="status-text-row">
				<span v-if="connectionStatus === 'live'" class="status-live"
					>● LIVE FEED</span
				>
				<span
					v-else-if="connectionStatus === 'error'"
					class="status-error"
					>● CONNECTION ERROR</span
				>
				<span v-else class="status-sync">● SYNCING...</span>
			</div>

			<div class="info-row" v-if="connectionStatus !== 'error'">
				<span class="label">Target Time:</span>
				<span class="value">{{ currentDisplayTime }}</span>
			</div>

			<div v-if="lastErrorMessage" class="error-banner">
				{{ lastErrorMessage }}
			</div>

			<div
				v-if="eewData && connectionStatus !== 'error'"
				class="eew-details"
			>
				<div class="info-row">
					<span class="label">Status:</span>
					<span class="value">{{
						eewData.result?.message || eewData.result?.status
					}}</span>
				</div>

				<div class="info-row warning">
					<span class="label">calcintensity:</span>
					<span class="value">{{ eewData.calcintensity }}</span>
				</div>
				<div class="info-row warning">
					<span class="label">depth:</span>
					<span class="value">{{ eewData.depth }}</span>
				</div>
				<div class="info-row warning">
					<span class="label">is_cancel:</span>
					<span class="value">{{ eewData.is_cancel }}</span>
				</div>
				<div class="info-row warning">
					<span class="label">is_final:</span>
					<span class="value">{{ eewData.is_final }}</span>
				</div>
				<div class="info-row warning">
					<span class="label">is_training:</span>
					<span class="value">{{ eewData.is_training }}</span>
				</div>
				<div class="info-row warning">
					<span class="label">latitude:</span>
					<span class="value">{{ eewData.latitude }}</span>
				</div>
				<div class="info-row warning">
					<span class="label">longitude:</span>
					<span class="value">{{ eewData.longitude }}</span>
				</div>
				<div class="info-row warning">
					<span class="label">Magnitude:</span>
					<span class="value">M{{ eewData.magunitude }}</span>
				</div>
				<div class="info-row warning">
					<span class="label">origin_time:</span>
					<span class="value">{{ eewData.origin_time }}</span>
				</div>
				<div class="info-row warning">
					<span class="label">region_code:</span>
					<span class="value">{{ eewData.region_code }}</span>
				</div>
				<div class="info-row warning">
					<span class="label">region_name:</span>
					<span class="value">{{ eewData.region_name }}</span>
				</div>
				<div class="info-row warning">
					<span class="label">report_id:</span>
					<span class="value">{{ eewData.report_id }}</span>
				</div>
				<div class="info-row warning">
					<span class="label">report_num:</span>
					<span class="value">{{ eewData.report_num }}</span>
				</div>
				<div class="info-row warning">
					<span class="label">report_time:</span>
					<span class="value">{{ eewData.report_time }}</span>
				</div>
			</div>
			<div v-else-if="connectionStatus !== 'error'" class="loading">
				Initializing...
			</div>
		</div>
	</div>
</template>

<script setup lang="ts">
import { ref, onMounted, onBeforeUnmount } from "vue";

// 1. Map 관련 로직 가져오기
const mapEl = ref<HTMLDivElement | null>(null);
const { mouseLng, mouseLat, initMap, destroyMap, updateStationPoints } =
	useEEWMap();

// 2. EEW 관련 로직 가져오기
const {
	eewData,
	stationPointsData,
	currentDisplayTime,
	connectionStatus,
	lastErrorMessage,
	handleManualSync,
	initEEW,
	stopEEW,
} = useEEWMonitor();

// 3. 라이프사이클 연결
onMounted(() => {
	// EEW 모니터링 시작
	initEEW();

	// 지도 초기화
	if (mapEl.value) {
		initMap(mapEl.value);
	}
});

onBeforeUnmount(() => {
	stopEEW();
	destroyMap();
});

// 1. 현재 탭의 가시성 상태를 반응형 변수(Ref)로 가져옵니다.
// 값은 'visible', 'hidden', 'prerender' 중 하나입니다.
const visibility = useDocumentVisibility();

// 2. visibility 상태가 변할 때마다 감지합니다.
watch(visibility, (current, previous) => {
	// 탭이 'hidden'에서 'visible'로 바뀌었을 때 (사용자가 돌아왔을 때)
	if (current === "visible" && previous === "hidden") {
		console.log("탭 복귀 감지: 데이터/시간 동기화 실행");
		handleManualSync(); // 동기화 함수 실행
	}
});

// [추가] 관측소 데이터가 변경되면 지도 업데이트
watch(stationPointsData, (newData) => {
	if (newData) {
		updateStationPoints(newData);
	}
});
</script>

<style scoped>
.map {
	width: 100%;
	height: calc(100vh - 4rem);
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
	box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
}

/* ---------------------------------------------------------
   EEW Monitor 패널 스타일 (PC/모바일 공통 적용)
   - 화면 하단 고정
   - 가로로 길게 배치 (우측 버튼 공간 60px 제외)
--------------------------------------------------------- */
.eew-info {
	position: absolute;

	/* 위치 설정: 하단 고정 */
	bottom: 52px;
	left: 12px;
	/* 우측 하단 지도 컨트롤(줌, 위치 등) 회피를 위해 60px 여백 확보 */
	right: 60px;
	top: auto; /* 상단 위치 해제 */
	transform: none; /* 중앙 정렬 해제 */

	/* 모양 및 색상 */
	background: rgba(255, 255, 255, 0.95);
	padding: 10px 12px;
	border-radius: 8px;
	font-size: 13px;
	z-index: 10;
	color: #333;
	backdrop-filter: blur(4px);
	box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);

	/* 내부 레이아웃: 세로 스택 (헤더 -> 내용) */
	display: flex;
	flex-direction: column;

	/* 내용이 많을 경우 스크롤 처리 */
	max-height: 40vh;
	overflow-y: auto;
}

/* 헤더 영역 (제목, Sync 버튼) */
.header-row {
	display: flex;
	justify-content: space-between;
	align-items: center;
	border-bottom: 1px solid #eee;
	padding-bottom: 6px;
	margin-bottom: 6px;
}

.title-group {
	display: flex;
	align-items: center;
	gap: 6px;
}

.info-title {
	font-weight: 700;
	font-size: 14px;
}

/* 상태 표시 배지 (초록/빨강/노랑 점) */
.status-badge {
	display: inline-block;
	width: 10px;
	height: 10px;
	border-radius: 50%;
	background-color: #ccc;
	transition: background-color 0.3s;
}

.status-badge.live {
	background-color: #28a745;
	box-shadow: 0 0 8px rgba(40, 167, 69, 0.6);
}

.status-badge.error {
	background-color: #dc3545;
}

.status-badge.syncing {
	background-color: #ffc107;
	animation: blink 1s infinite;
}

/* 상태 텍스트 (LIVE FEED 등) */
.status-text-row {
	font-size: 10px;
	margin-bottom: 6px;
	font-weight: 700;
	letter-spacing: 0.5px;
}
.status-live {
	color: #28a745;
}
.status-error {
	color: #dc3545;
}
.status-sync {
	color: #d39e00;
}

.error-banner {
	background-color: #fde8e8;
	color: #c53030;
	padding: 4px 8px;
	border-radius: 4px;
	font-size: 11px;
	margin-bottom: 6px;
	border: 1px solid #fbd5d5;
}

/* 동기화 버튼 */
.sync-btn {
	background-color: #007bff;
	color: white;
	border: none;
	border-radius: 4px;
	padding: 2px 8px;
	font-size: 11px;
	cursor: pointer;
	transition: all 0.2s ease;
	font-weight: 600;
	height: 24px;
}

.sync-btn:hover:not(:disabled) {
	background-color: #0056b3;
}

.sync-btn:disabled {
	background-color: #a0c4eb;
	cursor: wait;
}

/* 데이터 상세 영역 스타일 
   가로로 나열되도록 flex-wrap 설정 
*/
.eew-details {
	display: flex;
	flex-wrap: wrap; /* 공간이 부족하면 줄바꿈 */
	gap: 0 16px; /* 항목 간 간격 */
	align-items: center;
}

/* 개별 정보 항목 (Label + Value) */
.info-row {
	display: inline-flex; /* 가로 배치 */
	align-items: center;
	gap: 6px;
	margin-bottom: 2px;
	line-height: 1.4;
	white-space: nowrap; /* 줄바꿈 방지 */
}

.label {
	color: #666;
	font-size: 12px;
}

.value {
	font-family: "Roboto Mono", monospace;
	font-weight: 500;
	color: #111;
	font-size: 12px;
}

/* 경고성 데이터(진도, 마그니튜드 등) 강조 */
.warning .label {
	color: #d32f2f;
	font-weight: 600;
}

.warning .value {
	color: #d32f2f;
	font-weight: 700;
}

.loading {
	color: #888;
	font-style: italic;
	text-align: center;
	padding: 4px 0;
	font-size: 12px;
}

@keyframes blink {
	0% {
		opacity: 1;
	}
	50% {
		opacity: 0.5;
	}
	100% {
		opacity: 1;
	}
}
</style>
