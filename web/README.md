# Mars Nav System

## Run

Requires Node.js 20.19+ or 22.12+.

```sh
cd web
npm install
npm run dev
```

`npm run build` creates `dist/`; `npm run preview` serves it locally.
`npm test` runs coordinate, slope and sample-route checks.

Browser checks: `npx playwright install chromium`, then `npm run test:e2e`.
Alternatively set `PLAYWRIGHT_CHANNEL=chrome` or `msedge` to use an installed browser.
The suite covers desktop/mobile selection, demo calculations, stale-request reset,
hazard layers, persistence/deletion, unavailable storage, no-data/out-of-bounds
selection and terrain failure/retry. Screenshots and test artifacts are written
to the OS temp directory under `opencode/mars-nav-test-results`.

## Data and integration

- Existing `public/data/jezero_grid.json` and metadata are preserved. Terrain and derived slopes load/cache once. Raster overlays use the grid's Mars equirectangular CRS, spherical radius, bounds and cell sizes, with Leaflet `CRS.Simple` (no Earth tile provider or Earth distance calculations).
- `src/routing/coordinates.js` completes the pre-existing placeholder signatures and exports outer-edge `gridBoundsLatLon(meta)`. Northern/western edges are inclusive; southern/eastern edges exclusive. Cell conversion returns centres. Spherical Mars latitude and east-positive longitude follow `../docs/data-sources.md`.
- `src/routing/slope.js` supplies `computeSlopeGrid(grid, meta)` using finite differences with one-sided valid edges. Missing neighbours on an entire axis produce null. The overlay is a real elevation-derived estimate, not a simulated hazard layer.
- The actual routing algorithm **is not supplied**. `src/routing/adapter.js` automatically discovers a named `findRoute` export in JavaScript modules under `src/routing/`, or a default function in `findRoute.js`/`index.js`. Add the contributor's implementation there and restart Vite. The contract is `findRoute(grid, meta, startCell, endCell)`; sync/async results are supported. Errors may throw/reject, or return `{ error: string | {message} }` or `{ success: false, message }`. Results are validated before display.
- Until then, **Demo mode** provides a deterministic orthogonal, L-shaped sample traverse. It does not find or optimize a terrain route or avoid hazards. Metrics/profile are derived from those displayed cells; distance uses metadata spacing, and maximum slope includes local cell slopes and along-track grades. Sample estimated risk uses the same project thresholds as the legend. No real routing end-to-end claim is made.
- Conditions come from `public/data/conditions_sample.json`, normalized by `src/data/conditions.js`. The bundled dataset is explicitly sample data, not telemetry.
- Saved routes use localStorage with endpoint cells and lightweight metadata only. Unavailable storage falls back to in-memory session state.

## Assets

There are no standalone globe or starfield assets in the repository. The home view uses a self-contained SVG fractal-noise globe and CSS stars, not screenshots. They are illustrative, not geographically accurate. Put future licensed Mars assets in `public/assets/` (e.g. `mars-color.jpg`, `starfield.jpg`) and replace the corresponding visual in `src/components/HomeView.jsx` / `src/styles.css`. Record their provenance. Google Fonts are optional; system fonts work offline.

## Interaction and accessibility

First valid click: Start; second: Destination; third: clear both. Reset also cancels stale requests. No-data/out-of-bounds clicks do not advance selection. Coordinate fields are deliberately read-only. Keyboard point selection can be enabled in map options: focus the map, pan with arrows, zoom with +/−, select centre with Enter. Mobile panels collapse using their top handle. Information is in a native modal dialog.

Terrain limitations, units, and provenance are in `../docs/data-sources.md` and the in-app information dialog. These project-defined slope thresholds are **not NASA safety limits**.
