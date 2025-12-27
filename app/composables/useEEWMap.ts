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
		// 여백 제거 (스타일에서 제어)
		this.container.style.margin = "0";
	}
	onAdd() {
		return this.container;
	}
	onRemove() {
		this.container.remove();
	}
}

// 2. [NEW] System Status Bar용 컨트롤 (우측 상단)
class SystemStatusControl implements maplibregl.IControl {
	private container: HTMLElement;
	constructor() {
		this.container = document.createElement("div");
		this.container.id = "system-status-portal";
		// maplibregl-ctrl 클래스는 기본 마진을 가지므로 필요시 커스텀 클래스 사용
		this.container.className = "maplibregl-ctrl";
		this.container.style.pointerEvents = "auto";
		// MapLibre 기본 컨트롤들과의 간격 조정
		this.container.style.marginBottom = "10px";
	}
	onAdd() {
		return this.container;
	}
	onRemove() {
		this.container.remove();
	}
}

export const useEEWMap = () => {
	const mouseLng = ref<number | null>(null);
	const mouseLat = ref<number | null>(null);
	const isMapLoaded = ref(false);

	let map: maplibregl.Map | null = null;
	let userMarker: maplibregl.Marker | null = null;
	let district: GeoJSON.FeatureCollection | null = null;

	// ... (MAX_BOUNDS, highlightUserRegion 등 기존 로직 동일) ...
	const MAX_BOUNDS = new maplibregl.LngLatBounds(
		[80.5184, -0.4539],
		[193.5944, 60.4917]
	);

	const highlightUserRegion = async (lng: number, lat: number) => {
		// ... (기존 코드 생략) ...
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

		map.addControl(new maplibregl.AttributionControl(), "top-left");

		// [NEW] 상태바 컨트롤 추가 (top-right의 가장 위쪽에 배치하고 싶다면 먼저 추가)
		map.addControl(new SystemStatusControl(), "top-right");

		// [기존] EEW 모니터 컨트롤 추가
		map.addControl(new EEWControl(), "bottom-left");

		map.addControl(
			new maplibregl.NavigationControl({
				showZoom: true,
				showCompass: false,
			}),
			"top-right"
		);

		// ... (이하 기존 로직 동일) ...
		map.dragRotate.disable();
		map.touchZoomRotate.disableRotation();

		const geolocate = new maplibregl.GeolocateControl({
			trackUserLocation: false,
			showUserLocation: false,
			fitBoundsOptions: { maxZoom: 6 },
		});
		map.addControl(geolocate, "top-right");

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

		map.on("mousemove", (e) => {
			mouseLng.value = Number(e.lngLat.lng.toFixed(4));
			mouseLat.value = Number(e.lngLat.lat.toFixed(4));
		});

		map.on("load", async () => {
			// ... (기존 레이어 추가 로직 생략 - 그대로 유지) ...
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

	// ... (updateStationPoints, destroyMap 등 기존 로직 동일) ...
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
		mouseLng,
		mouseLat,
		isMapLoaded,
		initMap,
		destroyMap,
		updateStationPoints,
	};
};
