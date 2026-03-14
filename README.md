# BLEchat — Bluetooth P2P Chat for iOS

A React Native app that turns two iPhones into a peer-to-peer messaging system over **Bluetooth Low Energy** — no internet, no Wi-Fi, no server required.

Each device simultaneously acts as a **Central** (scanner/client) and a **Peripheral** (advertiser/server). Devices discover each other, perform a GATT handshake, and exchange messages using a custom chunked framing protocol, with all conversations persisted locally in SQLite.

---

## Features

- **BLE Device Scanner** — discover all nearby Bluetooth devices in real-time with RSSI, signal strength, distance estimation, and manufacturer identification
- **GATT Explorer** — connect to any BLE device and read, write, or subscribe to its characteristics
- **Peripheral Mode** — advertise this device as a BLE server with a custom GATT service (chat-capable)
- **P2P Chat Discovery** — scan specifically for other BLEchat peers and perform automatic GATT handshake
- **Real-time Messaging** — send and receive messages over BLE with automatic chunking and reassembly
- **Persistent Chat History** — all messages and conversations stored in SQLite, survive app restarts
- **Favorites & Auto-Reconnect** — mark devices as favorites and optionally reconnect automatically
- **Session Recovery** — last scan cached to AsyncStorage, shown on next launch

---

## Tech Stack

| Layer | Technology |
|---|---|
| Framework | React Native 0.83.2 + Expo 55 |
| Language | TypeScript |
| State management | Zustand 5 |
| Navigation | React Navigation 7 (bottom tabs + native stack) |
| Database | expo-sqlite |
| Preferences / cache | AsyncStorage + Zustand persist middleware |
| Icons | lucide-react-native |
| Animations | react-native-reanimated 4 |
| BLE (iOS) | Custom local Expo module (`expo-bluetooth-scanner`) using CBCentralManager + CBPeripheralManager |

---

## Requirements

- **macOS** with Xcode 15+
- **Node.js** 18+
- **CocoaPods**
- **iOS 16+** device or simulator (peripheral mode requires a real device)
- React Native dev environment ([setup guide](https://reactnative.dev/docs/set-up-your-environment))

---

## Getting Started

### 1. Clone the repo

```bash
git clone https://github.com/alexg-93/react-native-ble-chat.git
cd react-native-ble-chat
```

### 2. Install JS dependencies

```bash
npm install
```

### 3. Install iOS native dependencies

```bash
cd ios && pod install && cd ..
```

### 4. Run on device / simulator

```bash
npx expo run:ios
```

> **Note:** BLE peripheral advertising (`PeripheralScreen`) requires a **real iOS device**. The simulator can scan but cannot advertise.

### If you hit a linker error (`facebook::react::Sealable`)

This happens when Xcode has stale build artifacts. Fix with:

```bash
rm -rf ~/Library/Developer/Xcode/DerivedData/MyApp-*
cd ios && rm -rf Pods Podfile.lock && pod install && cd ..
npx expo run:ios
```

---

## Project Structure

```
.
├── app.json                          # Expo config (name, bundle ID, icon)
├── assets/
│   └── icon.png                      # App icon (1024×1024)
├── modules/
│   └── expo-bluetooth-scanner/       # Local Expo module — iOS BLE bridge
│       ├── ios/
│       │   └── ExpoBluetoothScannerModule.swift  # CBCentralManager + CBPeripheralManager
│       └── src/
│           └── ExpoBluetoothScannerModule.ts     # JS API surface
├── plugins/
│   └── withPodfilePatches.js         # Expo config plugin for Podfile modifications
└── src/
    ├── AppRoot.tsx                   # Entry point
    ├── navigation/
    │   └── AppNavigator.tsx          # Bottom tabs + nested stacks
    ├── screens/
    │   ├── ScannerScreen.tsx         # BLE device scanner UI
    │   ├── GattDetailScreen.tsx      # GATT service / characteristic explorer
    │   ├── PeripheralScreen.tsx      # Local peripheral advertising
    │   ├── PeersScreen.tsx           # Chat peer discovery
    │   ├── ChatListScreen.tsx        # Conversation list
    │   └── ChatDetailScreen.tsx      # Full chat UI
    ├── hooks/
    │   ├── useScanner.ts             # Scanner lifecycle
    │   ├── usePeers.ts               # Peer lifecycle + DB helpers
    │   ├── usePeripheral.ts          # Peripheral lifecycle
    │   └── useGattDetail.ts          # GATT explorer state
    ├── scanner/
    │   └── ScannerService.ts         # BLE scan, connect, GATT name resolution, batching
    ├── services/
    │   └── PeerService.ts            # GATT handshake + framed message transport
    ├── transport/
    │   └── framer.ts                 # Message encoding, ChunkReassembler
    ├── storage/
    │   ├── AsyncStorageService.ts    # Last scan session persistence
    │   └── ChatDb.ts                 # SQLite schema + queries
    ├── store/
    │   ├── scannerStore.ts           # Zustand: BLE scanner state
    │   ├── peerStore.ts              # Zustand: peers + messages + conversations
    │   └── prefsStore.ts             # Zustand: persisted user preferences
    ├── components/
    │   ├── common/                   # EmptyState, SortChips, StateBadge, Toggle
    │   └── scanner/                  # DeviceCard, SignalBars, RssiSparkline, RadarView
    └── utils/
        ├── rssi.ts                   # RSSI → bars, color, distance
        ├── gatt.ts                   # UUID → readable names, value decoding
        ├── manufacturers.ts          # BLE company ID → name
        ├── deviceName.ts             # Infer display name from ad data
        └── time.ts                   # Relative time formatting
```

---

## Navigation

```
AppNavigator
└── BottomTabNavigator
    ├── Scanner tab
    │   ├── ScannerScreen       ← list of all nearby BLE devices
    │   └── GattDetailScreen    ← read/write/subscribe characteristics
    ├── Peripheral tab
    │   └── PeripheralScreen    ← advertise this device
    ├── Peers tab
    │   └── PeersScreen         ← discover & chat with BLEchat peers
    └── Chat tab
        ├── ChatListScreen      ← persisted conversation list
        └── ChatDetailScreen    ← full chat UI
```

---

## How It Works

### BLE Roles

Each device runs both roles simultaneously:

| Role | iOS API | Purpose |
|---|---|---|
| **Central** | `CBCentralManager` | Scan, connect, read/write GATT characteristics |
| **Peripheral** | `CBPeripheralManager` | Advertise, respond to reads, receive writes, send notifications |

### Custom GATT Service (Chat)

```
Service UUID:   12345678-0000-4B5A-8000-52454D4F5445
  ├─ PEER_ID_CHAR   (12345679…)  [read + notify]  → stable UUID of this device
  ├─ TX_CHAR        (1234567A…)  [notify]          → outgoing messages (peripheral → central)
  └─ RX_CHAR        (1234567B…)  [write]           → incoming messages (central → peripheral)
```

### Connection Handshake

```
Central                            Peripheral
───────                            ─────────
scan for CHAT_SERVICE UUID
        │
        ↓ device found
connect()
        │
        ↓ connected
discoverServices(CHAT_SERVICE)
discoverCharacteristics()
readCharacteristic(PEER_ID_CHAR)  →  returns UUID string
subscribeCharacteristic(TX_CHAR)  →  subscribes to notifications
        │
        ↓
state = 'paired' ✓  ←────────────  ready to send TX notifications
```

### Message Framing

BLE write operations max out at ~182 bytes (ATT MTU). Long messages are automatically split and reassembled using a 5-byte binary header:

```
Offset  Size  Field        Description
──────  ────  ─────────    ──────────────────────────────
0       2     msgId        uint16 — unique per message
2       1     chunkIdx     uint8  — 0-based chunk index
3       1     totalChunks  uint8  — total chunks in message
4       1     flags        uint8  — reserved (0x00)
5+      N     payload      UTF-8 text bytes (175 bytes max)
```

Each frame is base64-encoded before being written to `RX_CHAR`. The `ChunkReassembler` collects all chunks and fires a callback with the complete text once all arrive.

### Message Persistence

```
Incoming message
  → ChunkReassembler.receive()
  → (complete) ChatDb.insertMessage()
  → ChatDb.upsertConversation(unread++)
  → peerStore.appendChatMessage()
  → ChatDetailScreen re-renders

App restart
  → ChatDb.loadConversations()
  → peerStore.setConversations()
  → ChatListScreen shows full history immediately
```

### UI Performance — Batched BLE Updates

With `allowDuplicates: true`, BLE advertisements fire up to hundreds of times per second for many nearby devices. Instead of calling `store.set()` per event (which would cause a re-render storm), `ScannerService` accumulates events in a `Map<id, device>` buffer and flushes every **300 ms** with a single `batchUpsertDevices()` call.

---

## SQLite Schema

```sql
CREATE TABLE messages (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  peerId       TEXT    NOT NULL,
  remotePeerId TEXT    NOT NULL DEFAULT '',
  text         TEXT    NOT NULL,
  ts           INTEGER NOT NULL,
  outgoing     INTEGER NOT NULL DEFAULT 0  -- 0 = incoming, 1 = outgoing
);

CREATE TABLE conversations (
  peerId       TEXT    PRIMARY KEY,
  peerName     TEXT    NOT NULL DEFAULT '',
  remotePeerId TEXT    NOT NULL DEFAULT '',
  lastText     TEXT    NOT NULL DEFAULT '',
  lastTs       INTEGER NOT NULL DEFAULT 0,
  unread       INTEGER NOT NULL DEFAULT 0
);
```

---

## State Management

Three Zustand stores drive the entire app:

| Store | Persisted | Key state |
|---|---|---|
| `scannerStore` | No | `devices[]`, `connState`, `rssiHistory`, `scanning`, `countdown` |
| `peerStore` | No | `peers[]`, `messages[]`, `conversations[]`, `chatMessages` |
| `prefsStore` | Yes (AsyncStorage) | `favorites[]`, `autoReconnect`, `advertisedName` |

---

## iOS Permissions

The following keys are set in `Info.plist` and required for Bluetooth access:

```
NSBluetoothAlwaysUsageDescription
NSBluetoothPeripheralUsageDescription
```

iOS will prompt the user on first launch.

---

## Known Limitations

- **iOS only** — the native BLE module is implemented in Swift. The Android stub exists in `modules/expo-bluetooth-scanner/android/` but is not functional yet.
- **Peripheral mode** requires a physical device (iOS Simulator cannot advertise BLE services).
- **Max message size**: 255 chunks × 175 bytes ≈ 44 KB. Sufficient for all normal chat use.
- **Range**: Bluetooth Low Energy typically reaches 10–30 m indoors, up to 100 m line-of-sight.

---

## License

MIT
