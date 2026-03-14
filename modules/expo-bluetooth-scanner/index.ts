export {
  // Adapter
  getState,
  // Scan
  startScan, stopScan, getDiscoveredCount,
  // Scan events
  addDeviceFoundListener, addScanStateListener, addErrorListener, addBluetoothStateListener,
  // Connection
  connectToDevice, disconnectDevice,
  addConnectionStateListener,
  // GATT discovery
  discoverServices, discoverCharacteristics,
  addServicesDiscoveredListener, addCharacteristicsDiscoveredListener,
  // GATT read/write/notify
  readCharacteristic, writeCharacteristic,
  subscribeCharacteristic, unsubscribeCharacteristic,
  addCharacteristicReadListener, addCharacteristicChangedListener, addCharacteristicWrittenListener,
  // Peripheral (server) role
  getLocalPeerId, getPeripheralState, getMaxWriteLength, startAdvertising, stopAdvertising, sendMessage,
  addPeripheralStateListener, addAdvertisingStartedListener, addAdvertisingStoppedListener,
  addCentralSubscribedListener, addCentralUnsubscribedListener, addMessageReceivedListener,
} from './src/ExpoBluetoothScannerModule';
export type {
  BluetoothDevice, BluetoothState,
  ScanStateEvent, ScanErrorEvent, BluetoothStateEvent,
  ConnectionState, ConnectionStateEvent,
  GattService, GattCharacteristic,
  ServicesDiscoveredEvent, CharacteristicsDiscoveredEvent,
  CharacteristicValueEvent, CharacteristicWrittenEvent,
  // Peripheral role types
  PeripheralStateEvent, AdvertisingStartedEvent, CentralSubscribedEvent, MessageReceivedEvent,
} from './src/ExpoBluetoothScannerModule';
