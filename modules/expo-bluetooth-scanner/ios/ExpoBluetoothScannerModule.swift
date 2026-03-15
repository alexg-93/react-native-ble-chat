import ExpoModulesCore
import CoreBluetooth

// ── Custom BLE service / characteristic UUIDs ────────────────────────────────
// This app advertises a single custom GATT service so two devices can discover
// and connect to each other. All UUIDs share the same 128-bit base.
private enum BLEChatUUIDs {
  /// Primary service UUID for the chat application.
  static let service   = CBUUID(string: "12345678-0000-4B5A-8000-52454D4F5445")
  /// Peer-ID characteristic — readable + notifiable. Value is the peer's UUID string.
  static let peerId    = CBUUID(string: "12345679-0000-4B5A-8000-52454D4F5445")
  /// TX characteristic — notify only. Peripheral sends messages to central subscribers.
  static let tx        = CBUUID(string: "1234567A-0000-4B5A-8000-52454D4F5445")
  /// RX characteristic — write (with/without response). Central sends messages to peripheral.
  static let rx        = CBUUID(string: "1234567B-0000-4B5A-8000-52454D4F5445")
}

// ── Peripheral delegate ───────────────────────────────────────────────────────
private class PeripheralDelegate: NSObject, CBPeripheralManagerDelegate {
  var onStateChanged:       ((CBManagerState) -> Void)?
  var onCentralSubscribed:  ((CBCentral, CBCharacteristic) -> Void)?
  var onCentralUnsubscribed:((CBCentral, CBCharacteristic) -> Void)?
  var onWriteReceived:      ((CBPeripheralManager, [CBATTRequest]) -> Void)?
  var onReadRequest:        ((CBPeripheralManager, CBATTRequest) -> Void)?
  var onAdvertisingStarted: ((Error?) -> Void)?
  var onServiceAdded:       ((CBService, Error?) -> Void)?

  func peripheralManagerDidUpdateState(_ peripheral: CBPeripheralManager) {
    onStateChanged?(peripheral.state)
  }
  func peripheralManagerDidStartAdvertising(_ peripheral: CBPeripheralManager, error: Error?) {
    onAdvertisingStarted?(error)
  }
  func peripheralManager(_ peripheral: CBPeripheralManager, didAdd service: CBService, error: Error?) {
    onServiceAdded?(service, error)
  }
  func peripheralManager(_ peripheral: CBPeripheralManager, central: CBCentral,
                         didSubscribeTo characteristic: CBCharacteristic) {
    onCentralSubscribed?(central, characteristic)
  }
  func peripheralManager(_ peripheral: CBPeripheralManager, central: CBCentral,
                         didUnsubscribeTo characteristic: CBCharacteristic) {
    onCentralUnsubscribed?(central, characteristic)
  }
  func peripheralManager(_ peripheral: CBPeripheralManager,
                         didReceiveWrite requests: [CBATTRequest]) {
    onWriteReceived?(peripheral, requests)
  }
  func peripheralManager(_ peripheral: CBPeripheralManager,
                         didReceiveRead request: CBATTRequest) {
    onReadRequest?(peripheral, request)
  }
}

private class BLEDelegate: NSObject, CBCentralManagerDelegate, CBPeripheralDelegate {

  // Scan callbacks — pass both payload and peripheral for caching
  var onDeviceFound:        (([String: Any], CBPeripheral) -> Void)?
  var onStateChanged:       ((CBManagerState) -> Void)?

  // Name cache: persists names across advertisement packets so a device
  // that occasionally omits its local-name still gets reported with a name.
  var nameCache: [String: String] = [:]

  // Connection callbacks
  var onConnected:          ((CBPeripheral) -> Void)?
  var onDisconnected:       ((CBPeripheral, Error?) -> Void)?
  var onFailedToConnect:    ((CBPeripheral, Error?) -> Void)?

  // GATT callbacks
  var onServicesDiscovered:          ((CBPeripheral, Error?) -> Void)?
  var onCharacteristicsDiscovered:   ((CBPeripheral, CBService, Error?) -> Void)?
  var onCharacteristicRead:          ((CBPeripheral, CBCharacteristic, Error?) -> Void)?
  var onCharacteristicChanged:       ((CBPeripheral, CBCharacteristic) -> Void)?
  var onCharacteristicWritten:       ((CBPeripheral, CBCharacteristic, Error?) -> Void)?

  // ── CBCentralManagerDelegate ──────────────────────────────────────────

  func centralManagerDidUpdateState(_ central: CBCentralManager) {
    onStateChanged?(central.state)
  }

  func centralManager(
    _ central: CBCentralManager,
    didDiscover peripheral: CBPeripheral,
    advertisementData: [String: Any],
    rssi RSSI: NSNumber
  ) {
    let id = peripheral.identifier.uuidString
    let localName  = advertisementData[CBAdvertisementDataLocalNameKey] as? String

    // Only cache names that come from the live advertisement packet.
    // peripheral.name is cached by iOS itself and may be stale after a name change,
    // so we use it only as a display fallback, never write it into nameCache.
    if let n = localName, !n.isEmpty {
      nameCache[id] = n
    }
    let name = nameCache[id] ?? peripheral.name ?? ""

    let serviceUUIDs: [String] = (advertisementData[CBAdvertisementDataServiceUUIDsKey] as? [CBUUID])?.map { $0.uuidString } ?? []
    let txPower    = advertisementData[CBAdvertisementDataTxPowerLevelKey] as? Int
    let mfgData    = advertisementData[CBAdvertisementDataManufacturerDataKey] as? Data
    var companyId: Int?
    if let data = mfgData, data.count >= 2 {
      companyId = Int(data[0]) | (Int(data[1]) << 8)
    }
    var payload: [String: Any] = [
      "id":            id,
      "name":          name,
      "rssi":          RSSI.intValue,
      "isConnectable": (advertisementData[CBAdvertisementDataIsConnectable] as? Bool) ?? false,
      "serviceUUIDs":  serviceUUIDs,
      "timestamp":     Date().timeIntervalSince1970 * 1000,
    ]
    if let tx  = txPower  { payload["txPowerLevel"]   = tx }
    if let cid = companyId { payload["manufacturerId"] = cid }
    onDeviceFound?(payload, peripheral)
  }

  func centralManager(_ central: CBCentralManager, didConnect peripheral: CBPeripheral) {
    peripheral.delegate = self
    onConnected?(peripheral)
  }

  func centralManager(_ central: CBCentralManager, didDisconnectPeripheral peripheral: CBPeripheral, error: Error?) {
    onDisconnected?(peripheral, error)
  }

  func centralManager(_ central: CBCentralManager, didFailToConnect peripheral: CBPeripheral, error: Error?) {
    onFailedToConnect?(peripheral, error)
  }

  // ── CBPeripheralDelegate ──────────────────────────────────────────────

  func peripheral(_ peripheral: CBPeripheral, didDiscoverServices error: Error?) {
    onServicesDiscovered?(peripheral, error)
  }

  func peripheral(_ peripheral: CBPeripheral, didDiscoverCharacteristicsFor service: CBService, error: Error?) {
    onCharacteristicsDiscovered?(peripheral, service, error)
  }

  func peripheral(_ peripheral: CBPeripheral, didUpdateValueFor characteristic: CBCharacteristic, error: Error?) {
    if characteristic.isNotifying {
      onCharacteristicChanged?(peripheral, characteristic)
    } else {
      onCharacteristicRead?(peripheral, characteristic, error)
    }
  }

  func peripheral(_ peripheral: CBPeripheral, didWriteValueFor characteristic: CBCharacteristic, error: Error?) {
    onCharacteristicWritten?(peripheral, characteristic, error)
  }

  func peripheral(_ peripheral: CBPeripheral, didUpdateNotificationStateFor characteristic: CBCharacteristic, error: Error?) {
    // Fires after setNotifyValue — re-use read handler to report any error
    if let error = error {
      onCharacteristicRead?(peripheral, characteristic, error)
    }
  }
}

// ── Module ────────────────────────────────────────────────────────────────────

public class ExpoBluetoothScannerModule: Module {

  private var central: CBCentralManager?
  private let bleDelegate = BLEDelegate()
  private var isScanning = false
  private var scanTimer: Timer?
  private var discoveredDeviceIds = Set<String>()

  // Peripherals seen during scan — needed to reconnect after scan stops
  private var peripheralCache: [String: CBPeripheral] = [:]
  // Currently connected peripherals
  private var connectedPeripherals: [String: CBPeripheral] = [:]
  // Connection attempt timers (auto-cancel after timeout)
  private var connectionTimers: [String: Timer] = [:]

  // ── Peripheral (server) role ──
  private var peripheralManager: CBPeripheralManager?
  private let peripheralDelegate = PeripheralDelegate()
  private var isAdvertising = false
  // GATT characteristics we own (kept as refs so we can update their values)
  private var peerIdCharacteristic: CBMutableCharacteristic?
  private var txCharacteristic: CBMutableCharacteristic?
  private var rxCharacteristic: CBMutableCharacteristic?
  // Centrals that subscribed to TX (to send notifications)
  private var txSubscribers: [CBCentral] = []
  // Our stable peer identifier (this device's UUID)
  private let localPeerId = UUID().uuidString

  public func definition() -> ModuleDefinition {

    Name("ExpoBluetoothScanner")

    Events(
      "onDeviceFound", "onScanStateChanged", "onError", "onBluetoothStateChanged",
      "onConnectionStateChanged",
      "onServicesDiscovered",
      "onCharacteristicsDiscovered",
      "onCharacteristicRead",
      "onCharacteristicChanged",
      "onCharacteristicWritten",
      // Peripheral (server) role events
      "onPeripheralStateChanged",    // { state: 'poweredOn'|'poweredOff'|... }
      "onAdvertisingStarted",         // { error?: string }
      "onAdvertisingStopped",         // {}
      "onCentralSubscribed",          // { centralId: string, charUUID: string }
      "onCentralUnsubscribed",        // { centralId: string, charUUID: string }
      "onMessageReceived"             // { value: string } base64
    )

    OnCreate {
      DispatchQueue.main.async {
        self.ensureCentral()
        self.ensurePeripheralManager()
      }
    }

    // ── Adapter state ───────────────────────────────────────────────────

    /// Returns the local peer identifier (stable for this app install).
    Function("getLocalPeerId") { () -> String in
      return self.localPeerId
    }

    /// Returns the current CBPeripheralManager state as a string.
    /// Call this on mount to seed the initial state and avoid the race where
    /// onPeripheralStateChanged fires before the JS listener is registered.
    Function("getPeripheralState") { () -> String in
      guard let pm = self.peripheralManager else { return "unknown" }
      return self.stateString(pm.state)
    }

    /// Returns the maximum number of bytes that can be written in a single
    /// BLE write-without-response for a connected device.
    /// Use this to configure the framing chunk size in JS after connecting.
    Function("getMaxWriteLength") { (deviceId: String) -> Int in
      guard let peripheral = self.connectedPeripherals[deviceId] else { return 20 }
      return peripheral.maximumWriteValueLength(for: .withoutResponse)
    }

    // ── Peripheral (server) role ────────────────────────────────────────

    /// Start advertising the chat GATT service. localName appears in scan results.
    Function("startAdvertising") { (localName: String) in
      DispatchQueue.main.async {
        self.ensurePeripheralManager()
        guard let pm = self.peripheralManager, pm.state == .poweredOn else {
          self.sendEvent("onError", ["code": "BLUETOOTH_OFF",
                                    "message": "Bluetooth is not available for peripheral role."])
          return
        }
        guard !self.isAdvertising else { return }
        self.buildGattServiceIfNeeded(pm)
        let advertisementData: [String: Any] = [
          CBAdvertisementDataServiceUUIDsKey: [BLEChatUUIDs.service],
          CBAdvertisementDataLocalNameKey: localName,
        ]
        pm.startAdvertising(advertisementData)
      }
    }

    /// Stop advertising.
    Function("stopAdvertising") { () in
      DispatchQueue.main.async {
        guard let pm = self.peripheralManager, self.isAdvertising else { return }
        pm.stopAdvertising()
        self.isAdvertising = false
        self.sendEvent("onAdvertisingStopped", [:])
      }
    }

    /// Send a base64-encoded message to all subscribed centrals via TX notify.
    Function("sendMessage") { (value: String) in
      DispatchQueue.main.async {
        guard let pm = self.peripheralManager,
              let txChar = self.txCharacteristic,
              !self.txSubscribers.isEmpty,
              let data = Data(base64Encoded: value) else { return }
        pm.updateValue(data, for: txChar, onSubscribedCentrals: nil)
      }
    }

    AsyncFunction("getState") { () -> String in
      await MainActor.run {
        self.ensureCentral()
        return self.stateString(self.central!.state)
      }
    }

    // ── Scanning ────────────────────────────────────────────────────────

    Function("startScan") { (allowDuplicates: Bool, timeoutSeconds: Double) in
      DispatchQueue.main.async {
        self.ensureCentral()
        guard let c = self.central, c.state == .poweredOn else {
          self.sendEvent("onError", ["code": "BLUETOOTH_OFF", "message": "Bluetooth is not powered on."])
          return
        }
        guard !self.isScanning else { return }
        self.discoveredDeviceIds.removeAll()
        self.nameCache.removeAll()   // fresh scan — don't serve stale cached names
        self.isScanning = true
        c.scanForPeripherals(withServices: nil,
                             options: [CBCentralManagerScanOptionAllowDuplicatesKey: allowDuplicates])
        self.sendEvent("onScanStateChanged", ["isScanning": true])
        self.scanTimer?.invalidate()
        if timeoutSeconds > 0 {
          self.scanTimer = Timer.scheduledTimer(withTimeInterval: timeoutSeconds, repeats: false) { [weak self] _ in
            self?.doStopScan()
          }
        }
      }
    }

    Function("stopScan") { () in
      DispatchQueue.main.async { self.doStopScan() }
    }

    Function("getDiscoveredCount") { () -> Int in
      return self.discoveredDeviceIds.count
    }

    // ── Connection ──────────────────────────────────────────────────────

    Function("connectToDevice") { (deviceId: String) in
      DispatchQueue.main.async {
        guard let c = self.central else { return }
        guard let peripheral = self.peripheralCache[deviceId] else {
          self.sendEvent("onError", ["code": "DEVICE_NOT_FOUND",
                                    "message": "Device \(deviceId) not found. Scan first."])
          return
        }
        // Stop scan before connecting (iOS requirement for reliable connections)
        self.doStopScan()
        self.sendEvent("onConnectionStateChanged", ["id": deviceId, "state": "connecting"])
        c.connect(peripheral, options: nil)
        // Auto-cancel if connection hangs for more than 10 seconds
        self.connectionTimers[deviceId]?.invalidate()
        self.connectionTimers[deviceId] = Timer.scheduledTimer(withTimeInterval: 10, repeats: false) { [weak self] _ in
          guard let self = self else { return }
          if let p = self.peripheralCache[deviceId] { self.central?.cancelPeripheralConnection(p) }
          self.sendEvent("onConnectionStateChanged", [
            "id": deviceId, "state": "failed", "error": "Connection timed out"
          ])
          self.connectionTimers.removeValue(forKey: deviceId)
        }
      }
    }

    Function("disconnectDevice") { (deviceId: String) in
      DispatchQueue.main.async {
        guard let c = self.central,
              let peripheral = self.connectedPeripherals[deviceId] else { return }
        c.cancelPeripheralConnection(peripheral)
      }
    }

    // ── GATT service/characteristic discovery ───────────────────────────

    Function("discoverServices") { (deviceId: String) in
      DispatchQueue.main.async {
        guard let peripheral = self.connectedPeripherals[deviceId] else {
          self.sendEvent("onError", ["code": "NOT_CONNECTED",
                                    "message": "Device \(deviceId) is not connected."])
          return
        }
        peripheral.discoverServices(nil) // nil = discover all services
      }
    }

    Function("discoverCharacteristics") { (deviceId: String, serviceUUID: String) in
      DispatchQueue.main.async {
        guard let peripheral = self.connectedPeripherals[deviceId] else { return }
        guard let service = peripheral.services?.first(where: {
          $0.uuid.uuidString.uppercased() == serviceUUID.uppercased()
        }) else { return }
        peripheral.discoverCharacteristics(nil, for: service) // nil = all characteristics
      }
    }

    // ── Read / Write / Notify ───────────────────────────────────────────

    Function("readCharacteristic") { (deviceId: String, serviceUUID: String, charUUID: String) in
      DispatchQueue.main.async {
        guard let (peripheral, characteristic) = self.resolveCharacteristic(deviceId, serviceUUID, charUUID) else {
          self.sendEvent("onError", ["code": "CHAR_NOT_FOUND",
                                    "message": "Characteristic \(charUUID) not found."])
          return
        }
        peripheral.readValue(for: characteristic)
      }
    }

    // value is a base64-encoded string; withResponse controls write type
    Function("writeCharacteristic") { (deviceId: String, serviceUUID: String, charUUID: String, value: String, withResponse: Bool) in
      DispatchQueue.main.async {
        guard let (peripheral, characteristic) = self.resolveCharacteristic(deviceId, serviceUUID, charUUID) else {
          self.sendEvent("onError", ["code": "CHAR_NOT_FOUND",
                                    "message": "Characteristic \(charUUID) not found."])
          return
        }
        guard let data = Data(base64Encoded: value) else {
          self.sendEvent("onError", ["code": "INVALID_VALUE",
                                    "message": "Value must be a valid base64 string."])
          return
        }
        let writeType: CBCharacteristicWriteType = withResponse ? .withResponse : .withoutResponse
        peripheral.writeValue(data, for: characteristic, type: writeType)
      }
    }

    Function("subscribeCharacteristic") { (deviceId: String, serviceUUID: String, charUUID: String) in
      DispatchQueue.main.async {
        guard let (peripheral, characteristic) = self.resolveCharacteristic(deviceId, serviceUUID, charUUID) else { return }
        peripheral.setNotifyValue(true, for: characteristic)
      }
    }

    Function("unsubscribeCharacteristic") { (deviceId: String, serviceUUID: String, charUUID: String) in
      DispatchQueue.main.async {
        guard let (peripheral, characteristic) = self.resolveCharacteristic(deviceId, serviceUUID, charUUID) else { return }
        peripheral.setNotifyValue(false, for: characteristic)
      }
    }
  }

  // ── Private helpers ───────────────────────────────────────────────────

  private func doStopScan() {
    scanTimer?.invalidate(); scanTimer = nil
    guard isScanning, let c = central else { return }
    c.stopScan()
    isScanning = false
    sendEvent("onScanStateChanged", ["isScanning": false])
  }

  private func resolveCharacteristic(_ deviceId: String, _ serviceUUID: String, _ charUUID: String)
    -> (CBPeripheral, CBCharacteristic)?
  {
    guard let peripheral = connectedPeripherals[deviceId],
          let service = peripheral.services?.first(where: {
            $0.uuid.uuidString.uppercased() == serviceUUID.uppercased()
          }),
          let characteristic = service.characteristics?.first(where: {
            $0.uuid.uuidString.uppercased() == charUUID.uppercased()
          })
    else { return nil }
    return (peripheral, characteristic)
  }

  private func characteristicProperties(_ props: CBCharacteristicProperties) -> [String] {
    var result: [String] = []
    if props.contains(.read)                 { result.append("read") }
    if props.contains(.write)                { result.append("write") }
    if props.contains(.writeWithoutResponse) { result.append("writeWithoutResponse") }
    if props.contains(.notify)               { result.append("notify") }
    if props.contains(.indicate)             { result.append("indicate") }
    return result
  }

  private func ensureCentral() {
    guard central == nil else { return }

    // ── Scan callbacks ──
    bleDelegate.onDeviceFound = { [weak self] payload, peripheral in
      guard let self = self else { return }
      let id = peripheral.identifier.uuidString
      self.discoveredDeviceIds.insert(id)
      self.peripheralCache[id] = peripheral          // direct strong reference
      self.sendEvent("onDeviceFound", payload)
    }
    bleDelegate.onStateChanged = { [weak self] state in
      guard let self = self else { return }
      if state != .poweredOn && self.isScanning { self.doStopScan() }
      self.sendEvent("onBluetoothStateChanged", ["state": self.stateString(state)])
    }

    // ── Connection callbacks ──
    bleDelegate.onConnected = { [weak self] peripheral in
      guard let self = self else { return }
      let id = peripheral.identifier.uuidString
      self.connectionTimers[id]?.invalidate()
      self.connectionTimers.removeValue(forKey: id)
      self.connectedPeripherals[id] = peripheral
      self.sendEvent("onConnectionStateChanged", ["id": id, "state": "connected"])
    }
    bleDelegate.onDisconnected = { [weak self] peripheral, error in
      guard let self = self else { return }
      let id = peripheral.identifier.uuidString
      self.connectionTimers[id]?.invalidate()
      self.connectionTimers.removeValue(forKey: id)
      self.connectedPeripherals.removeValue(forKey: id)
      var payload: [String: Any] = ["id": id, "state": "disconnected"]
      if let e = error { payload["error"] = e.localizedDescription }
      self.sendEvent("onConnectionStateChanged", payload)
    }
    bleDelegate.onFailedToConnect = { [weak self] peripheral, error in
      guard let self = self else { return }
      let id = peripheral.identifier.uuidString
      self.connectionTimers[id]?.invalidate()
      self.connectionTimers.removeValue(forKey: id)
      self.connectedPeripherals.removeValue(forKey: id)
      var payload: [String: Any] = ["id": id, "state": "failed"]
      if let e = error { payload["error"] = e.localizedDescription }
      self.sendEvent("onConnectionStateChanged", payload)
    }

    // ── GATT callbacks ──
    bleDelegate.onServicesDiscovered = { [weak self] peripheral, error in
      guard let self = self else { return }
      let id = peripheral.identifier.uuidString
      if let error = error {
        self.sendEvent("onError", ["code": "SERVICES_ERROR", "message": error.localizedDescription])
        return
      }
      let services: [[String: Any]] = (peripheral.services ?? []).map {
        ["uuid": $0.uuid.uuidString, "isPrimary": $0.isPrimary]
      }
      self.sendEvent("onServicesDiscovered", ["id": id, "services": services])
    }

    bleDelegate.onCharacteristicsDiscovered = { [weak self] peripheral, service, error in
      guard let self = self else { return }
      let id = peripheral.identifier.uuidString
      if let error = error {
        self.sendEvent("onError", ["code": "CHARS_ERROR", "message": error.localizedDescription])
        return
      }
      let chars: [[String: Any]] = (service.characteristics ?? []).map {
        ["uuid": $0.uuid.uuidString, "properties": self.characteristicProperties($0.properties)]
      }
      self.sendEvent("onCharacteristicsDiscovered", [
        "id": id,
        "serviceUUID": service.uuid.uuidString,
        "characteristics": chars
      ])
    }

    bleDelegate.onCharacteristicRead = { [weak self] peripheral, characteristic, error in
      guard let self = self else { return }
      let id = peripheral.identifier.uuidString
      var payload: [String: Any] = [
        "id":          id,
        "serviceUUID": characteristic.service?.uuid.uuidString ?? "",
        "charUUID":    characteristic.uuid.uuidString,
        "value":       characteristic.value?.base64EncodedString() ?? "",
      ]
      if let e = error { payload["error"] = e.localizedDescription }
      self.sendEvent("onCharacteristicRead", payload)
    }

    bleDelegate.onCharacteristicChanged = { [weak self] peripheral, characteristic in
      guard let self = self else { return }
      self.sendEvent("onCharacteristicChanged", [
        "id":          peripheral.identifier.uuidString,
        "serviceUUID": characteristic.service?.uuid.uuidString ?? "",
        "charUUID":    characteristic.uuid.uuidString,
        "value":       characteristic.value?.base64EncodedString() ?? "",
      ])
    }

    bleDelegate.onCharacteristicWritten = { [weak self] peripheral, characteristic, error in
      guard let self = self else { return }
      var payload: [String: Any] = [
        "id":          peripheral.identifier.uuidString,
        "serviceUUID": characteristic.service?.uuid.uuidString ?? "",
        "charUUID":    characteristic.uuid.uuidString,
      ]
      if let e = error { payload["error"] = e.localizedDescription }
      self.sendEvent("onCharacteristicWritten", payload)
    }

    central = CBCentralManager(delegate: bleDelegate, queue: nil)
  }

  private func stateString(_ state: CBManagerState) -> String {
    switch state {
    case .poweredOn:    return "poweredOn"
    case .poweredOff:   return "poweredOff"
    case .unauthorized: return "unauthorized"
    case .unsupported:  return "unsupported"
    case .resetting:    return "resetting"
    case .unknown:      return "unknown"
    @unknown default:   return "unknown"
    }
  }

  // ── Peripheral manager helpers ────────────────────────────────────────

  private func ensurePeripheralManager() {
    guard peripheralManager == nil else { return }

    peripheralDelegate.onStateChanged = { [weak self] state in
      guard let self = self else { return }
      self.sendEvent("onPeripheralStateChanged", ["state": self.stateString(state)])
      if state != .poweredOn && self.isAdvertising {
        self.isAdvertising = false
        self.sendEvent("onAdvertisingStopped", [:])
      }
    }

    peripheralDelegate.onAdvertisingStarted = { [weak self] error in
      guard let self = self else { return }
      if let error = error {
        self.sendEvent("onAdvertisingStarted", ["error": error.localizedDescription])
      } else {
        self.isAdvertising = true
        // Update the Peer-ID characteristic value so centrals can read it
        if let peerChar = self.peerIdCharacteristic {
          peerChar.value = self.localPeerId.data(using: .utf8)
        }
        self.sendEvent("onAdvertisingStarted", [:])
      }
    }

    peripheralDelegate.onServiceAdded = { [weak self] _, error in
      guard let self = self else { return }
      if let error = error {
        self.sendEvent("onError", ["code": "SERVICE_ADD_FAILED",
                                   "message": error.localizedDescription])
      }
    }

    peripheralDelegate.onCentralSubscribed = { [weak self] central, characteristic in
      guard let self = self else { return }
      if characteristic.uuid == BLEChatUUIDs.tx,
         !self.txSubscribers.contains(where: { $0.identifier == central.identifier }) {
        self.txSubscribers.append(central)
      }
      self.sendEvent("onCentralSubscribed", [
        "centralId": central.identifier.uuidString,
        "charUUID":  characteristic.uuid.uuidString,
      ])
    }

    peripheralDelegate.onCentralUnsubscribed = { [weak self] central, characteristic in
      guard let self = self else { return }
      self.txSubscribers.removeAll { $0.identifier == central.identifier }
      self.sendEvent("onCentralUnsubscribed", [
        "centralId": central.identifier.uuidString,
        "charUUID":  characteristic.uuid.uuidString,
      ])
    }

    peripheralDelegate.onWriteReceived = { [weak self] pm, requests in
      guard let self = self else { return }
      for request in requests {
        if request.characteristic.uuid == BLEChatUUIDs.rx, let data = request.value {
          self.sendEvent("onMessageReceived", [
            "value":     data.base64EncodedString(),
            "centralId": request.central.identifier.uuidString,
          ])
        }
        pm.respond(to: request, withResult: .success)
      }
    }

    peripheralDelegate.onReadRequest = { [weak self] pm, request in
      guard let self = self else { return }
      if request.characteristic.uuid == BLEChatUUIDs.peerId {
        request.value = self.localPeerId.data(using: .utf8)
        pm.respond(to: request, withResult: .success)
      } else {
        pm.respond(to: request, withResult: .requestNotSupported)
      }
    }

    peripheralManager = CBPeripheralManager(delegate: peripheralDelegate, queue: nil)
  }

  /// Build and add the chat GATT service to the peripheral manager (idempotent).
  private func buildGattServiceIfNeeded(_ pm: CBPeripheralManager) {
    guard peerIdCharacteristic == nil else { return }

    let peerChar = CBMutableCharacteristic(
      type: BLEChatUUIDs.peerId,
      properties: [.read, .notify],
      value: nil,
      permissions: [.readable]
    )
    let txChar = CBMutableCharacteristic(
      type: BLEChatUUIDs.tx,
      properties: [.notify],
      value: nil,
      permissions: []
    )
    let rxChar = CBMutableCharacteristic(
      type: BLEChatUUIDs.rx,
      properties: [.write, .writeWithoutResponse],
      value: nil,
      permissions: [.writeable]
    )
    self.peerIdCharacteristic = peerChar
    self.txCharacteristic     = txChar
    self.rxCharacteristic     = rxChar

    let service = CBMutableService(type: BLEChatUUIDs.service, primary: true)
    service.characteristics = [peerChar, txChar, rxChar]
    pm.add(service)
  }
}

