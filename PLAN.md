# Mars Navigation System — Implementation Plan

Frontend build in `web/` : React + Vite + Three.js + Leaflet.
Exact-design reproduction of the 1440×1024 spec (globe → 2D map, WMTS imagery,
route planner, saved routes, hazard overlay, route summary + elevation profile).

---

## Ownership and collaboration rules (override conflicting steps below)

- Do not edit root `README.md` or `.gitignore` (Hussain), `LICENSE` (leave
  unchanged), `docs/` (Hussain/Abdullah), or `data-prep/` (Hussain).
- `data/raw/` is local only: do not modify or commit it.
- All of `web/public/data/` is off limits, including grid, ortho, metadata,
  and conditions files.
- `web/src/data/loadGrid.js` belongs to Hussain and is off limits.
- All of `web/src/routing/` belongs to Hussain/Zayem and is off limits.
- The frontend developer owns the remaining frontend files under `web/`,
  including components, styles, entry points, and Vite configuration.
- Only the frontend developer edits `web/package.json`. Anyone else needing
  a library asks the frontend developer to add it. Generate the lockfile with npm.
- If a protected file needs a change, ask its owner in the group chat first.
  If group-chat access is unavailable, give the user a request to forward and
  wait for approval. Do not silently edit protected files.

Phase 1 predates these ownership rules and changed `conditions_sample.json`,
`loadGrid.js`, `coordinates.js`, `planRoute.js`, and `routeMetrics.js`.
Their owners must review those existing changes; do not automatically revert or
further modify them. Future frontend work must use adapters in frontend-owned
files where possible, rather than following conflicting edits in this plan.

---

## 0. Verified research (complete — do not re-verify)

**Imagery stack (every tile URL live-tested, 200 confirmed):**

| Zoom | Layer | Endpoint |
|------|-------|----------|
| 0–6 | `msss_atlas_simp_clon` (task-preferred color mosaic) | `https://trek.nasa.gov/tiles/Mars/EQ/{layer}/1.0.0/default/default028mm/{z}/{y}/{x}.png` |
| 7–9 | `THEMIS_DayIR_ControlledMosaics_100m_v2_oct2018` | same trek pattern (verified at 4 global sites) |
| 10–12 | `OnMars/CTX` (512px tiles, identical row/col math) | `https://astro.arcgis.com/arcgis/rest/services/OnMars/CTX/MapServer/tile/{z}/{y}/{x}` (verified at 4 global sites) |
| 13–17 | `OnMars/HiRISE` (sparse; 404 outside coverage → show layer beneath) | `https://astro.arcgis.com/arcgis/rest/services/OnMars/HiRISE/MapServer/tile/{z}/{y}/{x}` |
| study area overlay | `JEZ_ctx_B_soc_008_orthoMosaic_6m_Eqc_latTs0_lon0` (z0–13), `JEZ_hirise_soc_006_orthoMosaic_25cm_Eqc_latTs0_lon0_first_dd` (z10–15+) | trek pattern, constrained to layer bbox |

- All trek layers use TileMatrixSet `default028mm` (256px, 2^(z+1)×2^z, origin −180/90)
  → matches Leaflet `L.CRS.EPSG4326` exactly; row/col math:
  `col = floor((lon+180)/360 · 2^(z+1))`, `row = floor((90-lat)/180 · 2^z)`.
- Mars texture: `https://www.solarsystemscope.com/textures/download/2k_mars.jpg` (200 OK, CC BY 4.0) → download to `web/public/assets/`.
- Design-reference PNGs + full prior frontend (incl. working `coordinates.js`) recoverable
  from reverted commit `44139ba` via `git show 44139ba:<path>` — used for calibration only; text spec stays source of truth.
- HiRISE ortho image NOT in repo yet → conditional loader (if file appears under
  `web/public/data/`, use ImageOverlay at grid bounds; else WMTS JEZ layers).
- No `package.json` / lockfile exists → scaffold fresh with npm.

**Reusable modules (do not rewrite):**
`web/src/data/loadGrid.js`, `web/src/routing/{planRoute,findRoute,slope,routeMetrics}.js`.
`web/src/routing/coordinates.js` is a throwing stub on main → restore full implementation
from `44139ba` (`latLonToCell`, `cellToLatLon`, `gridBoundsLatLon`).

---

## Phase 1 — Scaffold & data plumbing

1. Create this file. Extract `design-references/*.png` + prior frontend files from `44139ba` to temp for visual reference.
2. Scaffold `web/` Vite app: `package.json` (react, react-dom, leaflet, three, vite,
   @vitejs/plugin-react; devDep playwright), `vite.config.js`, `index.html`, `src/main.jsx`.
3. Restore complete `coordinates.js` from `44139ba`; sanity-check against `jezero_grid_meta.json`
   (grid ≈ 77.15–77.29°E, 18.29–18.43°N, 16 m cells).
4. Switch `planRoute.js` import `./fakeRoute.js` → `./findRoute.js`; normalize
   `{error:{code,message}}` result to a display string.
5. Extend `loadGrid.js` additively: slope grid via `computeSlopeGrid`, terrain canvas raster,
   slope-class raster (green <10°, yellow 10–15°, red >15° via `routeMetrics.classFor`).
6. New data modules: `conditions.js` (readings → mbar (Pa/100), ideal-gas density
   ρ=P/(191.2·T_K); add `radiation` (0.67 mSv/d) + `storm` (LOW) sample fields to
   `conditions_sample.json`), `savedRoutes.js` (localStorage), `wmts.js` (verified layer configs only).
7. Download Mars texture to `web/public/assets/mars.jpg`.

## Phase 2 — App shell (exact design values)

8. `styles.css`: palette `#0D0D12`, panels `rgba(65,37,21,.88)`, border `#A84C2A`,
   accent `#F1C749` / `#FF6A00`, text `#FFFFFF` / `#D5C7BF`, green `#00C853`;
   Barlow font, starfield, two-level header crown; layout tokens
   (header 624×118 @ top 49 centered, panels, globe ≈690px).
9. `ConditionsHeader`: 4 metrics — Temperature °C, ATM & Density (mbar + kg/m³),
   Radiation Level (mSv/d), Storm Percentage (LOW, green); "SAMPLE DATA" badge when
   `isSample`; small info icon top-right.
10. `RightToolbar`: 3×40px buttons, right:64px, gap:15px — pin→planner panel,
    star→saved panel, map→3D/2D switch (globe) / hazard toggle (map); orange fill when active.
11. `App.jsx` state machine: States A–E (globe → planner open → endpoints selected →
    2D map → calculated/saved), panel visibility, loading/error state, transition control.

## Phase 3 — 3D globe (Three.js)

12. `MarsGlobe.jsx`: textured sphere (~690px diameter at default camera), lighting
    bright-left / dark-right, procedural starfield (no asset).
13. OrbitControls: rotate / pinch / wheel zoom, no pan, distance limits;
    distance < threshold (~1.55R) → 2D-map transition callback.
14. **Updated by user request:** one Jezero Study Area marker at the centre of
    the current DEM bounds (read from metadata). Remove the previous four sites.
    Preserve yellow dot, translucent orange disc, white dashed ring and label;
    hide when back-facing. Initially face Jezero. Click/tap/keyboard activation
    smoothly rotates/zooms toward it, then enters 2D fitted to the full study
    footprint, preserving existing app state. Manual globe controls remain.

## Phase 4 — 2D map (Leaflet)

15. `MarsMap.jsx`: `L.CRS.EPSG4326`; stacked tile layers by zoom
    (msss 0–6 → THEMIS 7–9 → CTX 10–12 → HiRISE 13+, failed tiles fall through)
    + JEZ study-area layers bounded to their bbox; conditional local HiRISE
    `ImageOverlay` when file present. No blank areas on layer switch — global layer
    always beneath.
16. Grid footprint rectangle from `gridBoundsLatLon`; attribution (NASA Mars Trek / USGS / HiRISE).
17. Endpoint selection: click-cycle 1st=start, 2nd=end, 3rd=reset, through `latLonToCell`;
    start marker orange/gold + dotted ring, dest marker green + dotted ring.
18. Route render: 4px golden polyline + translucent glow underlay; `fitBounds` with padding.
19. Hazard overlay: canvas from slope raster (green <10°, yellow 10–15°, red >15°,
    translucent), toggle via map toolbar button, legend chips.
20. 3D↔2D transition: enter when camera distance < threshold, exit when map zoom ≤ 3
    (separate hysteresis thresholds, no oscillation); animated handoff preserving
    center/zoom, endpoints, route, open panel.

## Phase 5 — Panels & routing UI

21. `RoutePlanner` compact — left:60, top:406, 309×212: heading, two coordinate
    inputs (icon, placeholder; lat/lon + elevation + slope when set), yellow Calculate Route button.
22. Validation & errors: missing/invalid endpoints → inline messages; button spinner
    during `planRoute`; failed route (findRoute error) → error message, no partial results.
23. `RoutePlanner` expanded — left:60, top:222, 364×686: endpoint fields, Recalculate,
    divider, 3 metric cards: Distance / Max Slope° / Terrain Risk (labeled "estimated
    terrain risk": Low / Moderate / High).
24. `ElevationProfile`: SVG, thin orange line, gridlines, "Elevation (m)" /
    "Distance (Km)" labels, +0..n km ticks; no-data state.
25. `SavedRoutesPanel` — left:60, top:406, 309×212: rows `Start → Dest  X.X Kms`,
    auto-save on successful calculation (no save button), click → switch to map +
    fit bounds + redraw + expanded panel; corrupt entry → validation message.
26. Header/route data wiring: metrics from conditions, summary values from route metrics.

## Phase 6 — Responsive

27. Tablet media query: scale margins/panel widths, keep identical visual identity
    (no redesign, no new controls).

## Phase 7 — Verification

28. `npm run build` passes; dev server boots; **zero console errors**.
29. Playwright (chromium) — the 14 behaviors + screenshots at 1440×1024 (compare
    against `44139ba:design-references/*.png`) and tablet viewport:
    1. Rotate 3D globe (drag)
    2. Zoom 3D globe (wheel/pinch)
    3. One Jezero marker + label; back-face hide; click/tap/keyboard → study zoom and fitted 2D entry
    4. Zoom past threshold → 2D transition, view preserved
    5. Map zoom out ≤3 → back to globe (no loop)
    6. Tiles load at z2 / z8 / z11 / z14 (global + study area), no blank/gray tiles
    7. Click-cycle: 1st=start, 2nd=end, 3rd=reset; markers styled per spec
    8. Calculate Route → spinner → expanded panel with Distance / Max Slope° / Risk
    9. Missing/invalid endpoint + failed-route error messages appear
    10. Hazard toggle: green/yellow/red overlay + legend
    11. Elevation profile renders with axis labels; empty state without route
    12. Saved routes: auto-save, row format, click → map fit + route + expanded panel
    13. Header metrics + SAMPLE DATA badge + toolbar active states
    14. Tablet viewport: layout intact, same identity; console clean throughout
30. Visual-diff pass vs reference PNGs → fix discrepancies → final `npm run build` + report.

---

**Constraints (from spec):** no extra dashboards/cards/buttons/animations — only
loading indicators, validation messages, error messages allowed beyond the design.
Dependencies limited to the allowed list. No commits unless explicitly asked.
Do not touch `data-prep/`, `docs/` routing algorithms, or `findRoute` internals.

**Status:** Implementation Phases 1–6 and the Phase 7 verification pass are
complete, with an unresolved external live-imagery availability limitation.
30 unit tests, the complete Phase 1–7 browser suite (zero console errors),
`npm run build`, production desktop/four-tablet checks and desktop visual
geometry checks pass. See `web/VERIFICATION.md` for the full coverage/results.
Map checks cover EPSG:4326 imagery at z2/8/11/14, transparent sparse-tile fallback,
endpoint click-cycle/validation, hazards, real-route drawing/fit, optional local
image handling, terrain-load failure, and globe/map hysteresis/state preservation.
Tile failure/coverage tests use deterministic fixtures; a separate live smoke
check also loaded CTX imagery with no runtime errors. This does not guarantee
all remote tiles/providers are continuously available.
Screenshots are stored in the approved temporary directory, outside the repo.
The Calculate/Recalculate action, route summary/profile, and saved-route panels
are implemented. Tablet refinement and final visual/behavior verification are
complete, but reliable live global high-detail imagery is not certified:
the latest live check observed transport timeouts/partial coverage at z2/8/11/14.
Fallbacks and local Jezero imagery/hazards remain functional; this limitation is
explicitly reported rather than counted as a passing availability check.
The merged backend now supplies
the local ortho image; tests verify its loading and alignment with the grid.
Its presence is detected at Vite startup/build, so restart/rebuild if it changes.
No protected files were changed during Phases 2–7. Ownership rules above apply
to all remaining work. No commits without an explicit request.

**Phase 4 correction (before Phase 5):** User-reported off-screen hazards and
mixed orange/gray tile patchwork were addressed in frontend-owned files.
The map pin now fits and labels Jezero even when the planner is already active;
hazard activation reveals off-screen/tiny coverage without disturbing useful
close-ups. Coverage limitations are visible in the legend. Imagery priority no
longer lets coarse Jezero CTX obscure global HiRISE; new native levels load as
batches, stalled tiles time out, and only coarse color fallback is desaturated
at detail zooms to avoid orange gaps among native grayscale imagery.
Regression checks cover the reported globe-entry path, visible raster/rectangle,
active-pin navigation, partial/slow/stalled providers, and preserved endpoints.
The separate live check verifies visible Jezero hazards and displayed detail,
not merely that a tile URL loaded. Native grayscale and sparse detail coverage
remain source limitations, not fabricated color or global hazard coverage.

**Phase 5 implementation:** Typed and map-selected coordinates are validated
against the DEM and show cell elevation/slope. The existing route finder runs
unchanged through a frontend-owned cancellable Worker, with loading and timeout/
error handling. Successful routes populate the summary and SVG profile, switch
to the map, and auto-save. Editing invalidates old results; failed routes display
no partial metrics/geometry. Saved rows recalculate from endpoints, fit/redraw
the map, and reopen the expanded planner. Duplicate cell pairs update an entry;
corrupt data is reported and unavailable storage has a session-only fallback.
Checks cover typed/map-selected calculation, spinner, exact metric wiring,
profile/empty/flat/single-point states, save/dedup/restore from the globe, blocked
route failure, edit cancellation, corruption, and blocked/quota-limited storage.

**Phase 6 implementation:** Verified the merged backend interfaces and existing
unit/build/browser flows before completing responsive work. The old browser
assertion that the ortho was absent was updated to validate the newly supplied
asset; protected assets and algorithms were not changed. Tablet/short-window
media queries reduce margins/panel widths, retain the original controls/identity,
prevent page overflow, and keep long results scrollable inside the panel.
Map padding now measures actual controls and refits existing routes on resize;
coverage visibility uses the unobscured map region. Touch-enabled browser checks
cover 1024×768, 768×1024, 1024×600 and 800×1280, including compact/expanded/error/
saved panels, scrollable charts, route visibility, rotation/state preservation,
hazards, native touch controls and real local-ortho decoding.

**Phase 7 implementation:** Re-ran the full deterministic suite and production
checks, extended failure coverage (texture, Worker start/timeout, disconnected
terrain), and verified correct local-image source labeling. Compared all four
original reference states with production screenshots; calibrated compact
desktop card internals and retained exact outer geometry. Difference images/
statistics are diagnostic: scientific imagery, real values, site locations,
procedural stars and requested marker changes intentionally differ.
Added a separate, honest live tile-pipeline report with native-source/fallback
counts, network failures and nonzero status for unavailable primary sources.
The live check is degraded, with no app runtime exceptions/broken tiles.
All artifacts are outside the repo; no dependency changes or commits were made.

**Requested globe-marker revision:** Replaced the four original sites with a
single metadata-derived Jezero Study Area marker and a Jezero-facing initial
view. Marker activation animates rotation/zoom, then requests an explicit fit
to the real study boundary in 2D. Manual rotation/zoom and existing app state
remain intact. Updated desktop, touch-tablet, reduced-motion, metadata-failure,
state-preservation and production tests. No protected files were changed.

**Latest overlay-control revision (overrides earlier auto-reveal behavior):**
Show the hazard/overlay button only in 2D. Enabling/disabling it preserves the
current map centre and zoom and must not request study-area focus. Use the
Jezero globe marker or planner pin to navigate; keep header radiation unchanged.
