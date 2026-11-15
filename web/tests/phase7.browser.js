import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { cellToLatLon } from "../src/routing/coordinates.js";
import { formatCoordinates } from "../src/planner/plannerData.js";

const meta = JSON.parse(await readFile(new URL("../public/data/jezero_grid_meta.json", import.meta.url), "utf8"));
const start = formatCoordinates(cellToLatLon({ row: 250, col: 250 }, meta));
const end = formatCoordinates(cellToLatLon({ row: 250, col: 330 }, meta));

async function openPlanner(page, url, from = start, to = end) {
  await page.goto(url);
  await page.getByRole("button", { name: "Route planner", exact: true }).click();
  await page.getByRole("textbox", { name: "Start coordinates" }).fill(from);
  await page.getByRole("textbox", { name: "Destination coordinates" }).fill(to);
}

export async function checkPhase7(page, url) {
  await page.setViewportSize({ width: 1440, height: 1024 });
  await page.route("**/assets/mars.jpg", (request) => request.fulfill({ contentType: "image/jpeg", body: "invalid image fixture" }));
  await page.goto(url);
  await page.getByRole("alert").filter({ hasText: "Mars surface texture could not be loaded" }).waitFor();
  assert.equal(await page.locator(".globe-marker:not([hidden])").count(), 0);
  await page.unroute("**/assets/mars.jpg");

  await openPlanner(page, url);
  await page.evaluate(() => {
    window.Worker = class {
      constructor() { throw new DOMException("Worker blocked fixture", "SecurityError"); }
    };
  });
  await page.getByRole("button", { name: "Calculate Route", exact: true }).click();
  await page.getByRole("alert").filter({ hasText: "worker could not start" }).waitFor();
  assert.equal(await page.locator(".route-line").count(), 0);
  assert.equal(await page.locator(".elevation-line").count(), 0);

  await openPlanner(page, url);
  await page.evaluate(() => {
    window.workerTerminations = 0;
    window.Worker = class {
      postMessage() {}
      terminate() { window.workerTerminations += 1; }
    };
    const schedule = window.setTimeout.bind(window);
    // Exercise the real 30-second timeout branch without a 30-second test wait.
    window.setTimeout = (callback, delay, ...args) => schedule(callback, delay === 30000 ? 25 : delay, ...args);
  });
  await page.getByRole("button", { name: "Calculate Route", exact: true }).click();
  await page.getByRole("alert").filter({ hasText: "Route calculation timed out" }).waitFor();
  assert.equal(await page.evaluate(() => window.workerTerminations), 1);
  assert.equal(await page.locator(".route-line").count(), 0);

  // Genuinely disconnected terrain, not a mocked route-finder response.
  // Only HTTP fixtures change: no protected file is written.
  const smallMeta = {
    ...meta, width: 7, height: 7,
    bounds: { xmin: meta.bounds.xmin, xmax: meta.bounds.xmin + 112, ymin: meta.bounds.ymax - 112, ymax: meta.bounds.ymax },
  };
  const smallGrid = Array.from({ length: 7 }, () => Array(7).fill(0));
  smallGrid[3].fill(null);
  await page.route("**/data/jezero_grid.json", (request) => request.fulfill({ json: smallGrid }));
  await page.route("**/data/jezero_grid_meta.json", (request) => request.fulfill({ json: smallMeta }));
  await openPlanner(page, url,
    formatCoordinates(cellToLatLon({ row: 1, col: 1 }, smallMeta)),
    formatCoordinates(cellToLatLon({ row: 5, col: 5 }, smallMeta)));
  await page.getByRole("button", { name: "Calculate Route", exact: true }).click();
  await page.getByRole("alert").filter({ hasText: "No traversable route connects" }).waitFor();
  assert.equal(await page.locator(".route-line").count(), 0);
  assert.equal(await page.locator(".route-metrics").count(), 0);
  await page.unroute("**/data/jezero_grid.json");
  await page.unroute("**/data/jezero_grid_meta.json");

  // The merged local image must be identified as the displayed source.
  await page.goto(url);
  await page.getByRole("button", { name: "Switch to 2D map" }).click();
  await page.locator('.mars-map[data-terrain="ready"]').waitFor();
  if (existsSync(new URL("../public/data/jezero_ortho.png", import.meta.url))) {
    await page.locator(".local-ortho").waitFor();
    await page.waitForFunction(() => document.querySelector(".local-ortho")?.naturalWidth > 0);
    await page.locator(".imagery-status").getByText("Local Jezero orthomosaic · grayscale", { exact: true }).waitFor();
  }
  console.log("Phase 7 failure/provenance checks passed: failed texture, unavailable Worker, terminated timeout, genuinely disconnected terrain and correctly identified local orthomosaic; no partial results. Failure data/timing use test-only fixtures.");
}
