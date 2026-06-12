import { defineConfig } from '@playwright/test';
import dotenv from 'dotenv';

dotenv.config();

/**
 * Maximized Chrome window, full visible viewport for QA engineers.
 *
 * Note: we deliberately do NOT use devices['Desktop Chrome'] here. That preset
 * sets a fixed deviceScaleFactor + viewport, which conflicts with viewport:null
 * (Playwright throws: "deviceScaleFactor option is not supported with null
 * viewport"). Instead we set viewport:null + --start-maximized so the page
 * fills the actual browser window.
 */
export default defineConfig({
  testDir: './tests',
  timeout: 240 * 1000,
  expect: { timeout: 20 * 1000 },
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: 0,
  workers: 1,
  reporter: [
    ['html', { open: 'never' }],
    ['list'],
  ],
  use: {
    baseURL: process.env.IMA360_BASE_URL || 'https://dev.ima360.app',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    actionTimeout: 25 * 1000,
    navigationTimeout: 60 * 1000,

    headless: false,
    viewport: null,                       // use the real window size
    launchOptions: {
      args: ['--start-maximized'],        // maximize Chrome on launch
    },
  },
  projects: [
    {
      name: 'chromium',
      // Just specify the browser; no device preset (avoids the scale-factor clash)
      use: { browserName: 'chromium' },
    },
  ],
});
