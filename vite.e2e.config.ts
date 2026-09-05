import { defineConfig, mergeConfig } from "vite";
import viteConfig from "./vite.config.js";

// Exercise the real app and device plugin without loading local API credentials.
export default defineConfig(() =>
  mergeConfig(viteConfig({ mode: "test" }), {
    envDir: false,
    base: "/",
    cacheDir: `node_modules/.vite-e2e-${process.env.TARGET_DEVICE}`,
    define: {
      "import.meta.env.DEV": "false",
      "import.meta.env.VITE_ENABLE_DEBUG_OVERLAY": JSON.stringify("false"),
      "import.meta.env.VITE_API_URL": JSON.stringify("/api/v1/catalog"),
      "import.meta.env.VITE_API_BASE_URL": JSON.stringify("/api/v1"),
      "import.meta.env.VITE_API_KEY": JSON.stringify("tv-navigation-test"),
    },
  }),
);
