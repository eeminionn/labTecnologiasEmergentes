#!/usr/bin/env python3
"""Focused topology and output tests; uses requirements-neighborhoods.txt."""

import importlib.util
import json
import unittest
from pathlib import Path

from shapely.geometry import GeometryCollection, MultiPolygon, Point, Polygon, box, shape
from shapely.ops import unary_union

SPEC = importlib.util.spec_from_file_location("prepare_neighborhood_data", Path(__file__).with_name("prepare-neighborhood-data.py"))
MODULE = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(MODULE)


class NeighborhoodDataTest(unittest.TestCase):
    def assert_partition(self, parent, count):
        pieces = MODULE.shared_vertices(MODULE.subdivide(parent, count), parent)
        self.assertEqual(len(pieces), count)
        self.assertTrue(all(piece.is_valid for piece in pieces))
        self.assertLess(parent.symmetric_difference(unary_union(pieces)).area, 1e-6)
        self.assertLess(sum(a.intersection(b).area for i, a in enumerate(pieces) for b in pieces[i + 1:]), 1e-6)
        self.assertLess(max(abs(piece.area - parent.area / count) for piece in pieces), 1e-6)
        return pieces

    def test_concavity_and_hole_preserved(self):
        parent = Polygon([(0, 0), (500, 0), (500, 150), (300, 150), (300, 400), (0, 400)], holes=[[(30, 30), (90, 30), (90, 90), (30, 90)]])
        pieces = self.assert_partition(parent, 7)
        self.assertFalse(unary_union(pieces).covers(Point(60, 60)))

    def test_disconnected_island_preserved(self):
        parent = MultiPolygon([box(0, 0, 600, 300), box(900, 20, 920, 40)])
        pieces = self.assert_partition(parent, 4)
        self.assertAlmostEqual(unary_union(pieces).intersection(box(900, 20, 920, 40)).area, 400)

    def test_polygonal_collection_keeps_all_fragments(self):
        parent = GeometryCollection([box(0, 0, 4, 4), box(10, 0, 12, 2), Point(0, 0)])
        self.assertEqual(MODULE.polygonal(parent).area, 20)

    def test_asset_contract_and_serialized_topology(self):
        path = MODULE.ROOT / "assets/la-reina-neighborhoods.geojson"
        asset = json.loads(path.read_text())
        self.assertEqual(len(asset["units"]["features"]), 15)
        self.assertEqual(len(asset["features"]), 49)
        self.assertEqual(asset["metadata"]["sourceYear"], 2024)
        parents = {f["properties"]["id"]: MODULE.transform(MODULE.TO_METRES.transform, shape(f["geometry"])) for f in asset["units"]["features"]}
        result = MODULE.validate(parents, asset["features"], asset["metadata"]["unitCounts"])
        self.assertTrue(result["valid"])
        self.assertEqual([f["properties"]["id"] for f in asset["features"] if f["properties"]["unit"] == "13"], ["13-A", "13-B", "13-C", "13-D"])
        for feature in asset["features"] + asset["units"]["features"]:
            self.assertTrue(shape(feature["geometry"]).covers(Point(feature["properties"]["labelPoint"])))
        self.assertLess(result["maxWithinUnitOverlapM2"], 1e-6)
        self.assertLess(result["totalPairwiseOverlapM2"], 0.1)


if __name__ == "__main__":
    unittest.main()
