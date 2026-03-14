import { Alert } from 'react-native';
import {
  getState,
  startScan, stopScan,
  connectToDevice, disconnectDevice,
  discoverServices, discoverCharacteristics, readCharacteristic,
  addDeviceFoundListener, addScanStateListener, addErrorListener, addBluetoothStateListener,
  addConnectionStateListener,
  addServicesDiscoveredListener, addCharacteristicsDiscoveredListener, addCharacteristicReadListener,
} from '../../modules/expo-bluetooth-scanner';
import type { BluetoothDevice } from '../../modules/expo-bluetooth-scanner';
import { useScannerStore } from '../store/scannerStore';
import { usePrefsStore } from '../store/prefsStore';
import { saveLastSession } from '../storage/AsyncStorageService';

const SCAN_DURATION_MS = 15_000;
const RECONNECT_DELAY_MS = 2_000;
// Generic Access service / Device Name characteristic
const GENERIC_ACCESS_SVC  = '1800';
const DEVICE_NAME_CHAR    = '2A00';

class ScannerService {
  private subs: Array<{ remove: () => void }> = [];
  private seenIds = new Set<string>();
  private countdownInterval: ReturnType<typeof setInterval> | null = null;
  // Track pending reconnect timers so we can cancel on explicit disconnect
  private reconnectTimers: Record<string, ReturnType<typeof setTimeout>> = {};
  // Track devices we fired name-resolution for (avoid duplicate resolves)
  private nameResolutionInProgress = new Set<string>();
  // Batch incoming device events to avoid flooding the JS thread.
  private deviceUpdateBuffer = new Map<string, BluetoothDevice>();
  private flushScheduled = false;

  private _flushDeviceBuffer() {
    this.flushScheduled = false;
    if (this.deviceUpdateBuffer.size === 0) return;
    const updates = [...this.deviceUpdateBuffer.values()];
    this.deviceUpdateBuffer.clear();
    useScannerStore.getState().batchUpsertDevices(updates);
  }

  async subscribe() {
    // Bluetooth state
    this.subs.push(
      addBluetoothStateListener((evt) => {
        useScannerStore.getState().setBtState(evt.state as any);
      }),
    );

    // Scan state
    this.subs.push(
      addScanStateListener((evt) => {
        const scanning = evt.isScanning;
        useScannerStore.getState().setScanning(scanning);
        if (!scanning) {
          this._clearCountdown();
          // persist session
          const devices = useScannerStore.getState().devices;
          if (devices.length > 0) {
            saveLastSession(devices).catch(() => {});
          }
        }
      }),
    );

    // Device found
    this.subs.push(
      addDeviceFoundListener((d: BluetoothDevice) => {
        if (!this.seenIds.has(d.id)) this.seenIds.add(d.id);
        // Keep only the latest data for each device in the buffer.
        this.deviceUpdateBuffer.set(d.id, d);
        if (!this.flushScheduled) {
          this.flushScheduled = true;
          setTimeout(() => this._flushDeviceBuffer(), 300);
        }
      }),
    );

    // BLE errors
    this.subs.push(
      addErrorListener((evt: any) => {
        useScannerStore.getState().setError(evt.message ?? String(evt));
      }),
    );

    // Connection state — drives auto-reconnect + GATT name resolution
    this.subs.push(
      addConnectionStateListener((evt: any) => {
        const { id, state } = evt;
        useScannerStore.getState().setConnState(id, state);

        if (state === 'connected') {
          // Cancel any pending reconnect timer for this device
          if (this.reconnectTimers[id]) {
            clearTimeout(this.reconnectTimers[id]);
            delete this.reconnectTimers[id];
          }
          // Resolve device name via GATT if still unknown
          this._resolveDeviceName(id);
        }

        if (state === 'disconnected') {
          this.nameResolutionInProgress.delete(id);
          const { isFavorite } = usePrefsStore.getState();
          const { autoReconnect } = usePrefsStore.getState();
          if (autoReconnect && isFavorite(id)) {
            this.reconnectTimers[id] = setTimeout(() => {
              delete this.reconnectTimers[id];
              connectToDevice(id);
            }, RECONNECT_DELAY_MS);
          }
        }

        if (state === 'failed') {
          this.nameResolutionInProgress.delete(id);
          Alert.alert('Connection Failed', `Could not connect to ${evt.id}`);
        }
      }),
    );

    // Global GATT listeners used for device-name resolution
    this.subs.push(
      addServicesDiscoveredListener((evt) => {
        if (!this.nameResolutionInProgress.has(evt.id)) return;
        const hasGenericAccess = evt.services.some(
          (s) => s.uuid.replace(/-/g, '').toUpperCase().endsWith(GENERIC_ACCESS_SVC.toUpperCase()) ||
                 s.uuid.toUpperCase() === GENERIC_ACCESS_SVC.toUpperCase(),
        );
        if (hasGenericAccess) {
          discoverCharacteristics(evt.id, '00001800-0000-1000-8000-00805F9B34FB');
        }
      }),
    );

    this.subs.push(
      addCharacteristicsDiscoveredListener((evt) => {
        if (!this.nameResolutionInProgress.has(evt.id)) return;
        const nameChar = evt.characteristics.find(
          (c) => c.uuid.replace(/-/g, '').toUpperCase().endsWith(DEVICE_NAME_CHAR.toUpperCase()) ||
                 c.uuid.toUpperCase() === DEVICE_NAME_CHAR.toUpperCase(),
        );
        if (nameChar) {
          readCharacteristic(evt.id, evt.serviceUUID, nameChar.uuid);
        }
      }),
    );

    this.subs.push(
      addCharacteristicReadListener((evt) => {
        if (!this.nameResolutionInProgress.has(evt.id)) return;
        // charUUID ends with 2A00 → Device Name
        if (!evt.charUUID.toUpperCase().endsWith(DEVICE_NAME_CHAR)) return;
        this.nameResolutionInProgress.delete(evt.id);
        if (evt.value) {
          try {
            const name = atob(evt.value);
            if (name) useScannerStore.getState().updateDeviceName(evt.id, name);
          } catch (_) {}
        }
      }),
    );

    // Read initial BT state
    try {
      const s = await getState();
      useScannerStore.getState().setBtState(s as any);
    } catch (_) {}
  }

  unsubscribe() {
    this.subs.forEach((s) => s.remove());
    this.subs = [];
    this._clearCountdown();
  }

  async startScan() {
    try {
      useScannerStore.getState().clearDevices();
      this.seenIds.clear();
      startScan();
      this._startCountdown(SCAN_DURATION_MS / 1000);
    } catch (e: any) {
      useScannerStore.getState().setError(e?.message ?? String(e));
    }
  }

  async stopScan() {
    stopScan();
    this._clearCountdown();
  }

  connect(deviceId: string) {
    connectToDevice(deviceId);
  }

  disconnect(deviceId: string) {
    // Cancel any pending auto-reconnect before disconnecting
    if (this.reconnectTimers[deviceId]) {
      clearTimeout(this.reconnectTimers[deviceId]);
      delete this.reconnectTimers[deviceId];
    }
    disconnectDevice(deviceId);
  }

  private _resolveDeviceName(deviceId: string) {
    const device = useScannerStore.getState().devices.find((d) => d.id === deviceId);
    // Only resolve if name is still unknown
    if (device?.name) return;
    if (this.nameResolutionInProgress.has(deviceId)) return;
    this.nameResolutionInProgress.add(deviceId);
    // Trigger GATT discovery — listeners in subscribe() do the rest
    discoverServices(deviceId);
  }

  private _startCountdown(seconds: number) {
    useScannerStore.getState().setCountdown(seconds);
    this.countdownInterval = setInterval(() => {
      useScannerStore.getState().decrementCountdown();
    }, 1000);
  }

  private _clearCountdown() {
    if (this.countdownInterval != null) {
      clearInterval(this.countdownInterval);
      this.countdownInterval = null;
    }
    useScannerStore.getState().setCountdown(0);
  }
}

export const scannerService = new ScannerService();
