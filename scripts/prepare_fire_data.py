from pathlib import Path

import geopandas as gpd
import pandas as pd


ROOT = Path(__file__).resolve().parents[1]
INPUT = ROOT / "Data" / "NT_FireHistory_GPKG.gpkg"
OUTPUT = ROOT / "Data" / "nt-fire-history.geojson"


def main() -> None:
    gdf = gpd.read_file(INPUT, layer="NT_FireHistory")
    gdf = gdf.to_crs(4326)

    gdf["ignition_date"] = pd.to_datetime(gdf["ignition_date"], errors="coerce", utc=True).dt.tz_convert(None)
    gdf["extinguish_date"] = pd.to_datetime(gdf["extinguish_date"], errors="coerce", utc=True).dt.tz_convert(None)
    gdf["capture_date"] = pd.to_datetime(gdf["capture_date"], errors="coerce", utc=True).dt.tz_convert(None)

    gdf["season_year"] = gdf["ignition_date"].dt.year.fillna(gdf["extinguish_date"].dt.year)
    gdf["season_year"] = gdf["season_year"].fillna(gdf["capture_date"].dt.year)
    gdf["season_year"] = gdf["season_year"].astype("Int64")

    output = gdf[[
        "fire_id",
        "fire_name",
        "season_year",
        "ignition_date",
        "extinguish_date",
        "fire_type",
        "ignition_cause",
        "capt_method",
        "area_ha",
        "perim_km",
        "state",
        "agency",
        "geometry",
    ]].copy()

    output["start"] = output["ignition_date"].dt.strftime("%Y-%m-%d")
    output["end"] = output["extinguish_date"].dt.strftime("%Y-%m-%d")
    output["source"] = "NT Government Open Data Portal | NT Fire History GeoPackage"

    output = output.rename(columns={
        "fire_id": "fire_id",
        "fire_name": "fire_name",
        "fire_type": "fire_type",
        "ignition_cause": "ignition_cause",
        "capt_method": "capture_method",
        "perim_km": "perim_km",
    })

    output.to_file(OUTPUT, driver="GeoJSON")
    print(f"Wrote {OUTPUT.relative_to(ROOT)} with {len(output)} features")


if __name__ == "__main__":
    main()
