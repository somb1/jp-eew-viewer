import { ref, onMounted, onBeforeUnmount, type Ref } from "vue";
import maplibregl from "maplibre-gl";

export default function (containerRef: Ref<HTMLElement | null>) {
	const map = ref<maplibregl.Map | null>(null);
	const isLoaded = ref(false);

	onMounted(() => {
		if (!containerRef.value) return;

		map.value = new maplibregl.Map({
			container: containerRef.value,
			style: "/positron.json",
			center: [139.6917, 35.6894],
			zoom: 5,
		});

		map.value.addControl(
			new maplibregl.NavigationControl({
				showZoom: false,
				showCompass: false,
			})
		);

		map.value.dragRotate.disable();
		map.value.keyboard.disable();
		map.value.touchZoomRotate.disableRotation();

		map.value.on("load", () => {
			isLoaded.value = true;
		});
	});

	onBeforeUnmount(() => {
		if (map.value) map.value.remove();
	});

	return { map, isLoaded };
}
