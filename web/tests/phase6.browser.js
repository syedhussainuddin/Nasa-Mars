import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

async function checkLayout(page, name) {
  const layout = await page.evaluate(() => {
    const box = (node) => {
      if (!node) return null;
      const { x, y, width, height } = node.getBoundingClientRect();
      return { x, y, width, height };
    };
    return {
      viewport: { width: innerWidth, height: innerHeight },
      document: { width: document.documentElement.scrollWidth, height: document.documentElement.scrollHeight },
      shell: box(document.querySelector(".app-shell")),
      header: box(document.querySelector(".conditions-header")),
      toolbar: box(document.querySelector(".right-toolbar")),
      panel: box(document.querySelector(".side-panel:not([hidden])")),
      footer: box(document.querySelector(".imagery-status")),
      hazards: box(document.querySelector(".hazard-key")),
      buttons: [...document.querySelectorAll(".tool-button")].map(box),
      metricCells: [...document.querySelectorAll(".conditions-metrics > div")].map(box),
      font: getComputedStyle(document.body).fontFamily,
      accent: getComputedStyle(document.documentElement).getPropertyValue("--color-gold").trim(),
    };
  });
  const within = (box) => !box || (box.x >= -1 && box.y >= -1 &&
    box.x + box.width <= layout.viewport.width + 1 && box.y + box.height <= layout.viewport.height + 1);
  assert.equal(layout.document.width, layout.viewport.width, `${name}: horizontal page overflow`);
  assert.equal(layout.document.height, layout.viewport.height, `${name}: vertical page overflow`);
  assert.equal(layout.shell.height, layout.viewport.height);
  assert.ok([layout.header, layout.toolbar, layout.panel, layout.footer, layout.hazards].every(within), `${name}: control outside viewport`);
  if (layout.panel) {
    assert.ok(layout.panel.y >= layout.header.y + layout.header.height + 12, `${name}: panel/header overlap`);
    assert.ok(layout.panel.x + layout.panel.width + 12 < layout.toolbar.x, `${name}: panel/toolbar overlap`);
    if (layout.footer) assert.ok(layout.panel.y + layout.panel.height <= layout.footer.y, `${name}: panel covers imagery status`);
  }
  if (layout.hazards && layout.footer) {
    assert.ok(layout.footer.x + layout.footer.width <= layout.hazards.x ||
      layout.footer.y + layout.footer.height <= layout.hazards.y ||
      layout.hazards.y + layout.hazards.height <= layout.footer.y, `${name}: footer/hazard overlap`);
  }
  assert.equal(layout.buttons.length, 3, "no extra controls");
  assert.ok(layout.buttons.every((button) => button.width === 40 && button.height === 40));
  assert.ok(layout.metricCells.every((cell) => cell.x >= layout.header.x && cell.x + cell.width <= layout.header.x + layout.header.width));
  assert.ok(layout.font.includes("Barlow"));
  assert.equal(layout.accent.toUpperCase(), "#F1C749");
}

async function routeUnobscured(page) {
  await page.waitForFunction(() => {
    const panel = document.querySelector("#planner-panel").getBoundingClientRect();
    const header = document.querySelector(".conditions-header").getBoundingClientRect();
    const toolbar = document.querySelector(".right-toolbar").getBoundingClientRect();
    return [...document.querySelectorAll(".map-endpoint")].length === 2 &&
      [...document.querySelectorAll(".map-endpoint")].every((marker) => {
        const bounds = marker.getBoundingClientRect();
        return bounds.left > panel.right && bounds.right < toolbar.left && bounds.top > header.bottom &&
          bounds.bottom < innerHeight - 90;
      });
  });
}

export async function checkPhase6(page, url) {
  const directory = join(tmpdir(), "opencode", "nasa-mars-phase6");
  await mkdir(directory, { recursive: true });
  const sizes = [
    { width: 1024, height: 768, name: "landscape" },
    { width: 768, height: 1024, name: "portrait" },
    { width: 1024, height: 600, name: "short-landscape" },
    { width: 800, height: 1280, name: "tall-portrait" },
  ];
  for (const size of sizes) {
    await page.setViewportSize({ width: size.width, height: size.height });
    await page.goto(url);
    await page.locator('.mars-globe[data-status="ready"]').waitFor();
    await page.evaluate(() => document.fonts.ready);
    await checkLayout(page, `${size.name} globe`);
    assert.equal(await page.locator(".globe-marker:not([hidden])").count(), 4);
    await page.screenshot({ path: join(directory, `${size.name}-globe.png`) });
    await page.getByRole("button", { name: "Route planner", exact: true }).tap();
    await checkLayout(page, `${size.name} compact planner`);
    await page.getByRole("button", { name: "Calculate Route", exact: true }).tap();
    await page.getByRole("alert").filter({ hasText: "Choose a start point" }).waitFor();
    await checkLayout(page, `${size.name} validation`);

    const fixture = await page.evaluate(async () => {
      const { loadGrid } = await import("/src/data/loadGrid.js");
      const { cellToLatLon } = await import("/src/routing/coordinates.js");
      const { formatCoordinates } = await import("/src/planner/plannerData.js");
      const { meta } = await loadGrid();
      return {
        start: formatCoordinates(cellToLatLon({ row: 250, col: 250 }, meta)),
        end: formatCoordinates(cellToLatLon({ row: 250, col: 330 }, meta)),
      };
    });
    await page.getByRole("textbox", { name: "Start coordinates" }).fill(fixture.start);
    await page.getByRole("textbox", { name: "Destination coordinates" }).fill(fixture.end);
    await page.getByRole("button", { name: "Calculate Route", exact: true }).tap();
    await page.getByRole("button", { name: "Recalculate Route", exact: true }).waitFor();
    await page.locator(".route-line").waitFor({ state: "attached" });
    await page.locator("#planner-panel").evaluate((panel) => { panel.scrollTop = 0; });
    await routeUnobscured(page);
    await checkLayout(page, `${size.name} calculated route`);
    await page.screenshot({ path: join(directory, `${size.name}-route.png`) });
    const scrollable = await page.locator("#planner-panel").evaluate((panel) => panel.scrollHeight > panel.clientHeight + 2);
    if (scrollable) {
      const panel = await page.locator("#planner-panel").boundingBox();
      const touch = await page.context().newCDPSession(page);
      try {
        const x = panel.x + panel.width / 2, y = panel.y + panel.height - 35;
        await touch.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x, y, id: 1 }] });
        for (const distance of [35, 75, 125, 185, 240]) {
          await touch.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x, y: y - distance, id: 1 }] });
          await page.evaluate(() => new Promise(requestAnimationFrame));
        }
        await touch.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
        await page.waitForFunction(() => document.querySelector("#planner-panel").scrollTop > 0);
      } finally {
        await touch.detach();
      }
    }
    await page.locator(".elevation-chart").scrollIntoViewIfNeeded();
    const profile = await page.locator(".elevation-chart").boundingBox();
    assert.ok(profile.y >= 170 && profile.y + profile.height < size.height - 90, `${size.name}: chart cannot scroll into view`);
    assert.equal(await page.getByRole("img", { name: "Route elevation profile" }).count(), 1);
    await checkLayout(page, `${size.name} scrolled profile`);
    await page.getByRole("button", { name: "Saved routes", exact: true }).tap();
    await page.locator(".saved-route-row").first().waitFor();
    await checkLayout(page, `${size.name} saved routes`);
    await page.locator(".saved-route-row").first().tap();
    await page.getByRole("button", { name: "Recalculate Route", exact: true }).waitFor();
    await routeUnobscured(page);

    if (size.name === "landscape") {
      // Rotation must retain app state and re-fit existing route geometry.
      await page.setViewportSize({ width: 768, height: 1024 });
      await routeUnobscured(page);
      assert.equal(await page.getByRole("textbox", { name: "Start coordinates" }).inputValue(), fixture.start);
      assert.equal(await page.getByRole("textbox", { name: "Destination coordinates" }).inputValue(), fixture.end);
      await checkLayout(page, "orientation change with route");
    }
    await page.getByRole("button", { name: "Toggle hazard overlay" }).tap();
    await page.locator(".hazard-raster").waitFor();
    await page.getByText("Hazards: Jezero study area only", { exact: true }).waitFor();
    await page.locator("#planner-panel").evaluate((panel) => { panel.scrollTop = 0; });
    await checkLayout(page, `${size.name} hazards`);
    await page.screenshot({ path: join(directory, `${size.name}-hazards.png`) });
    // The backend-supplied local orthomosaic must really decode, not just exist.
    if (await page.locator(".local-ortho").count()) {
      await page.waitForFunction(() => document.querySelector(".local-ortho").naturalWidth > 0);
    }
  }
  console.log(`Phase 6 tablet checks passed at 1024×768, 768×1024, 1024×600 and 800×1280: native touch controls, no page overflow/control overlap, compact/expanded panels, scrollable profile, route fitting on rotation, save/restore, hazards and local ortho. Screenshots: ${directory}`);
}
