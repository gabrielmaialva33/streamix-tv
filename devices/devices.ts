import type { Config as LightningConfig, KeyMap } from "@solidtv/solid";

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
  FIRETV = "FIRETV",
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
