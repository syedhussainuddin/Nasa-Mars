# Mars Navigation System

React + Vite frontend. Phase 1 supplies data/routing plumbing. Phase 2 supplies
the app shell, conditions header, toolbar, and state management. Phase 3 adds the
interactive Three.js globe. Phase 4 adds the Leaflet imagery stack, endpoint
selection, hazards, route drawing, and globe/map transitions. Phase 5 adds the
working route planner, summary, elevation profile, and automatic saved routes.
Phase 6 adds tablet/short-window layout refinements. Phase 7 verification is
complete with a recorded external limitation: live global imagery services
timed out/returned partial coverage during testing. See [VERIFICATION.md](VERIFICATION.md)
for results, scope, visual differences, and remaining availability limitations.

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
Browser checks cover Phases 1–7, including native two-touch pinch, marker focus
and hiding, imagery fallback, endpoint selection, hazards, route geometry, and
globe/map transitions. Tile coverage/failure tests use deterministic fixtures:
they do not establish live NASA availability. Route calculations use the real
route finder in a Worker, through both typed coordinates and map-click controls.
Screenshots are written under the system temporary directory in
`opencode/nasa-mars-phase2/`, `opencode/nasa-mars-phase3/`, and
`opencode/nasa-mars-phase4/`, `opencode/nasa-mars-phase5/`, and
`opencode/nasa-mars-phase6/`, not into the repo. Final visual/network artifacts
are in `opencode/nasa-mars-phase7/`.

After `npm run build`, run `node tests/phase5.preview.js` to check the production
Worker asset, calculation/summary/profile/save/restore flow, and four tablet
sizes. This also uses tile fixtures; the route finder and DEM are real.

Run `node tests/phase7.visual.js` after building to generate reference/current/
difference images and desktop geometry checks. These are not a zero-diff claim:
real data, imagery, site placement and requested changes differ from the mockup.

`node tests/phase7.live.js` separately tests actual remote tiles at z2/8/11/14.
It reports source availability rather than treating fallback as high-resolution
success, and exits with status 2 when primary global sources are unavailable.
The final run was degraded; local Jezero functionality and deterministic
production checks still pass. See the verification report before claiming
reliable live global coverage.

For a separate live-provider smoke check, run `node tests/phase4.live.js`.
It waits for a real CTX tile, records provider coverage misses/runtime errors,
and saves a live-map screenshot. Network availability affects this optional
check; sparse providers can return HTTP 404s without breaking the fallback layers.

## Globe controls

- Drag to orbit; scroll or pinch to zoom. Panning is disabled.
- Click a site marker (or focus it with the keyboard and press Enter) to centre
  that site. Reduced-motion preferences skip the focus animation.
- Zoom below 1.55 Mars radii to enter map view, preserving the globe viewport and
  passing the current centre to the map at zoom 4.
- Camera distance is limited to 1.3–6 radii. At the default distance the globe is
  approximately 690px across in the 1440×1024 design viewport.
- Texture credit is visible in the globe; WebGL/texture/context failures show an
  error instead of a fake globe. GPU resources and controls are disposed on unmount.

## Map controls

- The map toolbar button on the globe opens the retained study-area view
  (Jezero on first entry); close-in globe zoom instead enters at the globe centre.
- Drag to pan; wheel, pinch, double-click, or keyboard `=`/`-` to zoom.
  Zooming out to level 3 returns to the globe. Separate entry/exit thresholds
  preserve endpoints, route, panel, and hazard settings without a transition loop.
- Click inside the dashed DEM footprint: first click sets start, second sets
  destination, third starts a new pair. Points snap to DEM cell centres; outside
  or missing-elevation selections show validation messages.
- In map view the third toolbar button toggles slope hazards and the legend:
  green <10°, yellow 10–15°, red >15°. No-data cells remain transparent.
- **To find the study area:** in 2D, click the pin. It fits the labeled
  `JEZERO · STUDY AREA` rectangle and opens the planner, even if already active.
  Enabling hazards also brings Jezero into view if coverage is off-screen or
  too small. A useful close-up inside the study area is left unchanged.
  Hazards are not available globally; the legend indicates when you pan away.
- Imagery stays stacked from coarse to fine. Failed tiles become transparent;
  a tiled local Mars texture remains beneath the stack as a last-resort fallback.
- THEMIS, CTX, and HiRISE detail is naturally **grayscale**, not a grey error
  screen. In detail view only the coarse color fallback is desaturated to avoid
  orange checkerboard gaps. Scientific detail and hazard colors are not recolored.
  New native levels appear as batches; stalled tiles fall back after 20 seconds.
  Global HiRISE is above coarser Jezero CTX, not hidden under it. The small source
  readout distinguishes loading/missing detail from available imagery.
  When the local orthomosaic is visible it is identified as the local source,
  not incorrectly attributed to an underlying remote tile layer.
- `MarsMap` draws supplied route cells as a 4px golden line with a glow and fits
  the view with UI-aware padding after calculation or saved-route restoration.
- If the data owner provides `public/data/jezero_ortho.png`, restart Vite or
  rebuild to enable the local image at the grid bounds. Without it, Jezero WMTS
  imagery is used. No protected data files are created or changed by this loader.

The merged backend now supplies that local orthomosaic. Browser checks detect
its presence, verify it decodes and aligns with the grid, and retain a separate
fixture for the absent-image path.

`npm run test:browser` also reproduces globe entry far from Jezero followed by
hazard activation, re-location using an already-active pin, partial/slow imagery,
and stalled-tile fallback. The live smoke check now verifies a visible hazard
raster and a promoted CTX layer, rather than merely counting a decoded tile.

## Plan and save a route

1. Enter 2D, then click the pin to locate Jezero and open the planner.
2. Click two points inside the dashed footprint, or enter decimal
   `latitude, longitude` coordinates in the two inputs. Inputs also accept a
   whitespace-separated pair; longitude may be −180…180 or 0…360 east.
3. Click **Calculate Route**. Elevation/slope details come from the selected DEM
   cells. Successful routes open the map and expanded summary/profile; routes
   automatically save locally, without a separate save button.
4. Edit either point and use **Recalculate Route**. Editing clears old results
   immediately and cancels pending work, so stale results cannot reappear.
5. Use the star to open saved routes. Selecting a row recalculates its endpoints
   against the current grid, switches to the map, and fits/draws the route.

Routing runs off the UI thread, using the team's unchanged `planRoute` through a
frontend-owned Worker. It times out after 30 seconds and needs Worker support.
Missing/invalid coordinates, outside/no-data cells, blocked endpoints, failed
routes, and Worker errors produce inline messages without partial results.

Summary values and elevation samples come from route metrics, not demo values.
Risk is explicitly labeled **estimated terrain risk**. Empty/flat/single-point
profiles are handled without invented measurements or invalid chart geometry.
Recalculating the same cell pair updates its saved entry rather than duplicating
it; row tooltips identify the endpoint coordinates. Corrupt records report
validation errors. If storage is blocked/full, routes remain available in the
current session only, with a visible warning.

## Tablet layout

The 1440×1024 layout stays unchanged. At widths up to 1199px or window heights
up to 820px, the same crown, palette, panels and three toolbar controls use
smaller margins and panel widths. Long results scroll inside their panel,
including by touch; the map itself stays within the viewport.

Map fitting measures the visible header, sidebar, toolbar and footer instead
of assuming desktop dimensions. Rotation re-fits an existing route without
clearing endpoints or calculated results. Hazards use the unobscured map region
when deciding whether Jezero needs to be brought into view.

The tablet checks cover landscape (1024×768), portrait (768×1024), short
landscape (1024×600), and tall portrait (800×1280), with touch controls,
route calculation, scrolling, save/restore, orientation changes, hazards and
local imagery. No new controls or alternative dashboard layout were added.

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
- Saved route entries are `{ id, name, start, end, distanceKm }` with an optional
  `description` for endpoint coordinate tooltips, with endpoints
  as `{ row, col }` cells. Pass grid metadata to `readSavedRoutes(meta)` for bounds
  validation. Invalid entries produce a message; storage failure has an in-session
  fallback. Routes should be recalculated from endpoints when restored.
- `wmts.js` contains only the planned imagery providers and Jezero bounding boxes.
  Keep coarse imagery beneath higher-resolution layers. ArcGIS images are 512px,
  but use 256px Leaflet display tiles to keep the same geographic tile matrix.

Mars texture licensing is recorded in `public/assets/ATTRIBUTION.md`.
