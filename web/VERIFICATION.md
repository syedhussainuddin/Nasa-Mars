# Final verification — 2026-11-15

## Outcome

Frontend implementation and deterministic verification are complete against the
merged backend. **Live global imagery availability is degraded and is not
certified by this pass.** Local Jezero imagery, routing, hazards, desktop/tablet
flows, and production assets pass their checks.

No protected routing/data files were edited during this verification. No commit
was created. Browser checks used Playwright with installed Chrome/Chromium
157.0.8103.52; this is not a Firefox/Safari or physical-device certification.

## Results

| Check | Result |
| --- | --- |
| `npm test` | 30 passing unit tests after the requested Jezero-marker update |
| `npm run test:browser` | All desktop, tablet, regression and failure-path checks pass; zero console errors |
| `npm run build` | Production build succeeds |
| `node tests/phase5.preview.js` | Built Worker, real route/metrics/profile, save/restore and four tablet sizes pass; zero console errors |
| `node tests/phase7.visual.js` | Four reference/current/difference image sets generated; desktop geometry and local fonts pass |
| `node tests/phase7.live.js` | Fallback/runtime checks pass, but live primary-source availability is degraded; returns nonzero |

The default browser suite mocks remote tile success/failure, **not** normal
routing results. Routing uses the real merged modules and DEM. Exceptional
texture/Worker cases, accelerated timeout timing, and a disconnected 7×7 terrain
are test-only fixtures; protected files on disk remain unchanged.

## Required behavior coverage

| # | Behavior | Evidence |
| --- | --- | --- |
| 1 | Globe rotation | Drag changes camera centre without panning |
| 2 | Globe zoom | Wheel and native two-touch pinch; minimum/maximum distance |
| 3 | Single Jezero marker | Actual DEM centre, old sites removed, animated click/tap/keyboard study-area entry, back-face hiding, reduced motion |
| 4 | Globe → map | Close-in camera entry, current centre and open panel retained |
| 5 | Map → globe | Exit at z3, hysteresis, no immediate loop, state retained |
| 6 | Imagery | EPSG:4326 stack at z2/8/11/14; sparse/slow/stalled fallback; local ortho decoding/alignment |
| 7 | Endpoints | Click-cycle, typed inputs, centred dots, cyan destination, details from selected cells |
| 8 | Calculation | Real Worker, spinner/disabled button, expanded panel and exact metric wiring |
| 9 | Errors | Missing/invalid/outside/no-data/blocked/disconnected terrain, failed Worker and timeout; no partial results |
| 10 | Hazards | Real raster, unchanged green/yellow/red classes, 2D-only control, viewport-preserving toggle and active-pin relocation |
| 11 | Profile | Real elevations/distances, axes/grid, empty/flat/single-point handling |
| 12 | Saved routes | Automatic save, deduplication, current-grid recalculation, globe-to-map restoration, corruption/quota handling |
| 13 | Header/toolbar | Sample provenance, conversions, source information, keyboard info control and active states |
| 14 | Tablet | 1024×768, 768×1024, 1024×600, 800×1280; touch controls/scrolling, no page overflow, route refit on rotation |

z2 tile testing uses a standalone map fixture because the actual application
intentionally returns to the globe at z3.

## Visual review

Compared all four 1440×1024 reference images from commit `44139ba` with current
production screenshots. Reference/current/difference artifacts and pixel
statistics are generated outside the repository.

Verified desktop geometry:

- Header: 624×118 at (408, 49).
- Toolbar: 40×40 controls, 15px gaps, 64px from the right; two in 3D and three in 2D.
- Compact planner/saved panel: 309×212 at (60, 406).
- Expanded planner: 364×686 at (60, 222).
- Approximately 690px globe; locally hosted Barlow; specified palette.

Corrected compact desktop heading/field/row/button spacing during review.
Corrected the source readout to identify the local Jezero orthomosaic when it
is actually visible.

**Not a zero-pixel-difference reproduction.** The scientific/local grayscale map,
real route and sample values, user-requested single Jezero marker/initial view, procedural starfield,
provenance/attribution text, hazard-coverage guidance and user-requested cyan
destination differ from illustrative reference pixels. The full-scene image
differences are diagnostic, not an invented pixel-perfect approval.

## Live-network limitation

The latest live check used no tile mocks and observed:

| Zoom | Intended global source | Successful visible native tiles | Outcome |
| --- | --- | --- | --- |
| 2 | Color mosaic | 4 | Partial; other tiles fell back |
| 8 | THEMIS | 0 | Fallback used |
| 11 | CTX | 0 | Fallback used; one Jezero HiRISE tile loaded |
| 14 | HiRISE | 7 | Partial; additional Jezero imagery also loaded |

Six transport timeout failures were recorded. There were **zero application
runtime exceptions and zero broken displayed tiles**, but network errors do
appear in the live browser console. Many other requests were cancelled after
the fallback deadline or navigation; cancellations are not successful imagery.
An earlier live run was also degraded.

The local orthomosaic is disabled only in this standalone remote-pipeline
diagnostic, to avoid mistaking it for remote success. Its real loading,
alignment, displayed-source label and usable hazard coverage are verified in
the application/production tests.

Re-run live availability from the target network before relying on global
high-detail imagery. Native grayscale is expected; fallback does not create
missing resolution. Hazards exist only within the supplied Jezero DEM.
Conditions are explicitly sample data, and terrain risk is an estimate, not
certified rover-safety guidance.

## Subsequent user-requested globe update

The previous four site markers have been replaced by one Jezero Study Area
marker with the same visual treatment. Its position comes from the current
DEM metadata, not a guessed crater coordinate. Clicking/tapping it performs a
smooth rotate/zoom, then fits the actual study footprint in 2D. The default
camera faces Jezero; free rotation and manual wheel/pinch transitions remain.

Updated checks verify exactly one marker, removal of old sites, metadata
positioning/failure, normal and reduced-motion keyboard entry, touch entry at
all four tablet sizes, preserved app state and production-built behavior.
This requested change supersedes the original four-marker illustration.

The subsequent overlay-control request hides its button in 3D and removes
automatic study-area navigation from hazard toggling. The current map centre
and zoom are preserved. Jezero marker/pin navigation and the header radiation
reading are unchanged.

## Reproduce and inspect artifacts

From `web/`:

```sh
npm test
npm run test:browser
npm run build
node tests/phase5.preview.js
node tests/phase7.visual.js
node tests/phase7.live.js
```

The live command reports missing primary sources through exit status 2; sparse
HiRISE alone is not treated as a global-source outage. It must not be described
as a passing availability check when primary sources are unavailable.

Artifacts are under:

`C:\Users\user\AppData\Local\Temp\opencode\nasa-mars-phase7\`

- `visual-comparison.html` — side-by-side reference/current/difference images.
- `visual-comparison.json` — measured geometry and diagnostic pixel statistics.
- `live-imagery.json` — latest real-provider results and network diagnostics.
- `live-imagery-previous.json` — preceding live run, when present.
- `live-z2.png`, `live-z8.png`, `live-z11.png`, `live-z14.png`.

Earlier desktop/tablet screenshots remain in the corresponding
`nasa-mars-phase2` through `nasa-mars-phase6` temporary directories.
