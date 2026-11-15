# Mars Navigation System

React + Vite frontend. Phase 1 supplies data/routing plumbing. Phase 2 supplies
the app shell, conditions header, toolbar, and state management. Globe/map scenes
and full route panels are introduced in subsequent phases; the scene is
intentionally empty until then.

## Run

```sh
npm install
npm run dev
```

## Verify

```sh
npm test
npm run test:browser
npm run build
```

The browser smoke test starts and stops its own Vite server. It uses Playwright's
Chromium when installed, otherwise the system Chrome. To install Chromium:

```sh
node node_modules/playwright/cli.js install chromium
```

`PLAYWRIGHT_CHANNEL` can select another installed Chromium channel, e.g. `msedge`.
Browser checks cover Phases 1 and 2; shell screenshots are written under the
system temporary directory in `opencode/nasa-mars-phase2/`, not into the repo.

## Ownership

Do not edit `public/data/`, `src/data/loadGrid.js`, or anything under `src/routing/`.
Those files belong to the data/routing team. See root `PLAN.md` for collaboration
rules. The reducer under `src/state/` is frontend-only and does not implement
route finding. Phase 1 changes to protected files still need owner review.

## Data contracts

- `loadGrid()` shares in-flight/cached data and returns `{ grid, meta, slopeGrid,
  terrainRaster, slopeRaster }`. Raster values are PNG data URLs; no-data pixels
  are transparent. This loader needs a browser canvas. A failed load can be retried.
- `loadConditions()` uses the latest sample sol, converts Pa to mbar, and computes
  CO₂ density as `pressurePa / (191.2 * temperatureK)`. Radiation is in mSv/day.
  The sample flag remains explicit; these are not live measurements.
- `planRoute(start, end, grid, meta)` accepts `{ lat, lon }` points and calls the
  existing real route finder. Errors are display strings; successful results
  contain grid cells and route metrics. Coordinate conversion uses the DEM's
  spherical Mars equirectangular projection.
- Saved route entries are `{ id, name, start, end, distanceKm }`, with endpoints
  as `{ row, col }` cells. Pass grid metadata to `readSavedRoutes(meta)` for bounds
  validation. Invalid entries produce a message; storage failure has an in-session
  fallback. Routes should be recalculated from endpoints when restored.
- `wmts.js` contains only the planned imagery providers and Jezero bounding boxes.
  Keep coarse imagery beneath higher-resolution layers. ArcGIS images are 512px,
  but use 256px Leaflet display tiles to keep the same geographic tile matrix.

Mars texture licensing is recorded in `public/assets/ATTRIBUTION.md`.
