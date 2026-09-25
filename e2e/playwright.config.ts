import { defineConfig, devices } from '@playwright/test';

// End-to-end suite against the local stack (see e2e/README.md). The stack
// must already be running — use `npm run test:e2e`, which sets it up.
export default defineConfig({
  testDir: './tests',
  globalSetup: './global-setup.ts',
  fullyParallel: false,
  workers: 1,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  reporter: [['list']],
  use: {
    // Real HTTPS through e2e/stack/tls-proxy.mjs (self-signed certificate),
    // exactly how the app is deployed behind a TLS-terminating edge.
    baseURL: `https://localhost:${process.env.E2E_TLS_PORT ?? 3443}`,
    ignoreHTTPSErrors: true,
    screenshot: 'only-on-failure',
    trace: 'off',
  },
  outputDir: './.results',
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
});
