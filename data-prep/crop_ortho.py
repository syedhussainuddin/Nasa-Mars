r"""Crop the HiRISE orthoimage to the same area as the elevation grid, and save
it as a small PNG for the map's base layer.

Usage (run from the data-prep/ folder):
    python crop_ortho.py "..\data\raw\MSR_hirise_soc_003_Orthomosaic_0.25m_Eqc_latTs0_lon0_First_NoBlend.tif"

By default it uses the SAME bounds as the elevation crop, so the image lines up
exactly with the grid. The source is huge (0.25 m per pixel), so this can take a
few minutes. Be patient and do not close the terminal.

Outputs (in ../web/public/data/):
    jezero_ortho.png        the cropped image
    jezero_ortho_meta.json  bounds and size, for the record
"""
import argparse
import json
import os
import numpy as np
import rasterio
from PIL import Image
from rasterio.enums import Resampling
from rasterio.windows import from_bounds

OUT_DIR = os.path.join(os.path.dirname(__file__), "..", "web", "public", "data")
DEFAULT_BOUNDS = (4573152, 1084394, 4581152, 1092394)  # same as the DEM crop


def main():
    p = argparse.ArgumentParser()
    p.add_argument("ortho")
    p.add_argument("--bounds", nargs=4, type=float, default=list(DEFAULT_BOUNDS),
                   metavar=("XMIN", "YMIN", "XMAX", "YMAX"))
    p.add_argument("--max-size", type=int, default=1200,
                   help="longest side of the output image in pixels")
    p.add_argument("--name", default="jezero")
    a = p.parse_args()

    xmin, ymin, xmax, ymax = a.bounds
    with rasterio.open(a.ortho) as src:
        b = src.bounds
        if xmin < b.left or xmax > b.right or ymin < b.bottom or ymax > b.top:
            raise SystemExit(
                "The crop area is outside this file.\n"
                "File bounds: %s\nCrop bounds: %s" % (tuple(b), (xmin, ymin, xmax, ymax)))

        win = from_bounds(xmin, ymin, xmax, ymax, transform=src.transform)
        scale = min(1.0, a.max_size / max(win.width, win.height))
        out_w = max(1, int(round(win.width * scale)))
        out_h = max(1, int(round(win.height * scale)))
        print("Reading... (this can take a few minutes on the full-size file)")
        data = src.read(1, window=win, out_shape=(out_h, out_w),
                        resampling=Resampling.average).astype("float64")
        nodata = src.nodata
        orig_dtype = src.dtypes[0]
        res = src.res

    valid = data != nodata if nodata is not None else np.ones(data.shape, bool)
    if orig_dtype == "uint8":
        img = data.copy()
    else:
        lo, hi = np.percentile(data[valid], [2, 98])
        img = np.clip((data - lo) / max(hi - lo, 1e-9), 0, 1) * 255
    img[~valid] = 0
    img = img.astype("uint8")

    os.makedirs(OUT_DIR, exist_ok=True)
    Image.fromarray(img, mode="L").save(os.path.join(OUT_DIR, a.name + "_ortho.png"), optimize=True)
    meta = {
        "source_file": os.path.basename(a.ortho),
        "bounds": {"xmin": xmin, "ymin": ymin, "xmax": xmax, "ymax": ymax},
        "width": out_w,
        "height": out_h,
        "source_cell_size": {"x": res[0], "y": res[1]},
        "note": "Same bounds as the elevation grid; north edge is the top of the image.",
    }
    with open(os.path.join(OUT_DIR, a.name + "_ortho_meta.json"), "w") as f:
        json.dump(meta, f, indent=2)
    size = os.path.getsize(os.path.join(OUT_DIR, a.name + "_ortho.png")) / 1e6
    print("Wrote %dx%d image (%.1f MB)." % (out_w, out_h, size))


if __name__ == "__main__":
    main()
