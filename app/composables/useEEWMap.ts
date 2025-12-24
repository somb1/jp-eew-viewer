import maplibregl from "maplibre-gl";

export const useEEWMap = () => {
	const mouseLng = ref<number | null>(null);
	const mouseLat = ref<number | null>(null);

	let map: maplibregl.Map | null = null;
	let userMarker: maplibregl.Marker | null = null;
	let prefecture: GeoJSON.FeatureCollection | null = null;

	// 지역 하이라이트 로직
	const highlightUserRegion = async (lng: number, lat: number) => {
		if (!map) return;
		if (!prefecture)
			prefecture = await fetch("/prefecture.geojson").then((r) =>
				r.json()
			);

		// findContainingPolygon은 utils 폴더에 있어 자동 import 된다고 가정 (또는 직접 import)
		// @ts-ignore
		const feature = findContainingPolygon(lng, lat, prefecture!);
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
		});

		map.addControl(
			new maplibregl.NavigationControl({
				showZoom: false,
				showCompass: false,
			})
		);
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

			// 로드 완료 후 바로 위치 추적 시도
			geolocate.trigger();
		});
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
	};
};
