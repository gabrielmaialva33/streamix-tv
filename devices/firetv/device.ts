import { EDeviceType } from "#devices/devices";
import { DeviceCommon } from "#devices/common/device";

export class FireTVDevice extends DeviceCommon {
  static async initialize() {
    return new FireTVDevice(EDeviceType.FIRETV);
  }

  async closeApp() {
    window.close();
  }
}
