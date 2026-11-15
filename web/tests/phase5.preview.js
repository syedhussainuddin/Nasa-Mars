// Checks the built Worker URL and full UI flow, not Vite's source-module paths.
// Run npm run build first. Tile responses are deterministic fixtures.
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { chromium } from "playwright";
import { preview } from "vite";
import { cellToLatLon } from "../src/routing/coordinates.js";
import { planRoute } from "../src/routing/planRoute.js";
import { formatCoordinates } from "../src/planner/plannerData.js";
import { installImageryFixtures } from "./imageryFixtures.js";

const grid = JSON.parse(await readFile(new URL("../public/data/jezero_grid.json", import.meta.url), "utf8"));
const meta = JSON.parse(await readFile(new URL("../public/data/jezero_grid_meta.json", import.meta.url), "utf8"));
const start = cellToLatLon({ row: 250, col: 250 }, meta), end = cellToLatLon({ row: 250, col: 330 }, meta);
const expected = planRoute(start, end, grid, meta);
const server = await preview({ preview: { host: "127.0.0.1", port: 0, open: false } });
let browser;
try {
  browser = await chromium.launch({
    channel: process.env.PLAYWRIGHT_CHANNEL || (existsSync(chromium.executablePath()) ? undefined : "chrome"),
  });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1024 }, hasTouch: true });
  await installImageryFixtures(page);
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => { if (message.type() === "error") errors.push(message.text()); });
  await page.goto(server.resolvedUrls.local[0]);
  await page.getByRole("button", { name: "Zoom to Jezero Study Area" }).waitFor();
  assert.equal(await page.locator(".globe-marker").count(), 1);
  await page.getByRole("button", { name: "Zoom to Jezero Study Area" }).tap();
  await page.locator('.mars-map[data-terrain="ready"]').waitFor();
  await page.waitForFunction(() => Number(document.querySelector(".mars-map").dataset.zoom) >= 10);
  await page.getByText("JEZERO · STUDY AREA", { exact: true }).waitFor();
  await page.getByRole("button", { name: "Route planner", exact: true }).click();
  await page.getByRole("textbox", { name: "Start coordinates" }).fill(formatCoordinates(start));
  await page.getByRole("textbox", { name: "Destination coordinates" }).fill(formatCoordinates(end));
  await page.getByRole("button", { name: "Calculate Route", exact: true }).click();
  await page.getByRole("button", { name: "Recalculate Route", exact: true }).waitFor();
  await page.locator(".route-line").waitFor({ state: "attached" });
  assert.equal(await page.locator('[data-metric="distance"]').textContent(), `${expected.distanceKm.toFixed(2)} Km`);
  assert.equal(await page.getByRole("img", { name: "Route elevation profile" }).count(), 1);
  await page.getByRole("button", { name: "Saved routes", exact: true }).click();
  await page.locator(".saved-route-row").waitFor();
  assert.equal(await page.locator(".saved-route-row").count(), 1);
  await page.locator(".saved-route-row").tap();
  await page.getByRole("button", { name: "Recalculate Route", exact: true }).waitFor();
  for (const viewport of [
    { width: 1024, height: 768 }, { width: 768, height: 1024 },
    { width: 1024, height: 600 }, { width: 800, height: 1280 },
  ]) {
    await page.setViewportSize(viewport);
    await page.waitForFunction(() => {
      const panel = document.querySelector("#planner-panel").getBoundingClientRect();
      const toolbar = document.querySelector(".right-toolbar").getBoundingClientRect();
      return [...document.querySelectorAll(".map-endpoint")].length === 2 &&
        [...document.querySelectorAll(".map-endpoint")].every((marker) => {
          const bounds = marker.getBoundingClientRect();
          return bounds.left > panel.right && bounds.right < toolbar.left && bounds.bottom < innerHeight - 90;
        });
    });
    assert.deepEqual(await page.evaluate(() => ({
      width: document.documentElement.scrollWidth, height: document.documentElement.scrollHeight,
    })), viewport);
    assert.equal(await page.locator('[data-metric="distance"]').textContent(), `${expected.distanceKm.toFixed(2)} Km`);
    await page.locator(".elevation-chart").scrollIntoViewIfNeeded();
    const chart = await page.locator(".elevation-chart").boundingBox();
    assert.ok(chart.y >= 170 && chart.y + chart.height < viewport.height - 90);
  }
  assert.deepEqual(errors, []);
  console.log("Production preview passed: single Jezero globe marker/study-area entry, built Web Worker, real route/metrics/profile, automatic save/restore, and route/layout preservation at desktop plus four tablet sizes; no console errors. Imagery uses fixtures.");
} finally {
  await browser?.close();
  await new Promise((resolve, reject) => server.httpServer.close((error) => error ? reject(error) : resolve()));
}
