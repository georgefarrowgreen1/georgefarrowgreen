#!/usr/bin/env python3
"""Build the UK settlement grid from the GHSL GHS-SMOD R2023A 2020 release."""

import argparse
import hashlib
import itertools
import json
from pathlib import Path

from osgeo import gdal

ARCHIVE_SHA256 = "a02f4741f4ff37143ea0b53179d834eb2caa522e7e34b39b51ddcc3011d0a251"
RASTER = "GHS_SMOD_E2020_GLOBE_R2023A_54009_1000_V2_0.tif"
# West, south, east, north. Include settlements on both sides of the Irish border.
BOUNDS = (-9, 49.5, 3, 61.5)
RESOLUTION = (0.01, 0.005)
# Water, rural clusters and low-density cells carry no settlement cost.
DENSITY = {21: 1, 22: 2, 23: 3, 30: 4}

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument("archive", type=Path, help="The original JRC GHS-SMOD ZIP")
args = parser.parse_args()
with args.archive.open("rb") as archive:
    if hashlib.file_digest(archive, "sha256").hexdigest() != ARCHIVE_SHA256:
        parser.error("The archive does not match the pinned GHS-SMOD release.")

gdal.UseExceptions()
source = f"/vsizip/{args.archive.resolve()}/{RASTER}"
grid = gdal.Warp(
    "", source, format="MEM", dstSRS="EPSG:4326", outputBounds=BOUNDS,
    xRes=RESOLUTION[0], yRes=RESOLUTION[1], resampleAlg="near", overviewLevel="NONE",
)
rows = {}
for index, row in enumerate(grid.ReadAsArray()):
    start = 0
    runs = []
    for density, cells in itertools.groupby(row, lambda value: DENSITY.get(int(value), 0)):
        end = start + sum(1 for _ in cells)
        if density:
            runs.extend((start, end, density))
        start = end
    if runs:
        rows[index] = runs

# Keep each populated row on one line and the grid independent of GDAL at runtime.
destination = Path(__file__).resolve().parents[1] / "src" / "settlement-grid.json"
lines = [f"    {json.dumps(str(index))}: {json.dumps(runs)}" for index, runs in rows.items()]
destination.write_text(
    "{\n  \"bounds\": " + json.dumps(BOUNDS) + ",\n  \"resolution\": " + json.dumps(RESOLUTION)
    + ",\n  \"rows\": {\n" + ",\n".join(lines) + "\n  }\n}\n",
    encoding="utf-8",
)
