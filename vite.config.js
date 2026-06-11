import { readFileSync } from "fs";
import { defineConfig } from "vite";
import solidPlugin from "vite-plugin-solid";
import hexColorTransform from "@lightningtv/vite-hex-transform";
import legacy from "@vitejs/plugin-legacy";
import path from "path";
import deviceConfigPlugin from "./devices/deviceConfigPlugin.js";

const pkg = JSON.parse(readFileSync(new URL("./package.json", import.meta.url), "utf8"));

const envDir = "./environments";

export default defineConfig(({ mode }) => {
  // Get environment variables
  // const env = loadEnv(mode, path.join(__dirname, envDir));

  return {
    envDir,
    define: {
      __DEV__: mode !== "production",
      __APP_VERSION__: JSON.stringify(pkg.version),
    },
    plugins: [
      deviceConfigPlugin(process.env.TARGET_DEVICE),
      hexColorTransform({
        include: ["src/**/*.{ts,tsx,js,jsx}"],
      }),
      solidPlugin({
        // DO NOT add an `include` filter here — @solidjs/router ships raw .jsx
        // files in its dist folder and needs this plugin to transform them.
        // Restricting include to src/** breaks the router silently (Show/Match
        // etc. render as plain strings, so HashRouter never invokes root).
        solid: {
          moduleName: "@lightningtv/solid",
          generate: "universal",
        },
      }),
      legacy({
        targets: ["defaults", "Chrome >= 49"],
        // For Tizen/FireTV: disable modern chunks since file:// protocol causes both to run
        renderModernChunks: process.env.TARGET_DEVICE !== "tizen" && process.env.TARGET_DEVICE !== "firetv",
        modernPolyfills:
          process.env.TARGET_DEVICE === "tizen" || process.env.TARGET_DEVICE === "firetv"
            ? false
            : [
                // Safari 11 has modules, but throws > ReferenceError: Can't find variable: globalThis
                "es.global-this",
              ],
      }),
    ],
    resolve: {
      alias: {
        theme: path.resolve(__dirname, "./theme.js"),
        "@": path.resolve(__dirname, "./src"),
        "#devices": path.resolve(__dirname, "./devices"),
      },
      dedupe: [
        "solid-js",
        "solid-js/universal",
        "@solidjs/router",
        "@lightningtv/solid",
        "@lightningtv/solid/primitives",
        "@lightningjs/renderer",
      ],
    },
    build: {
      // Tizen 3.0+ runs Chromium 47; the legacy plugin still produces the
      // compatibility bucket so the modern target just has to out-run legacy.
      target: "es2020",
      sourcemap: false,
    },
    optimizeDeps: {
      exclude: ["@lightningtv/solid", "@lightningtv/solid/primitives", "@lightningjs/renderer"],
    },
    server: {
      hmr: true,
      // Removed COEP/COOP headers that were blocking cross-origin fetch
      // Dev-only reverse proxy: the browser hits same-origin /sx-api, Vite
      // forwards to the real backend with the Origin rewritten, so CORS never
      // trips. Image/stream URLs still go direct (see imageUrl.ts). Only the
      // `development` env file points the API base at /sx-api.
      proxy: {
        "/sx-api": {
          target: "https://streamix.mahina.cloud",
          changeOrigin: true,
          secure: true,
          rewrite: p => p.replace(/^\/sx-api/, ""),
        },
      },
    },
  };
});
