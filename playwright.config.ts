import { defineConfig, devices } from "@playwright/test";
export default defineConfig({
  testDir:"./browser_tests",
  testMatch:"**/*.e2e.ts",
  timeout:120_000,
  retries:0,
  use:{...devices["Desktop Chrome"],baseURL:"http://127.0.0.1:5173",headless:true},
  webServer:{command:"npm run dev -- --host 127.0.0.1 --port 5173 --strictPort",
    url:"http://127.0.0.1:5173",reuseExistingServer:!process.env.CI,timeout:60_000},
  reporter:"list"
});
