import L from "leaflet";
import { GLOBAL_LAYERS, STUDY_AREA_LAYERS } from "../data/wmts.js";
import { MAP_MAX_ZOOM } from "./mapHelpers.js";

// Do not use L.Util.emptyImageUrl here: Leaflet reserves that exact value for
// aborted tiles and will never mark such fallback tiles as loaded.
const TRANSPARENT_TILE = `data:image/svg+xml,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256"/>')}`;

/** Always-available local texture tiles beneath NASA imagery, not a fake DEM.
 * Crop in geographic tile space so fallback images stay aligned at every zoom.
 */
export function createTextureFallback(url) {
  const image = new Image();
  image.src = url;
  const ready = image.decode();
  // Register a handler immediately, even before the first tile is requested.
  ready.catch(() => {});
  const TextureLayer = L.GridLayer.extend({
    createTile(coords, done) {
      const canvas = document.createElement("canvas");
      canvas.width = canvas.height = 256;
      ready.then(() => {
        const rows = 2 ** coords.z, columns = rows * 2;
        const x = ((coords.x % columns) + columns) % columns;
        if (coords.y >= 0 && coords.y < rows) {
          const context = canvas.getContext("2d");
          context.drawImage(image, x * image.width / columns, coords.y * image.height / rows,
            image.width / columns, image.height / rows, 0, 0, 256, 256);
        }
        done(null, canvas);
      }).catch((error) => done(error, canvas));
      return canvas;
    },
  });
  return new TextureLayer({ pane: "texturePane", tileSize: 256, minZoom: 0, maxZoom: MAP_MAX_ZOOM });
}

const priority = (id) => id.includes("JEZ_hirise") ? 60 : id === "HiRISE" ? 50
  : id.includes("JEZ_ctx") ? 40 : id === "CTX" ? 30 : id.startsWith("THEMIS") ? 20 : 10;
const label = (id) => id.includes("JEZ_hirise") ? "Jezero HiRISE"
  : id.includes("JEZ_ctx") ? "Jezero CTX" : id.startsWith("THEMIS") ? "THEMIS"
    : id === "msss_atlas_simp_clon" ? "Color mosaic" : id;

export function createImageryLayers({ onChange = () => {}, tileTimeoutMs = 20000 } = {}) {
  return [...GLOBAL_LAYERS, ...STUDY_AREA_LAYERS].map((config, index) => {
    const order = priority(config.id);
    const layer = L.tileLayer(config.url, {
      pane: "imageryPane",
      tileSize: config.tileSize,
      minZoom: config.minZoom,
      maxZoom: MAP_MAX_ZOOM,
      maxNativeZoom: config.maxNativeZoom,
      bounds: config.bounds,
      zIndex: order,
      // Reveal a new native level as a completed batch, not a checkerboard of
      // partly arrived tiles. Coarser layers remain present while it loads.
      opacity: 0,
      keepBuffer: 2,
      updateWhenIdle: true,
      // A failed high-resolution tile becomes transparent, not a broken-image
      // icon or a grey tile; coarser imagery stays present underneath.
      errorTileUrl: TRANSPARENT_TILE,
    });
    let nativeZoom = null;
    const deadlines = new Map();
    const clearDeadline = ({ tile }) => {
      clearTimeout(deadlines.get(tile));
      deadlines.delete(tile);
    };
    layer.on("add", () => {
      const container = layer.getContainer();
      if (container) {
        container.classList.toggle("imagery-color-mosaic", index === 0);
        container.dataset.layer = config.id;
      }
      onChange();
    });
    layer.on("tileloadstart", ({ tile, coords }) => {
      tile.dataset.layer = config.id;
      clearDeadline({ tile });
      deadlines.set(tile, setTimeout(() => {
        deadlines.delete(tile);
        // A stalled provider must not hold the entire new level indefinitely.
        // Decoding this transparent image completes Leaflet's normal load path.
        tile.dataset.fallback = "true";
        tile.src = TRANSPARENT_TILE;
        onChange();
      }, tileTimeoutMs));
      if (nativeZoom !== coords.z) {
        nativeZoom = coords.z;
        layer.setOpacity(0);
      }
      onChange();
    });
    layer.on("tileerror", ({ tile }) => {
      clearDeadline({ tile });
      tile.dataset.fallback = "true";
      onChange();
    });
    layer.on("tileload", ({ tile }) => {
      clearDeadline({ tile });
      tile.dataset.layer = config.id;
      tile.dataset.fallback = String(tile.src.startsWith("data:"));
      onChange();
    });
    layer.on("loading", onChange);
    layer.on("load", () => { layer.setOpacity(1); onChange(); });
    layer.on("tileunload", clearDeadline);
    layer.on("remove", () => {
      for (const deadline of deadlines.values()) clearTimeout(deadline);
      deadlines.clear();
    });
    return { id: config.id, label: label(config.id), priority: order, config, layer };
  });
}

/** Inspect visible, successfully decoded tiles—not just requested URLs. */
export function imageryStatus(entries, map) {
  const zoom = map.getZoom();
  const view = map.getContainer().getBoundingClientRect();
  const active = entries.filter(({ config }) => zoom >= config.minZoom &&
    (!config.bounds || L.latLngBounds(config.bounds).intersects(map.getBounds())));
  const visible = (image) => {
    const box = image.getBoundingClientRect();
    return box.right > view.left && box.left < view.right && box.bottom > view.top && box.top < view.bottom;
  };
  const displayed = active.filter(({ layer }) => layer.options.opacity > 0 &&
    [...(layer.getContainer()?.querySelectorAll("img.leaflet-tile-loaded") || [])]
      .some((image) => image.dataset.fallback !== "true" && image.complete && image.naturalWidth && visible(image)))
    .sort((a, b) => b.priority - a.priority);
  return {
    source: displayed[0]?.label || "Local texture fallback",
    grayscale: zoom >= 7,
    loading: active.some(({ layer }) => layer.isLoading()),
    fallback: active.some(({ layer }) =>
      [...(layer.getContainer()?.querySelectorAll('img[data-fallback="true"]') || [])].some(visible)),
  };
}

// Determined at Vite startup/build without probing nonexistent public URLs.
// Restart Vite after the data owner adds jezero_ortho.png.
export const LOCAL_ORTHO_URL = typeof __MARS_LOCAL_ORTHO__ !== "undefined" && __MARS_LOCAL_ORTHO__
  ? `${import.meta.env.BASE_URL}data/jezero_ortho.png`
  : null;
