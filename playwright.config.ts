import { defineConfig } from "playwright/test";

const targets = ["firetv", "tizen", "lg"];

export default defineConfig({
  testDir: "./src",
  testMatch: "**/*.e2e.ts",
  outputDir: "./tmp/playwright-results",
  fullyParallel: true,
  workers: 2,
  timeout: 30_000,
  expect: { timeout: 5000 },
  // One retry so an intermittent failure is reported as flaky and keeps its
  // trace, instead of failing the run and having the artefacts overwritten by
  // the next (green) one. That is how the "Left returns to the sidebar" flake
  // on the lg target stayed undiagnosed: by the time anyone looked, the only
  // evidence had been replaced. A test that fails both attempts still fails.
  retries: 1,
  reporter: "list",
  use: {
    channel: "chrome",
    viewport: { width: 1920, height: 1080 },
    serviceWorkers: "block",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: targets.map((name, index) => ({
    name,
    grepInvert: name === "firetv" ? /@pointer/ : /@remote-only/,
    use: { baseURL: `http://127.0.0.1:${4173 + index}` },
  })),
  webServer: targets.map((target, index) => ({
    name: target,
    command: `pnpm exec vite --config vite.e2e.config.ts --mode test --host 127.0.0.1 --port ${4173 + index} --strictPort`,
    url: `http://127.0.0.1:${4173 + index}`,
    env: { TARGET_DEVICE: target, VITE_ENABLE_DEBUG_OVERLAY: "false" },
    reuseExistingServer: false,
    gracefulShutdown: { signal: "SIGTERM", timeout: 5000 },
  })),
});
