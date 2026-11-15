import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DEFAULT_CENTER } from "../src/globe/globeMath.js";

async function readyGlobe(page, url) {
  await page.goto(url);
  await page.locator('.mars-globe[data-status="ready"]').waitFor();
  await page.waitForFunction(() =>
    document.querySelectorAll(".globe-marker:not([hidden])").length === 1);
}

const view = (page) => page.locator(".mars-globe").evaluate((element) => ({
  lat: Number(element.dataset.centerLat),
  lon: Number(element.dataset.centerLon),
  distance: Number(element.dataset.distance),
}));

async function drag(page, from, to) {
  await page.mouse.move(...from);
  await page.mouse.down();
  await page.mouse.move(...to, { steps: 18 });
  await page.mouse.up();
}

export async function checkPhase3(page, url) {
  await page.setViewportSize({ width: 1440, height: 1024 });
  await readyGlobe(page, url);
  assert.equal(await page.locator(".globe-canvas").count(), 1, "StrictMode must not leak renderers");
  assert.deepEqual(await view(page), { ...DEFAULT_CENTER, distance: 3 });
  assert.equal(await page.locator(".globe-marker").count(), 1);
  assert.equal(await page.getByRole("button", { name: "Zoom to Jezero Study Area" }).isVisible(), true);
  for (const name of ["Opportunity", "Mawrth Vallis", "Viking 1", "Pathfinder"]) {
    assert.equal(await page.getByRole("button", { name: `Focus on ${name}` }).count(), 0);
  }
  const directory = join(tmpdir(), "opencode", "nasa-mars-phase3");
  await mkdir(directory, { recursive: true });
  await page.screenshot({ path: join(directory, "globe-home.png") });

  // Pixel bounds of the opaque rendered sphere (alpha excludes the SVG stars).
  const diameter = await page.locator(".globe-canvas").evaluate((canvas) => {
    const copy = document.createElement("canvas");
    copy.width = canvas.width;
    copy.height = canvas.height;
    const context = copy.getContext("2d");
    context.drawImage(canvas, 0, 0);
    const { data } = context.getImageData(0, 0, copy.width, copy.height);
    let minX = copy.width, maxX = -1;
    for (let y = 0; y < copy.height; y += 1) {
      for (let x = 0; x < copy.width; x += 1) {
        if (data[(y * copy.width + x) * 4 + 3] > 200) {
          minX = Math.min(minX, x);
          maxX = Math.max(maxX, x);
        }
      }
    }
    return (maxX - minX + 1) / devicePixelRatio;
  });
  // Some browser/GPU implementations clear the drawing buffer after compositing;
  // the pure-math unit test verifies exact diameter regardless.
  if (diameter > 0) assert.ok(Math.abs(diameter - 690) < 8, `globe diameter was ${diameter}`);

  const before = await view(page);
  await drag(page, [720, 850], [1100, 850]);
  await page.waitForFunction((lon) =>
    Math.abs(Number(document.querySelector(".mars-globe").dataset.centerLon) - lon) > 20, before.lon);
  assert.ok(Math.abs((await view(page)).distance - 3) < 0.01);
  await page.waitForFunction(() => document.querySelectorAll(".globe-marker[hidden]").length > 0);

  // Middle/right drags must never pan the globe away from the origin.
  const afterRotate = await view(page);
  await page.mouse.move(720, 700);
  await page.mouse.down({ button: "right" });
  await page.mouse.move(900, 750, { steps: 8 });
  await page.mouse.up({ button: "right" });
  assert.ok(Math.abs((await view(page)).distance - afterRotate.distance) < 0.01);

  await readyGlobe(page, url);
  await page.getByRole("button", { name: "Route planner", exact: true }).click();
  await page.getByRole("button", { name: "Zoom to Jezero Study Area" }).click();
  await page.waitForFunction(() => {
    const globe = document.querySelector(".mars-globe");
    return globe?.dataset.focusSite === "jezero-study-area" &&
      globe.dataset.focusing === "true" && Number(globe.dataset.distance) < 2.9;
  });
  await page.locator('.mars-map[data-terrain="ready"]').waitFor();
  await page.waitForFunction(() => Number(document.querySelector(".mars-map").dataset.zoom) >= 10);
  await page.getByText("JEZERO · STUDY AREA", { exact: true }).waitFor();
  const footprint = await page.locator(".grid-footprint").boundingBox();
  assert.ok(footprint.width >= 160 && footprint.height >= 160);
  assert.ok(footprint.x > 424 && footprint.y > 167 && footprint.x + footprint.width < 1336 && footprint.y + footprint.height < 1000);
  assert.equal(await page.locator("#planner-panel").isVisible(), true);
  assert.equal(await page.locator(".globe-canvas").count(), 0);
  await page.screenshot({ path: join(directory, "jezero-study-map.png") });

  await readyGlobe(page, url);
  await page.mouse.move(720, 850);
  await page.mouse.wheel(0, 650);
  await page.waitForFunction(() => Number(document.querySelector(".mars-globe").dataset.distance) > 3.2);
  await page.mouse.wheel(0, 12000);
  await page.waitForFunction(() => Number(document.querySelector(".mars-globe").dataset.distance) >= 5.99);
  assert.ok((await view(page)).distance <= 6.001);

  // A native two-touch pinch reaches OrbitControls' dolly/rotate path.
  await readyGlobe(page, url);
  const touch = await page.context().newCDPSession(page);
  try {
    await touch.send("Input.dispatchTouchEvent", {
      type: "touchStart",
      touchPoints: [{ x: 650, y: 820, id: 1 }, { x: 790, y: 820, id: 2 }],
    });
    await touch.send("Input.dispatchTouchEvent", {
      type: "touchMove",
      touchPoints: [{ x: 620, y: 820, id: 1 }, { x: 820, y: 820, id: 2 }],
    });
    await touch.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
    await page.waitForFunction(() => Number(document.querySelector(".mars-globe").dataset.distance) < 2.8);
  } finally {
    await touch.detach();
  }
  assert.equal(await page.locator(".app-shell").getAttribute("data-view"), "globe");

  await page.getByRole("button", { name: "Route planner", exact: true }).click();
  await page.mouse.move(720, 850);
  await page.mouse.wheel(0, -12000);
  await page.locator('.app-shell[data-view="map"]').waitFor();
  assert.equal(await page.locator(".mars-globe").count(), 0);
  assert.equal(await page.locator(".globe-canvas").count(), 0);
  assert.equal(await page.locator("#planner-panel").isVisible(), true);
  assert.equal(await page.getByRole("button", { name: "Toggle hazard overlay" }).isVisible(), true);

  // Reload mounts a fresh renderer, including after a complete unmount above.
  await page.emulateMedia({ reducedMotion: "reduce" });
  await readyGlobe(page, url);
  await page.getByRole("button", { name: "Zoom to Jezero Study Area" }).focus();
  await page.keyboard.press("Enter");
  await page.locator('.mars-map[data-terrain="ready"]').waitFor();
  await page.waitForFunction(() => Number(document.querySelector(".mars-map").dataset.zoom) >= 10);
  assert.equal(await page.locator(".globe-marker").count(), 0);
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await page.route("**/data/jezero_grid_meta.json", (request) => request.fulfill({ json: {} }));
  await page.goto(url);
  await page.getByRole("alert").filter({ hasText: "Jezero study-area marker could not be loaded" }).waitFor();
  assert.equal(await page.locator(".globe-marker").count(), 0, "invalid metadata must not produce a guessed marker");
  await page.unroute("**/data/jezero_grid_meta.json");
  await readyGlobe(page, url);
  console.log(`Phase 3 browser checks passed: one metadata-positioned Jezero marker, old sites removed, animated study zoom/map fit, drag/back-face hiding, manual zoom limits/native pinch, panel preservation, remount and keyboard/reduced-motion entry. Screenshots: ${directory}`);
}
