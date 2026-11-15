import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { clickCell, zoomTo } from "./phase4.browser.js";

const KEY = "mars-nav:saved-routes:v1";
const workerUrl = "**/src/workers/route.worker.js*";

async function fillEndpoints(page, fixture) {
  await page.getByRole("textbox", { name: "Start coordinates" }).fill(fixture.start);
  await page.getByRole("textbox", { name: "Destination coordinates" }).fill(fixture.end);
}

export async function checkPhase5(page, url) {
  await page.goto(url);
  await page.evaluate((key) => localStorage.removeItem(key), KEY);
  await page.getByRole("button", { name: "Route planner", exact: true }).click();
  await page.getByRole("button", { name: "Calculate Route", exact: true }).click();
  await page.getByRole("alert").filter({ hasText: "Choose a start point" }).waitFor();
  await page.getByRole("alert").filter({ hasText: "Choose a destination point" }).waitFor();

  const fixture = await page.evaluate(async () => {
    const { loadGrid } = await import("/src/data/loadGrid.js");
    const { cellToLatLon } = await import("/src/routing/coordinates.js");
    const { planRoute } = await import("/src/routing/planRoute.js");
    const { formatCoordinates } = await import("/src/planner/plannerData.js");
    const { grid, meta } = await loadGrid();
    const start = cellToLatLon({ row: 250, col: 250 }, meta);
    const end = cellToLatLon({ row: 250, col: 330 }, meta);
    return {
      start: formatCoordinates(start), end: formatCoordinates(end),
      blocked: formatCoordinates(cellToLatLon({ row: 0, col: 0 }, meta)),
      expected: planRoute(start, end, grid, meta),
      otherStart: formatCoordinates(cellToLatLon({ row: 200, col: 200 }, meta)),
      otherEnd: formatCoordinates(cellToLatLon({ row: 300, col: 240 }, meta)),
    };
  });
  await fillEndpoints(page, { ...fixture, start: "not coordinates" });
  await page.getByRole("button", { name: "Calculate Route", exact: true }).click();
  await page.getByRole("alert").filter({ hasText: "decimal degrees" }).waitFor();
  await page.getByRole("textbox", { name: "Start coordinates" }).fill("0, 0");
  await page.getByRole("button", { name: "Calculate Route", exact: true }).click();
  await page.getByRole("alert").filter({ hasText: "outlined Jezero study area" }).waitFor();
  await fillEndpoints(page, fixture);
  await page.waitForFunction(() => document.querySelectorAll(".endpoint-details").length === 2);

  let release;
  const gate = new Promise((resolve) => { release = resolve; });
  await page.route(workerUrl, async (request) => { await gate; await request.continue(); });
  await page.getByRole("button", { name: "Calculate Route", exact: true }).click();
  try {
    await page.getByRole("status").filter({ hasText: "Calculating route" }).waitFor();
    assert.equal(await page.locator(".calculate-button").isDisabled(), true);
    assert.equal(await page.locator(".route-line").count(), 0);
  } finally { release(); }
  await page.getByRole("button", { name: "Recalculate Route", exact: true }).waitFor();
  await page.unroute(workerUrl);
  await page.locator(".route-line").waitFor({ state: "attached" });
  assert.deepEqual(await page.locator("#planner-panel").boundingBox(), { x: 60, y: 222, width: 364, height: 686 });
  assert.equal(await page.locator('[data-metric="distance"]').textContent(), `${fixture.expected.distanceKm.toFixed(2)} Km`);
  assert.equal(await page.locator('[data-metric="slope"]').textContent(), `${fixture.expected.maxSlopeDeg.toFixed(1)}°`);
  assert.equal(await page.locator('[data-metric="risk"]').textContent(), fixture.expected.riskLevel);
  await page.getByText("Estimated terrain risk", { exact: true }).waitFor();
  assert.equal(await page.getByRole("img", { name: "Route elevation profile" }).count(), 1);
  assert.doesNotMatch(await page.locator(".elevation-line").getAttribute("d"), /NaN|Infinity/);
  assert.equal(await page.locator(".elevation-chart").getByText("Elevation (m)", { exact: true }).count(), 1);
  assert.equal(await page.locator(".elevation-chart").getByText("Distance (Km)", { exact: true }).count(), 1);
  assert.equal(await page.locator(".elevation-chart .chart-tick").filter({ hasText: /^0$/ }).count(), 1);
  assert.equal(await page.getByRole("button", { name: /^Save Route$/ }).count(), 0);
  const saved = await page.evaluate((key) => JSON.parse(localStorage.getItem(key)), KEY);
  assert.equal(saved.length, 1);
  assert.equal(saved[0].distanceKm, fixture.expected.distanceKm);
  const directory = join(tmpdir(), "opencode", "nasa-mars-phase5");
  await mkdir(directory, { recursive: true });
  await page.screenshot({ path: join(directory, "calculated-route.png") });

  await page.getByRole("button", { name: "Recalculate Route", exact: true }).click();
  await page.getByRole("button", { name: "Recalculate Route", exact: true }).waitFor();
  assert.equal(await page.evaluate((key) => JSON.parse(localStorage.getItem(key)).length, KEY), 1);
  await page.getByRole("button", { name: "Saved routes", exact: true }).click();
  await page.locator(".saved-route-row").waitFor();
  assert.match(await page.locator(".saved-route-row").textContent(), /Start → Dest1\.4 Kms/);
  await page.screenshot({ path: join(directory, "saved-routes.png") });
  // Restore from the globe, not only from an already-mounted map.
  await page.locator(".mars-map").focus();
  while (await page.locator(".mars-map").count()) {
    const current = Number(await page.locator(".mars-map").getAttribute("data-zoom"));
    await page.waitForFunction(() => !document.querySelector(".mars-map").classList.contains("leaflet-zoom-anim"));
    await page.keyboard.press("Shift+-");
    if (current - 3 <= 3) break;
    await page.waitForFunction((zoom) => Number(document.querySelector(".mars-map")?.dataset.zoom) === zoom, current - 3);
  }
  await page.locator('.mars-globe[data-status="ready"]').waitFor();
  await page.locator(".saved-route-row").click();
  await page.getByRole("button", { name: "Recalculate Route", exact: true }).waitFor();
  await page.locator(".route-line").waitFor({ state: "attached" });
  assert.equal(await page.locator(".app-shell").getAttribute("data-view"), "map");
  assert.equal(await page.locator("#planner-panel").isVisible(), true);
  assert.equal(await page.locator(".map-endpoint").count(), 2);

  // A real blocked edge cell must fail cleanly and leave no partial route/profile.
  await page.getByRole("textbox", { name: "Start coordinates" }).fill(fixture.blocked);
  await page.getByRole("button", { name: "Recalculate Route", exact: true }).click();
  await page.getByRole("alert").filter({ hasText: "blocked or unmapped cell" }).waitFor();
  assert.equal(await page.locator(".route-line").count(), 0);
  assert.equal(await page.locator(".elevation-line").count(), 0);
  assert.equal(await page.getByRole("img", { name: "No elevation data available" }).count(), 1);
  assert.deepEqual(await page.locator(".route-metrics dd").allTextContents(), ["—", "—", "—"]);
  assert.equal(await page.evaluate((key) => JSON.parse(localStorage.getItem(key)).length, KEY), 1);

  // Editing while a worker is starting invalidates the pending result.
  await fillEndpoints(page, fixture);
  let finish;
  const paused = new Promise((resolve) => { finish = resolve; });
  await page.route(workerUrl, async (request) => { await paused; await request.continue(); });
  await page.getByRole("button", { name: "Recalculate Route", exact: true }).click();
  try {
    await page.getByRole("status").filter({ hasText: "Calculating route" }).waitFor();
    await page.getByRole("textbox", { name: "Start coordinates" }).fill("invalid");
  } finally { finish(); }
  await page.unroute(workerUrl);
  await page.getByRole("button", { name: "Recalculate Route", exact: true }).waitFor();
  assert.equal(await page.locator(".route-line").count(), 0);
  assert.equal(await page.evaluate((key) => JSON.parse(localStorage.getItem(key)).length, KEY), 1);

  await page.evaluate((key) => {
    const routes = JSON.parse(localStorage.getItem(key));
    localStorage.setItem(key, JSON.stringify([...routes, { ...routes[0], id: "bad", start: { row: 9999, col: 0 } }]));
  }, KEY);
  await page.getByRole("button", { name: "Saved routes", exact: true }).click();
  await page.getByRole("alert").filter({ hasText: "Some saved routes are corrupt" }).waitFor();
  assert.equal(await page.locator(".saved-route-row").count(), 1);
  await page.evaluate((key) => localStorage.setItem(key, "{broken"), KEY);
  await page.reload();
  await page.getByRole("button", { name: "Saved routes", exact: true }).click();
  await page.getByRole("alert").filter({ hasText: "Saved routes could not be read" }).waitFor();
  assert.equal(await page.locator(".saved-route-row").count(), 0);

  await page.evaluate((key) => {
    localStorage.removeItem(key);
    Storage.prototype.setItem = () => { throw new DOMException("Quota exceeded", "QuotaExceededError"); };
  }, KEY);
  await page.getByRole("button", { name: "Route planner", exact: true }).click();
  await fillEndpoints(page, fixture);
  await page.getByRole("button", { name: "Calculate Route", exact: true }).click();
  await page.getByRole("button", { name: "Recalculate Route", exact: true }).waitFor();
  await page.locator(".storage-warning").filter({ hasText: "session only" }).waitFor();
  assert.equal(await page.evaluate((key) => localStorage.getItem(key), KEY), null);
  await page.getByRole("button", { name: "Saved routes", exact: true }).click();
  await page.locator(".saved-route-row").waitFor();
  assert.equal(await page.locator(".saved-route-row").count(), 1);
  await page.getByRole("button", { name: "Route planner", exact: true }).click();
  // At z11 a DEM cell is less than one CSS pixel; zoom before asserting
  // exact selected cells rather than allowing pixel rounding to choose a neighbour.
  await zoomTo(page, 13);
  await clickCell(page, { row: 200, col: 200 });
  await clickCell(page, { row: 300, col: 240 });
  assert.equal(await page.getByRole("textbox", { name: "Start coordinates" }).inputValue(), fixture.otherStart);
  assert.equal(await page.getByRole("textbox", { name: "Destination coordinates" }).inputValue(), fixture.otherEnd);
  await page.getByRole("button", { name: "Recalculate Route", exact: true }).click();
  await page.getByRole("button", { name: "Recalculate Route", exact: true }).waitFor();
  assert.equal(await page.locator('[data-metric="distance"]').textContent(), "1.87 Km");
  await page.getByRole("button", { name: "Saved routes", exact: true }).click();
  await page.waitForFunction(() => document.querySelectorAll(".saved-route-row").length === 2);
  console.log(`Phase 5 browser checks passed: typed/map-selected coordinates/details, validation, real worker/spinner, calculated summary/profile/map, auto-save/deduplication, restore from globe, failed route with no partial results, edit cancellation, corrupt data and session-only storage. Screenshots: ${directory}`);
}
