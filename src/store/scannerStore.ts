import { create } from 'zustand';

export interface ScannerDevice {
  id: string;
  name?: string | null;
  rssi: number;
  isConnectable: boolean;
  serviceUUIDs?: string[];
  txPowerLevel?: number | null;
  manufacturerId?: number | null;
  timestamp: number;
  firstSeen: number;
  lastSeen: number;
}

export type ConnectionState = 'connecting' | 'connected' | 'disconnected' | 'failed';
export type BluetoothState = 'poweredOn' | 'poweredOff' | 'unauthorized' | 'unsupported' | 'resetting' | 'unknown';
export type SortMode = 'rssi' | 'lastSeen' | 'name' | 'favorites';

interface ScannerState {
  btState: BluetoothState;
  scanning: boolean;
  devices: ScannerDevice[];
  connState: Record<string, ConnectionState>;
  rssiHistory: Record<string, number[]>;
  search: string;
  sortMode: SortMode;
  expandedId: string | null;
  countdown: number;
  error: string | null;
  staleDevices: ScannerDevice[] | null;
  staleTimestamp: number | null;

  // Actions
  setBtState: (s: BluetoothState) => void;
  setScanning: (v: boolean) => void;
  upsertDevice: (device: Omit<ScannerDevice, 'firstSeen' | 'lastSeen'>, isNew: boolean) => void;
  clearDevices: () => void;
  setConnState: (id: string, state: ConnectionState) => void;
  setSearch: (s: string) => void;
  setSortMode: (m: SortMode) => void;
  setExpandedId: (id: string | null) => void;
  setCountdown: (n: number) => void;
  decrementCountdown: () => void;
  setError: (msg: string | null) => void;
  appendRssi: (id: string, rssi: number) => void;
  clearRssiHistory: () => void;
  setStaleSession: (devices: ScannerDevice[] | null, ts: number | null) => void;
  updateDeviceName: (id: string, name: string) => void;
  /** Process a batch of device updates in a single set() call to avoid per-event re-renders. */
  batchUpsertDevices: (updates: Array<Omit<ScannerDevice, 'firstSeen' | 'lastSeen'>>) => void;
}

export const useScannerStore = create<ScannerState>((set) => ({
  btState: 'unknown',
  scanning: false,
  devices: [],
  connState: {},
  rssiHistory: {},
  search: '',
  sortMode: 'rssi',
  expandedId: null,
  countdown: 0,
  error: null,
  staleDevices: null,
  staleTimestamp: null,

  setBtState: (btState) => set({ btState }),
  setScanning: (scanning) => set({ scanning }),

  upsertDevice: (device, isNew) =>
    set((state) => {
      const now = Date.now();
      const idx = state.devices.findIndex((d) => d.id === device.id);
      if (idx === -1) {
        return {
          devices: [
            ...state.devices,
            { ...device, firstSeen: now, lastSeen: now },
          ],
        };
      }
      const existing = state.devices[idx];
      const updated = [...state.devices];
      updated[idx] = {
        ...existing,
        name: device.name || existing.name,
        rssi: device.rssi,
        lastSeen: now,
        serviceUUIDs: device.serviceUUIDs?.length ? device.serviceUUIDs : existing.serviceUUIDs,
        txPowerLevel: device.txPowerLevel ?? existing.txPowerLevel,
        manufacturerId: device.manufacturerId ?? existing.manufacturerId,
      };
      return { devices: updated };
    }),

  clearDevices: () => set({ devices: [], connState: {}, rssiHistory: {} }),

  setConnState: (id, state) =>
    set((s) => ({ connState: { ...s.connState, [id]: state } })),

  setSearch: (search) => set({ search }),
  setSortMode: (sortMode) => set({ sortMode }),
  setExpandedId: (expandedId) => set({ expandedId }),
  setCountdown: (countdown) => set({ countdown }),
  decrementCountdown: () =>
    set((s) => ({ countdown: s.countdown > 0 ? s.countdown - 1 : 0 })),
  setError: (error) => set({ error }),

  appendRssi: (id, rssi) =>
    set((s) => {
      const hist = s.rssiHistory[id] || [];
      return { rssiHistory: { ...s.rssiHistory, [id]: [...hist, rssi].slice(-20) } };
    }),

  clearRssiHistory: () => set({ rssiHistory: {} }),

  setStaleSession: (staleDevices, staleTimestamp) => set({ staleDevices, staleTimestamp }),

  updateDeviceName: (id, name) =>
    set((s) => ({
      devices: s.devices.map((d) => (d.id === id && !d.name ? { ...d, name } : d)),
    })),

  batchUpsertDevices: (updates) =>
    set((s) => {
      const now = Date.now();
      let devices = [...s.devices];
      let rssiHistory = { ...s.rssiHistory };
      for (const device of updates) {
        const idx = devices.findIndex((d) => d.id === device.id);
        if (idx === -1) {
          devices.push({ ...device, firstSeen: now, lastSeen: now });
        } else {
          const ex = devices[idx];
          devices[idx] = {
            ...ex,
            name: device.name || ex.name,
            rssi: device.rssi,
            lastSeen: now,
            serviceUUIDs: device.serviceUUIDs?.length ? device.serviceUUIDs : ex.serviceUUIDs,
            txPowerLevel: device.txPowerLevel ?? ex.txPowerLevel,
            manufacturerId: device.manufacturerId ?? ex.manufacturerId,
          };
        }
        const hist = rssiHistory[device.id] ?? [];
        rssiHistory[device.id] = [...hist, device.rssi].slice(-20);
      }
      return { devices, rssiHistory };
    }),
}));
