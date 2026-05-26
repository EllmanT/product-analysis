import { defineConfig, devices } from "@playwright/test";
import * as dotenv from "dotenv";
dotenv.config({ path: ".env.test" });

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: false,
  workers: 1,
  retries: 1,
  timeout: 60_000,
  globalSetup: "./tests/global-setup.ts",
  use: {
    baseURL: process.env.TEST_BASE_URL ?? "http://localhost:3000",
    trace: "on-first-retry",
    screenshot: "only-on-failure",
    headless: true,
  },
  projects: [
    // Phase 1: auth tests — no data dependency
    {
      name: "auth",
      testMatch: "**/auth.spec.ts",
      use: { ...devices["Desktop Chrome"] },
    },
    // Phase 2: upload simulation — creates 10 weeks of fresh data
    {
      name: "upload",
      testMatch: "**/upload.spec.ts",
      use: { ...devices["Desktop Chrome"] },
    },
    // Phase 3: data-dependent tests — wait for upload project to complete
    {
      name: "analytics",
      testMatch: "**/analytics.spec.ts",
      dependencies: ["upload"],
      use: { ...devices["Desktop Chrome"] },
    },
    {
      name: "ai-agent",
      testMatch: "**/ai-agent.spec.ts",
      dependencies: ["upload"],
      use: { ...devices["Desktop Chrome"] },
    },
    {
      name: "upload-history",
      testMatch: "**/upload-history.spec.ts",
      dependencies: ["upload"],
      use: { ...devices["Desktop Chrome"] },
    },
  ],
});
