# Mars Navigation System — Implementation Plan

Frontend build in `web/` : React + Vite + Three.js + Leaflet.
Exact-design reproduction of the 1440×1024 spec (globe → 2D map, WMTS imagery,
route planner, saved routes, hazard overlay, route summary + elevation profile).

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
14. Markers — Opportunity (−1.95, 354.47), Mawrth Vallis (24, 343),
    Viking 1 (22.27, 312.05), Pathfinder (19.13, 332.18): yellow center dot,
    translucent orange disc, white dashed ring, white label above; hidden when
    back-facing; click → smooth camera focus.

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
    3. 4 markers visible + labels; back-face hide; click → camera focus
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

**Status:** plan only — coding starts on approval.
