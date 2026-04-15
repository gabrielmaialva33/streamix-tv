import { EDeviceType } from "#devices/devices";
import { DeviceCommon } from "#devices/common/device";

export class LgDevice extends DeviceCommon {
  static async initialize() {
    return new LgDevice(EDeviceType.LG);
  }
}
