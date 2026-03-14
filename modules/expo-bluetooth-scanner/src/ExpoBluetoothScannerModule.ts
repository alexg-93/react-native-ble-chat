// Level 04 — ExpoBluetoothScanner TypeScript interface
import { requireNativeModule, EventSubscription } from 'expo-modules-core';

// -------------------------------------------------------------------------
// Types
// -------------------------------------------------------------------------

/** A discovered Bluetooth LE peripheral. */
export interface BluetoothDevice {
  /** iOS: CBPeripheral UUID (stable per app install). Android: MAC address. */
  id: string;
  /** Local name from the advertisement packet, or "" if not broadcast. */
  name: string;
  /** Signal strength in dBm. Closer devices → higher (less negative) values. */
  rssi: number;
  /** Whether the device accepts connections (vs. beacon-only). */
  isConnectable: boolean;
  /** Advertised GATT service UUIDs (e.g. ["180D"] for Heart Rate). */
  serviceUUIDs?: string[];
  /** TX power level in dBm (if advertised). Useful for distance estimation. */
  txPowerLevel?: number;
  /** Bluetooth SIG company ID from manufacturer data (e.g. 76 = Apple). */
  manufacturerId?: number;
  /** Unix timestamp in milliseconds when this advertisement was received. */
  timestamp: number;
}

export interface ScanStateEvent        { isScanning: boolean; }
export interface ScanErrorEvent        { code: string; message: string; }
export interface BluetoothStateEvent   { state: BluetoothState; }

/** Connection lifecycle states for a peripheral. */
export type ConnectionState = 'connecting' | 'connected' | 'disconnected' | 'failed';

export interface ConnectionStateEvent {
  id: string;
  state: ConnectionState;
  error?: string;
}

export interface GattService {
  uuid: string;
  isPrimary: boolean;
}

export interface GattCharacteristic {
  uuid: string;
  properties: Array<'read' | 'write' | 'writeWithoutResponse' | 'notify' | 'indicate'>;
}

export interface ServicesDiscoveredEvent {
  id: string;
  services: GattService[];
}

export interface CharacteristicsDiscoveredEvent {
  id: string;
  serviceUUID: string;
  characteristics: GattCharacteristic[];
}

export interface CharacteristicValueEvent {
  id: string;
  serviceUUID: string;
  charUUID: string;
  /** Base64-encoded raw bytes from the characteristic. */
  value: string;
  error?: string;
}

export interface CharacteristicWrittenEvent {
  id: string;
  serviceUUID: string;
  charUUID: string;
  error?: string;
}

// ── Peripheral (server) role types ────────────────────────────────────────────

export interface PeripheralStateEvent  { state: BluetoothState; }
export interface AdvertisingStartedEvent { error?: string; }
export interface CentralSubscribedEvent  { centralId: string; charUUID: string; }
export interface MessageReceivedEvent {
  value: string;      // base64-encoded frame
  centralId: string;  // CBCentral UUID that wrote this frame
}

/** Human-readable Bluetooth adapter states (mirrors iOS CBManagerState). */
export type BluetoothState =
  | 'poweredOn'
  | 'poweredOff'
  | 'unauthorized'
  | 'unsupported'
  | 'resetting'
  | 'unknown';

// -------------------------------------------------------------------------
// Native module interface (SDK 52+: addListener lives on the module directly)
// -------------------------------------------------------------------------
interface ExpoBluetoothScannerNativeModule {
  // Adapter
  getState(): Promise<BluetoothState>;
  getLocalPeerId(): string;
  // Scan
  startScan(allowDuplicates: boolean, timeoutSeconds: number): void;
  stopScan(): void;
  getDiscoveredCount(): number;
  // Connection
  connectToDevice(deviceId: string): void;
  disconnectDevice(deviceId: string): void;
  // GATT discovery
  discoverServices(deviceId: string): void;
  discoverCharacteristics(deviceId: string, serviceUUID: string): void;
  // GATT read/write/notify
  readCharacteristic(deviceId: string, serviceUUID: string, charUUID: string): void;
  writeCharacteristic(deviceId: string, serviceUUID: string, charUUID: string, value: string, withResponse: boolean): void;
  subscribeCharacteristic(deviceId: string, serviceUUID: string, charUUID: string): void;
  unsubscribeCharacteristic(deviceId: string, serviceUUID: string, charUUID: string): void;
  getPeripheralState(): string;
  getMaxWriteLength(deviceId: string): number;
  // Peripheral (server) role
  startAdvertising(localName: string): void;
  stopAdvertising(): void;
  sendMessage(value: string): void;
  // Events
  addListener(event: 'onDeviceFound',                listener: (e: BluetoothDevice)              => void): EventSubscription;
  addListener(event: 'onScanStateChanged',           listener: (e: ScanStateEvent)               => void): EventSubscription;
  addListener(event: 'onError',                      listener: (e: ScanErrorEvent)               => void): EventSubscription;
  addListener(event: 'onBluetoothStateChanged',      listener: (e: BluetoothStateEvent)          => void): EventSubscription;
  addListener(event: 'onConnectionStateChanged',     listener: (e: ConnectionStateEvent)         => void): EventSubscription;
  addListener(event: 'onServicesDiscovered',         listener: (e: ServicesDiscoveredEvent)      => void): EventSubscription;
  addListener(event: 'onCharacteristicsDiscovered',  listener: (e: CharacteristicsDiscoveredEvent) => void): EventSubscription;
  addListener(event: 'onCharacteristicRead',         listener: (e: CharacteristicValueEvent)     => void): EventSubscription;
  addListener(event: 'onCharacteristicChanged',      listener: (e: CharacteristicValueEvent)     => void): EventSubscription;
  addListener(event: 'onCharacteristicWritten',      listener: (e: CharacteristicWrittenEvent)   => void): EventSubscription;
  addListener(event: 'onPeripheralStateChanged',     listener: (e: PeripheralStateEvent)         => void): EventSubscription;
  addListener(event: 'onAdvertisingStarted',         listener: (e: AdvertisingStartedEvent)      => void): EventSubscription;
  addListener(event: 'onAdvertisingStopped',         listener: (e: Record<string, never>)        => void): EventSubscription;
  addListener(event: 'onCentralSubscribed',          listener: (e: CentralSubscribedEvent)       => void): EventSubscription;
  addListener(event: 'onCentralUnsubscribed',        listener: (e: CentralSubscribedEvent)       => void): EventSubscription;
  addListener(event: 'onMessageReceived',            listener: (e: MessageReceivedEvent)         => void): EventSubscription;
}

const NativeModule = requireNativeModule<ExpoBluetoothScannerNativeModule>('ExpoBluetoothScanner');

// -------------------------------------------------------------------------
// Public API
// -------------------------------------------------------------------------

/** Returns the current Bluetooth adapter state. */
export async function getState(): Promise<BluetoothState> {
  return NativeModule.getState();
}

/**
 * Start scanning for BLE peripherals.
 *
 * @param allowDuplicates - When true, fires onDeviceFound on every advertisement
 *   packet (useful for watching RSSI change in real time). Default true.
 * @param timeoutSeconds - Auto‑stop the scan after this many seconds (saves battery).
 *   Pass 0 to scan indefinitely. Default 10.
 *
 * Results arrive via `addDeviceFoundListener`.
 */
export function startScan(allowDuplicates = true, timeoutSeconds = 10): void {
  NativeModule.startScan(allowDuplicates, timeoutSeconds);
}

/** Stop an in-progress scan. Safe to call if not scanning. */
export function stopScan(): void {
  NativeModule.stopScan();
}

/** Returns how many unique devices were found in the current/last scan. */
export function getDiscoveredCount(): number {
  return NativeModule.getDiscoveredCount();
}

/** Subscribe to newly discovered BLE devices. */
export function addDeviceFoundListener(
  listener: (device: BluetoothDevice) => void
): EventSubscription {
  return NativeModule.addListener('onDeviceFound', listener);
}

/** Subscribe to scan start/stop state changes. */
export function addScanStateListener(
  listener: (e: ScanStateEvent) => void
): EventSubscription {
  return NativeModule.addListener('onScanStateChanged', listener);
}

/** Subscribe to Bluetooth errors (off, unauthorized, scan failure). */
export function addErrorListener(
  listener: (e: ScanErrorEvent) => void
): EventSubscription {
  return NativeModule.addListener('onError', listener);
}

/**
 * Subscribe to Bluetooth adapter state changes.
 * Fires whenever the adapter state changes (poweredOn, poweredOff, unauthorized, etc.).
 */
export function addBluetoothStateListener(
  listener: (e: BluetoothStateEvent) => void
): EventSubscription {
  return NativeModule.addListener('onBluetoothStateChanged', listener);
}

// ── Connection API ────────────────────────────────────────────────────────────

/** Connect to a discovered peripheral. The device must have been found during a scan. */
export function connectToDevice(deviceId: string): void {
  NativeModule.connectToDevice(deviceId);
}

/** Disconnect from a connected peripheral. */
export function disconnectDevice(deviceId: string): void {
  NativeModule.disconnectDevice(deviceId);
}

/** Subscribe to connection/disconnection state changes. */
export function addConnectionStateListener(
  listener: (e: ConnectionStateEvent) => void
): EventSubscription {
  return NativeModule.addListener('onConnectionStateChanged', listener);
}

// ── GATT discovery ────────────────────────────────────────────────────────────

/** Discover all GATT services on a connected device. Results arrive via addServicesDiscoveredListener. */
export function discoverServices(deviceId: string): void {
  NativeModule.discoverServices(deviceId);
}

/** Discover all characteristics for one service. Results arrive via addCharacteristicsDiscoveredListener. */
export function discoverCharacteristics(deviceId: string, serviceUUID: string): void {
  NativeModule.discoverCharacteristics(deviceId, serviceUUID);
}

export function addServicesDiscoveredListener(
  listener: (e: ServicesDiscoveredEvent) => void
): EventSubscription {
  return NativeModule.addListener('onServicesDiscovered', listener);
}

export function addCharacteristicsDiscoveredListener(
  listener: (e: CharacteristicsDiscoveredEvent) => void
): EventSubscription {
  return NativeModule.addListener('onCharacteristicsDiscovered', listener);
}

// ── GATT read / write / notify ────────────────────────────────────────────────

/** Read the current value of a characteristic. Result fires via addCharacteristicReadListener. */
export function readCharacteristic(deviceId: string, serviceUUID: string, charUUID: string): void {
  NativeModule.readCharacteristic(deviceId, serviceUUID, charUUID);
}

/**
 * Write a value to a characteristic.
 * @param value - Base64-encoded bytes to write.
 * @param withResponse - true = write with response (confirmed), false = write without response.
 */
export function writeCharacteristic(
  deviceId: string, serviceUUID: string, charUUID: string,
  value: string, withResponse = true
): void {
  NativeModule.writeCharacteristic(deviceId, serviceUUID, charUUID, value, withResponse);
}

/** Enable notifications for a characteristic. Values arrive via addCharacteristicChangedListener. */
export function subscribeCharacteristic(deviceId: string, serviceUUID: string, charUUID: string): void {
  NativeModule.subscribeCharacteristic(deviceId, serviceUUID, charUUID);
}

/** Disable notifications for a characteristic. */
export function unsubscribeCharacteristic(deviceId: string, serviceUUID: string, charUUID: string): void {
  NativeModule.unsubscribeCharacteristic(deviceId, serviceUUID, charUUID);
}

export function addCharacteristicReadListener(
  listener: (e: CharacteristicValueEvent) => void
): EventSubscription {
  return NativeModule.addListener('onCharacteristicRead', listener);
}

export function addCharacteristicChangedListener(
  listener: (e: CharacteristicValueEvent) => void
): EventSubscription {
  return NativeModule.addListener('onCharacteristicChanged', listener);
}

export function addCharacteristicWrittenListener(
  listener: (e: CharacteristicWrittenEvent) => void
): EventSubscription {
  return NativeModule.addListener('onCharacteristicWritten', listener);
}

// ── Peripheral (server) role API ──────────────────────────────────────────────

/** Returns this device's stable local peer identifier string. */
export function getLocalPeerId(): string {
  return NativeModule.getLocalPeerId();
}

/**
 * Returns the current CBPeripheralManager state as a string.
 * Call this on mount to seed initial state synchronously.
 */
export function getPeripheralState(): string {
  return NativeModule.getPeripheralState();
}

/**
 * Returns the maximum number of bytes writable in a single write-without-response
 * for the given connected peripheral. Use this to set the framing chunk size.
 * Returns 20 if the device is not connected (safe minimum).
 */
export function getMaxWriteLength(deviceId: string): number {
  return NativeModule.getMaxWriteLength(deviceId);
}

/**
 * Start advertising as a BLE peripheral with the chat GATT service.
 * @param localName - Name shown in central scan results.
 */
export function startAdvertising(localName: string): void {
  NativeModule.startAdvertising(localName);
}

/** Stop advertising. */
export function stopAdvertising(): void {
  NativeModule.stopAdvertising();
}

/**
 * Send a message to all subscribed centrals via TX notification.
 * @param value - Base64-encoded bytes.
 */
export function sendMessage(value: string): void {
  NativeModule.sendMessage(value);
}

export function addPeripheralStateListener(
  listener: (e: PeripheralStateEvent) => void
): EventSubscription {
  return NativeModule.addListener('onPeripheralStateChanged', listener);
}

export function addAdvertisingStartedListener(
  listener: (e: AdvertisingStartedEvent) => void
): EventSubscription {
  return NativeModule.addListener('onAdvertisingStarted', listener);
}

export function addAdvertisingStoppedListener(
  listener: (e: Record<string, never>) => void
): EventSubscription {
  return NativeModule.addListener('onAdvertisingStopped', listener);
}

export function addCentralSubscribedListener(
  listener: (e: CentralSubscribedEvent) => void
): EventSubscription {
  return NativeModule.addListener('onCentralSubscribed', listener);
}

export function addCentralUnsubscribedListener(
  listener: (e: CentralSubscribedEvent) => void
): EventSubscription {
  return NativeModule.addListener('onCentralUnsubscribed', listener);
}

export function addMessageReceivedListener(
  listener: (e: MessageReceivedEvent) => void
): EventSubscription {
  return NativeModule.addListener('onMessageReceived', listener);
}
