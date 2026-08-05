import { mergeConfig } from "vite";
import { defineConfig } from "vitest/config";
import viteConfig from "./vite.config.js";

export default defineConfig(() =>
  mergeConfig(viteConfig({ mode: "test" }), {
    test: {
      environment: "jsdom",
      globals: true,
      setupFiles: ["./src/test/setup.ts"],
      exclude: ["**/node_modules/**", "**/dist/**", "tmp/**"],
      passWithNoTests: true,
    },
  }),
);
