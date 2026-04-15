import { EDevicePlatform, EDeviceType } from "#devices/devices";
import { createUniqueId } from "solid-js";
import { createLogger } from "../../src/shared/logging/logger";

const logger = createLogger("DeviceCommon");

export class DeviceCommon {
  type: EDeviceType;
  platform: string;
  macAddress: string;
  osVersion: string;
  model: string;
  serialNumber: string;
  isUHD: boolean;
  canUpdate: boolean;

  constructor(
    type,
    platform: EDevicePlatform = EDevicePlatform.CHROME,
    osVersion: string = "0.0.0",
    model: string = "",
    serialNumber: string = "",
    isUHD: boolean = true,
    canUpdate: boolean = false,
  ) {
    this.macAddress = createUniqueId();
    this.type = type;
    this.platform = platform;
    this.osVersion = osVersion;
    this.model = model;
    this.serialNumber = serialNumber;
    this.isUHD = isUHD;
    this.canUpdate = canUpdate;
  }

  static async initialize(): Promise<DeviceCommon> {
    return new DeviceCommon(EDeviceType.EMULATOR);
  }

  async closeApp(): Promise<void> {
    logger.debug("Closing the app via browser window");
    window.close();
  }

  async updateApp(): Promise<void> {
    logger.debug("Update flow is not implemented for the common device profile");
  }
}
