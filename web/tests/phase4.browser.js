import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { installImageryFixtures } from "./imageryFixtures.js";

export async function zoomTo(page, target) {
  await page.locator(".mars-map").focus();
  let current = Number(await page.locator(".mars-map").getAttribute("data-zoom"));
  while (current !== target) {
    await page.waitForFunction(() => !document.querySelector(".mars-map").classList.contains("leaflet-zoom-anim"));
    const next = current + Math.sign(target - current);
    // "=" is Leaflet's unshifted plus key; Shift+"+" jumps three zoom levels.
    await page.keyboard.press(next > current ? "=" : "-");
    try {
      await page.waitForFunction((zoom) => Number(document.querySelector(".mars-map")?.dataset.zoom) === zoom, next);
    } catch (error) {
      const state = await page.locator(".mars-map").evaluate((map) => ({
        zoom: map.dataset.zoom, classes: map.className, focused: map === document.activeElement,
      }));
      throw new Error(`Keyboard zoom ${current}→${next} failed: ${JSON.stringify(state)}`, { cause: error });
    }
    current = next;
  }
}

export async function clickCell(page, cell) {
  const point = await page.evaluate(async (cell) => {
    const { loadGrid } = await import("/src/data/loadGrid.js");
    const { cellToLatLon } = await import("/src/routing/coordinates.js");
    const { meta } = await loadGrid();
    const point = cellToLatLon(cell, meta);
    const map = document.querySelector(".mars-map");
    const box = map.getBoundingClientRect();
    const zoom = Number(map.dataset.zoom);
    return {
      x: box.x + box.width / 2 + (point.lon - Number(map.dataset.centerLon)) / 360 * 2 ** (zoom + 1) * 256,
      y: box.y + box.height / 2 + (Number(map.dataset.centerLat) - point.lat) / 180 * 2 ** zoom * 256,
    };
  }, cell);
  await page.mouse.click(point.x, point.y);
}

export const phase4Harness = `<!doctype html><html><head><link rel="icon" href="data:,"><link rel="stylesheet" href="/src/styles.css">
<script type="module">
import RefreshRuntime from "/@react-refresh";
RefreshRuntime.injectIntoGlobalHook(window);
window.$RefreshReg$ = () => {};
window.$RefreshSig$ = () => type => type;
window.__vite_plugin_react_preamble_installed__ = true;
</script></head>
<body><div id="fixture-root" style="position:fixed;inset:0"></div><script type="module">
import React from "/node_modules/.vite/deps/react.js";
import ReactDom from "/node_modules/.vite/deps/react-dom_client.js";
const { useState } = React;
const { createRoot } = ReactDom;
import MarsMap from "/src/components/MarsMap.jsx";
import { loadGrid } from "/src/data/loadGrid.js";
import { cellToLatLon } from "/src/routing/coordinates.js";
import { planRoute } from "/src/routing/planRoute.js";
const data = await loadGrid();
let pair;
for(let row=2;row<data.meta.height-2&&!pair;row++){
  for(let col=2;col<data.meta.width-3;col++){
    if([data.slopeGrid[row][col],data.slopeGrid[row][col+1]].every(s=>Number.isFinite(s)&&s<=15)){
      pair=[{row,col},{row,col:col+1}];break;
    }
  }
}
const [start,end] = pair.map(c=>cellToLatLon(c,data.meta));
const route=planRoute(start,end,data.grid,data.meta);
window.phase4Events=[];
function Fixture(){
  const [props,set]=useState({viewport:{center:{lat:18.36,lon:77.22},zoom:11},
    endpoints:{start:null,end:null},route:null,panel:"planner",hazardsVisible:false,localOrthoUrl:null});
  window.phase4Fixture={set,route,endpoints:{start,end},data};
  return React.createElement(MarsMap,{...props,gridData:data,
    onViewportChange:v=>set(s=>({...s,viewport:v})),
    onSelectEndpoint:p=>window.phase4Events.push(p),
    onSelectionError:error=>window.phase4Events.push({error})});
}
createRoot(document.getElementById("fixture-root")).render(React.createElement(Fixture));
</script></body></html>`;

export async function checkPhase4(page, url) {
  await page.setViewportSize({ width: 1440, height: 1024 });
  const requests = await installImageryFixtures(page);
  await page.goto(url);
  await page.locator('.mars-globe[data-status="ready"]').waitFor();
  await page.getByRole("button", { name: "Switch to 2D map" }).click();
  await page.locator('.mars-map[data-terrain="ready"]').waitFor();
  await page.waitForFunction(() => document.querySelectorAll('img.leaflet-tile-loaded[data-layer="CTX"]').length > 0);
  assert.equal(await page.locator(".leaflet-control-zoom").count(), 0);
  assert.equal(await page.locator(".grid-footprint").count(), 1);
  assert.match(await page.locator(".leaflet-control-attribution").textContent(), /NASA Mars Trek \/ USGS \/ HiRISE/);
  assert.equal(await page.locator(".local-ortho").count(), 0, "missing optional image must not be requested");
  assert.equal(requests.some((url) => url.includes("jezero_ortho")), false);
  const info = page.getByRole("button", { name: "About conditions data" });
  await info.click();
  assert.equal(await info.getAttribute("aria-expanded"), "true", "map panes must stay below header/toolbar");
  await info.click();

  await clickCell(page, { row: 250, col: 250 });
  await page.locator(".map-endpoint-start").waitFor();
  assert.equal(await page.locator(".map-endpoint-end").count(), 0);
  await clickCell(page, { row: 320, col: 350 });
  await page.locator(".map-endpoint-end").waitFor();
  assert.equal(await page.locator(".map-endpoint").count(), 2);
  const colors = await page.locator(".map-endpoint-dot").evaluateAll((nodes) => nodes.map((node) => getComputedStyle(node).backgroundColor));
  assert.deepEqual(colors, ["rgb(241, 199, 73)", "rgb(255, 255, 255)"]);
  assert.equal(await page.locator(".map-endpoint-end").evaluate((marker) => getComputedStyle(marker).borderTopColor), "rgb(0, 217, 255)");
  const checkMarkerCenters = async () => {
    const offsets = await page.locator(".map-endpoint").evaluateAll((markers) => markers.map((marker) => {
      const outer = marker.getBoundingClientRect();
      const dot = marker.querySelector(".map-endpoint-dot").getBoundingClientRect();
      return { x: Math.abs(dot.x + dot.width / 2 - outer.x - outer.width / 2), y: Math.abs(dot.y + dot.height / 2 - outer.y - outer.height / 2) };
    }));
    assert.ok(offsets.every(({ x, y }) => x < 0.1 && y < 0.1), JSON.stringify(offsets));
  };
  await checkMarkerCenters();
  await clickCell(page, { row: 225, col: 225 });
  await page.waitForFunction(() => document.querySelectorAll(".map-endpoint").length === 1);
  await page.mouse.click(1200, 800);
  await page.getByRole("alert").filter({ hasText: "inside the outlined study area" }).waitFor();
  assert.equal(await page.locator(".map-endpoint").count(), 1);
  await clickCell(page, { row: 320, col: 350 });
  await page.locator(".map-endpoint-end").waitFor();
  assert.equal(await page.locator("#planner-panel [role=alert]").count(), 0);

  const hazard = page.getByRole("button", { name: "Toggle hazard overlay" });
  await hazard.click();
  await page.locator(".hazard-raster").waitFor();
  await checkMarkerCenters();
  assert.equal(await page.locator(".hazard-legend li").count(), 3);
  assert.equal(await page.locator(".hazard-raster").evaluate((image) => getComputedStyle(image).opacity), "0.43");
  await hazard.click();
  assert.equal(await page.locator(".hazard-raster").count(), 0);
  await hazard.click();

  const directory = join(tmpdir(), "opencode", "nasa-mars-phase4");
  await mkdir(directory, { recursive: true });
  await page.screenshot({ path: join(directory, "map-endpoints-hazards-fixture.png") });
  await zoomTo(page, 8);
  await page.waitForFunction(() => document.querySelectorAll('img[data-layer="THEMIS_DayIR_ControlledMosaics_100m_v2_oct2018"]').length > 0);
  assert.ok(requests.some((url) => /THEMIS.*\/8\/\d+\/\d+\.png/.test(url)));
  await zoomTo(page, 14);
  await page.waitForFunction(() => document.querySelectorAll('img[data-layer="HiRISE"]').length > 0);
  assert.ok(requests.some((url) => /\/CTX\/MapServer\/tile\/12\//.test(url)));
  assert.ok(requests.some((url) => /\/HiRISE\/MapServer\/tile\/14\//.test(url)));
  assert.ok(requests.some((url) => url.includes("JEZ_ctx")));
  assert.ok(requests.some((url) => url.includes("JEZ_hirise")));
  const fallbacks = await page.evaluate(() => ({
    localTiles: document.querySelectorAll(".leaflet-texture-pane canvas.leaflet-tile-loaded").length,
    coarseTiles: document.querySelectorAll('img[data-layer="CTX"]').length,
    broken: [...document.querySelectorAll("img.leaflet-tile-loaded")].filter((image) => !image.complete || !image.naturalWidth).length,
  }));
  assert.ok(fallbacks.localTiles > 0 && fallbacks.coarseTiles > 0);
  assert.equal(fallbacks.broken, 0);

  await zoomTo(page, 4);
  const exitCenter = await page.locator(".mars-map").evaluate((map) => ({
    lat: Number(map.dataset.centerLat), lon: Number(map.dataset.centerLon),
  }));
  await page.keyboard.press("-");
  await page.locator('.mars-globe[data-status="ready"]').waitFor();
  await page.locator(".scene-entering").waitFor({ state: "detached" });
  assert.equal(await page.locator(".mars-map").count(), 0);
  assert.ok(Number(await page.locator(".mars-globe").getAttribute("data-distance")) >= 3);
  assert.ok(Math.abs(Number(await page.locator(".mars-globe").getAttribute("data-center-lat")) - exitCenter.lat) < 0.01);
  assert.ok(Math.abs(Number(await page.locator(".mars-globe").getAttribute("data-center-lon")) - exitCenter.lon) < 0.01);
  assert.equal(await page.locator("#planner-panel").isVisible(), true);
  await page.getByRole("button", { name: "Switch to 2D map" }).click();
  await page.locator('.mars-map[data-terrain="ready"]').waitFor();
  assert.equal(Number(await page.locator(".mars-map").getAttribute("data-zoom")), 4);
  await page.locator(".map-endpoint-end").waitFor();
  assert.equal(await page.locator(".map-endpoint").count(), 2);
  assert.equal(await hazard.getAttribute("aria-pressed"), "true");
  await page.locator(".hazard-raster").waitFor();

  // Component fixture exercises route rendering before Phase 5 adds Calculate,
  // plus the optional-image branch without changing protected public data.
  await page.route("**/__ortho.svg", (request) => request.fulfill({
    contentType: "image/svg+xml",
    body: '<svg xmlns="http://www.w3.org/2000/svg" width="500" height="500"><path fill="#96816a" d="M0 0h500v500H0z"/></svg>',
  }));
  await page.goto(new URL("__phase4_harness.html", url).href);
  await page.locator('.mars-map[data-terrain="ready"]').waitFor();
  await zoomTo(page, 2);
  assert.ok(requests.some((url) => /msss_atlas_simp_clon.*\/2\/\d+\/\d+\.png/.test(url)));
  await page.evaluate(() => window.phase4Fixture.set((props) => ({
    ...props, route: window.phase4Fixture.route, endpoints: window.phase4Fixture.endpoints,
    hazardsVisible: true, localOrthoUrl: "/__ortho.svg",
  })));
  // A horizontal two-cell path has zero geometric height, despite visible stroke.
  await page.locator(".route-line").waitFor({ state: "attached" });
  await page.locator(".local-ortho").waitFor();
  await page.waitForFunction(() => document.querySelector(".local-ortho").naturalWidth > 0);
  assert.equal(await page.locator(".route-glow").count(), 1);
  assert.equal(await page.locator(".route-line").getAttribute("stroke-width"), "4");
  assert.equal(await page.locator(".route-line").getAttribute("stroke"), "#F1C749");
  assert.equal(Number(await page.locator(".mars-map").getAttribute("data-zoom")), 17);
  await page.screenshot({ path: join(directory, "map-real-route-optional-image-fixture.png") });
  await page.evaluate(() => window.phase4Fixture.set((props) => ({ ...props, route: { cells: [{ row: -1, col: 0 }] } })));
  await page.getByRole("alert").filter({ hasText: "invalid map coordinates" }).waitFor();
  assert.equal(await page.locator(".route-line").count(), 0);
  assert.equal(await page.locator(".route-glow").count(), 0);
  await page.unroute("**/__ortho.svg");
  await page.route("**/data/jezero_grid.json", (request) => request.fulfill({ json: [] }));
  await page.goto(url);
  await page.getByRole("button", { name: "Switch to 2D map" }).click();
  await page.locator('.mars-map[data-terrain="error"]').waitFor();
  await page.getByRole("alert").filter({ hasText: "Endpoint selection and hazards are unavailable" }).waitFor();
  await page.mouse.click(1000, 700);
  await page.getByRole("alert").filter({ hasText: "Reload the page before selecting endpoints" }).waitFor();
  assert.equal(await page.locator(".map-endpoint").count(), 0);
  await page.unroute("**/data/jezero_grid.json");
  console.log(`Phase 4 browser checks passed: EPSG:4326 stack at z2/8/11/14, sparse imagery fallback, endpoint cycle/errors, hazards, globe/map hysteresis and state preservation, real-route geometry/fit, optional image. Imagery uses fixtures, not a live-provider availability test. Screenshots: ${directory}`);
}
