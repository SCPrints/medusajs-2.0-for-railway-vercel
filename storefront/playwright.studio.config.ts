import { defineConfig, devices } from "@playwright/test"

/**
 * Studio (customizer) journeys against a DEPLOYED storefront — a Vercel
 * preview in CI, or production for the nightly run. Never boots a local
 * server (`next dev` has taken the Mac down), never resets a database.
 *
 *   STUDIO_BASE_URL=https://<preview>.vercel.app pnpm test-studio
 */
export default defineConfig({
  testDir: "./e2e-studio",
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  timeout: 180_000,
  expect: { timeout: 30_000 },
  forbidOnly: !!process.env.CI,
  reporter: process.env.CI
    ? [["list"], ["html", { open: "never", outputFolder: "playwright-report-studio" }]]
    : [["list"]],
  use: {
    baseURL: process.env.STUDIO_BASE_URL ?? "https://www.scprints.com.au",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
    viewport: { width: 1440, height: 900 },
  },
  projects: [{ name: "studio-chromium", use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 900 } } }],
})
