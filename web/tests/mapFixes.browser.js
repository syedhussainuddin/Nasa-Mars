import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

export async function checkMapFixes(page, url) {
  await page.goto(url);
  await page.locator('.mars-globe[data-status="ready"]').waitFor();
  // Move away from the new Jezero-facing default to retain the off-screen
  // coverage regression that originally affected arbitrary globe entry.
  await page.mouse.move(500, 850);
  await page.mouse.down();
  await page.mouse.move(1100, 850, { steps: 24 });
  await page.mouse.up();
  await page.waitForFunction(() => Number(document.querySelector(".mars-globe").dataset.centerLon) < 0);
  await page.mouse.move(720, 850);
  await page.mouse.wheel(0, -12000);
  await page.locator('.mars-map[data-terrain="ready"]').waitFor();
  assert.equal(Number(await page.locator(".mars-map").getAttribute("data-zoom")), 4);
  assert.ok(Number(await page.locator(".mars-map").getAttribute("data-center-lon")) < 0);

  // Toggling hazards away from Jezero must not move the user's map.
  const beforeToggle = await page.locator(".mars-map").evaluate((map) => ({
    zoom: map.dataset.zoom, lat: map.dataset.centerLat, lon: map.dataset.centerLon,
  }));
  await page.getByRole("button", { name: "Toggle hazard overlay" }).click();
  assert.deepEqual(await page.locator(".mars-map").evaluate((map) => ({
    zoom: map.dataset.zoom, lat: map.dataset.centerLat, lon: map.dataset.centerLon,
  })), beforeToggle);
  await page.getByText("Jezero hazards off-screen or too small — use the pin to locate", { exact: true }).waitFor();
  await page.getByRole("button", { name: "Route planner", exact: true }).click();
  await page.waitForFunction(() => Number(document.querySelector(".mars-map").dataset.zoom) >= 10);
  await page.getByText("Hazards: Jezero study area only", { exact: true }).waitFor();
  await page.locator(".hazard-raster").waitFor();
  const coverage = await page.locator(".hazard-raster").boundingBox();
  assert.ok(coverage.width >= 160 && coverage.height >= 160);
  assert.ok(coverage.x >= 0 && coverage.y > 167 && coverage.x + coverage.width <= 1440 && coverage.y + coverage.height < 1000);
  await page.getByText("JEZERO · STUDY AREA", { exact: true }).waitFor();

  await page.mouse.click(coverage.x + coverage.width / 2, coverage.y + coverage.height / 2);
  await page.locator(".map-endpoint-start").waitFor();
  await page.mouse.move(500, 800);
  await page.mouse.down();
  await page.mouse.move(1350, 800, { steps: 20 });
  await page.mouse.up();
  await page.getByText("Jezero hazards off-screen or too small — use the pin to locate", { exact: true }).waitFor();
  // Planner is already active: clicking the same pin must still locate coverage.
  const pin = page.getByRole("button", { name: "Route planner", exact: true });
  assert.equal(await pin.getAttribute("aria-pressed"), "true");
  await pin.click();
  await page.getByText("Hazards: Jezero study area only", { exact: true }).waitFor();
  assert.equal(await page.locator("#planner-panel").isVisible(), true);
  assert.equal(await page.locator(".map-endpoint-start").count(), 1);
  const directory = join(tmpdir(), "opencode", "nasa-mars-map-fixes");
  await mkdir(directory, { recursive: true });
  await page.screenshot({ path: join(directory, "jezero-visible-hazards.png") });

  // Incomplete detailed coverage: hold some CTX tiles, fail others. The fallback
  // must match grayscale detail, not expose an orange checkerboard.
  let release;
  const gate = new Promise((resolve) => { release = resolve; });
  await page.route("**/OnMars/CTX/MapServer/tile/**", async (request) => {
    const x = Number(request.request().url().split("/").at(-1));
    if (x % 2 === 0) {
      await request.fulfill({ contentType: "image/png", body: "missing coverage" });
    } else {
      await gate;
      await request.fulfill({
        contentType: "image/svg+xml",
        body: '<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512"><path fill="#888" d="M0 0h512v512H0z"/><circle cx="256" cy="256" r="100" stroke="#555" stroke-width="12" fill="none"/></svg>',
      });
    }
  });
  try {
    await page.goto(new URL("__phase4_harness.html", url).href, { waitUntil: "domcontentloaded" });
    await page.locator('.mars-map[data-terrain="ready"]').waitFor();
    await page.evaluate(() => window.phase4Fixture.set((props) => ({
      ...props, viewport: { center: { lat: 0, lon: 0 }, zoom: 12 },
    })));
    await page.waitForFunction(() => document.querySelector(".mars-map").dataset.zoom === "12");
    assert.equal(await page.locator('.leaflet-layer[data-layer="CTX"]').evaluate((layer) => getComputedStyle(layer).opacity), "0");
    assert.equal(await page.locator(".leaflet-texture-pane").evaluate((pane) => getComputedStyle(pane).filter), "grayscale(1)");
    assert.equal(await page.locator(".imagery-color-mosaic").evaluate((layer) => getComputedStyle(layer).filter), "grayscale(1)");
  } finally {
    release();
  }
  await page.waitForFunction(() => document.querySelector(".mars-map").dataset.imageryLoading === "false");
  assert.equal(await page.locator('.leaflet-layer[data-layer="CTX"]').evaluate((layer) => getComputedStyle(layer).opacity), "1");
  await page.getByText("Some detailed tiles unavailable; showing lower-resolution coverage.", { exact: true }).waitFor();
  const order = await page.evaluate(() => ({
    hires: Number(document.querySelector('.leaflet-layer[data-layer="HiRISE"]').style.zIndex),
    jezeroCtx: Number(document.querySelector('.leaflet-layer[data-layer^="JEZ_ctx"]').style.zIndex),
  }));
  assert.ok(order.hires > order.jezeroCtx, "coarse Jezero CTX must not cover finer global HiRISE");
  await page.screenshot({ path: join(directory, "grayscale-partial-coverage.png") });
  await page.unroute("**/OnMars/CTX/MapServer/tile/**");

  let finishStalledRequests;
  const stalled = new Promise((resolve) => { finishStalledRequests = resolve; });
  await page.route("**/OnMars/CTX/MapServer/tile/**", async (request) => {
    await stalled;
    await request.fulfill({ contentType: "image/svg+xml", body: '<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256"/>' });
  });
  try {
    const timeoutResult = await page.evaluate(async () => {
      const L = (await import("/node_modules/.vite/deps/leaflet.js")).default;
      const { createImageryLayers } = await import("/src/map/imageryLayers.js");
      const element = document.createElement("div");
      element.style.cssText = "position:fixed;left:0;top:0;width:128px;height:128px";
      document.body.append(element);
      const map = L.map(element, { crs: L.CRS.EPSG4326, zoomControl: false, attributionControl: false }).setView([0, 0], 12);
      map.createPane("imageryPane");
      const { layer, config } = createImageryLayers({ tileTimeoutMs: 100 }).find((entry) => entry.id === "CTX");
      // Don't reuse already-decoded CTX images from the preceding coverage test.
      layer.setUrl(`${config.url}?test=stalled-${performance.now()}`, true);
      let deadline;
      try {
        await Promise.race([
          new Promise((resolve) => { layer.once("load", resolve); layer.addTo(map); }),
          new Promise((_, reject) => { deadline = setTimeout(() => reject(new Error("Stalled imagery did not fall back")), 5000); }),
        ]);
        return {
          opacity: layer.options.opacity,
          allFallback: [...layer.getContainer().querySelectorAll("img")].every((image) => image.dataset.fallback === "true"),
        };
      } finally {
        clearTimeout(deadline);
        map.remove();
        element.remove();
      }
    });
    assert.deepEqual(timeoutResult, { opacity: 1, allFallback: true });
  } finally {
    finishStalledRequests();
    await page.unroute("**/OnMars/CTX/MapServer/tile/**");
  }
  console.log(`Map regression checks passed: hazard coverage brought on-screen from globe entry, active planner pin re-locates Jezero, visible labeled footprint, endpoint preservation, batch tile promotion, coherent grayscale fallback, stalled-provider timeout, native-detail layer priority. Screenshots: ${directory}`);
}
