import { ref, type Ref } from "vue";
import type maplibregl from "maplibre-gl";

export default function (map: Ref<maplibregl.Map | null>) {
	const mouseLng = ref<number | null>(null);
	const mouseLat = ref<number | null>(null);

	const setupMouseTracking = () => {
		if (!map.value) return;

		map.value.on("mousemove", (e) => {
			mouseLng.value = Number(e.lngLat.lng.toFixed(4));
			mouseLat.value = Number(e.lngLat.lat.toFixed(4));
		});
	};

	return { mouseLng, mouseLat, setupMouseTracking };
}
