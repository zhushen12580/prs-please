import { defineConfig } from '@playwright/test';

const base = process.env.PRS_PLEASE_BASE ?? '/prs-please/';
const baseURL = new URL(base, 'http://127.0.0.1:4173').href;

export default defineConfig({
  testDir: './tests/e2e',
  reporter: 'list',
  use: {
    browserName: 'chromium',
    baseURL,
    viewport: { width: 1280, height: 800 },
  },
  webServer: {
    command: 'npm run preview -- --host 127.0.0.1 --port 4173 --strictPort',
    url: baseURL,
    reuseExistingServer: false,
  },
});
