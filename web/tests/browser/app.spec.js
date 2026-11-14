import { test, expect } from '@playwright/test';

async function openPlanner(page) {
  await page.goto('/');
  await page.locator('.home-intro .primary').click();
  await expect(page.locator('.leaflet-container')).toBeVisible();
  await expect(page.getByText('Demo mode', { exact: true })).toBeVisible();
}

async function selectPoints(page, mobile = false) {
  if (mobile) {
    await page.getByLabel('Keyboard point selection', { exact: true }).check();
    const map = page.locator('.leaflet-container');
    await map.focus();
    await page.keyboard.press('Enter');
    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('ArrowDown');
    // Leaflet keyboard panning is animated.
    await page.waitForTimeout(400);
    await page.keyboard.press('Enter');
  } else {
    await page.locator('.leaflet-container').click({ position: { x: 760, y: 450 } });
    await page.locator('.leaflet-container').click({ position: { x: 900, y: 650 } });
  }
  await expect(page.getByText('Ready to calculate.', { exact: true })).toBeVisible();
}

test('desktop: selection, hazards, sample metrics, save/reload/delete, reset and navigation', async ({ page }, testInfo) => {
  const errors = [];
  page.on('pageerror', err => errors.push(err.message));
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'A little closer to the red planet.' })).toBeVisible();
  await expect(page.getByText('Sample data', { exact: true })).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath('home-desktop.png') });
  await page.locator('.home-intro .primary').click();
  await expect(page.locator('.leaflet-container')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Calculate Route', exact: true })).toBeDisabled();
  await page.getByLabel('Slope hazards', { exact: true }).check();
  await expect(page.locator('.leaflet-hazards-pane img')).toBeVisible();
  expect(await page.locator('.leaflet-hazards-pane').evaluate(el => Number(getComputedStyle(el).zIndex))).toBeGreaterThan(
    await page.locator('.leaflet-tile-pane').evaluate(el => Number(getComputedStyle(el).zIndex)));
  await expect(page.getByText('Project-defined slope thresholds, not NASA safety limits.', { exact: true })).toBeVisible();
  await expect(page.getByText('10–20°', { exact: true })).toBeVisible();
  await selectPoints(page);
  await page.getByRole('button', { name: 'Calculate Route', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Route Summary' })).toBeVisible();
  await expect(page.getByText('Sample result', { exact: true })).toBeVisible();
  await expect(page.getByText('Estimated terrain risk', { exact: true })).toBeVisible();
  await expect(page.getByRole('img', { name: /Elevation profile over/ })).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath('route-desktop.png') });
  const distance = await page.locator('.summary-grid > div').first().textContent();
  await page.getByRole('button', { name: 'Save Route', exact: true }).click();
  await page.getByRole('button', { name: 'Saved routes', exact: true }).click();
  await expect(page.locator('.saved-entry')).toHaveCount(1);
  await page.reload();
  await page.getByRole('button', { name: 'Saved routes', exact: true }).click();
  await expect(page.locator('.saved-entry')).toHaveCount(1);
  await page.locator('.saved-entry').click();
  await expect(page.getByRole('heading', { name: 'Route Summary' })).toBeVisible();
  await expect(page.locator('.summary-grid > div').first()).toHaveText(distance);
  await page.getByRole('button', { name: 'Reset points and route' }).click();
  await expect(page.getByText('Choose a starting point.', { exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Route Summary' })).toHaveCount(0);
  await selectPoints(page);
  await page.locator('.leaflet-container').click({ position: { x: 950, y: 600 } });
  await expect(page.getByText('Choose a starting point.', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Saved routes', exact: true }).click();
  await page.getByRole('button', { name: /Delete Jezero/ }).click();
  await expect(page.getByText('A new horizon awaits.')).toBeVisible();
  await page.getByRole('button', { name: 'Data and mission information', exact: true }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('mobile: bottom sheet, keyboard map selection, hazards and route result', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await page.screenshot({ path: testInfo.outputPath('home-mobile.png') });
  await page.locator('.home-intro .primary').click();
  await expect(page.locator('.leaflet-container')).toBeVisible();
  await selectPoints(page, true);
  await page.getByRole('button', { name: 'Calculate Route', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Route Summary' })).toBeAttached();
  await page.locator('.sheet-handle').click();
  await expect(page.locator('.side-panel')).toHaveClass(/collapsed/);
  await page.getByLabel('Slope hazards', { exact: true }).check();
  await expect(page.getByText('Project-defined slope thresholds, not NASA safety limits.', { exact: true })).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath('route-mobile.png') });
  await page.locator('.sheet-handle').click();
  await page.getByRole('button', { name: 'Save Route', exact: true }).scrollIntoViewIfNeeded();
  await page.getByRole('button', { name: 'Save Route', exact: true }).click();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test('reset cancels pending work and repeated calculations do not resurrect a route', async ({ page }) => {
  await openPlanner(page);
  await selectPoints(page);
  await page.evaluate(() => {
    const calculate = [...document.querySelectorAll('button')].find(button => button.textContent === 'Calculate Route');
    calculate.click();
    calculate.click();
    document.querySelector('[aria-label="Reset points and route"]').click();
  });
  await expect(page.getByText('Choose a starting point.', { exact: true })).toBeVisible();
  await page.waitForTimeout(300);
  await expect(page.getByRole('heading', { name: 'Route Summary' })).toHaveCount(0);
});

test('terrain failure retries and unavailable conditions remain honest', async ({ page }) => {
  await page.route('**/data/jezero_grid.json', route => route.fulfill({ status: 503, body: 'unavailable' }));
  await page.route('**/data/conditions_sample.json', route => route.fulfill({ status: 404, body: 'missing' }));
  await page.goto('/');
  await page.locator('.home-intro .primary').click();
  await expect(page.getByText('Conditions unavailable', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Retry terrain load' })).toBeVisible();
  await page.unroute('**/data/jezero_grid.json');
  await page.getByRole('button', { name: 'Retry terrain load' }).click();
  await expect(page.locator('.leaflet-container')).toBeVisible();
});

test('no-data and outside selections do not advance the workflow', async ({ page }) => {
  await page.route('**/data/jezero_grid.json', async route => {
    const response = await route.fetch();
    const grid = await response.json();
    // All-null terrain makes every interior click an unavailable cell.
    await route.fulfill({ json: grid.map(row => row.map(() => null)) });
  });
  await openPlanner(page);
  await page.locator('.leaflet-container').click({ position: { x: 760, y: 450 } });
  await expect(page.getByRole('alert')).toContainText('No elevation data');
  await expect(page.getByText('Choose a starting point.', { exact: true })).toBeVisible();
  await page.locator('.leaflet-container').click({ position: { x: 1430, y: 300 } });
  await expect(page.getByRole('alert')).toContainText('Outside the study area');
});

test('storage failure preserves a usable session', async ({ page }) => {
  await page.addInitScript(() => {
    Storage.prototype.setItem = () => { throw new DOMException('Denied', 'SecurityError'); };
  });
  await openPlanner(page);
  await selectPoints(page);
  await page.getByRole('button', { name: 'Calculate Route', exact: true }).click();
  await page.getByRole('button', { name: 'Save Route', exact: true }).click();
  await expect(page.getByText('Storage is unavailable. Your routes are saved for this session only.', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Saved routes', exact: true }).click();
  await expect(page.locator('.saved-entry')).toHaveCount(1);
});
