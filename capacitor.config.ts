import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "tv.streamix.app",
  appName: "Streamix TV",
  webDir: "dist/firetv",
  android: {
    allowMixedContent: true,
  },
  plugins: {
    CapacitorHttp: {
      enabled: true,
    },
    SystemBars: {
      hidden: true,
      insetsHandling: "disable",
      style: "DARK",
    },
  },
  server: {
    androidScheme: "https",
  },
};

export default config;
