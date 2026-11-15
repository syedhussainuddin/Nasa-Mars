// Live imagery-pipeline integration, separate from deterministic UI assertions.
// z2 uses the standalone map because the app deliberately returns to 3D at z3.
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { copyFile, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { chromium } from "playwright";
import { createServer } from "vite";
import { phase4Harness } from "./phase4.browser.js";

const directory = join(tmpdir(), "opencode", "nasa-mars-phase7");
await mkdir(directory, { recursive: true });
const server = await createServer({
  server: { host: "127.0.0.1", port: 0, hmr: false },
  plugins: [{
    name: "live-map-pipeline",
    configureServer(server) {
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
  browser = await chromium.launch({
    channel: process.env.PLAYWRIGHT_CHANNEL || (existsSync(chromium.executablePath()) ? undefined : "chrome"),
  });
  const page = await browser.newPage({ viewport: { width: 768, height: 768 } });
  const runtimeErrors = [], providerMisses = [], consoleErrors = [], transportFailures = [];
  let cancelledRequests = 0;
  page.on("pageerror", (error) => runtimeErrors.push(error.message));
  page.on("console", (message) => { if (message.type() === "error") consoleErrors.push(message.text()); });
  page.on("response", (response) => {
    if (/trek\.nasa\.gov|astro\.arcgis\.com/.test(response.url()) && response.status() >= 400) {
      providerMisses.push({ status: response.status(), url: response.url() });
    }
  });
  page.on("requestfailed", (request) => {
    if (!/trek\.nasa\.gov|astro\.arcgis\.com/.test(request.url())) return;
    const reason = request.failure()?.errorText || "Unknown network failure";
    if (reason === "net::ERR_ABORTED") cancelledRequests += 1;
    else transportFailures.push({ reason, url: request.url() });
  });
  await page.goto(new URL("__phase4_harness.html", server.resolvedUrls.local[0]).href);
  await page.locator('.mars-map[data-terrain="ready"]').waitFor();
  const stages = [
    { zoom: 2, center: { lat: 0, lon: 0 }, expected: "msss_atlas_simp_clon" },
    { zoom: 8, center: { lat: 18.36, lon: 77.22 }, expected: "THEMIS_DayIR_ControlledMosaics_100m_v2_oct2018" },
    { zoom: 11, center: { lat: 18.36, lon: 77.22 }, expected: "CTX" },
    { zoom: 14, center: { lat: 18.45, lon: 77.4 }, expected: "HiRISE" },
  ];
  const results = [];
  for (const stage of stages) {
    await page.evaluate((viewport) => window.phase4Fixture.set((props) => ({ ...props, viewport })), { center: stage.center, zoom: stage.zoom });
    await page.waitForFunction((zoom) => Number(document.querySelector(".mars-map").dataset.zoom) === zoom, stage.zoom);
    await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    await page.waitForFunction(() => document.querySelector(".mars-map").dataset.imageryLoading === "false", null, { timeout: 45000 });
    const tiles = await page.evaluate(() => {
      const viewport = document.querySelector(".mars-map").getBoundingClientRect();
      const visible = (tile) => {
        const bounds = tile.getBoundingClientRect();
        return bounds.right > viewport.left && bounds.left < viewport.right &&
          bounds.bottom > viewport.top && bounds.top < viewport.bottom;
      };
      const sources = {}, missing = {};
      let broken = 0;
      for (const tile of document.querySelectorAll("img.leaflet-tile-loaded[data-layer]")) {
        if (!visible(tile)) continue;
        if (!tile.complete || !tile.naturalWidth) broken += 1;
        else if (tile.dataset.fallback === "true") missing[tile.dataset.layer] = (missing[tile.dataset.layer] || 0) + 1;
        else sources[tile.dataset.layer] = (sources[tile.dataset.layer] || 0) + 1;
      }
      return { sources, missing, broken, textureFallbackTiles: document.querySelectorAll(".leaflet-texture-pane canvas.leaflet-tile-loaded").length };
    });
    assert.equal(tiles.broken, 0);
    assert.ok(tiles.textureFallbackTiles > 0);
    const screenshot = `live-z${stage.zoom}.png`;
    await page.screenshot({ path: join(directory, screenshot) });
    results.push({
      ...stage, ...tiles, screenshot,
      expectedSourceAvailable: Boolean(tiles.sources[stage.expected]),
      sourceReadout: await page.locator(".imagery-status").textContent(),
    });
  }
  assert.deepEqual(runtimeErrors, []);
  const report = {
    capturedAt: new Date().toISOString(), browser: browser.version(), results, runtimeErrors, providerMisses, consoleErrors,
    primarySourcesAvailable: results.filter((stage) => stage.zoom !== 14).every((stage) => stage.expectedSourceAvailable),
    transportFailures, cancelledRequests,
    note: "No tile mocks. Missing/slow native coverage is reported, not counted as a successful high-resolution load. Coarser/local texture fallback is verified. HTTP coverage misses can create browser network-console messages without application exceptions. Local ortho is disabled only in this pipeline fixture; the full app tests verify it separately.",
  };
  const reportFile = join(directory, "live-imagery.json");
  if (existsSync(reportFile)) await copyFile(reportFile, join(directory, "live-imagery-previous.json"));
  await writeFile(reportFile, JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
  // HiRISE is deliberately sparse, but missing primary global sources must not
  // be mistaken for a successful live-availability verification.
  if (!report.primarySourcesAvailable) process.exitCode = 2;
} finally {
  await browser?.close();
  await server.close();
}
