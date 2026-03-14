import AsyncStorage from '@react-native-async-storage/async-storage';
import { ScannerDevice } from '../store/scannerStore';

const LAST_SCAN_KEY = 'ble_last_scan';

export interface LastSession {
  devices: ScannerDevice[];
  ts: number;
}

export async function saveLastSession(devices: ScannerDevice[]): Promise<void> {
  if (!devices.length) return;
  await AsyncStorage.setItem(LAST_SCAN_KEY, JSON.stringify({ devices, ts: Date.now() }));
}

export async function loadLastSession(): Promise<LastSession | null> {
  try {
    const raw = await AsyncStorage.getItem(LAST_SCAN_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as LastSession;
  } catch {
    return null;
  }
}
