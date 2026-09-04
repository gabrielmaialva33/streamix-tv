import path from "node:path";
import { Plugin } from "vite";

const DEVICE_TARGETS = new Set(["tizen", "lg", "firetv"]);

export default (device: string): Plugin => {
  const devicesDir = import.meta.dirname;
  const commonIndex = path.join(devicesDir, "common");
  const isEmbedded = DEVICE_TARGETS.has(device);

  return {
    name: "device-config",
    enforce: "pre",

    /**
     * Point `#devices/common` at the target's own config folder.
     *
     * `vite:alias` runs ahead of user `enforce: "pre"` plugins and resolves
     * `#devices/common` to an absolute path before this hook is reached, so
     * matching the bare specifier alone never fires — that silently left every
     * embedded build on the generic `devices/common` profile. Match both forms.
     */
    resolveId(id, importer) {
      if (!isEmbedded) return null;

      const isCommonIndex = id === "#devices/common" || path.resolve(id) === commonIndex;
      if (!isCommonIndex) return null;

      // `devices/<target>/index.ts` merges its overrides on top of the common
      // config, so its own import must resolve to the real common module —
      // redirecting it would make that file import itself.
      if (importer && importer.startsWith(devicesDir + path.sep)) return null;

      return this.resolve(path.join(devicesDir, device), importer, { skipSelf: true });
    },

    config: config => {
      config.build = config.build ?? {};
      const devicePath = `${device ?? "common"}`;
      config.build.outDir ??= `dist/${devicePath}`;
      // Use relative paths for embedded devices (tizen, lg, firetv), absolute for browser (common)
      config.base ??= isEmbedded ? "./" : `/${devicePath}/`;
    },
  };
};
