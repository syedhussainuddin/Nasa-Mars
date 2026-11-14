import { defineConfig } from '@playwright/test';
import path from 'node:path';
import os from 'node:os';

export default defineConfig({
  testDir: './tests/browser',
  outputDir: path.join(os.tmpdir(), 'opencode', 'mars-nav-test-results'),
  fullyParallel: true,
  use: { baseURL: 'http://127.0.0.1:5173', viewport: { width: 1440, height: 1024 }, channel: process.env.PLAYWRIGHT_CHANNEL || undefined },
  webServer: { command: 'npm run dev -- --host 127.0.0.1', url: 'http://127.0.0.1:5173', reuseExistingServer: !process.env.CI },
});
