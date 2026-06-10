import { defineConfig, devices } from "@playwright/test";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

const configDir = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  testDir: "./e2e",
  timeout: 30_000,
  expect: { timeout: 10_000 },
  use: {
    ...devices["Desktop Chrome"],
    baseURL: "http://127.0.0.1:4174",
  },
  webServer: {
    command: "python -m http.server 4174 --directory ../docs",
    cwd: configDir,
    reuseExistingServer: !process.env.CI,
    url: "http://127.0.0.1:4174/workstation/?nointro=1",
  },
});
