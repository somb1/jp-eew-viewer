import { ref } from "vue";
import maplibregl from "maplibre-gl";
import * as turf from "@turf/turf";
import findContainingPolygon from "~/utils/findContainingPolygon";

// =========================================================================================
// [커스텀 컨트롤 클래스 정의]
// =========================================================================================

/**
 * 1. 시스템 상태 바(SystemStatusBar)가 위치할 컨테이너 컨트롤
 * - Vue Teleport를 통해 컴포넌트가 이곳에 마운트됩니다.
 */
class SystemStatusControl implements maplibregl.IControl {
	private container: HTMLElement;

	constructor() {
		this.container = document.createElement("div");
		this.container.id = "system-status-portal";
		this.container.className = "maplibregl-ctrl";
		this.container.style.pointerEvents = "auto";
		this.container.style.marginBottom = "10px";
	}

	onAdd() {
		return this.container;
	}

	onRemove() {
		this.container.remove();
	}
}

/**
 * 2. 마우스 좌표 표시 컨트롤
 * - 다크/라이트 모드 지원 및 모바일(아이폰 Safe Area) 대응
 */
class MouseCoordinatesControl implements maplibregl.IControl {
	private container: HTMLElement;
	private map: maplibregl.Map | undefined;

	constructor() {
		this.container = document.createElement("div");
		// Tailwind 클래스로 스타일링 (텍스트 가독성 확보를 위한 Shadow 포함)
		this.container.className =
			"maplibregl-ctrl pointer-events-none flex gap-x-3 text-[11px] font-mono font-semibold " +
			"text-gray-900 drop-shadow-[0_1px_2px_rgba(255,255,255,1)] " +
			"dark:text-white dark:drop-shadow-[0_1.5px_1.5px_rgba(0,0,0,0.9)]";

		this.container.style.display = "none";

		// 아이폰 PWA 하단 Safe Area 대응
		this.container.style.margin = "8px 8px 8px 8px";
		this.container.style.marginBottom =
			"calc(8px + env(safe-area-inset-bottom))";
	}

	onAdd(map: maplibregl.Map) {
		this.map = map;
		this.map.on("mousemove", this.onMouseMove);
		this.map.on("mouseout", this.onMouseOut);
		return this.container;
	}

	onRemove() {
		this.container.remove();
		this.map?.off("mousemove", this.onMouseMove);
		this.map?.off("mouseout", this.onMouseOut);
		this.map = undefined;
	}

	private onMouseMove = (e: maplibregl.MapMouseEvent) => {
		// 소수점 4자리로 고정하여 표시
		const lng = e.lngLat.lng.toFixed(4);
		const lat = e.lngLat.lat.toFixed(4);

		this.container.style.display = "flex";
		this.container.innerHTML = `
            <span>Lng: ${lng}</span>
            <span>Lat: ${lat}</span>
        `;
	};

	private onMouseOut = () => {
		this.container.style.display = "none";
	};
}

// =========================================================================================
// [메인 Composable: useEEWMap]
// =========================================================================================

export const useEEWMap = () => {
	// -------------------------------------------------------------------------------------
	// 1. 상수 및 설정값
	// -------------------------------------------------------------------------------------
	const STYLE_DARK = "/dataviz-v4-dark.json";
	const STYLE_LIGHT = "/dataviz-v4-light.json";

	// 지진파 속도 상수 (km/s)
	const V_P = 6.0; // P파 속도
	const V_S = 3.5; // S파 속도

	// 맵 최대 이동 범위 제한
	const MAX_BOUNDS = new maplibregl.LngLatBounds(
		[80.5184, -0.4539],
		[193.5944, 60.4917]
	);

	// -------------------------------------------------------------------------------------
	// 2. 상태 변수 (Reactive Refs)
	// -------------------------------------------------------------------------------------
	const isMapLoaded = ref(false);
	const isLocationActive = ref(false);

	// 위치 에러 상태 (코드, 메시지, 발생 시간)
	const locationError = ref<{
		code: number;
		message: string;
		timestamp: number;
	} | null>(null);

	// -------------------------------------------------------------------------------------
	// 3. 내부 변수 (Non-reactive)
	// -------------------------------------------------------------------------------------
	let map: maplibregl.Map | null = null;
	let userMarker: maplibregl.Marker | null = null;
	let district: GeoJSON.FeatureCollection | null = null;
	let geolocateControl: maplibregl.GeolocateControl | null = null;
	let lastUserCoords: { lng: number; lat: number } | null = null;

	// 패닝(드래그) 및 관성 효과 관련 변수
	let isMiddlePanning = false;
	let startX = 0;
	let startY = 0;
	let lastDeltaX = 0;
	let lastDeltaY = 0;
	let lastMoveTime = 0;

	// -------------------------------------------------------------------------------------
	// 4. 이벤트 핸들러: 마우스 조작 및 관성 패닝
	// -------------------------------------------------------------------------------------

	// 마우스 휠 클릭(가운데 버튼) 시작
	const onMouseDown = (e: MouseEvent) => {
		if (e.button === 1) {
			e.preventDefault();
			isMiddlePanning = true;
			startX = e.clientX;
			startY = e.clientY;
			if (map) map.getCanvas().style.cursor = "grabbing";
		}
	};

	// 마우스 이동 (패닝 계산 및 관성 데이터 수집)
	const onMouseMove = (e: MouseEvent) => {
		if (!isMiddlePanning || !map) return;
		e.preventDefault();

		const dx = e.clientX - startX;
		const dy = e.clientY - startY;

		// 즉각적인 지도 이동 (애니메이션 없이)
		map.panBy([-dx, -dy], { animate: false });

		// 관성 계산을 위한 현재 상태 저장
		lastDeltaX = dx;
		lastDeltaY = dy;
		lastMoveTime = performance.now();

		// 기준점 갱신
		startX = e.clientX;
		startY = e.clientY;
	};

	// 마우스 버튼 뗌 (관성 적용)
	const onMouseUp = (e: MouseEvent) => {
		if (e.button === 1 && isMiddlePanning) {
			isMiddlePanning = false;
			if (map) map.getCanvas().style.cursor = "";

			const now = performance.now();
			const timeSinceLastMove = now - lastMoveTime;

			// 마지막 움직임 후 50ms 이내에 멈추지 않고 뗐을 때만 관성 적용
			if (
				timeSinceLastMove < 50 &&
				(Math.abs(lastDeltaX) > 1 || Math.abs(lastDeltaY) > 1)
			) {
				const INERTIA_FACTOR = 5; // 관성 강도
				const DURATION = 600; // 감속 시간(ms)
				const easeOutCubic = (t: number) => 1 - Math.pow(1 - t, 3);

				map?.panBy(
					[
						-lastDeltaX * INERTIA_FACTOR,
						-lastDeltaY * INERTIA_FACTOR,
					],
					{ duration: DURATION, easing: easeOutCubic }
				);
			}
		}
	};

	// -------------------------------------------------------------------------------------
	// 5. 맵 로직: 레이어 구성 및 시각화
	// -------------------------------------------------------------------------------------

	/**
	 * 지도 레이어 및 소스 초기 설정
	 * - 스타일 변경 시 소스가 초기화되므로 재호출이 필요함
	 */
	const setupLayers = () => {
		if (!map) return;
		if (map.getSource("prefecture")) return; // 중복 방지

		// [1] 기본 경계 (Prefecture)
		map.addSource("prefecture", {
			type: "geojson",
			data: "/prefecture.geojson",
		});
		map.addLayer({
			id: "prefecture-outline",
			type: "line",
			source: "prefecture",
			paint: { "line-color": "#888", "line-width": 1 },
		});

		// [2] 상세 구역 (District)
		map.addSource("district", {
			type: "geojson",
			data: "/district.geojson",
		});
		map.addLayer({
			id: "district-outline",
			type: "line",
			source: "district",
			paint: {
				"line-color": "#888",
				"line-width": 1,
				"line-dasharray": [4, 4],
			},
		});

		// [3] 선택 지역 하이라이트 (Fill)
		map.addSource("region-selected", {
			type: "geojson",
			data: { type: "FeatureCollection", features: [] },
		});
		map.addLayer({
			id: "region-highlight",
			type: "fill",
			source: "region-selected",
			paint: { "fill-color": "#ff0000", "fill-opacity": 0.3 },
		});

		// [4] 관측소 포인트 (Circles)
		map.addSource("realtime-stations", {
			type: "geojson",
			data: { type: "FeatureCollection", features: [] },
		});
		map.addLayer({
			id: "realtime-stations-layer",
			type: "circle",
			source: "realtime-stations",
			paint: {
				"circle-color": ["get", "color"],
				"circle-radius": 4,
				"circle-stroke-width": 0.5,
				"circle-stroke-color": "#fff",
				"circle-opacity": 0.9,
			},
		});

		// [5] EEW 파동 (P파, S파)
		map.addSource("eew-waves", {
			type: "geojson",
			data: { type: "FeatureCollection", features: [] },
		});

		// S파 (실선 및 채우기)
		map.addLayer({
			id: "eew-s-wave-line",
			type: "line",
			source: "eew-waves",
			filter: ["==", "type", "S-Wave"],
			paint: {
				"line-color": "#ff4444",
				"line-width": 2,
				"line-opacity": 0.8,
			},
		});
		map.addLayer({
			id: "eew-s-wave-fill",
			type: "fill",
			source: "eew-waves",
			filter: ["==", "type", "S-Wave"],
			paint: { "fill-color": "#ff4444", "fill-opacity": 0.15 },
		});

		// P파 (점선)
		map.addLayer({
			id: "eew-p-wave-line",
			type: "line",
			source: "eew-waves",
			filter: ["==", "type", "P-Wave"],
			paint: {
				"line-color": "#4488ff",
				"line-width": 1.5,
				"line-dasharray": [4, 2],
				"line-opacity": 0.7,
			},
		});

		// [6] 진앙지 마커 (X 표시)
		map.addSource("eew-epicenter", {
			type: "geojson",
			data: { type: "FeatureCollection", features: [] },
		});
		map.addLayer({
			id: "eew-epicenter-marker",
			type: "circle",
			source: "eew-epicenter",
			paint: {
				"circle-radius": 8,
				"circle-color": "#ff0000",
				"circle-stroke-width": 2,
				"circle-stroke-color": "#ffffff",
			},
		});
		map.addLayer({
			id: "eew-epicenter-symbol",
			type: "symbol",
			source: "eew-epicenter",
			layout: {
				"text-field": "✖",
				"text-size": 14,
				"text-allow-overlap": true,
			},
			paint: { "text-color": "#ffffff" },
		});
	};

	/**
	 * 관측소 데이터 업데이트
	 */
	const updateStationPoints = (geoJsonData: any) => {
		if (!map || !map.getSource("realtime-stations")) return;
		(
			map.getSource("realtime-stations") as maplibregl.GeoJSONSource
		).setData(geoJsonData);
	};

	/**
	 * EEW 데이터 시각화 (진앙지 및 P/S파 원 그리기)
	 */
	const updateEEWVisuals = (eewData: any, currentDisplayTime: string) => {
		if (!map || !isMapLoaded.value) return;

		const epicenterSource = map.getSource(
			"eew-epicenter"
		) as maplibregl.GeoJSONSource;
		const waveSource = map.getSource(
			"eew-waves"
		) as maplibregl.GeoJSONSource;

		// 데이터가 없거나 유효하지 않으면 초기화
		if (!eewData || !eewData.result) {
			epicenterSource?.setData({
				type: "FeatureCollection",
				features: [],
			});
			waveSource?.setData({ type: "FeatureCollection", features: [] });
			return;
		}

		// 1. 데이터 파싱
		const lat = parseFloat(eewData.latitude);
		const lng = parseFloat(eewData.longitude);
		const depth = parseInt(eewData.depth.replace("km", "")) || 10;

		// [수정됨] 2. 시간 차이 계산 (현재 시각 - 발생 시각)
		// Safari/iOS 호환성을 위해 정규식으로 숫자만 추출하여 Date 생성
		const timeParts = currentDisplayTime.match(/\d+/g);
		if (!timeParts || timeParts.length < 6) return;

		const currTime = new Date(
			parseInt(timeParts[0]!), // Year
			parseInt(timeParts[1]!) - 1, // Month (0-based)
			parseInt(timeParts[2]!), // Day
			parseInt(timeParts[3]!), // Hour
			parseInt(timeParts[4]!), // Minute
			parseInt(timeParts[5]!)  // Second
		);

		const originStr = eewData.origin_time;
		const originTime = new Date(
			parseInt(originStr.substring(0, 4)),
			parseInt(originStr.substring(4, 6)) - 1,
			parseInt(originStr.substring(6, 8)),
			parseInt(originStr.substring(8, 10)),
			parseInt(originStr.substring(10, 12)),
			parseInt(originStr.substring(12, 14))
		);
		
		const timeDiff = (currTime.getTime() - originTime.getTime()) / 1000;

		if (timeDiff < 0) return; // 미래 시간 무시

		// 3. 진앙지 업데이트
		epicenterSource?.setData({
			type: "FeatureCollection",
			features: [
				{
					type: "Feature",
					properties: {},
					geometry: { type: "Point", coordinates: [lng, lat] },
				},
			],
		});

		// 4. 파동 반경 계산 (피타고라스 정리: 지표 거리 = sqrt(이동거리^2 - 깊이^2))
		const distP = V_P * timeDiff;
		const distS = V_S * timeDiff;

		const radiusP =
			distP > depth
				? Math.sqrt(Math.pow(distP, 2) - Math.pow(depth, 2))
				: 0;
		const radiusS =
			distS > depth
				? Math.sqrt(Math.pow(distS, 2) - Math.pow(depth, 2))
				: 0;

		// 5. Turf.js를 이용해 원형 폴리곤 생성
		const features: any[] = [];
		if (radiusP > 0) {
			const pCircle = turf.circle([lng, lat], radiusP, {
				steps: 64,
				units: "kilometers",
			});
			pCircle.properties = { type: "P-Wave" };
			features.push(pCircle);
		}
		if (radiusS > 0) {
			const sCircle = turf.circle([lng, lat], radiusS, {
				steps: 64,
				units: "kilometers",
			});
			sCircle.properties = { type: "S-Wave" };
			features.push(sCircle);
		}

		waveSource?.setData({ type: "FeatureCollection", features });
	};

	/**
	 * 사용자 위치 기반 행정구역 하이라이트
	 */
	const highlightUserRegion = async (lng: number, lat: number) => {
		if (!map) return;
		// 구역 데이터가 없으면 로드
		if (!district)
			district = await fetch("/district.geojson").then((r) => r.json());

		// 좌표가 포함된 폴리곤 찾기
		const feature = findContainingPolygon(lng, lat, district!);
		if (!feature) return;

		const source = map.getSource(
			"region-selected"
		) as maplibregl.GeoJSONSource;
		source?.setData({ type: "FeatureCollection", features: [feature] });
	};

	// -------------------------------------------------------------------------------------
	// 6. 맵 생명주기 및 제어 (Init, Destroy, Style, Utils)
	// -------------------------------------------------------------------------------------

	/**
	 * 맵 스타일 변경 (다크/라이트)
	 * - 스타일 변경 시 레이어가 소실되므로 다시 그리는 로직 포함
	 */
	const changeMapStyle = (isDark: boolean) => {
		if (!map) return;
		const targetStyle = isDark ? STYLE_DARK : STYLE_LIGHT;

		map.setStyle(targetStyle);

		map.once("styledata", () => {
			setupLayers();
			// 사용자 위치가 있다면 하이라이트 복구
			if (lastUserCoords) {
				highlightUserRegion(lastUserCoords.lng, lastUserCoords.lat);
			}
		});
	};

	/**
	 * 레이아웃 강제 갱신
	 * - 모바일/Safari 등에서 렌더링이 멈췄을 때 깨우는 용도
	 */
	const refreshMapLayout = () => {
		if (map) map.resize();
	};

	/**
	 * 위치 찾기 트리거 (외부 호출용)
	 */
	const triggerLocation = () => {
		if (geolocateControl) geolocateControl.trigger();
	};

	/**
	 * 맵 초기화 함수
	 */
	const initMap = (
		container: HTMLElement,
		initialDarkMode: boolean = true
	) => {
		map = new maplibregl.Map({
			container,
			style: initialDarkMode ? STYLE_DARK : STYLE_LIGHT,
			center: [139.6917, 35.6894],
			zoom: 4.7,
			maxBounds: MAX_BOUNDS,
			attributionControl: false,
			dragPan: true,
		});

		// 마우스 이벤트 리스너 등록
		map.getCanvas().addEventListener("mousedown", onMouseDown);
		window.addEventListener("mousemove", onMouseMove);
		window.addEventListener("mouseup", onMouseUp);

		// 기본 컨트롤 추가
		map.addControl(
			new maplibregl.AttributionControl({ compact: true }),
			"bottom-right"
		);
		map.addControl(new SystemStatusControl(), "top-right");
		map.addControl(new MouseCoordinatesControl(), "bottom-right");

		// 불필요한 제스처 비활성화
		map.dragRotate.disable();
		map.touchZoomRotate.disableRotation();
		map.touchPitch.disable();
		map.boxZoom.disable();

		// GeolocateControl 설정
		geolocateControl = new maplibregl.GeolocateControl({
			positionOptions: { enableHighAccuracy: true },
			trackUserLocation: true, // 추적 모드 활성화 (아이콘 색상 유지)
			showUserLocation: false, // 기본 마커 대신 커스텀 마커 사용
			showAccuracyCircle: false,
			fitBoundsOptions: { maxZoom: 4.7 },
		});

		map.addControl(geolocateControl, "bottom-right");

		// GeolocateControl UI 숨김 처리 (커스텀 버튼 사용을 위함)
		const geolocateBtn = (geolocateControl as any)
			._container as HTMLElement;
		if (geolocateBtn) geolocateBtn.style.display = "none";

		// 위치 확인 성공 시 이벤트
		geolocateControl.on("geolocate", (e: any) => {
			isLocationActive.value = true;
			const lng = e.coords.longitude;
			const lat = e.coords.latitude;
			lastUserCoords = { lng, lat };

			// 커스텀 마커 생성 또는 이동
			if (!userMarker) {
				userMarker = new maplibregl.Marker({ color: "#ff0000" })
					.setLngLat([lng, lat])
					.addTo(map!);
			} else {
				userMarker.setLngLat([lng, lat]);
			}
			highlightUserRegion(lng, lat);
		});

		// 위치 추적 중단 시 (지도 드래그 등) - 현재 로직상 주석 처리됨
		geolocateControl.on("trackuserlocationend", () => {
			// isLocationActive.value = false;
		});

		// 위치 에러 핸들링
		geolocateControl.on("error", (e: any) => {
			console.error("Geolocate Error:", e);
			isLocationActive.value = false;

			const errorObj = e.error || e;
			locationError.value = {
				code: errorObj.code || 0,
				message: errorObj.message || "Unknown error",
				timestamp: Date.now(),
			};
		});

		// 맵 로드 완료 이벤트
		map.on("load", async () => {
			setupLayers();
			isMapLoaded.value = true;
			// 로드 직후 위치 찾기를 원하면 아래 주석 해제
			geolocateControl?.trigger();
		});
	};

	/**
	 * 맵 리소스 정리 (언마운트 시 호출)
	 */
	const destroyMap = () => {
		if (map) {
			map.getCanvas().removeEventListener("mousedown", onMouseDown);
		}
		window.removeEventListener("mousemove", onMouseMove);
		window.removeEventListener("mouseup", onMouseUp);

		isMapLoaded.value = false;
		userMarker?.remove();
		map?.remove();
	};

	return {
		// 상태
		isMapLoaded,
		isLocationActive,
		locationError,

		// 초기화 및 해제
		initMap,
		destroyMap,

		// 제어 및 유틸리티
		changeMapStyle,
		refreshMapLayout,
		triggerLocation,

		// 데이터 업데이트
		updateStationPoints,
		updateEEWVisuals,
	};
};
