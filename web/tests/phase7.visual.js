// Produces reference/current/difference images and checks fixed design geometry.
// Run npm run build first. Full-scene pixel differences are diagnostic only:
// real imagery/data and the requested cyan destination differ from the mockup.
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { chromium } from "playwright";
import { preview } from "vite";
import { cellToLatLon } from "../src/routing/coordinates.js";
import { planRoute } from "../src/routing/planRoute.js";
import { installImageryFixtures } from "./imageryFixtures.js";

const directory = join(tmpdir(), "opencode", "nasa-mars-phase7");
await mkdir(directory, { recursive: true });
const grid = JSON.parse(await readFile(new URL("../public/data/jezero_grid.json", import.meta.url), "utf8"));
const meta = JSON.parse(await readFile(new URL("../public/data/jezero_grid_meta.json", import.meta.url), "utf8"));
const startCell = { row: 250, col: 250 }, endCell = { row: 250, col: 330 };
const route = planRoute(cellToLatLon(startCell, meta), cellToLatLon(endCell, meta), grid, meta);
assert.equal(route.error, undefined);
const server = await preview({ preview: { host: "127.0.0.1", port: 0, open: false } });
const screenshots = [];
let browser;
try {
  browser = await chromium.launch({
    channel: process.env.PLAYWRIGHT_CHANNEL || (existsSync(chromium.executablePath()) ? undefined : "chrome"),
  });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1024 } });
  await installImageryFixtures(page);
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => { if (message.type() === "error") errors.push(message.text()); });
  const capture = async (name, referenceName) => {
    const current = `${name}-current.png`, reference = `${name}-reference.png`, diff = `${name}-difference.png`;
    await page.screenshot({ path: join(directory, current) });
    // Read original binary objects without restoring/altering tracked files.
    await writeFile(join(directory, reference), execFileSync("git", ["show", `44139ba:design-references/${referenceName}`], { maxBuffer: 16 * 1024 * 1024 }));
    const geometry = await page.evaluate(() => {
      const box = (selector) => {
        const node = document.querySelector(selector);
        if (!node || node.hidden) return null;
        const { x, y, width, height } = node.getBoundingClientRect();
        return { x, y, width, height };
      };
      return {
        header: box(".conditions-header"), planner: box("#planner-panel"), saved: box("#saved-panel"),
        compactInput: box("#planner-panel:not(.side-panel-expanded):not([hidden]) .endpoint-input-box"),
        savedRow: box("#saved-panel:not([hidden]) .saved-route-row"),
        toolbar: box(".right-toolbar"), font: getComputedStyle(document.body).fontFamily,
        fontLoaded: document.fonts.check('14px "Barlow"'),
      };
    });
    assert.deepEqual(geometry.header, { x: 408, y: 49, width: 624, height: 118 });
    assert.deepEqual(geometry.toolbar, { x: 1336, y: 437, width: 40, height: 150 });
    if (name === "planner") assert.deepEqual(geometry.planner, { x: 60, y: 406, width: 309, height: 212 });
    if (name === "saved") assert.deepEqual(geometry.saved, { x: 60, y: 406, width: 309, height: 212 });
    if (name === "planner") assert.deepEqual(geometry.compactInput, { x: 92, y: 468, width: 244, height: 32 });
    if (name === "saved") assert.deepEqual(geometry.savedRow, { x: 93, y: 468, width: 243, height: 32 });
    if (name === "calculated") assert.deepEqual(geometry.planner, { x: 60, y: 222, width: 364, height: 686 });
    assert.ok(geometry.fontLoaded && geometry.font.includes("Barlow"));
    screenshots.push({ name, current, reference, diff, geometry });
  };
  await page.goto(server.resolvedUrls.local[0]);
  await page.waitForFunction(() => document.querySelectorAll(".globe-marker:not([hidden])").length === 4);
  await page.getByText("SAMPLE DATA", { exact: true }).waitFor();
  await page.evaluate(() => document.fonts.ready);
  await capture("home", "homepage.png");
  await page.getByRole("button", { name: "Route planner", exact: true }).click();
  await capture("planner", "routespage.png");
  await page.evaluate((entry) => localStorage.setItem("mars-nav:saved-routes:v1", JSON.stringify([entry])), {
    id: "visual-example", name: "Start → Dest", start: startCell, end: endCell, distanceKm: route.distanceKm,
  });
  await page.getByRole("button", { name: "Saved routes", exact: true }).click();
  await page.locator(".saved-route-row").waitFor();
  await capture("saved", "savedroutespage.png");
  await page.locator(".saved-route-row").click();
  await page.getByRole("button", { name: "Recalculate Route", exact: true }).waitFor();
  await page.locator(".route-line").waitFor({ state: "attached" });
  if (existsSync(new URL("../public/data/jezero_ortho.png", import.meta.url))) {
    await page.waitForFunction(() => document.querySelector(".local-ortho")?.naturalWidth > 0);
  }
  await capture("calculated", "routescalculatedpage.png");
  assert.deepEqual(errors, []);
  const comparison = await browser.newPage();
  for (const entry of screenshots) {
    const reference = `data:image/png;base64,${(await readFile(join(directory, entry.reference))).toString("base64")}`;
    const current = `data:image/png;base64,${(await readFile(join(directory, entry.current))).toString("base64")}`;
    const pixels = await comparison.evaluate(async ({ reference, current }) => {
      const load = async (url) => {
        const image = new Image();
        image.src = url;
        await image.decode();
        return image;
      };
      const [a, b] = await Promise.all([load(reference), load(current)]);
      if (a.width !== b.width || a.height !== b.height) throw new Error("Reference and current dimensions differ");
      const canvas = document.createElement("canvas");
      canvas.width = a.width; canvas.height = a.height;
      const context = canvas.getContext("2d");
      context.drawImage(a, 0, 0);
      const left = context.getImageData(0, 0, a.width, a.height);
      context.clearRect(0, 0, a.width, a.height);
      context.drawImage(b, 0, 0);
      const right = context.getImageData(0, 0, a.width, a.height);
      const difference = context.createImageData(a.width, a.height);
      let total = 0, changed = 0;
      for (let index = 0; index < left.data.length; index += 4) {
        let maximum = 0;
        for (let channel = 0; channel < 3; channel += 1) {
          const value = Math.abs(left.data[index + channel] - right.data[index + channel]);
          total += value; maximum = Math.max(maximum, value);
          difference.data[index + channel] = Math.min(255, value * 2);
        }
        if (maximum > 32) changed += 1;
        difference.data[index + 3] = 255;
      }
      context.putImageData(difference, 0, 0);
      return {
        meanAbsoluteRgbDifference: total / (a.width * a.height * 3),
        changedPixelPercentOver32: changed / (a.width * a.height) * 100,
        image: canvas.toDataURL("image/png").split(",")[1],
      };
    }, { reference, current });
    const { image, ...statistics } = pixels;
    await writeFile(join(directory, entry.diff), Buffer.from(image, "base64"));
    entry.statistics = statistics;
  }
  const note = "Geometry assertions pass. Pixel differences are diagnostic, NOT a pixel-perfect approval: live/local scientific imagery, real sample/route values, geographically placed globe sites, procedural stars, provenance badges/credits and the requested cyan destination intentionally differ from the illustrative references.";
  await writeFile(join(directory, "visual-comparison.json"), JSON.stringify({ referenceCommit: "44139ba", note, screenshots }, null, 2));
  await writeFile(join(directory, "visual-comparison.html"), `<!doctype html><meta charset="UTF-8"><title>Mars visual review</title>
<style>body{background:#0d0d12;color:#fff;font:16px system-ui;margin:24px}section{margin:32px 0}.images{display:grid;grid-template-columns:repeat(3,1fr);gap:12px}img{width:100%}figcaption{margin:8px}figure{margin:0}p{max-width:1100px;line-height:1.5}</style>
<h1>Mars Navigation — reference/current/difference</h1><p>${note}</p>
${screenshots.map((entry) => `<section><h2>${entry.name}</h2><p>Mean RGB difference ${entry.statistics.meanAbsoluteRgbDifference.toFixed(2)}; changed pixels over 32 levels: ${entry.statistics.changedPixelPercentOver32.toFixed(2)}% (not acceptance thresholds).</p><div class="images">${[[entry.reference, "Reference 44139ba"], [entry.current, "Current build"], [entry.diff, "Absolute difference ×2"]].map(([file, title]) => `<figure><img src="${file}"><figcaption>${title}</figcaption></figure>`).join("")}</div></section>`).join("")}`);
  console.log(`Visual review artifacts generated; desktop geometry/fonts pass for all four states. Full-scene differences require contextual review, not a zero-diff claim. Report: ${join(directory, "visual-comparison.html")}`);
} finally {
  await browser?.close();
  await new Promise((resolve, reject) => server.httpServer.close((error) => error ? reject(error) : resolve()));
}
