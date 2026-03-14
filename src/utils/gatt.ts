// Well-known GATT characteristic UUIDs → readable names
export const CHAR_NAMES: Record<string, string> = {
  '2A19': 'Battery Level',          '2A00': 'Device Name',
  '2A01': 'Appearance',             '2A04': 'Conn. Parameters',
  '2A24': 'Model Number',           '2A25': 'Serial Number',
  '2A26': 'Firmware Revision',      '2A27': 'Hardware Revision',
  '2A28': 'Software Revision',      '2A29': 'Manufacturer Name',
  '2A2A': 'Regulatory Cert.',       '2A50': 'PnP ID',
  '2A37': 'Heart Rate Measurement', '2A38': 'Body Sensor Location',
  '2A6E': 'Temperature',            '2A6F': 'Humidity',
  '2A6D': 'Pressure',               '2A7E': 'Aerobic Heart Rate Lower',
};

export const SERVICE_NAMES: Record<string, string> = {
  '180D': 'Heart Rate',          '180F': 'Battery',
  '180A': 'Device Info',         '1800': 'Generic Access',
  '1801': 'Generic Attrib',      '1802': 'Immediate Alert',
  '1803': 'Link Loss',           '1804': 'TX Power',
  '1805': 'Current Time',        '1808': 'Glucose',
  '1809': 'Health Therm',        '1810': 'Blood Pressure',
  '1812': 'HID (KB/Mouse)',      '1816': 'Cycling Speed',
  '1818': 'Cycling Power',       '1819': 'Location & Nav',
  '181C': 'Body Comp',           '181D': 'Weight Scale',
  '1822': 'Pulse Ox',            '183E': 'Activity',
  'FE9F': 'Google',              'FEAA': 'Eddystone',
  'FD6F': 'Exposure Notif.',
};

export function charDisplayName(uuid: string): string {
  const key = uuid.toUpperCase().replace(/-.*/, '').replace(/^0+/, '');
  return CHAR_NAMES[key] || uuid;
}

/** Decode a base64 BLE characteristic value to a human-readable string. */
export function decodeCharValue(b64: string): string {
  if (!b64) return '(empty)';
  try {
    const bytes = Uint8Array.from(atob(b64), c => c.charCodeAt(0));
    if (bytes.length === 1) return String(bytes[0]);
    if (bytes.length === 2) {
      const val = bytes[0] | (bytes[1] << 8);
      return String(val);
    }
    const text = new TextDecoder('utf-8').decode(bytes);
    if (/^[\x20-\x7E]+$/.test(text)) return text;
    return Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join(' ');
  } catch {
    return b64;
  }
}
