/* --------------------
 * MultiPolygon 대응 포함 feature 찾기
 * -------------------- */
import { point, booleanPointInPolygon } from "@turf/turf";

export default function (
	lng: number,
	lat: number,
	geojson: GeoJSON.FeatureCollection
): GeoJSON.Feature | null {
	const pt = point([lng, lat]);

	for (const feature of geojson.features) {
		const geom = feature.geometry;

		// 단일 Polygon
		if (geom.type === "Polygon") {
			if (booleanPointInPolygon(pt, feature as any)) {
				return feature;
			}
		}

		// MultiPolygon → Polygon 단위로 분해
		if (geom.type === "MultiPolygon") {
			for (const coords of geom.coordinates) {
				const singlePoly: GeoJSON.Feature = {
					type: "Feature",
					properties: feature.properties ?? {},
					geometry: {
						type: "Polygon",
						coordinates: coords,
					},
				};

				if (booleanPointInPolygon(pt, singlePoly as any)) {
					return singlePoly;
				}
			}
		}
	}

	return null;
}
