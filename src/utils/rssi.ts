export function rssiToBars(rssi: number): string {
  if (rssi >= -50) return '▉▉▉▉';
  if (rssi >= -65) return '▉▉▉░';
  if (rssi >= -80) return '▉▉░░';
  if (rssi >= -90) return '▉░░░';
  return '░░░░';
}

export function rssiColor(rssi: number): string {
  if (rssi >= -50) return '#22c55e';
  if (rssi >= -65) return '#84cc16';
  if (rssi >= -80) return '#f59e0b';
  if (rssi >= -90) return '#ef4444';
  return '#991b1b';
}

/**
 * Estimated distance from RSSI using log-distance path-loss model.
 * d = 10 ^ ((txPower - rssi) / (10 * n))
 * txPower defaults to -59 dBm (calibrated RSSI at 1 metre).
 * n = 2.5 (typical indoor path-loss exponent).
 */
export function estimateDistance(rssi: number, txPower?: number | null): string {
  const tx = txPower ?? -59;
  const n = 2.5;
  const d = Math.pow(10, (tx - rssi) / (10 * n));
  if (d < 1) return `${(d * 100).toFixed(0)} cm`;
  return `${d.toFixed(1)} m`;
}
