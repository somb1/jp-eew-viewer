import { point, booleanPointInPolygon } from "@turf/turf";
import type {
	Feature,
	FeatureCollection,
	Polygon,
	MultiPolygon,
} from "geojson";

/**
 * 주어진 위경도 좌표(lng, lat)가 GeoJSON의 어떤 Feature(구역)에 포함되는지 탐색하는 함수
 * * @param lng 경도 (Longitude)
 * @param lat 위도 (Latitude)
 * @param geojson 탐색 대상이 되는 FeatureCollection (예: 행정구역 데이터)
 * @returns 포함된 Feature 객체 또는 null (찾지 못한 경우)
 */
export default function (
	lng: number,
	lat: number,
	geojson: FeatureCollection
): Feature | null {
	// =========================================================================================
	// 1. 탐색 대상 점(Point) 생성
	// =========================================================================================
	// Turf.js 연산을 위해 [경도, 위도] 배열을 GeoJSON Point 객체로 변환
	const pt = point([lng, lat]);

	// =========================================================================================
	// 2. 전체 구역(Features) 순회 및 포함 여부 검사
	// =========================================================================================
	for (const feature of geojson.features) {
		const geom = feature.geometry;

		// -------------------------------------------------------------------------------------
		// Case A: 단일 Polygon (단일 구역)
		// -------------------------------------------------------------------------------------
		if (geom.type === "Polygon") {
			// booleanPointInPolygon: 점이 폴리곤 내부에 있는지 true/false 반환
			if (booleanPointInPolygon(pt, feature as any)) {
				return feature;
			}
		}

		// -------------------------------------------------------------------------------------
		// Case B: MultiPolygon (여러 개의 떨어진 구역으로 구성된 형태)
		// -------------------------------------------------------------------------------------
		// 예: 섬이 많은 지역이나, 비지(떨어진 땅)가 있는 행정구역
		// 통째로 검사하는 대신, 각각의 폴리곤 조각(Coordinates)으로 분해하여 정밀 검사
		if (geom.type === "MultiPolygon") {
			const multiGeom = geom as MultiPolygon;

			// 각 조각(Polygon 좌표)을 순회
			for (const coords of multiGeom.coordinates) {
				// 임시 단일 Polygon Feature 생성
				// (부모 Feature의 속성(properties)을 그대로 상속받음)
				const singlePoly: Feature<Polygon> = {
					type: "Feature",
					properties: feature.properties ?? {},
					geometry: {
						type: "Polygon",
						coordinates: coords,
					},
				};

				// 분해된 단일 폴리곤에 점이 포함되는지 확인
				if (booleanPointInPolygon(pt, singlePoly)) {
					// 포함된다면, 해당 '조각'을 반환 (필요에 따라 원본 feature를 반환할 수도 있음)
					return singlePoly;
				}
			}
		}
	}

	// =========================================================================================
	// 3. 결과 반환 (탐색 실패 시)
	// =========================================================================================
	return null;
}
