import { ref, type Ref, onBeforeUnmount } from 'vue';
import maplibregl from 'maplibre-gl';
import type { FeatureCollection } from 'geojson';

export default function (map: Ref<maplibregl.Map | null>) {
  const prefectureGeojson = ref<FeatureCollection | null>(null);
  let userMarker: maplibregl.Marker | null = null;

  // 레이어 및 소스 초기화
  const initRegionLayers = () => {
    if (!map.value) return;

    map.value.addSource('prefecture', {
      type: 'geojson',
      data: '/prefecture.geojson',
    });

    map.value.addLayer({
      id: 'prefecture-outline',
      type: 'line',
      source: 'prefecture',
      paint: { 'line-color': '#555', 'line-width': 1 },
    });

    map.value.addSource('region-selected', {
      type: 'geojson',
      data: { type: 'FeatureCollection', features: [] },
    });

    map.value.addLayer({
      id: 'region-highlight',
      type: 'fill',
      source: 'region-selected',
      paint: {
        'fill-color': '#ff0000',
        'fill-opacity': 0.3,
      },
    });
  };

  // 특정 위치의 행정구역 하이라이트
  const highlightRegion = async (lng: number, lat: number) => {
    if (!map.value) return;

    if (!prefectureGeojson.value) {
      const res = await fetch('/prefecture.geojson');
      prefectureGeojson.value = await res.json();
    }

    const feature = findContainingPolygon(lng, lat, prefectureGeojson.value!);
    if (!feature) return;

    const source = map.value.getSource('region-selected') as maplibregl.GeoJSONSource;
    if (source) {
      source.setData({
        type: 'FeatureCollection',
        features: [feature],
      });
    }
  };

  // Geolocate 컨트롤 및 이벤트 설정
  const setupGeolocation = () => {
    if (!map.value) return;

    const geolocate = new maplibregl.GeolocateControl({
      trackUserLocation: false,
      showUserLocation: false,
      fitBoundsOptions: { maxZoom: 5 },
    });

    map.value.addControl(geolocate);

    geolocate.on('geolocate', (e: any) => { // 타입은 GeolocationEvent 사용 권장
      const { longitude: lng, latitude: lat } = e.coords;

      if (!userMarker) {
        userMarker = new maplibregl.Marker({ color: '#ff0000' })
          .setLngLat([lng, lat])
          .addTo(map.value!);
      } else {
        userMarker.setLngLat([lng, lat]);
      }

      highlightRegion(lng, lat);
    });

    requestAnimationFrame(() => {
        geolocate.trigger();
    });
  };
  
  onBeforeUnmount(() => {
    userMarker?.remove();
  });

  return { initRegionLayers, setupGeolocation };
}