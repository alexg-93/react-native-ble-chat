import { SERVICE_NAMES } from './gatt';
import { MANUFACTURER_NAMES } from './manufacturers';

export interface DeviceLike {
  name?: string | null;
  manufacturerId?: number | null;
  serviceUUIDs?: string[] | null;
}

export function getDeviceDisplayName(device: DeviceLike): string | null {
  if (device.name) return device.name;

  if (device.manufacturerId != null && MANUFACTURER_NAMES[device.manufacturerId])
    return `${MANUFACTURER_NAMES[device.manufacturerId]} Device`;

  if (device.serviceUUIDs?.length) {
    for (const uuid of device.serviceUUIDs) {
      const key = uuid.toUpperCase().replace(/^0+/, '');
      if (SERVICE_NAMES[key]) return SERVICE_NAMES[key];
    }
  }

  if (device.manufacturerId != null)
    return `BLE Device (MFG: ${device.manufacturerId})`;

  if (device.serviceUUIDs?.length)
    return `BLE [${device.serviceUUIDs[0].substring(0, 8)}…]`;

  return null;
}
