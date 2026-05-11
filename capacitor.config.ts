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
  },
  plugins: {
    CapacitorHttp: {
      enabled: false,
    },
    SystemBars: {
      hidden: true,
      insetsHandling: "disable",
      style: "DARK",
    },
  },
};

export default config;
