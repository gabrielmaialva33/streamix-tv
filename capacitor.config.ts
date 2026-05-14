import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "tv.streamix.app",
  appName: "Streamix TV",
  webDir: "dist/firetv",
  android: {
    allowMixedContent: true,
  },
  server: {
    androidScheme: "https",
    // Hosts the WebView is allowed to navigate to without being treated as
    // external. Required when the api domain differs from the bundle origin.
    allowNavigation: ["streamix.mahina.cloud", "*.mahina.cloud"],
  },
  plugins: {
    CapacitorHttp: {
      // Routes fetch() through native Android HTTP, bypassing the WebView's
      // CORS rules. Without this, every call to streamix.mahina.cloud from
      // https://localhost fails with "Failed to fetch".
      enabled: true,
    },
    SystemBars: {
      hidden: true,
      insetsHandling: "disable",
      style: "DARK",
    },
  },
};

export default config;
