import { ref } from "vue";
import maplibregl from "maplibre-gl";
import findContainingPolygon from "~/utils/findContainingPolygon";
import * as turf from "@turf/turf"; // Turf 전체 혹은 circle만 import

// 2. [기존] System Status Bar용 컨트롤 (우측 상단)
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

// 3. [NEW] 마우스 좌표 표시용 컨트롤 (다크모드/라이트모드 대응 + 아이폰 Safe Area 대응)
class MouseCoordinatesControl implements maplibregl.IControl {
    private container: HTMLElement;
    private map: maplibregl.Map | undefined;

    constructor() {
        this.container = document.createElement("div");

        // [스타일 수정 핵심]
        // 1. text-gray-900: 라이트 모드일 때 진한 회색(검정 계열)
        // 2. drop-shadow-[...rgba(255,255,255,1)]: 라이트 모드일 때 글씨 주변에 흰색 테두리(Halo)를 주어 지도 선 위에서도 잘 보이게 함
        // 3. dark:text-white: 다크 모드일 때 흰색
        // 4. dark:drop-shadow-[...]: 다크 모드일 때 검은 그림자
        this.container.className =
            "maplibregl-ctrl pointer-events-none flex gap-x-3 text-[11px] font-mono font-semibold " +
            "text-gray-900 drop-shadow-[0_1px_2px_rgba(255,255,255,1)] " + 
            "dark:text-white dark:drop-shadow-[0_1.5px_1.5px_rgba(0,0,0,0.9)]";

        this.container.style.display = "none";

        // [아이폰 PWA 하단 잘림 방지]
        // 기본 마진 8px + Safe Area(홈 인디케이터 높이)
        this.container.style.margin = "8px 8px 8px 8px"; 
        this.container.style.marginBottom = "calc(8px + env(safe-area-inset-bottom))";
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
        // 소수점 4자리 고정으로 흔들림 방지
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

export const useEEWMap = () => {
	const isMapLoaded = ref(false);

	let map: maplibregl.Map | null = null;
	let userMarker: maplibregl.Marker | null = null;
	let district: GeoJSON.FeatureCollection | null = null;

	// [1] 가운데 클릭 패닝을 위한 상태 변수
    let isMiddlePanning = false;
    let startX = 0;
    let startY = 0;

	// [1] 마지막 사용자 위치를 저장할 변수 추가
    let lastUserCoords: { lng: number; lat: number } | null = null;

	// 스타일 경로 상수 정의
	const STYLE_DARK = "/dataviz-v4-dark.json";
	const STYLE_LIGHT = "/dataviz-v4-light.json";

	const MAX_BOUNDS = new maplibregl.LngLatBounds(
		[80.5184, -0.4539],
		[193.5944, 60.4917]
	);
	// 지진파 속도 상수 (단위: km/s, 일반적인 지각 속도 근사값)
	const V_P = 6.0;
	const V_S = 3.5;

	// [2] 이벤트 핸들러 정의
    
    // 마우스 누름: 가운데 버튼(button === 1)인지 확인
    const onMouseDown = (e: MouseEvent) => {
        if (e.button === 1) { 
            e.preventDefault(); // 브라우저 자동 스크롤 모드 방지
            isMiddlePanning = true;
            startX = e.clientX;
            startY = e.clientY;
            if (map) map.getCanvas().style.cursor = 'grabbing';
        }
    };

    // 마우스 이동: 패닝 처리
	const onMouseMove = (e: MouseEvent) => {
		if (!isMiddlePanning || !map) return;
		e.preventDefault();

		const dx = e.clientX - startX;
		const dy = e.clientY - startY;

		// [수정] dx, dy에 마이너스(-)를 붙여 반대 방향으로 이동시킵니다.
		// 원리: 마우스를 오른쪽(동쪽)으로 끌면 -> 카메라는 왼쪽(서쪽)으로 가야 -> 지도가 오른쪽으로 이동해 보임
		map.panBy([-dx, -dy], { animate: false });

		startX = e.clientX;
		startY = e.clientY;
	};

    // 마우스 뗌: 드래그 종료
    const onMouseUp = (e: MouseEvent) => {
        if (e.button === 1 && isMiddlePanning) {
            isMiddlePanning = false;
            if (map) map.getCanvas().style.cursor = '';
        }
    };

	// [REFACTOR] 레이어 및 소스 설정을 별도 함수로 분리
	// 스타일이 변경(setStyle)되면 소스/레이어가 초기화되므로 다시 실행해야 함
	const setupLayers = () => {
		if (!map) return;

		// 이미 소스가 있다면 중복 추가 방지 (혹은 에러 무시)
		if (map.getSource("prefecture")) return;

		// 1. 기본 경계 데이터 (Prefecture)
		map.addSource("prefecture", {
			type: "geojson",
			data: "/prefecture.geojson",
		});
		map.addLayer({
			id: "prefecture-outline",
			type: "line",
			source: "prefecture",
			paint: { "line-color": "#888", "line-width": 1 }, // 색상 중립적으로 변경 또는 테마별 분기 가능
		});

		// 2. 상세 구역 데이터 (District)
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

		// 3. 선택된 지역 하이라이트
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

		// 4. 관측소 포인트
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

		// 5. EEW 파동 (S파/P파)
		map.addSource("eew-waves", {
			type: "geojson",
			data: { type: "FeatureCollection", features: [] },
		});

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
			paint: {
				"fill-color": "#ff4444",
				"fill-opacity": 0.15,
			},
		});

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

		// 6. 진앙지 마커
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
			paint: {
				"text-color": "#ffffff",
			},
		});
	};

	// [3] changeMapStyle 함수 수정
    const changeMapStyle = (isDark: boolean) => {
        if (!map) return;
        const targetStyle = isDark ? "/dataviz-v4-dark.json" : "/dataviz-v4-light.json";

        map.setStyle(targetStyle);

        map.once("styledata", () => {
            setupLayers(); // 레이어 다시 쌓기

            // [핵심] 저장된 위치가 있다면 하이라이트 다시 그리기
            if (lastUserCoords) {
                highlightUserRegion(lastUserCoords.lng, lastUserCoords.lat);
                
                // (선택 사항) 마커가 혹시 사라졌다면 다시 위치 잡아주기
                // 보통 Marker는 DOM 엘리먼트라 setStyle에도 유지되지만, 
                // 만약 사라진다면 여기서 userMarker.addTo(map) 등을 해줄 수 있습니다.
            }
        });
    };

	// [NEW] EEW 시각화를 위한 함수
	const updateEEWVisuals = (eewData: any, currentDisplayTime: string) => {
		if (!map || !isMapLoaded.value) return;

		// 1. 소스 가져오기 (없으면 리턴)
		const epicenterSource = map.getSource(
			"eew-epicenter"
		) as maplibregl.GeoJSONSource;
		const waveSource = map.getSource(
			"eew-waves"
		) as maplibregl.GeoJSONSource;

		if (!eewData || !eewData.result) {
			// 데이터가 없으면 레이어 초기화
			if (epicenterSource)
				epicenterSource.setData({
					type: "FeatureCollection",
					features: [],
				});
			if (waveSource)
				waveSource.setData({ type: "FeatureCollection", features: [] });
			return;
		}

		// 2. 데이터 파싱
		const lat = parseFloat(eewData.latitude);
		const lng = parseFloat(eewData.longitude);
		const depthStr = eewData.depth.replace("km", "");
		const depth = parseInt(depthStr) || 10; // 깊이 (km)

		// 시간 계산을 위한 파싱 (YYYY/MM/DD HH:mm:ss -> Date)
		// 주의: currentDisplayTime은 "YYYY/MM/DD HH:mm:ss" 형식이므로 변환 필요
		const currTime = new Date(currentDisplayTime);

		// Origin Time (YYYYMMDDHHmmss -> Date)
		const originStr = eewData.origin_time;
		const originTime = new Date(
			parseInt(originStr.substring(0, 4)),
			parseInt(originStr.substring(4, 6)) - 1,
			parseInt(originStr.substring(6, 8)),
			parseInt(originStr.substring(8, 10)),
			parseInt(originStr.substring(10, 12)),
			parseInt(originStr.substring(12, 14))
		);

		// 경과 시간 (초 단위)
		const timeDiff = (currTime.getTime() - originTime.getTime()) / 1000;

		if (timeDiff < 0) return; // 미래 시간이면 표시 안 함

		// 3. 진앙지 마커 표시 (X 표시)
		if (epicenterSource) {
			epicenterSource.setData({
				type: "FeatureCollection",
				features: [
					{
						type: "Feature",
						properties: {},
						geometry: {
							type: "Point",
							coordinates: [lng, lat],
						},
					},
				],
			});
		}

		// 4. P파, S파 반경 계산 (피타고라스 정리: 지표면 거리 = sqrt(이동거리^2 - 깊이^2))
		// 이동 거리 = 속도 * 시간
		const distP = V_P * timeDiff;
		const distS = V_S * timeDiff;

		// 지표면 도달 반경 (깊이보다 적게 이동했으면 0)
		const radiusP =
			distP > depth
				? Math.sqrt(Math.pow(distP, 2) - Math.pow(depth, 2))
				: 0;
		const radiusS =
			distS > depth
				? Math.sqrt(Math.pow(distS, 2) - Math.pow(depth, 2))
				: 0;

		const features: any[] = [];

		// Turf.js로 원형 폴리곤 생성 (steps를 높일수록 원이 부드러워짐)
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

		if (waveSource) {
			waveSource.setData({
				type: "FeatureCollection",
				features: features,
			});
		}
	};

	const highlightUserRegion = async (lng: number, lat: number) => {
		// ... (기존 로직 동일) ...
		if (!map) return;
		if (!district)
			district = await fetch("/district.geojson").then((r) => r.json());

		const feature = findContainingPolygon(lng, lat, district!);
		if (!feature) return;

		const source = map.getSource(
			"region-selected"
		) as maplibregl.GeoJSONSource;
		if (source) {
			source.setData({
				type: "FeatureCollection",
				features: [feature],
			});
		}
	};

	const initMap = (container: HTMLElement, initialDarkMode: boolean = true) => {
		map = new maplibregl.Map({
			container,
			style: initialDarkMode ? STYLE_DARK : STYLE_LIGHT, // 초기 스타일 설정
			center: [139.6917, 35.6894],
			zoom: 4.75,
			maxBounds: MAX_BOUNDS,
			attributionControl: false,
			dragPan: true,
		});

		// [3] 이벤트 리스너 등록
        // mousedown은 맵 캔버스에서 감지
        map.getCanvas().addEventListener("mousedown", onMouseDown);
        // move와 up은 윈도우 전체에서 감지 (드래그 중 맵 밖으로 나가도 끊기지 않게)
        window.addEventListener("mousemove", onMouseMove);
        window.addEventListener("mouseup", onMouseUp);

		map.addControl(
			new maplibregl.AttributionControl({ compact: true }),
			"bottom-right"
		);

		// [기존] 상단 컨트롤들
		map.addControl(new SystemStatusControl(), "top-right");
		/*
		map.addControl(
			new maplibregl.NavigationControl({
				showZoom: true,
				showCompass: false,
			}),
			"top-right"
		);
		*/
		map.dragRotate.disable();
		map.touchZoomRotate.disableRotation();
		map.touchPitch.disable();
		map.boxZoom.disable();

		const geolocate = new maplibregl.GeolocateControl({
			trackUserLocation: false,
			showUserLocation: false,
			fitBoundsOptions: { maxZoom: 4.75 },
		});
		map.addControl(geolocate, "top-right");

		// [변경] 마우스 좌표 컨트롤을 'bottom-left'에 추가
		// 가장 먼저 추가하면 가장 아래쪽에 깔리고, 나중에 추가하면 그 위에 쌓임
		// EEWControl(모니터)보다 아래 혹은 위에 두고 싶은지에 따라 순서 조정 가능.
		// 여기서는 좌표를 가장 하단 구석에 두기 위해 먼저 추가
		map.addControl(new MouseCoordinatesControl(), "bottom-right");

		// [2] geolocate 이벤트 수정
        geolocate.on("geolocate", (e) => {
            const lng = e.coords.longitude;
            const lat = e.coords.latitude;

            // 좌표 저장
            lastUserCoords = { lng, lat };

            if (!userMarker) {
                userMarker = new maplibregl.Marker({ color: "#ff0000" })
                    .setLngLat([lng, lat])
                    .addTo(map!);
            } else {
                userMarker.setLngLat([lng, lat]);
            }

            highlightUserRegion(lng, lat);
        });

		map.on("load", async () => {
			// [REFACTOR] 로드 시 setupLayers 호출
			setupLayers();
			isMapLoaded.value = true;
			geolocate.trigger();
		});
	};

	const updateStationPoints = (geoJsonData: any) => {
		if (!map || !map.getSource("realtime-stations")) return;
		const source = map.getSource(
			"realtime-stations"
		) as maplibregl.GeoJSONSource;
		source.setData(geoJsonData);
	};

	const destroyMap = () => {
		// [4] 이벤트 리스너 정리 (메모리 누수 방지)
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
		isMapLoaded,
		initMap,
		destroyMap,
		updateStationPoints,
		updateEEWVisuals, // [NEW] export 추가
		changeMapStyle, // [NEW] export
	};
};
