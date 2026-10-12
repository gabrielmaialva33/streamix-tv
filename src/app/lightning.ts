import { Config as LightningConfig, createRenderer, loadFonts, registerDefaultShaders } from "@solidtv/solid";
import { config } from "#devices/common";
import { mergeConfigInto } from "#devices/common/mergeConfig";
import fonts from "@/fonts";

let appRenderer: ReturnType<typeof createRenderer> | null = null;

/**
 * Register the eight shader types the UI draws with.
 *
 * `registerDefaultShaders` registers exactly the names this app used to wire by
 * hand — rounded, roundedWithBorder, roundedWithShadow,
 * roundedWithBorderWithShadow, shadow, holePunch, linearGradient,
 * radialGradient — so it replaces that block rather than changing it, and it
 * also honours the `SOLIDTV_DISABLE_SHADERS` build flag and skips the whole set
 * when the DOM renderer is active.
 *
 * Renderer 2.x moved `registerShaderType` off `stage.shManager` and onto the
 * renderer itself, which is what this helper expects. The DOM renderer keeps
 * its own manager one level down and registers nothing anyway, so the method
 * check is what tells the two apart — `createRenderer` is typed as returning
 * either.
 */
function registerShaders() {
  if (!appRenderer) {
    return;
  }

  const { renderer } = appRenderer;
  if ("registerShaderType" in renderer) {
    registerDefaultShaders(renderer);
  }
}

export function getAppRenderer() {
  if (appRenderer) {
    return appRenderer;
  }

  mergeConfigInto(LightningConfig, config.lightning);
  appRenderer = createRenderer();
  loadFonts(fonts);
  registerShaders();

  return appRenderer;
}
