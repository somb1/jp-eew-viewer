import { ref } from "vue";
import maplibregl from "maplibre-gl";
import findContainingPolygon from "~/utils/findContainingPolygon";

// 1. [기존] EEW Monitor용 컨트롤 (좌측 하단)
class EEWControl implements maplibregl.IControl {
	private container: HTMLElement;
	constructor() {
		this.container = document.createElement("div");
		this.container.id = "eew-control-portal";
		this.container.className = "maplibregl-ctrl";
		this.container.style.pointerEvents = "auto";
		this.container.style.margin = "0";
	}
	onAdd() {
		return this.container;
	}
	onRemove() {
		this.container.remove();
	}
}

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

// 3. [NEW] 마우스 좌표 표시용 컨트롤 (Nuxt UI 스타일 & 좌측 하단)
class MouseCoordinatesControl implements maplibregl.IControl {
	private container: HTMLElement;
	private map: maplibregl.Map | undefined;

	constructor() {
		this.container = document.createElement("div");
		// [스타일 수정]
		// maplibregl-ctrl: 필수 클래스
		// pointer-events-none: 마우스 통과
		// flex gap-x-3: 가로 배치
		// text-[11px] font-mono: Nuxt UI 느낌의 깔끔한 고정폭 폰트
		// font-semibold: 가독성 확보
		// text-white drop-shadow-md: 배경 없이도 잘 보이게 처리 (진한 그림자)
		this.container.className =
			"maplibregl-ctrl pointer-events-none flex gap-x-3 text-[11px] font-mono font-semibold text-white drop-shadow-[0_1.5px_1.5px_rgba(0,0,0,0.9)]";

		this.container.style.display = "none";

		// 좌측 하단 구석에 딱 붙지 않게 약간의 여백 (Tailwind m-2 등 사용 가능하지만 컨트롤 특성상 style이 안전)
		this.container.style.margin = "0 0 8px 8px";
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

	const MAX_BOUNDS = new maplibregl.LngLatBounds(
		[80.5184, -0.4539],
		[193.5944, 60.4917]
	);

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

	const initMap = (container: HTMLElement) => {
		map = new maplibregl.Map({
			container,
			style: "/positron.json",
			center: [139.6917, 35.6894],
			zoom: 6,
			maxBounds: MAX_BOUNDS,
			attributionControl: false,
		});

		map.addControl(new maplibregl.AttributionControl({ compact: true }), "bottom-right");

		// [변경] 마우스 좌표 컨트롤을 'bottom-left'에 추가
		// 가장 먼저 추가하면 가장 아래쪽에 깔리고, 나중에 추가하면 그 위에 쌓임
		// EEWControl(모니터)보다 아래 혹은 위에 두고 싶은지에 따라 순서 조정 가능.
		// 여기서는 좌표를 가장 하단 구석에 두기 위해 먼저 추가
		map.addControl(new MouseCoordinatesControl(), "bottom-left");

		// [기존] EEW 모니터 컨트롤 (좌표 위에 쌓임)
		map.addControl(new EEWControl(), "bottom-left");

		// [기존] 상단 컨트롤들
		map.addControl(new SystemStatusControl(), "top-right");

		map.addControl(
			new maplibregl.NavigationControl({
				showZoom: true,
				showCompass: false,
			}),
			"bottom-right"
		);

		// ... (이하 로직 동일) ...
		map.dragRotate.disable();
		map.touchZoomRotate.disableRotation();

		const geolocate = new maplibregl.GeolocateControl({
			trackUserLocation: false,
			showUserLocation: false,
			fitBoundsOptions: { maxZoom: 6 },
		});
		map.addControl(geolocate, "bottom-right");

		geolocate.on("geolocate", (e) => {
			const lng = e.coords.longitude;
			const lat = e.coords.latitude;

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
			// ... (기존 레이어 추가 로직 전체 동일 - 생략 없이 유지 필요) ...
			map!.addSource("prefecture", {
				type: "geojson",
				data: "/prefecture.geojson",
			});
			map!.addLayer({
				id: "prefecture-outline",
				type: "line",
				source: "prefecture",
				paint: { "line-color": "#555", "line-width": 1 },
			});

			map!.addSource("district", {
				type: "geojson",
				data: "/district.geojson",
			});
			map!.addLayer({
				id: "district-outline",
				type: "line",
				source: "district",
				paint: {
					"line-color": "#555",
					"line-width": 1,
					"line-dasharray": [4, 4],
				},
			});

			map!.addSource("region-selected", {
				type: "geojson",
				data: { type: "FeatureCollection", features: [] },
			});
			map!.addLayer({
				id: "region-highlight",
				type: "fill",
				source: "region-selected",
				paint: { "fill-color": "#ff0000", "fill-opacity": 0.3 },
			});

			map!.addSource("realtime-stations", {
				type: "geojson",
				data: { type: "FeatureCollection", features: [] },
			});
			map!.addLayer({
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
		isMapLoaded.value = false;
		userMarker?.remove();
		map?.remove();
	};

	return {
		isMapLoaded,
		initMap,
		destroyMap,
		updateStationPoints,
	};
};
