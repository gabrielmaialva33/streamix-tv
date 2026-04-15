import { ElementNode, View } from "@lightningtv/solid";
import { useAnnouncer, useFocusManager, useMouse } from "@lightningtv/solid/primitives";
import { preferences } from "../lib/storage";
import { config } from "#devices/common";
import { DebugOverlay, toggleDebug } from "../components";

// Keycodes especificos do Tizen (Samsung TV). Detectamos aqui e mergeamos
// com os keys do device — assim no browser de dev continua funcionando com
// as teclas mapeadas em devices/common/index.ts.
const isTizen = typeof (window as any).tizen !== "undefined" || navigator.userAgent.includes("Tizen");

const tizenKeys = {
  Back: 10009,
  Left: 37,
  Right: 39,
  Up: 38,
  Down: 40,
  Enter: 13,
  Play: 415,
  Pause: 19,
  PlayPause: 10252,
  FastForward: 417,
  Rewind: 412,
  Stop: 413,
  // Digitos do control remoto numerico (Samsung usa os mesmos codigos do browser)
  Key0: [48, 96],
  Key1: [49, 97],
  Key2: [50, 98],
  Key3: [51, 99],
  Key4: [52, 100],
  Key5: [53, 101],
  Key6: [54, 102],
  Key7: [55, 103],
  Key8: [56, 104],
  Key9: [57, 105],
};

const activeKeys = isTizen ? { ...config.keys, ...tizenKeys } : config.keys;
const activeKeyHoldOptions = isTizen
  ? { ...config.keyHoldOptions, userKeyHoldMap: { EnterHold: 13, BackHold: 10009 } }
  : config.keyHoldOptions;

declare module "@lightningtv/solid/primitives" {
  interface KeyMap {
    Announcer: string | number | (string | number)[];
    Menu: string | number | (string | number)[];
    Text: string | number | (string | number)[];
    Escape: string | number | (string | number)[];
    Backspace: string | number | (string | number)[];
    Play: string | number | (string | number)[];
    Pause: string | number | (string | number)[];
    PlayPause: string | number | (string | number)[];
    Stop: string | number | (string | number)[];
    FastForward: string | number | (string | number)[];
    FastForward10: string | number | (string | number)[];
    Rewind: string | number | (string | number)[];
    Rewind10: string | number | (string | number)[];
    Key0: string | number | (string | number)[];
    Key1: string | number | (string | number)[];
    Key2: string | number | (string | number)[];
    Key3: string | number | (string | number)[];
    Key4: string | number | (string | number)[];
    Key5: string | number | (string | number)[];
    Key6: string | number | (string | number)[];
    Key7: string | number | (string | number)[];
    Key8: string | number | (string | number)[];
    Key9: string | number | (string | number)[];
  }
}

declare global {
  interface Window {
    APP: ElementNode;
  }
}

interface AppProps {
  children?: any;
}

// Root simples: so registra focus/mouse e toggleAnnouncer. Sem sidebar,
// sem dialog — isso fica no MainLayout. Player e outras rotas fullscreen
// ficam FORA do MainLayout (sem sidebar).
const App = (props: AppProps) => {
  useFocusManager(activeKeys, activeKeyHoldOptions);
  useMouse();

  const announcer = useAnnouncer();
  announcer.debug = false;
  announcer.enabled = preferences.get().announcer;

  return (
    <View
      ref={window.APP}
      width={1920}
      height={1080}
      color={0x0d0d12ff}
      onAnnouncer={() => {
        announcer.enabled = !announcer.enabled;
        preferences.update({ announcer: announcer.enabled });
      }}
      // Tecla "0" do remoto alterna o DebugOverlay com logs visiveis.
      onKey0={() => {
        toggleDebug();
        return true;
      }}
    >
      {props.children}
      <DebugOverlay />
    </View>
  );
};

export default App;
