import maplibregl from "maplibre-gl";

export const useEEWMap = () => {
	const mouseLng = ref<number | null>(null);
	const mouseLat = ref<number | null>(null);

	let map: maplibregl.Map | null = null;
	let userMarker: maplibregl.Marker | null = null;
	let district: GeoJSON.FeatureCollection | null = null;

	const MAX_BOUNDS = new maplibregl.LngLatBounds(
		[80.5184, -0.4539],
		[193.5944, 60.4917]
	);

	// 지역 하이라이트 로직
	const highlightUserRegion = async (lng: number, lat: number) => {
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
		});
		/*
		map.addControl(
			new maplibregl.NavigationControl({
				showZoom: false,
				showCompass: false,
			})
		);
		*/
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

			// ============================================
			// [추가] 실시간 관측소 점(Stations) 레이어
			// ============================================
			map!.addSource("realtime-stations", {
				type: "geojson",
				data: { type: "FeatureCollection", features: [] }, // 초기엔 빈 데이터
			});

			map!.addLayer({
				id: "realtime-stations-layer",
				type: "circle",
				source: "realtime-stations",
				paint: {
					// GeoJSON properties의 'color' 값을 가져와서 색칠
					"circle-color": ["get", "color"],
					"circle-radius": 4, // 점 크기
					"circle-stroke-width": 0.5, // 테두리 두께
					"circle-stroke-color": "#fff", // 테두리 색상 (흰색)
					"circle-opacity": 0.9, // 불투명도
				},
			});

			// 로드 완료 후 바로 위치 추적 시도
			geolocate.trigger();
		});
	};

	// [추가] 외부에서 GeoJSON 데이터를 받아 맵을 업데이트하는 함수
	const updateStationPoints = (geoJsonData: any) => {
		if (!map || !map.getSource("realtime-stations")) return;

		const source = map.getSource(
			"realtime-stations"
		) as maplibregl.GeoJSONSource;
		source.setData(geoJsonData);
	};

	const destroyMap = () => {
		userMarker?.remove();
		map?.remove();
	};

	return {
		mouseLng,
		mouseLat,
		initMap,
		destroyMap,
		updateStationPoints,
	};
};
