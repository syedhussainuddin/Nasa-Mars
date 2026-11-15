const TREK_ROOT = "https://trek.nasa.gov/tiles/Mars/EQ";
export const IMAGERY_ATTRIBUTION = "NASA Mars Trek / USGS / HiRISE";

const trek = (layer) =>
  `${TREK_ROOT}/${layer}/1.0.0/default/default028mm/{z}/{y}/{x}.png`;
const arcgis = (layer) =>
  `https://astro.arcgis.com/arcgis/rest/services/OnMars/${layer}/MapServer/tile/{z}/{y}/{x}`;

// Keep coarser layers beneath finer imagery: minZoom enables a new layer but
// maxNativeZoom freezes its native level so gaps in sparse HiRISE stay filled.
export const GLOBAL_LAYERS = [
  { id: "msss_atlas_simp_clon", url: trek("msss_atlas_simp_clon"), minZoom: 0, maxNativeZoom: 6, tileSize: 256 },
  { id: "THEMIS_DayIR_ControlledMosaics_100m_v2_oct2018", url: trek("THEMIS_DayIR_ControlledMosaics_100m_v2_oct2018"), minZoom: 7, maxNativeZoom: 9, tileSize: 256 },
  // ArcGIS serves 512px images over the SAME geographic tile footprint as Trek.
  // Display at 256 CSS pixels to preserve row/column math (no zoom offset).
  { id: "CTX", url: arcgis("CTX"), minZoom: 10, maxNativeZoom: 12, tileSize: 256, sourceTileSize: 512 },
  { id: "HiRISE", url: arcgis("HiRISE"), minZoom: 13, maxNativeZoom: 17, tileSize: 256, sourceTileSize: 512 },
];

// Leaflet order: [[south, west], [north, east]]. Bounds from each layer's
// WMTSCapabilities.xml; only the plan's already-verified imagery is configured.
export const STUDY_AREA_LAYERS = [
  {
    id: "JEZ_ctx_B_soc_008_orthoMosaic_6m_Eqc_latTs0_lon0",
    url: trek("JEZ_ctx_B_soc_008_orthoMosaic_6m_Eqc_latTs0_lon0"),
    minZoom: 0,
    maxNativeZoom: 13,
    tileSize: 256,
    bounds: [[18.2110274, 77.1604655], [18.7211945, 77.6991776]],
  },
  {
    id: "JEZ_hirise_soc_006_orthoMosaic_25cm_Eqc_latTs0_lon0_first_dd",
    url: trek("JEZ_hirise_soc_006_orthoMosaic_25cm_Eqc_latTs0_lon0_first_dd"),
    minZoom: 10,
    maxNativeZoom: 15,
    tileSize: 256,
    bounds: [[18.3067994, 77.2229331], [18.669315, 77.583964]],
  },
];

/** EPSG:4326/default028mm is 2^(z+1) columns by 2^z rows. */
export function latLonToTile({ lat, lon }, zoom) {
  if (!Number.isInteger(zoom) || zoom < 0 || zoom > 30 ||
      !Number.isFinite(lat) || lat < -90 || lat > 90 || !Number.isFinite(lon)) {
    throw new TypeError("A valid latitude, longitude, and tile zoom are required.");
  }
  const rows = 2 ** zoom;
  const longitude = ((lon + 180) % 360 + 360) % 360 - 180;
  return {
    x: Math.floor((longitude + 180) / 360 * rows * 2),
    y: Math.min(rows - 1, Math.floor((90 - lat) / 180 * rows)),
  };
}
