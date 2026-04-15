import { mergeConfig } from "vite";
import { defineConfig } from "vitest/config";
import viteConfig from "./vite.config";

export default defineConfig(() =>
  mergeConfig(viteConfig({ mode: "test" }), {
    test: {
      environment: "jsdom",
      globals: true,
    },
  }),
);
