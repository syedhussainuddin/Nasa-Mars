import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { chromium } from "playwright";
import { createServer } from "vite";
import { checkPhase2 } from "./phase2.browser.js";
import { checkPhase3 } from "./phase3.browser.js";
import { installImageryFixtures } from "./imageryFixtures.js";
import { checkPhase4, phase4Harness } from "./phase4.browser.js";
import { checkMapFixes } from "./mapFixes.browser.js";
import { checkPhase5 } from "./phase5.browser.js";
import { checkPhase6 } from "./phase6.browser.js";
import { checkPhase7 } from "./phase7.browser.js";

const server = await createServer({
  server: { host: "127.0.0.1", port: 0, open: false, hmr: false },
  plugins: [{
    name: "phase4-component-fixture",
    configureServer(server) {
      // Serve HTML over real localhost HTTP, not Playwright route.fulfill:
      // Chromium's local-network checks otherwise block Vite's dev websocket.
      server.middlewares.use((request, response, next) => {
        if (request.url?.split("?")[0] !== "/__phase4_harness.html") return next();
        response.setHeader("Content-Type", "text/html");
        response.end(phase4Harness);
      });
    },
  }],
});
let browser;
try {
  await server.listen();
  const channel = process.env.PLAYWRIGHT_CHANNEL ||
    (existsSync(chromium.executablePath()) ? undefined : "chrome");
  browser = await chromium.launch({ channel });
  const page = await browser.newPage();
  await installImageryFixtures(page);
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  await page.goto(server.resolvedUrls.local[0]);
  await page.getByRole("heading", { name: "Mars Navigation System" }).waitFor();
  const result = await page.evaluate(async () => {
    const { loadGrid } = await import("/src/data/loadGrid.js");
    const { loadConditions } = await import("/src/data/conditions.js");
    const { createSlopeRaster, createTerrainRaster } = await import("/src/data/rasters.js");
    const { readSavedRoutes, writeSavedRoutes } = await import("/src/data/savedRoutes.js");
    const { cellToLatLon } = await import("/src/routing/coordinates.js");
    const { planRoute } = await import("/src/routing/planRoute.js");
    const [a, b, conditions] = await Promise.all([loadGrid(), loadGrid(), loadConditions()]);
    const pixels = async (url) => {
      const image = new Image();
      image.src = url;
      await image.decode();
      const canvas = document.createElement("canvas");
      canvas.width = image.width;
      canvas.height = image.height;
      const context = canvas.getContext("2d");
      context.drawImage(image, 0, 0);
      return { width: image.width, height: image.height, data: Array.from(context.getImageData(0, 0, image.width, image.height).data) };
    };
    const slope = await pixels(createSlopeRaster([[null, 9.99, 10, 15, 15.01]], { width: 5, height: 1 }));
    const missing = await pixels(createTerrainRaster([[null]], { width: 1, height: 1, cell_size: { x: 16, y: 16 } }));
    const terrain = await pixels(a.terrainRaster);
    const hazard = await pixels(a.slopeRaster);
    let pair;
    for (let row = 1; row < a.meta.height - 1 && !pair; row += 1) {
      for (let col = 1; col < a.meta.width - 2; col += 1) {
        if ([a.slopeGrid[row][col], a.slopeGrid[row][col + 1]].every((s) => Number.isFinite(s) && s <= 15)) {
          pair = [{ row, col }, { row, col: col + 1 }];
          break;
        }
      }
    }
    const route = planRoute(...pair.map((cell) => cellToLatLon(cell, a.meta)), a.grid, a.meta);
    const saved = { id: "browser-check", name: "Start → Dest", start: route.start, end: route.end, distanceKm: route.distanceKm };
    const saveError = writeSavedRoutes([saved]);
    const restored = readSavedRoutes(a.meta);
    localStorage.clear();
    const texture = new Image();
    texture.src = "/assets/mars.jpg";
    await texture.decode();
    return {
      sameCache: a === b && a === await loadGrid(),
      dimensions: [a.grid.length, a.grid[0].length, a.slopeGrid.length],
      rasters: [[terrain.width, terrain.height], [hazard.width, hazard.height]],
      slope: slope.data,
      missing: missing.data,
      conditions,
      routeDistance: route.distanceKm,
      saveError,
      restored,
      texture: [texture.width, texture.height],
    };
  });
  assert.equal(result.sameCache, true);
  assert.deepEqual(result.dimensions, [500, 500, 500]);
  assert.deepEqual(result.rasters, [[500, 500], [500, 500]]);
  assert.deepEqual(result.slope, [0, 0, 0, 0, 0, 200, 83, 255, 241, 199, 73, 255, 241, 199, 73, 255, 227, 74, 59, 255]);
  assert.deepEqual(result.missing, [0, 0, 0, 0]);
  assert.equal(result.conditions.pressureMbar, 7.37);
  assert.equal(result.routeDistance, 0.016);
  assert.equal(result.saveError, "");
  assert.equal(result.restored.routes.length, 1);
  assert.deepEqual(result.texture, [2048, 1024]);
  console.log("Phase 1 Chromium checks passed: scaffold, grid cache, rasters, real routing, conditions, storage, texture; no console errors.");
  await checkPhase2(page, server.resolvedUrls.local[0]);
  await checkPhase3(page, server.resolvedUrls.local[0]);
  await checkPhase4(page, server.resolvedUrls.local[0]);
  await checkMapFixes(page, server.resolvedUrls.local[0]);
  await checkPhase5(page, server.resolvedUrls.local[0]);
  await checkPhase7(page, server.resolvedUrls.local[0]);
  const tablet = await browser.newPage({ viewport: { width: 1024, height: 768 }, hasTouch: true });
  await installImageryFixtures(tablet);
  tablet.on("pageerror", (error) => errors.push(error.message));
  tablet.on("console", (message) => { if (message.type() === "error") errors.push(message.text()); });
  try {
    await checkPhase6(tablet, server.resolvedUrls.local[0]);
  } finally {
    await tablet.close();
  }
  assert.deepEqual(errors, []);
} finally {
  await browser?.close();
  await server.close();
}
