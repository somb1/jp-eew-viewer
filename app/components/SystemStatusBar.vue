<template>
	<div class="system-status-bar font-bold rounded-full">
		<div class="status-indicator">
			<span class="dot" :class="status"></span>
			<span class="time">{{ currentTime || "Connecting..." }}</span>
		</div>

		<button
			class="sync-btn"
			@click="$emit('sync')"
			:disabled="status === 'syncing'"
		>
			{{ status === "syncing" ? "Syncing..." : "Sync Time" }}
		</button>
	</div>
</template>

<script setup lang="ts">
defineProps<{
	currentTime: string;
	status: string;
}>();

defineEmits<{
	(e: "sync"): void;
}>();
</script>

<style scoped>
/* MapLibre Control 내부에 들어가므로 absolute positioning 제거.
  float, margin 등은 MapLibre가 처리해줌.
*/
.system-status-bar {
    display: flex;
    align-items: center;
    gap: 10px;
    background: rgba(0, 0, 0, 0.6);
    backdrop-filter: blur(4px);
    padding: 6px 12px;
    border-radius: 20px; /* 바깥쪽 라운드 값 */
    color: white;
    pointer-events: auto;
}

.status-indicator {
	display: flex;
	align-items: center;
	gap: 6px;
	font-family: "Roboto Mono", monospace;
	font-size: 13px;
}

.dot {
	width: 8px;
	height: 8px;
	border-radius: 50%;
	background-color: #ccc;
}
.dot.live {
	background-color: #4cd964;
	box-shadow: 0 0 6px #4cd964;
}
.dot.syncing {
	background-color: #ffcc00;
	animation: blink 1s infinite;
}
.dot.error {
	background-color: #ff3b30;
}
.dot.test {
	background-color: #d63384;
	box-shadow: 0 0 6px #d63384;
}

.sync-btn {
    background: rgba(255, 255, 255, 0.2);
    border: none;
    color: #fff;
    padding: 4px 10px;
    /* border-radius: 4px;  <-- 기존 값 */
    border-radius: 20px; /* <-- 수정된 값: 바깥과 동일하게 라운드 처리 */
    font-size: 11px;
    cursor: pointer;
    transition: background 0.2s;
}
.sync-btn:hover {
	background: rgba(255, 255, 255, 0.3);
}
.sync-btn:disabled {
	opacity: 0.5;
	cursor: not-allowed;
}

@keyframes blink {
	0%,
	100% {
		opacity: 1;
	}
	50% {
		opacity: 0.5;
	}
}
</style>
