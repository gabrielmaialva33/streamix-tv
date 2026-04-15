import type { KeyMap, Config as LightningConfig } from "@lightningtv/solid";

// KeyHoldOptions não é re-exportado pelo root de @lightningtv/solid 3.2.5.
// Definido localmente conforme ./src/core/focusKeyTypes.ts do pacote.
type KeyNameOrKeyCode = string | number;
interface KeyHoldMap {
  [key: string]: KeyNameOrKeyCode | KeyNameOrKeyCode[];
}
export type KeyHoldOptions = {
  userKeyHoldMap: Partial<KeyHoldMap>;
  holdThreshold?: number;
};

export enum EDevicePlatform {
  CHROME = "CHROME",
  FIREFOX = "FIREFOX",
  SAFARI = "SAFARI",
  EDGE = "EDGE",
}

export enum EDeviceType {
  EMULATOR = "WEB",
  LG = "LG",
  LG_3 = "LG_3",
  LG_4 = "LG_4",
  TIZEN = "TIZEN",
}

export interface QualityConfig {
  image: {
    ratio: number;
    quality: number;
  };
}

export interface DeviceConfig {
  name: string;
  lightning?: Partial<typeof LightningConfig>;
  initialize: () => Promise<Device>;
  quality: QualityConfig;
  keys: Partial<KeyMap>;
  keyHoldOptions: KeyHoldOptions;
}

export interface Device {
  readonly type: EDeviceType;
  readonly platform: EDevicePlatform;
  readonly macAddress: string;
  readonly osVersion: string;
  readonly model: string;
  readonly serialNumber: string;
  readonly isUHD: boolean;
  readonly canUpdate: boolean;

  closeApp(): Promise<void>;
  updateApp(): Promise<void>;
}
