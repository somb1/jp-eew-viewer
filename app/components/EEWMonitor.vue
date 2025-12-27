<template>
	<div class="eew-monitor-container">
		<div v-if="!eewData && status !== 'error'" class="eew-banner no-warn">
			<span class="banner-text">데이터 수신 중...</span>
		</div>

		<div v-else-if="isEmptyResponse" class="eew-banner no-warn">
			<span class="banner-text">긴급지진속보는 발표되지 않았습니다</span>
		</div>

		<div v-else class="eew-alert-box" :class="{ 'is-cancel': isCancel }">
			<div class="alert-header">
				<span class="alert-title">
					{{
						isCancel ? "긴급지진속보 (취소)" : "긴급지진속보 (예보)"
					}}
				</span>
				<span class="report-num">
					{{ isFinal ? "최종보" : `제 ${eewData.report_num} 보` }}
				</span>
			</div>

			<div class="alert-body">
				<div class="intensity-box">
					<div class="intensity-label">예상최대진도</div>
					<div class="intensity-value">{{ displayIntensity }}</div>
				</div>

				<div class="details-box">
					<div class="region-name">{{ eewData.region_name }}</div>

					<div class="origin-time">
						{{ formatOriginTime(eewData.origin_time) }} 발생
					</div>

					<div class="metrics-row">
						<div class="metric-item">
							<span class="m-label">M</span>
							<span class="m-value">{{
								eewData.magunitude
							}}</span>
						</div>
						<div class="metric-item">
							<span class="d-label">깊이:</span>
							<span class="d-value">{{ eewData.depth }}</span>
						</div>
					</div>
				</div>
			</div>
		</div>
	</div>
</template>

<script setup lang="ts">
import { computed } from "vue";

// 부모로부터 받을 데이터 정의
const props = defineProps<{
	eewData: any; // 또는 인터페이스 타입 지정
	status: string;
}>();

// --- Display Logic (Computed) ---

const isEmptyResponse = computed(() => {
	if (!props.eewData) return true;
	const msg = props.eewData.result?.message || "";
	return (
		msg === "" ||
		msg.includes("データがありません") ||
		msg.includes("発表されていません")
	);
});

const isCancel = computed(() => {
	return props.eewData?.is_cancel === "true";
});

const isFinal = computed(() => {
	return props.eewData?.is_final === "true";
});

const displayIntensity = computed(() => {
	const val = props.eewData?.calcintensity;
	if (!val || val === "0") return "---";
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
/* IControl 내부 컨테이너 사이즈 */
.eew-monitor-container {
	width: 380px;
	max-width: 90vw;
	font-family: "Noto Sans JP", sans-serif;
	margin-bottom: 20px;
	margin-left: 10px;
	pointer-events: auto; /* 중요: 클릭 가능하게 */
}

/* ... (이하 기존 CSS 그대로 붙여넣기) ... */
.eew-banner {
	background: rgba(40, 40, 40, 0.9);
	color: white;
	padding: 12px 16px;
	border-radius: 6px;
	box-shadow: 0 4px 10px rgba(0, 0, 0, 0.5);
	text-align: center;
	border: 1px solid #555;
}
.banner-text {
	font-size: 1.1rem;
	font-weight: 700;
	letter-spacing: 0.05em;
}

.eew-alert-box {
	background: rgba(20, 20, 20, 0.95);
	border-radius: 8px;
	overflow: hidden;
	box-shadow: 0 8px 20px rgba(0, 0, 0, 0.6);
	border: 2px solid #fff;
}

.eew-alert-box.is-cancel .alert-header {
	background: #666;
}
.eew-alert-box.is-cancel .intensity-box {
	background: #aaa;
	color: #eee;
}

.alert-header {
	background: linear-gradient(to bottom, #d32f2f, #b71c1c);
	color: white;
	padding: 6px 12px;
	display: flex;
	justify-content: space-between;
	align-items: center;
	border-bottom: 1px solid rgba(255, 255, 255, 0.2);
}

.alert-title {
	font-size: 1.1rem;
	font-weight: 900;
	letter-spacing: -0.02em;
}

.report-num {
	font-size: 0.9rem;
	font-weight: 700;
	background: rgba(0, 0, 0, 0.2);
	padding: 2px 6px;
	border-radius: 4px;
}

.alert-body {
	display: flex;
	padding: 10px;
	gap: 12px;
}

.intensity-box {
	background-color: #ffeb3b;
	color: #000;
	width: 80px;
	display: flex;
	flex-direction: column;
	justify-content: center;
	align-items: center;
	border-radius: 4px;
	box-shadow: inset 0 0 10px rgba(0, 0, 0, 0.1);
}

.intensity-label {
	font-size: 0.65rem;
	font-weight: 700;
	margin-top: 4px;
	opacity: 0.8;
}

.intensity-value {
	font-size: 3rem;
	font-weight: 900;
	line-height: 1;
	margin-bottom: 4px;
	font-family: "Roboto", sans-serif;
}

.details-box {
	flex: 1;
	display: flex;
	flex-direction: column;
	justify-content: center;
	color: white;
}

.region-name {
	font-size: 1.6rem;
	font-weight: 900;
	line-height: 1.2;
	margin-bottom: 4px;
	text-shadow: 0 2px 4px rgba(0, 0, 0, 0.8);
}

.origin-time {
	font-size: 0.9rem;
	color: #ccc;
	margin-bottom: 8px;
	font-weight: 500;
}

.metrics-row {
	display: flex;
	gap: 16px;
	align-items: baseline;
	border-top: 1px solid #444;
	padding-top: 6px;
}

.metric-item {
	display: flex;
	align-items: baseline;
	gap: 4px;
}

.m-label {
	font-size: 1rem;
	font-weight: 700;
	color: #ffeb3b;
}
.m-value {
	font-size: 1.4rem;
	font-weight: 700;
	font-family: "Roboto", sans-serif;
}
.d-label {
	font-size: 0.85rem;
	color: #aaa;
}
.d-value {
	font-size: 1.2rem;
	font-weight: 700;
	font-family: "Roboto", sans-serif;
}
</style>
