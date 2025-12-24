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

				<template
					v-if="
						eewData.result?.status === 'success' &&
						eewData.result?.message !== 'データがありません'
					"
				>
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
				</template>
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
const { mouseLng, mouseLat, initMap, destroyMap } = useEEWMap();

// 2. EEW 관련 로직 가져오기
const {
	eewData,
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

.eew-info {
	position: absolute;
	top: 50%;
	right: 10px;
	transform: translateY(-50%);

	background: rgba(255, 255, 255, 0.95);
	padding: 12px;
	border-radius: 8px;
	font-size: 13px;
	z-index: 10;
	min-width: 210px;
	box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
	color: #333;
	backdrop-filter: blur(4px);
}

.header-row {
	display: flex;
	justify-content: space-between;
	align-items: center;
	border-bottom: 1px solid #eee;
	padding-bottom: 8px;
	margin-bottom: 8px;
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
	animation: pulse 1.5s infinite;
}

.status-badge.error {
	background-color: #dc3545;
}

.status-badge.syncing {
	background-color: #ffc107;
	animation: blink 1s infinite;
}

/* 상태 텍스트 스타일 */
.status-text-row {
	font-size: 10px;
	margin-bottom: 8px;
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

.sync-btn {
	background-color: #007bff;
	color: white;
	border: none;
	border-radius: 4px;
	padding: 4px 8px;
	font-size: 11px;
	cursor: pointer;
	transition: all 0.2s ease;
	font-weight: 600;
}

.sync-btn:hover:not(:disabled) {
	background-color: #0056b3;
}

.sync-btn:disabled {
	background-color: #a0c4eb;
	cursor: wait;
}

.info-row {
	display: flex;
	justify-content: space-between;
	align-items: center;
	margin-bottom: 4px;
	line-height: 1.4;
}

.label {
	color: #666;
	font-size: 12px;
}

.value {
	font-family: "Roboto Mono", monospace;
	font-weight: 500;
	color: #111;
}

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
}

@keyframes pulse {
	0% {
		transform: scale(0.95);
		opacity: 1;
	}
	50% {
		transform: scale(1.15);
		opacity: 0.8;
	}
	100% {
		transform: scale(0.95);
		opacity: 1;
	}
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
