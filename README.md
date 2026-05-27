# NT Fire Timeline Map

A small browser-based MVP for exploring Northern Territory fire extents over time.

## What it does

- Shows an interactive Leaflet map centered on the Northern Territory.
- Loads fire polygons from the NT Fire History GeoPackage after preprocessing them into GeoJSON.
- Lets you pick a year first, then scrub by month within that year.
- Lets you filter fire types from the legend and auto-scroll through months.
- Shows summary cards for polygon count and total burnt area.
- Includes a simple legend and dataset attribution panel.

## Data pipeline

The source GeoPackage lives in `Data/NT_FireHistory_GPKG.gpkg`.

Run the preprocessing script to generate browser-ready GeoJSON:

```bash
"/Users/averydoan/Library/CloudStorage/OneDrive-CharlesDarwinUniversity/Side quest/NT-Fire-History-Map/.venv/bin/python" scripts/prepare_fire_data.py
```

That writes `Data/nt-fire-history.geojson`.

## Run locally

Serve the folder with any static web server, then open `index.html`.

One simple option is:

```bash
"/Users/averydoan/Library/CloudStorage/OneDrive-CharlesDarwinUniversity/Side quest/NT-Fire-History-Map/.venv/bin/python" -m http.server 8000
```

Then visit `http://localhost:8000` in a browser.

## Notes

- The MVP filters by ignition year first and then by ignition month within the selected year, with fire-type toggles on the legend.
- `area_ha` is used for the summary card because the source dataset includes it for all features in the current GeoPackage.
- The UI is intentionally simple so the map stays the main focus.
