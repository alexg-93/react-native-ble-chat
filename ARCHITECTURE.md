# BLE P2P Chat — Architecture & Project Documentation

## Table of Contents

1. [Project Overview](#1-project-overview)
2. [Tech Stack](#2-tech-stack)
3. [Feature Phases](#3-feature-phases)
4. [Project Structure](#4-project-structure)
5. [Navigation](#5-navigation)
6. [State Management (Zustand Stores)](#6-state-management-zustand-stores)
7. [Services](#7-services)
8. [Transport Layer (Message Framing)](#8-transport-layer-message-framing)
9. [Storage Layer](#9-storage-layer)
10. [Screens](#10-screens)
11. [Hooks](#11-hooks)
12. [Components](#12-components)
13. [Utilities](#13-utilities)
14. [iOS Native Module](#14-ios-native-module)
15. [BLE Flow Diagrams](#15-ble-flow-diagrams)
16. [Key Data Flows](#16-key-data-flows)
17. [Dependencies](#17-dependencies)

---

## 1. Project Overview

**BLE P2P Chat** is a React Native + Expo application that turns two iOS devices into a peer-to-peer messaging system over **Bluetooth Low Energy**, requiring no internet, Wi-Fi, or server.

Each device can act as both a **Central** (scanner / client) and a **Peripheral** (advertiser / server) simultaneously. Devices discover each other via BLE scanning, perform a GATT handshake to exchange peer identities, then exchange messages using a custom chunked framing protocol. All conversations are persisted locally in SQLite.

**Core capabilities:**

- Scan for nearby BLE devices (any device, not just chat peers)
- Explore GATT services and characteristics of any connected device
- Run this device as a BLE peripheral (advertise a custom chat service)
- Discover and connect to other chat-capable peers
- Send and receive real-time messages over BLE (chunked, framed, reassembled)
- Persist full message history in a local SQLite database
- Restore the last scan session on app restart

---

## 2. Tech Stack

| Layer | Technology | Version |
|---|---|---|
| Framework | React Native + Expo | 0.83.2 / ~55.0.6 |
| Language | TypeScript | — |
| State | Zustand | ^5.0.11 |
| Navigation | React Navigation (bottom-tabs + native-stack) | ^7 |
| DB | expo-sqlite | ~55.0.10 |
| Prefs / Session cache | @react-native-async-storage/async-storage | ^2.2.0 |
| Animations | react-native-reanimated + react-native-worklets | ^4.2.1 / ^0.7.4 |
| BLE (iOS) | Custom Expo module: `expo-bluetooth-scanner` (CBCentralManager + CBPeripheralManager) | local |

---

## 3. Feature Phases

The project was built incrementally across five phases:

### Phase 0 — Foundation
- BLE scanner setup with `expo-bluetooth-scanner` native module
- Device list with RSSI, signal bars, distance estimation
- Favourites, auto-reconnect, sort modes
- Session persistence (last scan saved to AsyncStorage)

### Phase 1 — Peripheral Role
- iOS `CBPeripheralManager` integration
- Custom GATT service with PEER_ID / TX / RX characteristics
- `PeripheralScreen` — start/stop advertising, persisted device name
- `usePeripheral()` hook for full lifecycle management

### Phase 2 — Peer Discovery & State Machine
- `PeersScreen` — filters scan to devices advertising the chat GATT service
- Connection state machine: `discovered → connecting → handshaking → paired → disconnected`
- `PeerService.ts` — GATT handshake, reads remote peer ID, subscribes to TX characteristic
- `usePeers()` hook and `peerStore`

### Phase 3 — Message Framing & Chunking
- `framer.ts` — 5-byte binary header + 175-byte UTF-8 payload chunks
- `ChunkReassembler` — tracks in-flight multi-chunk messages per peer, fires callback on completion
- ATT MTU negotiation via `getMaxWriteLength()` after connection
- Handles messages of any length (up to ~44 KB / 255 chunks)

### Phase 4 — Chat UI & SQLite Persistence
- `ChatDb.ts` — SQLite `chat.db` with `messages` + `conversations` tables
- `ChatListScreen` — conversation list with unread badges
- `ChatDetailScreen` — full bubble UI, auto-scroll, offline detection, reconnect button
- Deep link from PeersScreen → ChatDetailScreen

---

## 4. Project Structure

```
MyApp/
├── app.json                          # Expo configuration
├── package.json
├── tsconfig.json
├── modules/
│   └── expo-bluetooth-scanner/       # Local Expo module (iOS Swift BLE)
│       └── ios/
│           └── ExpoBluetoothScannerModule.swift
└── src/
    ├── AppRoot.tsx                   # Entry point → AppNavigator
    ├── navigation/
    │   └── AppNavigator.tsx          # Bottom tabs + nested stacks
    ├── screens/
    │   ├── ScannerScreen.tsx         # BLE device scanner
    │   ├── GattDetailScreen.tsx      # GATT service / char explorer
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
    │   └── ScannerService.ts         # BLE scan, connect, name resolution
    ├── services/
    │   └── PeerService.ts            # GATT handshake, framed messaging
    ├── transport/
    │   └── framer.ts                 # Message encoding / ChunkReassembler
    ├── storage/
    │   ├── AsyncStorageService.ts    # Last scan session persistence
    │   └── ChatDb.ts                 # SQLite chat database
    ├── store/
    │   ├── scannerStore.ts           # Zustand: scanner state
    │   ├── peerStore.ts              # Zustand: peers + messages + conversations
    │   └── prefsStore.ts             # Zustand: persisted user prefs
    ├── components/
    │   ├── common/
    │   │   ├── EmptyState.tsx
    │   │   ├── SortChips.tsx
    │   │   ├── StateBadge.tsx
    │   │   └── Toggle.tsx
    │   └── scanner/
    │       ├── DeviceCard.tsx
    │       ├── GattCharacteristicRow.tsx
    │       ├── RadarView.tsx
    │       ├── RssiSparkline.tsx
    │       └── SignalBars.tsx
    └── utils/
        ├── time.ts
        ├── rssi.ts
        ├── gatt.ts
        ├── manufacturers.ts
        └── deviceName.ts
```

---

## 5. Navigation

```
AppNavigator (root)
└── BottomTabNavigator
    ├── Scanner tab → ScannerStackNavigator
    │   ├── ScannerScreen          (default)
    │   └── GattDetailScreen       (push on connect→tap)
    ├── Peripheral tab
    │   └── PeripheralScreen
    ├── Peers tab
    │   └── PeersScreen
    └── Chat tab → ChatStackNavigator
        ├── ChatListScreen         (default)
        └── ChatDetailScreen       (push on conversation tap)
```

Params passed to `ChatDetailScreen`:
```typescript
{ peerId: string; peerName: string; remotePeerId: string }
```

---

## 6. State Management (Zustand Stores)

### 6.1 `scannerStore` — BLE Scanner State

```typescript
interface ScannerDevice {
  id: string               // CBPeripheral UUID (iOS)
  name?: string | null
  rssi: number
  isConnectable: boolean
  serviceUUIDs?: string[]
  txPowerLevel?: number
  manufacturerId?: number
  timestamp: number
  firstSeen: number
  lastSeen: number
}

interface ScannerState {
  btState: 'poweredOn' | 'poweredOff' | 'unauthorized' | 'unsupported' | 'resetting' | 'unknown'
  scanning: boolean
  devices: ScannerDevice[]
  connState: Record<string, 'connected' | 'connecting' | 'disconnected' | 'failed'>
  rssiHistory: Record<string, number[]>   // last 20 readings per device
  search: string
  sortMode: 'rssi' | 'lastSeen' | 'name' | 'favorites'
  expandedId: string | null
  countdown: number                       // seconds remaining in scan
  error: string | null
  staleDevices: ScannerDevice[] | null    // cached from last session
  staleTimestamp: number | null
}
```

**Key actions:**
| Action | Effect |
|---|---|
| `batchUpsertDevices(updates[])` | Merge all buffered device events in a single `set()` — prevents re-render storm |
| `upsertDevice(device, isNew)` | Single device update (used by PeerService) |
| `setConnState(id, state)` | Update per-device connection state |
| `appendRssi(id, rssi)` | Push to rolling 20-value RSSI history |
| `setStaleSession(devices, ts)` | Store last-session snapshot |
| `updateDeviceName(id, name)` | Back-fill name from GATT resolution |

---

### 6.2 `peerStore` — P2P Chat State

```typescript
type PeerConnectionState =
  'discovered' | 'connecting' | 'handshaking' | 'paired' | 'disconnected' | 'failed'

interface Peer {
  id: string              // BLE device ID
  name: string
  rssi: number
  remotePeerId: string    // UUID read from PEER_ID_CHAR after handshake
  state: PeerConnectionState
  error?: string
  lastSeen: number
}

interface PeerMessage {
  peerId: string
  text: string
  ts: number
  outgoing: boolean
}

interface StoredConversation {
  peerId: string
  peerName: string
  remotePeerId: string
  lastText: string
  lastTs: number
  unread: number
}

interface PeerStoreState {
  scanning: boolean
  peers: Peer[]
  messages: PeerMessage[]                         // live buffer (last 500, all peers)
  conversations: StoredConversation[]             // from DB, sorted by lastTs DESC
  chatMessages: Record<string, PeerMessage[]>     // history cache keyed by peerId
}
```

**Key actions:**
| Action | Effect |
|---|---|
| `upsertPeer(partial)` | Add or refresh peer (name, rssi, lastSeen) |
| `setPeerState(id, state, remotePeerId?, error?)` | Drive connection state machine |
| `addMessage(msg)` | Push to live buffer (rolling 500-message window) |
| `setChatMessages(peerId, msgs)` | Populate history cache from DB load |
| `appendChatMessage(peerId, msg)` | Append incoming/outgoing to cache |
| `upsertConversation(conv)` | Update or create conversation, re-sort |
| `markRead(peerId)` | Zero unread count in store |

---

### 6.3 `prefsStore` — Persisted User Preferences

Persisted to AsyncStorage under key `'ble_prefs'` via Zustand `persist` middleware.

```typescript
interface PrefsState {
  favorites: string[]         // device IDs marked as favourite
  autoReconnect: boolean      // auto-reconnect favourites on disconnect
  advertisedName: string      // peripheral advertised name (default: 'MyBLEDevice')

  toggleFavorite(id: string): void
  setAutoReconnect(v: boolean): void
  setAdvertisedName(n: string): void
  isFavorite(id: string): boolean
}
```

---

## 7. Services

### 7.1 `ScannerService` — BLE Scanner Lifecycle

**File:** `src/scanner/ScannerService.ts`

Singleton instantiated once in `useScanner()` and never destroyed.

**Responsibilities:**
- Subscribe to all native BLE events (scan state, device found, connection state, GATT events, errors)
- Start/stop scans (`startScan()` → 15-second timeout with countdown)
- Connect / disconnect devices
- Perform GATT name resolution for devices missing a display name
- Schedule auto-reconnect for favourites after unexpected disconnect

**Batching (prevents UI freeze):**

`allowDuplicates: true` means advertisement packets arrive up to hundreds of times per second for many nearby devices. To avoid flooding the JS thread, `ScannerService` accumulates events in a `deviceUpdateBuffer` (a `Map<id, BluetoothDevice>`, keeping only the latest data per device). A 300 ms debounced timer then calls `_flushDeviceBuffer()` which issues a single `batchUpsertDevices()` call.

**GATT name resolution flow:**

```
Device connected (auto-connect for name resolution)
  ↓ discoverServices()
  ↓ discoverCharacteristics(Generic Access — 0x1800)
  ↓ readCharacteristic(Device Name — 0x2A00)
  ↓ updateDeviceName(id, name) → store
```

**Internal fields:**
```typescript
private seenIds = new Set<string>()
private deviceUpdateBuffer = new Map<string, BluetoothDevice>()
private flushScheduled = false
private reconnectTimers: Record<string, ReturnType<typeof setTimeout>> = {}
private nameResolutionInProgress = new Set<string>()
private countdownInterval: ReturnType<typeof setInterval> | null = null
```

---

### 7.2 `PeerService` — P2P Chat GATT Handshake & Messaging

**File:** `src/services/PeerService.ts`

Singleton instantiated once in `usePeers()`.

**Custom GATT UUIDs:**

```
Chat Service:   12345678-0000-4B5A-8000-52454D4F5445
  PEER_ID_CHAR  12345679-...   [read + notify]  → remote peer's stable UUID
  TX_CHAR       1234567A-...   [notify only]    → peer → us (incoming messages)
  RX_CHAR       1234567B-...   [write]          → us → peer (outgoing messages)
```

**Handshake sequence:**

```
Central                               Peripheral
────────                              ─────────
connect(deviceId)
  ↓
onConnectionStateChanged('connected')
  ↓
discoverServices(CHAT_SERVICE)
  ↓
discoverCharacteristics(all)
  ↓
readCharacteristic(PEER_ID_CHAR)  →  read response (UUID string)
subscribeCharacteristic(TX_CHAR)  →  subscribe acknowledged
  ↓
state = 'paired' ✓                    Ready to send notifications
```

**Outgoing message flow:**

```
sendMessage(deviceId, text)
  ↓
encodeFrames(text)               → string[] of base64 frames
  ↓
getMaxWriteLength(deviceId)      → e.g. 182 bytes ATT MTU
  ↓
for each frame:
  writeCharacteristic(RX_CHAR, frame, noResponse=true)
  ↓
insertMessage(DB) + addMessage(store)
upsertConversation(..., incrUnread=false)
```

**Incoming message flow:**

```
TX_CHAR notification fires
  ↓
reassembler.receive(peerId, b64Frame)
  ↓ (all chunks arrived?)
onComplete(text)
  ↓
insertMessage(DB) + addMessage(store) + appendChatMessage(store)
upsertConversation(..., incrUnread=true)
```

**Internal fields:**
```typescript
private handshakingPeers = new Set<string>()
private pairedPeers = new Set<string>()
private reassembler: ChunkReassembler
```

---

## 8. Transport Layer (Message Framing)

**File:** `src/transport/framer.ts`

BLE write operations have a maximum payload determined by ATT MTU negotiation (~182 bytes on iOS). Long messages are split into chunks automatically.

### Frame Binary Format

```
Offset  Size  Field         Description
──────  ────  ─────         ───────────
0       2     msgId         uint16, wraps at 0xFFFF; unique per message
2       1     chunkIdx      uint8, 0-based index of this chunk
3       1     totalChunks   uint8, total chunks in message (1–255)
4       1     flags         uint8, reserved (always 0x00)
5+      N     payload       UTF-8 encoded text bytes for this chunk
```

- **Default payload size:** 175 bytes
- **Total frame size:** 180 bytes (well within ~182 byte ATT MTU)
- Payload size is tunable via `setChunkSize(maxWriteBytes)` after calling `getMaxWriteLength()`

### Encoding

```typescript
function encodeFrames(text: string): string[] {
  // 1. Allocate unique msgId (allocMsgId++)
  // 2. UTF-8 encode text → Uint8Array
  // 3. Split into 175-byte chunks
  // 4. Prepend 5-byte header to each chunk
  // 5. Base64-encode → string (safe for BLE write)
  // 6. Return string[]
}
```

### Decoding — ChunkReassembler

```typescript
class ChunkReassembler {
  private buffers = new Map<string, Map<number, Uint8Array>>()  // "peerId:msgId" → chunks

  receive(peerId: string, b64Frame: string): void {
    // Base64 decode → Uint8Array
    // Extract header: msgId, chunkIdx, totalChunks
    // Store chunk at chunkIdx
    // If all totalChunks received:
    //   Concatenate in order → UTF-8 decode → call onComplete(text)
    //   Clean up buffer
  }

  onComplete: (peerId: string, text: string) => void  // set by PeerService
}
```

**Limits:** Max 255 chunks × 175 bytes = ~44 KB per message. Average chat message = 1 chunk.

---

## 9. Storage Layer

### 9.1 AsyncStorageService — Last Scan Session

**File:** `src/storage/AsyncStorageService.ts`  
**AsyncStorage key:** `'ble_last_scan'`

```typescript
interface LastSession {
  devices: ScannerDevice[]
  ts: number
}

saveLastSession(devices: ScannerDevice[]): Promise<void>
loadLastSession(): Promise<LastSession | null>
```

Called automatically:
- **Save:** when scan stops (if device list non-empty)
- **Load:** on app start via `useScanner()` → populates `staleDevices` in the scanner store

---

### 9.2 ChatDb — SQLite Message & Conversation Store

**File:** `src/storage/ChatDb.ts`  
**Database:** `chat.db` (expo-sqlite)

#### Schema

```sql
CREATE TABLE IF NOT EXISTS messages (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  peerId      TEXT    NOT NULL,
  remotePeerId TEXT   NOT NULL DEFAULT '',
  text        TEXT    NOT NULL,
  ts          INTEGER NOT NULL,
  outgoing    INTEGER NOT NULL DEFAULT 0   -- 0 = incoming, 1 = outgoing
);

CREATE INDEX IF NOT EXISTS idx_messages_peer_ts ON messages(peerId, ts);

CREATE TABLE IF NOT EXISTS conversations (
  peerId       TEXT    PRIMARY KEY,
  peerName     TEXT    NOT NULL DEFAULT '',
  remotePeerId TEXT    NOT NULL DEFAULT '',
  lastText     TEXT    NOT NULL DEFAULT '',
  lastTs       INTEGER NOT NULL DEFAULT 0,
  unread       INTEGER NOT NULL DEFAULT 0
);
```

#### Operations

```typescript
initDb(): Promise<void>                              // CREATE TABLE IF NOT EXISTS

insertMessage(
  peerId: string,
  remotePeerId: string,
  text: string,
  ts: number,
  outgoing: boolean
): Promise<void>

loadMessages(peerId: string, limit = 200): Promise<PeerMessage[]>  // oldest first

upsertConversation(
  peerId: string,
  peerName: string,
  remotePeerId: string,
  lastText: string,
  lastTs: number,
  incrUnread: boolean
): Promise<void>

loadConversations(): Promise<StoredConversation[]>   // ordered by lastTs DESC

markConversationRead(peerId: string): Promise<void>  // SET unread = 0
```

---

## 10. Screens

### 10.1 ScannerScreen

**File:** `src/screens/ScannerScreen.tsx`

The main BLE device discovery screen. Shows all nearby BLE devices regardless of type.

**Features:**
- **Real-time search** by device name or ID
- **Sort modes:** RSSI (signal strength), Last Seen, Name (A–Z), Favorites (filtered to favorites only)
- **Device cards** — collapsible, showing:
  - Name (inferred from manufacturer / advertised services if not in packet)
  - RSSI in dBm + signal bars + estimated distance
  - Tags: connectable, iBeacon, manufacturer name, service names
  - Expanded: RSSI history sparkline, first/last seen timestamps, TX power
- **Connect / Disconnect** button per device
- **Favorite toggle** (star icon, persisted to AsyncStorage)
- **Stale session banner** — shows last-session devices if no active scan
- **Scan Controls:** Start/Stop + countdown (15 seconds)
- **Auto-reconnect toggle** in header

---

### 10.2 GattDetailScreen

**File:** `src/screens/GattDetailScreen.tsx`

GATT service explorer for any connected device.

**Features:**
- Lists all discovered services with UUID + resolved name
- Per characteristic:
  - Properties: READ / WRITE / NOTIFY
  - **Read** — fetch current value, decoded to text/uint16/hex
  - **Write** — prompt for hex or text input
  - **Subscribe** — toggle live notifications
  - **History** — toggle showing last 50 values timestamped
- Powered by `useGattDetail(deviceId)` hook

---

### 10.3 PeripheralScreen

**File:** `src/screens/PeripheralScreen.tsx`

Runs this device as a BLE peripheral server, advertising the custom chat GATT service.

**Features:**
- **Local Peer ID** — stable UUID shown to identify this device
- **Advertised Name** — editable text field; persisted to `prefsStore.advertisedName`
  - Name is embedded in advertisement packets on `start()` — changing it while advertising has no effect; Stop + Start is required
  - Field is disabled while advertising to make this clear
- **BLE state badge** — powered on / off / unsupported
- **Start / Stop advertising** button
- **Subscriber count** — number of centrals subscribed to TX_CHAR
- **Send message** — encoded and notified to all subscribers
- **Received messages list** — rolling 100-message buffer

---

### 10.4 PeersScreen

**File:** `src/screens/PeersScreen.tsx`

Peer discovery and quick messaging. Only shows devices advertising the chat GATT service.

**Features:**
- **Scan** — 5-second targeted scan (filter by CHAT_SERVICE UUID)
- **Peer cards** with connection state:
  - `discovered` → `connecting` → `handshaking` → `paired`
  - RSSI + remote peer ID once paired
- **Action buttons:** Connect / Disconnect / Remove / Open Chat
- **Inline chat panel** (when expanded + paired):
  - Last 20 messages (bubble UI, in/out)
  - Message input + Send
- **Sorted:** active states (paired/handshaking) first, then by lastSeen

---

### 10.5 ChatListScreen

**File:** `src/screens/ChatListScreen.tsx`

Shows all past conversations loaded from SQLite.

**Features:**
- Conversation row: avatar, peer name, last message preview, timestamp, unread badge (max "99+")
- Empty state when no conversations
- Tap → navigate to `ChatDetailScreen`

---

### 10.6 ChatDetailScreen

**File:** `src/screens/ChatDetailScreen.tsx`

Full persistent chat UI for a specific peer.

**Features:**
- **Offline status bar** — shows "Peer offline" when peer is `disconnected`/`failed`, with a Reconnect button
- **Message bubbles** — outgoing right (blue), incoming left (gray)
- **Time separators** — shown between messages >5 minutes apart
- **Auto-scroll** to latest message
- **Input disabled** until peer is `paired`
- **Max 4000 characters** per message
- **On mount:** load history from DB → `chatMessages[peerId]`
- **On focus:** mark conversation as read (clears unread badge in ChatList)
- **Live updates:** new messages appended via `appendChatMessage` in store

---

## 11. Hooks

### `useScanner()`

**File:** `src/hooks/useScanner.ts`

Central scanner hook. Sets up `ScannerService` once (singleton pattern) and exposes the full scanner store + actions.

**Lifecycle:**
1. Mount: call `scannerService.subscribe()` once
2. Load last session → `setStaleSession()`
3. AppState listener: stop scan when app goes to background
4. Service stays alive for the app lifetime

---

### `usePeers()`

**File:** `src/hooks/usePeers.ts`

Peer chat hook. Wraps `PeerService` and `peerStore`, adds DB helpers.

**DB helpers:**
```typescript
loadChatHistory(peerId: string): void
  // loadMessages(peerId) from DB → setChatMessages(peerId, msgs)

markRead(peerId: string): void
  // markConversationRead(DB) + store.markRead(peerId)
```

---

### `usePeripheral()`

**File:** `src/hooks/usePeripheral.ts`

Peripheral lifecycle hook.

Returns:
```typescript
{
  localPeerId: string
  peripheralState: BluetoothState
  isAdvertising: boolean
  subscriberCount: number
  receivedMessages: Array<{ from: string; text: string; ts: number }>
  error?: string
  start(localName: string): void
  stop(): void
  send(text: string): void
}
```

---

### `useGattDetail(deviceId)`

**File:** `src/hooks/useGattDetail.ts`

GATT explorer hook. Manages service discovery, characteristic reads/writes/subscriptions, and value history.

Returns:
```typescript
{
  services: GattService[]
  characteristics: Record<svcUuid, GattCharacteristic[]>
  values: Record<charUuid, string>       // base64
  notifying: Record<charUuid, boolean>
  charHistory: Record<charUuid, Array<{ value: string; ts: number }>>
  expandedHistory: Record<charUuid, boolean>
  loading: boolean
  error?: string
  discover(): void
  readChar(svcUuid, charUuid): void
  toggleSubscribe(svcUuid, charUuid): void
  toggleHistory(charUuid): void
  cleanup(): void
}
```

---

## 12. Components

| Component | File | Purpose |
|---|---|---|
| `DeviceCard` | `components/scanner/DeviceCard.tsx` | Collapsible device row: RSSI, bars, distance, tags, sparkline |
| `GattCharacteristicRow` | `components/scanner/GattCharacteristicRow.tsx` | Characteristic read/write/notify row with value history |
| `SignalBars` | `components/scanner/SignalBars.tsx` | 4-bar signal strength visual |
| `RssiSparkline` | `components/scanner/RssiSparkline.tsx` | Line chart of last 20 RSSI readings |
| `RadarView` | `components/scanner/RadarView.tsx` | Animated scanning radar ring |
| `SortChips` | `components/common/SortChips.tsx` | Horizontal sort mode selector |
| `StateBadge` | `components/common/StateBadge.tsx` | Colored BLE state pill |
| `Toggle` | `components/common/Toggle.tsx` | On/off switch |
| `EmptyState` | `components/common/EmptyState.tsx` | Placeholder with icon and text |

---

## 13. Utilities

| File | Functions | Purpose |
|---|---|---|
| `utils/time.ts` | `timeAgo(ts)` | Relative time string: "just now", "5m ago", "Yesterday" |
| `utils/rssi.ts` | `rssiToBars(rssi)`, `rssiColor(rssi)`, `estimateDistance(rssi, txPower?)` | RSSI → UI signal indicators |
| `utils/gatt.ts` | `uuidToName(uuid)`, `decodeCharValue(uuid, b64)` | GATT UUID → standard name; base64 value → readable text/hex/uint16 |
| `utils/manufacturers.ts` | `manufacturerName(id)` | BLE SIG company ID → name (Apple=76, Google=224, …) |
| `utils/deviceName.ts` | `inferDeviceName(device)` | Infer display name from manufacturer ID or service UUIDs when BLE name is absent |

---

## 14. iOS Native Module

**Module:** `expo-bluetooth-scanner` (local, `modules/expo-bluetooth-scanner/`)  
**Implementation:** `ios/ExpoBluetoothScannerModule.swift`

### Architecture

The Swift module exposes two distinct BLE roles:

**Central Manager (CBCentralManager) — Scanner**
- `startScan()` / `stopScan()`
- `connectToDevice(id)` / `disconnectDevice(id)`
- `discoverServices(id, uuids[])` / `discoverCharacteristics(id, svcUuid, charUuids[])`
- `readCharacteristic(id, svcUuid, charUuid)`
- `writeCharacteristic(id, svcUuid, charUuid, base64, withResponse)`
- `subscribeCharacteristic(id, svcUuid, charUuid)` / `unsubscribeCharacteristic(...)`
- `getMaxWriteLength(id)` → number (ATT MTU after negotiation)

**Peripheral Manager (CBPeripheralManager) — Advertiser**
- `startAdvertising(name, serviceUuid)` / `stopAdvertising()`
- `sendMessage(base64Frame)` → notify to all subscribed centrals

**Events emitted to JS:**
```
bluetoothStateChanged      { state }
scanStateChanged           { isScanning }
deviceFound                { id, name, rssi, serviceUUIDs, txPowerLevel, manufacturerId, isConnectable }
connectionStateChanged     { id, state }          -- 'connected' | 'disconnected' | 'failed'
servicesDiscovered         { id, services[] }
characteristicsDiscovered  { id, svcUuid, characteristics[] }
characteristicRead         { id, svcUuid, charUuid, value }    -- base64
characteristicChanged      { id, svcUuid, charUuid, value }    -- notify
peripheralStateChanged     { state }
subscriberCountChanged     { count }
messageReceived            { centralId, value }   -- base64 frame, peripheral side
bleError                   { message }
```

**Implementation notes:**
- Device name is cached in a `nameCache: [UUID: String]` to avoid empty-name flicker
- ATT MTU negotiated automatically; `getMaxWriteLength()` returns the safe write size
- Max BLE write payload without response: ~182 bytes (iOS default ATT MTU = 185 − 3 byte header)

---

## 15. BLE Flow Diagrams

### 15.1 Device Discovery & Batched Updates

```
startScan()
  │
  ├─ CBCentralManager.scanForPeripherals(allowDuplicates: true)
  │
  ├─ Every ~50–200ms per nearby device:
  │     onDeviceFound(BluetoothDevice)
  │       ↓
  │     deviceUpdateBuffer.set(id, device)  ← map: keeps latest per device
  │       ↓
  │     (schedule flush if not scheduled)
  │         setTimeout(_flushDeviceBuffer, 300ms)
  │
  └─ Every 300ms:
        _flushDeviceBuffer()
          ↓
        batchUpsertDevices([...buffer.values()])   ← SINGLE store.set()
          ↓
        store.devices[] + store.rssiHistory[] updated
          ↓
        ScannerScreen re-renders (useMemo → sorted list → FlatList)
```

### 15.2 GATT Name Resolution

```
New device discovered (no name in advertisement)
  ↓
connect(deviceId)  [auto, for name resolution only]
  ↓
onConnectionStateChanged('connected')
  ↓
discoverServices([Generic Access — 0x1800])
  ↓
discoverCharacteristics([Device Name — 0x2A00])
  ↓
readCharacteristic(0x2A00)
  ↓
onCharacteristicRead → updateDeviceName(id, name)
  ↓
disconnect(deviceId)  [immediately after, if user hasn't connected manually]
```

### 15.3 Chat Peer Handshake

```
Central (PeersScreen)                        Peripheral (PeripheralScreen)
──────────────────────                       ─────────────────────────────
[scan for CHAT_SERVICE]                      [advertising CHAT_SERVICE]
         │                                              │
         ↓ (device found in scan)                       │
  upsertPeer → state: 'discovered'                      │
         │                                              │
  connect(deviceId)                                     │
         ↓                                              ↓
  state: 'connecting'                     Accept connection
         │                                              │
  onConnectionStateChanged('connected')                 │
  discoverServices(CHAT_SERVICE)                        │
  discoverCharacteristics()                             │
         │                                              │
  state: 'handshaking'                                  │
         │                                              │
  readCharacteristic(PEER_ID_CHAR) ──────────→ respond with UUID string
  subscribeCharacteristic(TX_CHAR) ──────────→ record subscription
         │                                              │
  onCharacteristicRead(PEER_ID_CHAR)                    │
  → setPeerState(id, 'paired', remotePeerId)            │
         │                                              │
  state: 'paired' ✓                        Ready to notify TX_CHAR
```

### 15.4 Message Send / Receive

```
Text input: "Hello!"

encodeFrames("Hello!")
  → [ "AAECAABIAAAA...base64..." ]   ← 1 frame (short message)

writeCharacteristic(RX_CHAR, frame, noResponse=true)
  ────────────────────────────────────────────────→
                                      onWrite(RX_CHAR, centralId, frame)
                                        ↓
                                      reassembler.receive(centralId, frame)
                                        ↓  (all chunks arrived)
                                      onComplete("Hello!")
                                        ↓
                                      insertMessage(DB)
                                      upsertConversation(..., unread++)
                                      appendChatMessage(store)
                                        ↓
                                      ChatDetailScreen re-renders
```

---

## 16. Key Data Flows

### 16.1 Native Event → UI (general pattern)

```
iOS Swift callback
  ↓
Expo module emits event (sendEvent / EventEmitter)
  ↓
JS listener registered in ScannerService / PeerService
  ↓
Zustand store.set({...})
  ↓
All hook subscribers (useScannerStore / usePeerStore) receive new state
  ↓
Components re-render → FlatList / Text / Button updated
```

### 16.2 Chat Persistence Round-Trip

```
Outgoing message:
  ChatDetailScreen → usePeers().send(peerId, text)
    → PeerService.sendMessage()
      → encodeFrames() → writeCharacteristic()
      → insertMessage(DB, outgoing=true)
      → upsertConversation(DB, incrUnread=false)
      → appendChatMessage(store) → UI updates

Incoming message (TX_CHAR notification):
  Native event → PeerService listener
    → reassembler.receive()
      → (complete) onComplete(text)
      → insertMessage(DB, outgoing=false)
      → upsertConversation(DB, incrUnread=true)
      → appendChatMessage(store) → ChatDetailScreen updates
      → upsertConversation(store) → ChatListScreen unread badge updates

User opens ChatDetailScreen:
  → loadChatHistory(peerId) → loadMessages(DB, 200)
  → setChatMessages(store)  → FlatList renders full history
  → markRead(peerId) on screen focus → zero badge

App restart:
  → initDb() → loadConversations() → setConversations(store)
  → ChatListScreen shows all previous conversations immediately
```

### 16.3 Advertised Name Persistence

```
User types in name field (PeripheralScreen)
  → setLocalName (local React state)   — updates input field
  → setAdvertisedName (prefsStore)     — persists to AsyncStorage

User navigates away and back:
  → useState(() => prefsStore.advertisedName)   ← initializes from persisted value
  → name field shows last typed name ✓

User presses Start Advertising:
  → start(localName)
  → CBPeripheralManager.startAdvertising({ CBAdvertisementDataLocalNameKey: localName })
  → Other devices scan → see this name in advertisement packet
  → Name can only change by stopping + starting advertising again
```

---

## 17. Dependencies

| Package | Version | Used For |
|---|---|---|
| `react-native` | ^0.83.2 | Core framework |
| `expo` | ~55.0.6 | Build tooling + module system |
| `expo-sqlite` | ~55.0.10 | Chat message + conversation persistence |
| `@react-native-async-storage/async-storage` | ^2.2.0 | Prefs + last scan session |
| `zustand` | ^5.0.11 | Global state management (scanner, peers, prefs) |
| `@react-navigation/native` | ^7 | Navigation host |
| `@react-navigation/bottom-tabs` | ^7 | Bottom tab bar |
| `@react-navigation/native-stack` | ^7 | Stack navigators (Scanner, Chat) |
| `react-native-reanimated` | ^4.2.1 | Card expand/collapse, radar animation |
| `react-native-worklets` | ^0.7.4 | Low-level worklet support for reanimated |
| `expo-bluetooth-scanner` | local | CBCentralManager + CBPeripheralManager bridge |

---

*Documentation generated: March 2026*
