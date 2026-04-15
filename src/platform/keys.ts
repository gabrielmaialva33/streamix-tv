import type { JSX } from "solid-js";
import { config } from "#devices/common";
import { isTizenRuntime } from "./runtime";

type KeyValue = string | number | (string | number)[];

const tizenRemoteKeys = {
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
} satisfies Record<string, KeyValue>;

export const activeKeys = isTizenRuntime() ? { ...config.keys, ...tizenRemoteKeys } : config.keys;

export const activeKeyHoldOptions = isTizenRuntime()
  ? { ...config.keyHoldOptions, userKeyHoldMap: { EnterHold: 13, BackHold: 10009 } }
  : config.keyHoldOptions;

declare module "@lightningtv/solid/primitives" {
  interface KeyMap {
    Announcer: KeyValue;
    Menu: KeyValue;
    Text: KeyValue;
    Escape: KeyValue;
    Backspace: KeyValue;
    Play: KeyValue;
    Pause: KeyValue;
    PlayPause: KeyValue;
    Stop: KeyValue;
    FastForward: KeyValue;
    FastForward10: KeyValue;
    Rewind: KeyValue;
    Rewind10: KeyValue;
    Key0: KeyValue;
    Key1: KeyValue;
    Key2: KeyValue;
    Key3: KeyValue;
    Key4: KeyValue;
    Key5: KeyValue;
    Key6: KeyValue;
    Key7: KeyValue;
    Key8: KeyValue;
    Key9: KeyValue;
  }
}

export type AppChildren = JSX.Element;
