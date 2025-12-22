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
          {{ connectionStatus === 'syncing' ? '...' : 'Sync' }}
        </button>
      </div>

      <div class="status-text-row">
        <span v-if="connectionStatus === 'live'" class="status-live">● LIVE FEED</span>
        <span v-else-if="connectionStatus === 'error'" class="status-error">● CONNECTION ERROR</span>
        <span v-else class="status-sync">● SYNCING...</span>
      </div>

      <div class="info-row" v-if="connectionStatus !== 'error'">
        <span class="label">Target Time:</span>
        <span class="value">{{ currentDisplayTime }}</span>
      </div>
      
      <div v-if="lastErrorMessage" class="error-banner">
        {{ lastErrorMessage }}
      </div>

      <div v-if="eewData && connectionStatus !== 'error'" class="eew-details">
        <div class="info-row">
          <span class="label">Status:</span>
          <span class="value">{{ eewData.result?.message || eewData.result?.status }}</span>
        </div>
        
        <template v-if="eewData.result?.status === 'success' && eewData.result?.message !== 'データがありません'">
          <div class="info-row warning">
            <span class="label">Region:</span>
            <span class="value">{{ eewData.region_name }}</span>
          </div>
          <div class="info-row warning">
            <span class="label">Magnitude:</span>
            <span class="value">M{{ eewData.magunitude }}</span>
          </div>
          <div class="info-row warning">
            <span class="label">Intensity:</span>
            <span class="value">{{ eewData.calcintensity }}</span>
          </div>
        </template>
      </div>
      <div v-else-if="connectionStatus !== 'error'" class="loading">Initializing...</div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onBeforeUnmount } from "vue";
import maplibregl from "maplibre-gl";

/* --------------------
 * 1. 상태 변수
 * -------------------- */
const mapEl = ref<HTMLDivElement | null>(null);
const mouseLng = ref<number | null>(null);
const mouseLat = ref<number | null>(null);

// EEW 관련 상태
const eewData = ref<any>(null);
const currentDisplayTime = ref<string>("");

// 상태 관리 변수 ('init' | 'syncing' | 'live' | 'error')
const connectionStatus = ref<string>('init');
const lastErrorMessage = ref<string | null>(null);

let timerId: any = null;
let simulatedTime: Date | null = null;

// 지도 객체들
let map: maplibregl.Map | null = null;
let userMarker: maplibregl.Marker | null = null;
let prefecture: GeoJSON.FeatureCollection | null = null;

const highlightUserRegion = async (lng: number, lat: number) => {
  if (!map) return;
  if (!prefecture)
    prefecture = await fetch("/prefecture.geojson").then((r) => r.json());

  // @ts-ignore
  const feature = findContainingPolygon(lng, lat, prefecture!);
  if (!feature) return;
  
  const source = map.getSource("region-selected") as maplibregl.GeoJSONSource;
  if (source) {
    source.setData({
      type: "FeatureCollection",
      features: [feature],
    });
  }
};

/* --------------------
 * 2. EEW 관련 로직
 * -------------------- */

const formatDateToParam = (date: Date): string => {
  const pad = (n: number) => n.toString().padStart(2, "0");
  return (
    date.getFullYear().toString() +
    pad(date.getMonth() + 1) +
    pad(date.getDate()) +
    pad(date.getHours()) +
    pad(date.getMinutes()) +
    pad(date.getSeconds())
  );
};

const formatDateToDisplay = (date: Date): string => {
  return date.toLocaleString('ko-KR', { hour12: false });
};

// [로직 1] 서버 시간 동기화
const syncFromServer = async () => {
  try {
    const latestRes = await fetch("/api/latest").then((r) => r.json());
    const newTime = new Date(latestRes.latest_time);
    
    simulatedTime = newTime;
    currentDisplayTime.value = formatDateToDisplay(newTime);
    lastErrorMessage.value = null;
    
    console.log("Synced time to:", newTime);
    return true;
  } catch (error: any) {
    console.error("Failed to sync latest time:", error);
    connectionStatus.value = 'error';
    lastErrorMessage.value = "Sync Failed";
    return false;
  }
};

// [로직 2] 루프 실행
const startLoop = () => {
  if (timerId) clearInterval(timerId);

  timerId = setInterval(async () => {
    if (!simulatedTime) return;

    // 1초 증가
    simulatedTime.setSeconds(simulatedTime.getSeconds() + 1);
    
    // UI 업데이트 (여기선 변수만 업데이트하고 표시는 템플릿 v-if에서 제어)
    const timeParam = formatDateToParam(simulatedTime);
    currentDisplayTime.value = formatDateToDisplay(simulatedTime);

    try {
      const res = await fetch(`/api/eew?time=${timeParam}`).then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      });

      eewData.value = res;
      connectionStatus.value = 'live';
      lastErrorMessage.value = null;
    } catch (err: any) {
      console.error("EEW Fetch Error", err);
      connectionStatus.value = 'error';
      lastErrorMessage.value = "Connection Lost";
    }
  }, 1000);
};

// [로직 3] 수동 동기화 버튼 핸들러
const handleManualSync = async () => {
  if (connectionStatus.value === 'syncing') return;
  
  if (timerId) clearInterval(timerId);
  connectionStatus.value = 'syncing';

  const success = await syncFromServer();
  if (success) {
    startLoop();
  }
};

// [로직 4] 초기화 함수
const init = async () => {
  connectionStatus.value = 'syncing';
  const success = await syncFromServer();
  if (success) {
    startLoop();
  }
};

/* --------------------
 * 라이프사이클
 * -------------------- */
onMounted(() => {
  init();

  if (!mapEl.value) return;

  map = new maplibregl.Map({
    container: mapEl.value,
    style: "/positron.json",
    center: [139.6917, 35.6894],
    zoom: 6,
  });

  map.addControl(new maplibregl.NavigationControl({ showZoom: false, showCompass: false }));
  map.dragRotate.disable();
  map.touchZoomRotate.disableRotation();

  const geolocate = new maplibregl.GeolocateControl({
    trackUserLocation: false,
    showUserLocation: false,
    fitBoundsOptions: { maxZoom: 6 },
  });
  map.addControl(geolocate);

  geolocate.on("geolocate", (e) => {
    const lng = e.coords.longitude;
    const lat = e.coords.latitude;
    if (!userMarker) {
      userMarker = new maplibregl.Marker({ color: "#ff0000" }).setLngLat([lng, lat]).addTo(map!);
    } else {
      userMarker.setLngLat([lng, lat]);
    }
    highlightUserRegion(lng, lat);
  });

  map.on("mousemove", (e) => {
    mouseLng.value = Number(e.lngLat.lng.toFixed(4));
    mouseLat.value = Number(e.lngLat.lat.toFixed(4));
  });

  map.on("load", async () => {
    map!.addSource("prefecture", { type: "geojson", data: "/prefecture.geojson" });
    map!.addLayer({
      id: "prefecture-outline",
      type: "line",
      source: "prefecture",
      paint: { "line-color": "#555", "line-width": 1 },
    });
    map!.addSource("region-selected", { type: "geojson", data: { type: "FeatureCollection", features: [] } });
    map!.addLayer({
      id: "region-highlight",
      type: "fill",
      source: "region-selected",
      paint: { "fill-color": "#ff0000", "fill-opacity": 0.3 },
    });
    geolocate.trigger();
  });
});

onBeforeUnmount(() => {
  if (timerId) clearInterval(timerId);
  userMarker?.remove();
  map?.remove();
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
  box-shadow: 0 2px 4px rgba(0,0,0,0.1);
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
  box-shadow: 0 4px 12px rgba(0,0,0,0.15);
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
.status-live { color: #28a745; }
.status-error { color: #dc3545; }
.status-sync { color: #d39e00; }

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
  font-family: 'Roboto Mono', monospace;
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
  0% { transform: scale(0.95); opacity: 1; }
  50% { transform: scale(1.15); opacity: 0.8; }
  100% { transform: scale(0.95); opacity: 1; }
}

@keyframes blink {
  0% { opacity: 1; }
  50% { opacity: 0.5; }
  100% { opacity: 1; }
}
</style>