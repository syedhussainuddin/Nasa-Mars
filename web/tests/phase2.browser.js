import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { readFile } from "node:fs/promises";

const sample = JSON.parse(await readFile(new URL("../public/data/conditions_sample.json", import.meta.url), "utf8"));

export async function checkPhase2(page, url) {
  await page.setViewportSize({ width: 1440, height: 1024 });
  await page.goto(url);
  await page.getByText("SAMPLE DATA", { exact: true }).waitFor();
  await page.evaluate(() => document.fonts.ready);
  assert.equal(await page.locator(".app-shell").getAttribute("data-stage"), "A");
  assert.equal(await page.locator(".conditions-metrics dd").allTextContents().then((values) => values.join("|")), "-62|7.37 mbar / 0.018 kg/m³|0.67 mSv/d|LOW");
  const geometry = await page.evaluate(() => {
    const box = (selector) => {
      const { x, y, width, height } = document.querySelector(selector).getBoundingClientRect();
      return { x, y, width, height };
    };
    return {
      header: box(".conditions-header"),
      tools: [...document.querySelectorAll(".tool-button")].map((button) => {
        const { x, y, width, height } = button.getBoundingClientRect();
        return { x, y, width, height };
      }),
      low: getComputedStyle(document.querySelector(".condition-low")).color,
      font: getComputedStyle(document.body).fontFamily,
      fontReady: document.fonts.check('14px "Barlow"'),
    };
  });
  assert.deepEqual(geometry.header, { x: 408, y: 49, width: 624, height: 118 });
  assert.deepEqual(geometry.tools, [
    { x: 1336, y: 464.5, width: 40, height: 40 },
    { x: 1336, y: 519.5, width: 40, height: 40 },
  ]);
  assert.equal(geometry.low, "rgb(0, 200, 83)");
  assert.ok(geometry.font.includes("Barlow") && geometry.fontReady);

  const screenshotDirectory = join(tmpdir(), "opencode", "nasa-mars-phase2");
  await mkdir(screenshotDirectory, { recursive: true });
  await page.screenshot({ path: join(screenshotDirectory, "shell-home.png") });
  const planner = page.getByRole("button", { name: "Route planner", exact: true });
  const saved = page.getByRole("button", { name: "Saved routes", exact: true });
  await planner.click();
  await page.getByRole("heading", { name: "Route Planner", exact: true }).waitFor();
  assert.equal(await planner.getAttribute("aria-pressed"), "true");
  assert.equal(await page.locator(".app-shell").getAttribute("data-stage"), "B");
  assert.deepEqual(await page.locator("#planner-panel").boundingBox(), { x: 60, y: 406, width: 309, height: 212 });
  assert.equal(await planner.evaluate((button) => getComputedStyle(button).backgroundColor), "rgb(255, 106, 0)");
  await page.screenshot({ path: join(screenshotDirectory, "shell-planner.png") });
  await saved.click();
  assert.equal(await page.locator("#planner-panel").isVisible(), false);
  assert.equal(await page.locator("#saved-panel").isVisible(), true);
  assert.equal(await saved.getAttribute("aria-pressed"), "true");
  assert.equal(await page.locator(".app-shell").getAttribute("data-stage"), "E");
  await saved.click();
  assert.equal(await page.locator("#saved-panel").isVisible(), false);

  const info = page.getByRole("button", { name: "About conditions data" });
  await info.focus();
  await page.keyboard.press("Enter");
  assert.equal(await info.getAttribute("aria-expanded"), "true");
  assert.equal(await page.locator(".conditions-info").isVisible(), true);
  await page.keyboard.press("Escape");
  assert.equal(await info.getAttribute("aria-expanded"), "false");
  assert.equal(await info.evaluate((button) => button === document.activeElement), true);

  await planner.click();
  assert.equal(await page.getByRole("button", { name: "Toggle hazard overlay" }).count(), 0);
  await page.getByRole("button", { name: "Zoom to Jezero Study Area" }).click();
  await page.locator('.mars-map[data-terrain="ready"]').waitFor();
  assert.equal(await page.locator(".app-shell").getAttribute("data-view"), "map");
  assert.equal(await page.locator(".app-shell").getAttribute("data-stage"), "D");
  assert.equal(await page.locator("#planner-panel").isVisible(), true);
  const hazard = page.getByRole("button", { name: "Toggle hazard overlay" });
  assert.equal(await hazard.getAttribute("aria-pressed"), "false");
  await hazard.click();
  assert.equal(await hazard.getAttribute("aria-pressed"), "true");
  await hazard.click();
  assert.equal(await hazard.getAttribute("aria-pressed"), "false");

  // Exercise loading and malformed data without creating expected HTTP errors
  // in the console. A valid live fixture must not display a SAMPLE DATA badge.
  let release;
  const gate = new Promise((resolve) => { release = resolve; });
  await page.route("**/data/conditions_sample.json", async (request) => {
    await gate;
    await request.fulfill({ json: { ...sample, isSample: false, source: "Verified fixture" } });
  });
  await page.goto(url, { waitUntil: "domcontentloaded" });
  try {
    await page.getByRole("status").filter({ hasText: "Loading conditions" }).waitFor();
    assert.deepEqual(await page.locator(".conditions-metrics dd").allTextContents(), ["—", "—", "—", "—"]);
  } finally {
    release();
  }
  await page.locator('.conditions-header[aria-busy="false"]').waitFor();
  assert.equal(await page.getByText("SAMPLE DATA", { exact: true }).count(), 0);
  assert.equal(await page.locator(".conditions-metrics dd").first().textContent(), "-62");
  await page.unroute("**/data/conditions_sample.json");
  await page.route("**/data/conditions_sample.json", (request) => request.fulfill({ json: { readings: [] } }));
  await page.reload();
  await page.getByRole("alert").filter({ hasText: "Conditions could not be loaded." }).waitFor();
  assert.deepEqual(await page.locator(".conditions-metrics dd").allTextContents(), ["—", "—", "—", "—"]);
  assert.equal(await page.getByText("SAMPLE DATA", { exact: true }).count(), 0);
  await page.unroute("**/data/conditions_sample.json");
  console.log(`Phase 2 browser checks passed: header geometry/data, local fonts, toolbar/panels, keyboard info, map/hazard state, loading/error/sample provenance. Screenshots: ${screenshotDirectory}`);
}
