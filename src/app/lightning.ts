import { Config as LightningConfig, createRenderer, loadFonts } from "@lightningtv/solid";
import {
  HolePunch,
  LinearGradient,
  RadialGradient,
  Rounded,
  RoundedWithBorder,
  RoundedWithBorderAndShadow,
  RoundedWithShadow,
  Shadow,
} from "@lightningjs/renderer/webgl/shaders";
import { merge } from "lodash-es";
import { config } from "#devices/common";
import fonts from "../fonts";

let appRenderer: ReturnType<typeof createRenderer> | null = null;

function registerShaders() {
  if (!appRenderer) {
    return;
  }

  const shaderManager = appRenderer.renderer.stage.shManager;
  shaderManager.registerShaderType("rounded", Rounded);
  shaderManager.registerShaderType("roundedWithBorder", RoundedWithBorder);
  shaderManager.registerShaderType("roundedWithShadow", RoundedWithShadow);
  shaderManager.registerShaderType("roundedWithBorderWithShadow", RoundedWithBorderAndShadow);
  shaderManager.registerShaderType("shadow", Shadow);
  shaderManager.registerShaderType("holePunch", HolePunch);
  shaderManager.registerShaderType("linearGradient", LinearGradient);
  shaderManager.registerShaderType("radialGradient", RadialGradient);
}

export function getAppRenderer() {
  if (appRenderer) {
    return appRenderer;
  }

  merge(LightningConfig, config.lightning);
  appRenderer = createRenderer();
  loadFonts(fonts);
  registerShaders();

  return appRenderer;
}
