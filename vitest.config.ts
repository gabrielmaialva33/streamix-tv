import { mergeConfig } from "vite";
import { defineConfig } from "vitest/config";
import viteConfig from "./vite.config";

export default defineConfig(() =>
  mergeConfig(viteConfig({ mode: "test" }), {
    test: {
      environment: "jsdom",
      globals: true,
      exclude: ["**/node_modules/**", "**/dist/**", "tmp/**"],
      // No test suites exist yet; keep `pnpm test` green until they land.
      passWithNoTests: true,
    },
  }),
);
