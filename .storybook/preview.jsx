import { Config, createRenderer, loadFonts } from "@solidtv/solid";
import { CanvasTextRenderer } from "@solidtv/renderer/canvas";
import { Inspector } from "@solidtv/renderer/inspector";
import { SdfTextRenderer, WebGlCoreRenderer } from "@solidtv/renderer/webgl";
import fonts from "../src/fonts";
import { useFocusManager } from "@solidtv/solid/primitives";
import { createSignal, Show } from "solid-js";

Config.rendererOptions = {
  appWidth: 1920,
  appHeight: 1080,
  deviceLogicalPixelRatio: 2 / 3,
  inspector: Inspector,
  devicePhysicalPixelRatio: 1,
  fontEngines: [SdfTextRenderer, CanvasTextRenderer],
  renderEngine: WebGlCoreRenderer,
};

Config.fontSettings.fontFamily = "NotoSans";

let startRenderer = true;
const solidRoot = document.createElement("div");
let toRender, setToRender;

const preview = {
  tags: ["autodocs"],
  parameters: {
    backgrounds: { default: "dark" },
    actions: { argTypesRegex: "^on[A-Z].*" },
    controls: {
      expanded: true,
    },
    docs: {
      story: {
        inline: false,
        iframeHeight: "360px",
      },
      source: {
        type: "code",
        language: "jsx",
      },
    },
  },
  decorators: [
    (Story, _context) => {
      if (setToRender) {
        setToRender(Story);
      }

      if (startRenderer) {
        startRenderer = false;
        const { render } = createRenderer(undefined, solidRoot);
        loadFonts(fonts);

        render(() => {
          useFocusManager();
          [toRender, setToRender] = createSignal(Story);
          return <Show when={toRender()}>{toRender()}</Show>;
        });
      }

      return solidRoot;
    },
  ],
};

export default preview;
