#!/usr/bin/env python3
"""Generate demonstrative equal-area sectors within La Reina's official UVs.

Install requirements-neighborhoods.txt, then run from any directory. The source
polygons are referential ministerial cartography; the lettered subdivisions are
algorithmic demonstration sectors, never official unidades vecinales.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import math
from pathlib import Path

from pyproj import Transformer
from shapely import transform as transform_geometry
from shapely.geometry import GeometryCollection, MultiPolygon, Polygon, box, mapping, shape
from shapely.ops import polygonize, polylabel, unary_union


ROOT = Path(__file__).resolve().parents[1]
TO_METRES = Transformer.from_crs("EPSG:4326", "EPSG:32719", always_xy=True)
TO_WGS84 = Transformer.from_crs("EPSG:32719", "EPSG:4326", always_xy=True)
SOURCE_PAGE = "https://bidat.gob.cl/details/ficha/dataset/shape-de-unidades-vecinales-del-registro-social-de-hogares"
SOURCE_SERVICE = "https://services.arcgis.com/r7t1P5pnkoOLRdhr/arcgis/rest/services/Unidades_Vecinales___2024/FeatureServer/0"


def transform(function, geometry):
    return transform_geometry(geometry, function, interleaved=False)


def polygonal(geometry):
    """Keep every polygon component, including holes and disconnected islands."""
    if isinstance(geometry, (Polygon, MultiPolygon)):
        return geometry
    parts = []
    if isinstance(geometry, GeometryCollection):
        for child in geometry.geoms:
            result = polygonal(child)
            if isinstance(result, Polygon) and not result.is_empty:
                parts.append(result)
            elif isinstance(result, MultiPolygon):
                parts.extend(result.geoms)
    if not parts:
        return Polygon()
    return parts[0] if len(parts) == 1 else MultiPolygon(parts)


def cut_balanced(geometry, left_fraction, axis):
    """Find a metric half-plane with the requested share of polygon area."""
    west, south, east, north = geometry.bounds
    low, high = (west, east) if axis == 0 else (south, north)
    padding = max(east - west, north - south, 1) + 1
    target = geometry.area * left_fraction
    for _ in range(65):
        cut = (low + high) / 2
        lower_box = (
            box(west - padding, south - padding, cut, north + padding)
            if axis == 0
            else box(west - padding, south - padding, east + padding, cut)
        )
        lower = polygonal(geometry.intersection(lower_box))
        if lower.area < target:
            low = cut
        else:
            high = cut
    cut = (low + high) / 2
    if axis == 0:
        lower_box = box(west - padding, south - padding, cut, north + padding)
        upper_box = box(cut, south - padding, east + padding, north + padding)
    else:
        lower_box = box(west - padding, south - padding, east + padding, cut)
        upper_box = box(west - padding, cut, east + padding, north + padding)
    return polygonal(geometry.intersection(lower_box)), polygonal(geometry.intersection(upper_box))


def subdivide(geometry, count):
    """Recursively bisect the longest bounding-box axis in equal-area shares."""
    if count == 1:
        return [geometry]
    west, south, east, north = geometry.bounds
    axis = 0 if east - west >= north - south else 1
    lower_count = count // 2
    lower, upper = cut_balanced(geometry, lower_count / count, axis)
    assert lower.area > 0 and upper.area > 0, "A cut produced an empty sector"
    return subdivide(lower, lower_count) + subdivide(upper, count - lower_count)


def shared_vertices(pieces, parent):
    """Node T-junctions before projection so adjacent rings share every vertex.

    A straight UTM edge becomes slightly curved in longitude/latitude. Projecting
    only one side's intermediate vertices would create microscopic overlaps.
    Polygonizing the noded linework inserts the same vertices on both sides,
    including when a split makes disconnected pieces or encloses a hole.
    """
    faces = list(polygonize(unary_union([piece.boundary for piece in pieces])))
    groups = [[] for _ in pieces]
    for face in faces:
        point = face.representative_point()
        if not parent.covers(point):
            continue  # Polygonized holes are not territory.
        matches = [i for i, piece in enumerate(pieces) if piece.covers(point)]
        assert len(matches) == 1, "A noded face has ambiguous ownership"
        groups[matches[0]].append(face)
    assert all(groups), "Noding discarded a sector"
    return [polygonal(unary_union(group)) for group in groups]


def count_for_area(area, target):
    ratio = area / target
    candidates = {max(1, math.floor(ratio)), max(1, math.ceil(ratio))}
    return min(candidates, key=lambda count: (abs(area / count - target), count))


def letter(index):
    result = ""
    index += 1
    while index:
        index, digit = divmod(index - 1, 26)
        result = chr(65 + digit) + result
    return result


def rounded_coordinates(value):
    if isinstance(value, (list, tuple)):
        return [rounded_coordinates(child) for child in value]
    return round(value, 9)


def geographic_geometry(geometry):
    result = mapping(transform(TO_WGS84.transform, geometry))
    return {"type": result["type"], "coordinates": rounded_coordinates(result["coordinates"])}


def label_point(geometry):
    # Only the label uses the largest component. All components remain in output.
    largest = max(geometry.geoms, key=lambda part: part.area) if isinstance(geometry, MultiPolygon) else geometry
    point = polylabel(largest, tolerance=0.25)
    lng, lat = TO_WGS84.transform(point.x, point.y)
    return [round(lng, 9), round(lat, 9)]


def validate(parents, children, target_counts):
    """Validate *serialized, rounded* geometry, not merely intermediate cuts."""
    child_shapes = [(feature, transform(TO_METRES.transform, shape(feature["geometry"]))) for feature in children]
    assert len({f["properties"]["id"] for f in children}) == len(children)
    assert all(g.is_valid and not g.is_empty for _, g in child_shapes)
    largest_coverage_error = largest_overlap = largest_equal_area_error = 0.0
    for unit, parent in parents.items():
        pieces = [geometry for feature, geometry in child_shapes if feature["properties"]["unit"] == unit]
        assert len(pieces) == target_counts[unit]
        union = unary_union(pieces)
        error = parent.symmetric_difference(union).area
        overlaps = sum(a.intersection(b).area for i, a in enumerate(pieces) for b in pieces[i + 1:])
        equal_error = max(abs(piece.area - parent.area / len(pieces)) for piece in pieces)
        assert error < 2, f"UV {unit}: coverage differs by {error:.6f} m²"
        assert overlaps < 0.1, f"UV {unit}: sectors overlap by {overlaps:.6f} m²"
        assert equal_error < 2, f"UV {unit}: equal-area error {equal_error:.6f} m²"
        largest_coverage_error = max(largest_coverage_error, error)
        largest_overlap = max(largest_overlap, overlaps)
        largest_equal_area_error = max(largest_equal_area_error, equal_error)
    all_pieces = [g for _, g in child_shapes]
    full_overlap = sum(a.intersection(b).area for i, a in enumerate(all_pieces) for b in all_pieces[i + 1:])
    assert full_overlap < 0.2, f"Cross-unit overlap is {full_overlap:.6f} m²"
    return {
        "valid": True,
        "coordinateDecimals": 9,
        "maxParentCoverageDifferenceM2": round(largest_coverage_error, 6),
        "totalPairwiseOverlapM2": round(full_overlap, 6),
        "maxWithinUnitOverlapM2": round(largest_overlap, 6),
        "maxEqualAreaDeviationM2": round(largest_equal_area_error, 6),
    }


def build(source, source_year):
    original = json.loads(source.read_text())
    source_features = sorted(original["features"], key=lambda f: int(f["properties"]["uv_carto"]))
    assert [int(f["properties"]["uv_carto"]) for f in source_features] == list(range(1, 16))
    parents = {str(f["properties"]["uv_carto"]): transform(TO_METRES.transform, shape(f["geometry"])) for f in source_features}
    assert all(geometry.is_valid and not geometry.is_empty for geometry in parents.values())
    target = parents["13"].area / 4
    counts = {unit: (4 if unit == "13" else count_for_area(geometry.area, target)) for unit, geometry in parents.items()}
    features, units = [], []
    for source_feature in source_features:
        unit = str(source_feature["properties"]["uv_carto"])
        parent = parents[unit]
        pieces = shared_vertices(subdivide(parent, counts[unit]), parent)
        units.append({
            "type": "Feature",
            "properties": {"id": unit, "unit": unit, "areaM2": round(parent.area, 3), "labelPoint": label_point(parent), "subdivisionCount": counts[unit]},
            # Preserve source parent boundaries without clipping or reprojecting.
            "geometry": source_feature["geometry"],
        })
        for index, piece in enumerate(pieces):
            features.append({
                "type": "Feature",
                "properties": {"id": f"{unit}-{letter(index)}", "unit": unit, "areaM2": round(piece.area, 3), "labelPoint": label_point(piece)},
                "geometry": geographic_geometry(piece),
            })
    verification = validate(parents, features, counts)
    commune_data = json.loads((ROOT / "assets/la-reina.geojson").read_text())
    commune = unary_union([transform(TO_METRES.transform, shape(f["geometry"])) for f in commune_data["features"]])
    coverage = unary_union(list(parents.values()))
    metadata = {
        "title": "Unidades vecinales de La Reina y sectores demostrativos",
        "source": "Ministerio de Desarrollo Social y Familia, Banco Integrado de Datos (BIDAT)",
        "sourceYear": source_year,
        "sourcePage": SOURCE_PAGE,
        "sourceService": SOURCE_SERVICE if source_year == 2024 else None,
        "sourceCatalogItem": "https://www.arcgis.com/home/item.html?id=3ce3d4d033c8427085cec48139ab1155" if source_year == 2024 else None,
        "sourceFile": str(source.relative_to(ROOT)),
        "sourceSha256": hashlib.sha256(source.read_bytes()).hexdigest(),
        "consulted": "2026-11-24",
        "license": "CC BY 4.0",
        "licenseUrl": "https://creativecommons.org/licenses/by/4.0/deed.es",
        "geometryStatus": "Cartografía ministerial referencial. Los sectores con letras son subdivisiones algorítmicas de demostración, no unidades vecinales oficiales.",
        "projection": "EPSG:32719",
        "targetAreaM2": round(target, 3),
        "unitCount": len(units),
        "subdivisionCount": len(features),
        "method": "Divisiones recursivas por el eje mayor del rectángulo envolvente, equilibradas por área métrica. La unidad 13 se divide en cuatro; para las demás se elige la cantidad que aproxima mejor esa superficie por sector.",
        "unitCounts": counts,
        "coverage": {
            "parentUnionAreaM2": round(coverage.area, 3),
            "existingCommuneAreaM2": round(commune.area, 3),
            "outsideExistingCommuneM2": round(coverage.difference(commune).area, 3),
            "existingCommuneNotCoveredM2": round(commune.difference(coverage).area, 3),
            "parentBordersPreserved": True,
            "unit14Note": "La unidad 14 incluye el territorio oriental hasta el límite comunal; no se recorta al encuadre urbano del plano de referencia.",
        },
        "verification": verification,
    }
    return {"type": "FeatureCollection", "features": features, "units": {"type": "FeatureCollection", "features": units}, "metadata": metadata}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--source", type=Path, default=ROOT / "Documentos/fuentes-analisis/unidades-vecinales-la-reina-2024.geojson")
    parser.add_argument("--source-year", type=int, default=2024)
    parser.add_argument("--output", type=Path, default=ROOT / "assets/la-reina-neighborhoods.geojson")
    args = parser.parse_args()
    result = build(args.source.resolve(), args.source_year)
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(result, ensure_ascii=False, separators=(",", ":")) + "\n")
    print(json.dumps({"output": str(args.output), **result["metadata"]}, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
