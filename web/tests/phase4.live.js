// Optional live integration smoke check; unlike the default suite, no tile mocks.
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { chromium } from "playwright";
import { createServer } from "vite";

const server = await createServer({ server: { host: "127.0.0.1", port: 0, hmr: false } });
let browser;
try {
  await server.listen();
  const channel = process.env.PLAYWRIGHT_CHANNEL ||
    (existsSync(chromium.executablePath()) ? undefined : "chrome");
  browser = await chromium.launch({ channel });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1024 } });
  const runtimeErrors = [], misses = [];
  page.on("pageerror", (error) => runtimeErrors.push(error.message));
  page.on("response", (response) => {
    if (/trek\.nasa\.gov|astro\.arcgis\.com/.test(response.url()) && response.status() >= 400) {
      misses.push({ status: response.status(), url: response.url() });
    }
  });
  await page.goto(server.resolvedUrls.local[0]);
  await page.locator('.mars-globe[data-status="ready"]').waitFor();
  await page.mouse.move(720, 850);
  await page.mouse.wheel(0, -12000);
  await page.locator('.mars-map[data-terrain="ready"]').waitFor();
  await page.getByRole("button", { name: "Toggle hazard overlay" }).click();
  await page.getByText("Hazards: Jezero study area only", { exact: true }).waitFor();
  await page.locator(".hazard-raster").waitFor();
  await page.waitForFunction(() => [...document.querySelectorAll("img.leaflet-tile-loaded[data-layer]")]
    .some((image) => image.dataset.layer === "CTX" &&
      image.src.startsWith("https://") && image.naturalWidth > 0 &&
      image.closest(".leaflet-layer").style.opacity === "1"), null, { timeout: 60000 });
  const layers = await page.evaluate(() => {
    const counts = {};
    for (const image of document.querySelectorAll("img.leaflet-tile-loaded[data-layer]")) {
      if (image.src.startsWith("https://") && image.naturalWidth) {
        counts[image.dataset.layer] = (counts[image.dataset.layer] || 0) + 1;
      }
    }
    return counts;
  });
  assert.deepEqual(runtimeErrors, []);
  const coverage = await page.locator(".hazard-raster").boundingBox();
  assert.ok(coverage.width >= 160 && coverage.height >= 160 &&
    coverage.x >= 0 && coverage.y > 167 && coverage.x + coverage.width < 1440 && coverage.y + coverage.height < 1000);
  const directory = join(tmpdir(), "opencode", "nasa-mars-phase4");
  await mkdir(directory, { recursive: true });
  await page.screenshot({ path: join(directory, "map-live.png") });
  console.log(JSON.stringify({
    liveLoadedTiles: layers,
    imageryStatus: await page.locator(".imagery-status").textContent(),
    hazardCoverageVisible: true,
    runtimeErrors,
    providerMisses: misses,
    screenshot: join(directory, "map-live.png"),
    note: "Provider 404s are coverage/network diagnostics; transparent tile fallback keeps lower layers visible.",
  }, null, 2));
} finally {
  await browser?.close();
  await server.close();
}
