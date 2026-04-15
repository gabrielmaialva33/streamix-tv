import type { Config as LightningConfig, KeyMap } from "@lightningtv/solid";

// KeyHoldOptions is not re-exported from the @lightningtv/solid root package.
// Keep a local copy based on the package focus key types.
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
