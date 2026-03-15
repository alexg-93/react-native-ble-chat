import {
  startScan, stopScan,
  connectToDevice, disconnectDevice,
  discoverServices, discoverCharacteristics,
  readCharacteristic, writeCharacteristic, subscribeCharacteristic,
  getMaxWriteLength,
  addDeviceFoundListener, addScanStateListener,
  addConnectionStateListener,
  addServicesDiscoveredListener,
  addCharacteristicsDiscoveredListener,
  addCharacteristicReadListener,
  addCharacteristicChangedListener,
  addMessageReceivedListener,
} from '../../modules/expo-bluetooth-scanner';
import type { BluetoothDevice } from '../../modules/expo-bluetooth-scanner';
import { usePeerStore } from '../store/peerStore';
import {
  encodeFramesWithId, encodeAck, ChunkReassembler, setChunkSize,
} from '../transport/framer';
import type { OnAck } from '../transport/framer';
import {
  initDb, insertMessage, updateMessageStatus, upsertConversation, loadConversations,
} from '../storage/ChatDb';

// ── Chat service / characteristic UUIDs (must match Swift BLEChatUUIDs) ────────
const CHAT_SERVICE = '12345678-0000-4B5A-8000-52454D4F5445';
const PEER_ID_CHAR = '12345679-0000-4B5A-8000-52454D4F5445'; // read + notify
const TX_CHAR      = '1234567A-0000-4B5A-8000-52454D4F5445'; // notify  (peer → us)
const RX_CHAR      = '1234567B-0000-4B5A-8000-52454D4F5445'; // write   (us → peer)

const SCAN_TIMEOUT_S = 15;
const MAX_RETRIES = 3;
const ACK_TIMEOUT_MS = 5000;

interface PendingOutbound {
  localId: number;
  deviceId: string;
  text: string;
  frames: string[];
  msgId: number;
  attempts: number;
  timer: ReturnType<typeof setTimeout> | null;
}

// ── PeerService ────────────────────────────────────────────────────────────────
//
// Responsibilities:
//   1. Filter onDeviceFound for devices advertising CHAT_SERVICE UUID
//   2. Drive the GATT handshake after connect:
//        connect → discoverServices → discoverCharacteristics(CHAT_SERVICE)
//        → readCharacteristic(PEER_ID_CHAR) + subscribeCharacteristic(TX_CHAR)
//        → state = 'paired'
//   3. Deliver TX notifications as incoming messages
//   4. Encode and write outgoing messages to RX characteristic
//
// Coordination with ScannerService:
//   Both register listeners on the same events. Each guards its handlers with
//   its own tracked ID sets (handshakingPeers / nameResolutionInProgress) so
//   they operate independently without interference.
// ───────────────────────────────────────────────────────────────────────────────
class PeerService {
  private subs: Array<{ remove: () => void }> = [];
  /** Peers currently running through the GATT handshake. */
  private handshakingPeers = new Set<string>();
  /** Peers that completed handshake and are ready to message. */
  private pairedPeers = new Set<string>();
  /** Pending outbound messages awaiting ACK, keyed by msgId. */
  private retryQueue = new Map<number, PendingOutbound>();

  /**
   * Peripheral-role reassembler: handles frames written by centrals to OUR RX_CHAR.
   * This is the path used when the remote device sends via writeCharacteristic
   * (i.e. both devices are on PeersScreen / acting as central + peripheral).
   * Routes received messages into peerStore so they appear in Quick Chat & ChatDetail.
   */
  private peripheralReassembler = new ChunkReassembler(
    // onComplete: a central wrote a full message to our RX_CHAR
    (text, { peerId: centralId, msgId }) => {
      const store = usePeerStore.getState();
      const peer = store.peers.find((p) => p.id === centralId);
      if (!peer) return; // unknown central — not one of our paired peers, ignore
      const ts = Date.now();
      const msg = { peerId: centralId, text, ts, outgoing: false };
      store.addMessage(msg);
      store.appendChatMessage(centralId, msg);
      try {
        insertMessage(centralId, peer.remotePeerId, text, ts, false);
        upsertConversation(
          centralId, peer.name ?? centralId.slice(0, 8), peer.remotePeerId,
          text, ts, true,
        );
        store.upsertConversation({
          peerId: centralId, peerName: peer.name ?? centralId.slice(0, 8),
          remotePeerId: peer.remotePeerId, lastText: text, lastTs: ts, unread: 1,
        });
      } catch { /* DB write errors must not crash the app */ }
      // Send ACK back: write to the central's RX_CHAR
      // (we are already connected to that device as a central too, so
      //  writeCharacteristic targeting centralId works if paired)
      try {
        writeCharacteristic(centralId, CHAT_SERVICE, RX_CHAR, encodeAck(msgId), false);
      } catch { /* ACK is best-effort */ }
    },
    // onAck: the remote device ACKed one of our outgoing messages via a RX write
    ((centralId: string, ackMsgId: number) => {
      this._handleAck(centralId, ackMsgId);
    }) as OnAck,
  );

  /** Reassembles chunked TX notifications into complete messages. */
  private reassembler = new ChunkReassembler(
    // onComplete: incoming message arrived
    (text, { peerId, msgId }) => {
      const peer = usePeerStore.getState().peers.find((p) => p.id === peerId);
      const msg = { peerId, text, ts: Date.now(), outgoing: false };
      usePeerStore.getState().addMessage(msg);
      usePeerStore.getState().appendChatMessage(peerId, msg);
      // Persist to DB
      try {
        insertMessage(peerId, peer?.remotePeerId ?? '', text, msg.ts, false);
        const conv = {
          peerId,
          peerName: peer?.name ?? peerId.slice(0, 8),
          remotePeerId: peer?.remotePeerId ?? '',
          lastText: text,
          lastTs: msg.ts,
          unread: 1,
        };
        upsertConversation(conv.peerId, conv.peerName, conv.remotePeerId, conv.lastText, conv.lastTs, true);
        usePeerStore.getState().upsertConversation({ ...conv });
      } catch { /* DB write errors must not crash the app */ }
      // Send ACK back to sender over RX_CHAR
      try {
        writeCharacteristic(peerId, CHAT_SERVICE, RX_CHAR, encodeAck(msgId), false);
      } catch { /* non-fatal — ACK best-effort */ }
    },
    // onAck: our outgoing message was delivered
    ((peerId: string, ackMsgId: number) => {
      this._handleAck(peerId, ackMsgId);
    }) as OnAck,
  );

  // ── Lifecycle ──────────────────────────────────────────────────────────────

  subscribe() {
    // Init SQLite and pre-load conversation list
    try {
      initDb();
      usePeerStore.getState().setConversations(loadConversations());
    } catch { /* non-fatal; DB features degrade gracefully */ }

    // 1. Track native scan state
    this.subs.push(
      addScanStateListener((e) => {
        usePeerStore.getState().setScanning(e.isScanning);
      }),
    );

    // 2. Device found — only process peers advertising our chat service
    this.subs.push(
      addDeviceFoundListener((d: BluetoothDevice) => {
        if (!this._isChatPeer(d)) return;
        usePeerStore.getState().upsertPeer({
          id: d.id,
          name: d.name || d.id.slice(0, 8),
          rssi: d.rssi,
          lastSeen: Date.now(),
        });
      }),
    );

    // 3. Connection state changes
    this.subs.push(
      addConnectionStateListener((evt) => {
        const { id, state } = evt;
        // Only handle peers we're tracking
        const peer = usePeerStore.getState().peers.find((p) => p.id === id);
        if (!peer) return;

        if (state === 'connected') {
          this.handshakingPeers.add(id);
          usePeerStore.getState().setPeerState(id, 'handshaking');
          // Tune chunk size to this connection's real ATT MTU
          try {
            const maxWrite = getMaxWriteLength(id);
            if (maxWrite > 5) setChunkSize(maxWrite);
          } catch { /* ignore — framer keeps its last-set value */ }
          // Start GATT handshake
          discoverServices(id);
        }

        if (state === 'disconnected') {
          this.handshakingPeers.delete(id);
          this.pairedPeers.delete(id);
          this.reassembler.clear(id);
          this.peripheralReassembler.clear(id);
          this._cancelPendingForDevice(id);
          usePeerStore.getState().setPeerState(id, 'disconnected', undefined, evt.error);
        }

        if (state === 'failed') {
          this.handshakingPeers.delete(id);
          this.pairedPeers.delete(id);
          this.reassembler.clear(id);
          this.peripheralReassembler.clear(id);
          this._cancelPendingForDevice(id);
          usePeerStore.getState().setPeerState(id, 'failed', undefined, evt.error ?? 'Connection failed');
        }
      }),
    );

    // 4. Services discovered → look for our chat service
    this.subs.push(
      addServicesDiscoveredListener((evt) => {
        if (!this.handshakingPeers.has(evt.id)) return;
        const hasChatService = evt.services.some(
          (s) => s.uuid.toUpperCase() === CHAT_SERVICE,
        );
        if (hasChatService) {
          discoverCharacteristics(evt.id, CHAT_SERVICE);
        } else {
          this.handshakingPeers.delete(evt.id);
          usePeerStore.getState().setPeerState(
            evt.id, 'failed', undefined, 'Chat service not found on peer'
          );
        }
      }),
    );

    // 5. Characteristics discovered → read Peer-ID + subscribe TX
    this.subs.push(
      addCharacteristicsDiscoveredListener((evt) => {
        if (!this.handshakingPeers.has(evt.id)) return;
        if (evt.serviceUUID.toUpperCase() !== CHAT_SERVICE) return;

        const hasPeerIdChar = evt.characteristics.some(
          (c) => c.uuid.toUpperCase() === PEER_ID_CHAR,
        );
        if (!hasPeerIdChar) {
          this.handshakingPeers.delete(evt.id);
          usePeerStore.getState().setPeerState(
            evt.id, 'failed', undefined, 'Peer-ID characteristic not found'
          );
          return;
        }

        for (const c of evt.characteristics) {
          if (c.uuid.toUpperCase() === PEER_ID_CHAR) {
            readCharacteristic(evt.id, CHAT_SERVICE, PEER_ID_CHAR);
          }
          if (c.uuid.toUpperCase() === TX_CHAR) {
            subscribeCharacteristic(evt.id, CHAT_SERVICE, TX_CHAR);
          }
        }
      }),
    );

    // 6. Peer-ID read → handshake complete → paired
    this.subs.push(
      addCharacteristicReadListener((evt) => {
        if (!this.handshakingPeers.has(evt.id)) return;
        if (evt.charUUID.toUpperCase() !== PEER_ID_CHAR) return;

        if (evt.error) {
          this.handshakingPeers.delete(evt.id);
          usePeerStore.getState().setPeerState(
            evt.id, 'failed', undefined, `Handshake failed: ${evt.error}`
          );
          return;
        }

        this.handshakingPeers.delete(evt.id);
        this.pairedPeers.add(evt.id);

        let remotePeerId = '';
        if (evt.value) {
          try { remotePeerId = atob(evt.value); } catch { remotePeerId = evt.value; }
        }
        usePeerStore.getState().setPeerState(evt.id, 'paired', remotePeerId);
      }),
    );

    // 7. TX notification → feed frame into reassembler
    this.subs.push(
      addCharacteristicChangedListener((evt) => {
        if (evt.charUUID.toUpperCase() !== TX_CHAR) return;
        if (!this.pairedPeers.has(evt.id)) return;
        this.reassembler.receive(evt.id, evt.value);
      }),
    );

    // 8. RX write (peripheral role) → feed frame into peripheralReassembler.
    // This fires when a remote central writes to OUR RX_CHAR, which is the path
    // used by peerService.sendMessage on the remote device. Routing it here means
    // messages are visible in peerStore (PeersScreen Quick Chat + ChatDetailScreen)
    // even when both devices are on the Peers tab (central + peripheral simultaneously).
    this.subs.push(
      addMessageReceivedListener((evt) => {
        this.peripheralReassembler.receive(evt.centralId, evt.value);
      }),
    );
  }

  unsubscribe() {
    this.subs.forEach((s) => s.remove());
    this.subs = [];
  }

  // ── Public actions ─────────────────────────────────────────────────────────

  startScan() {
    usePeerStore.getState().clearPeers();
    usePeerStore.getState().setScanning(true);
    startScan(true, SCAN_TIMEOUT_S);
  }

  stopScan() {
    stopScan();
  }

  connect(deviceId: string) {
    usePeerStore.getState().setPeerState(deviceId, 'connecting');
    connectToDevice(deviceId);
  }

  disconnect(deviceId: string) {
    this.handshakingPeers.delete(deviceId);
    this.pairedPeers.delete(deviceId);
    this.reassembler.clear(deviceId);
    this.peripheralReassembler.clear(deviceId);
    this._cancelPendingForDevice(deviceId);
    disconnectDevice(deviceId);
  }

  sendMessage(deviceId: string, text: string) {
    const { frames, msgId } = encodeFramesWithId(text);
    const peer = usePeerStore.getState().peers.find((p) => p.id === deviceId);
    const ts = Date.now();
    let localId = -1;
    try {
      localId = insertMessage(deviceId, peer?.remotePeerId ?? '', text, ts, true, 'sending');
      const conv = {
        peerId: deviceId,
        peerName: peer?.name ?? deviceId.slice(0, 8),
        remotePeerId: peer?.remotePeerId ?? '',
        lastText: text,
        lastTs: ts,
        unread: 0,
      };
      upsertConversation(conv.peerId, conv.peerName, conv.remotePeerId, conv.lastText, conv.lastTs, false);
      usePeerStore.getState().upsertConversation({ ...conv });
    } catch { /* non-fatal */ }

    const msg = { peerId: deviceId, text, ts, outgoing: true, status: 'sending' as const, localId };
    usePeerStore.getState().addMessage(msg);
    usePeerStore.getState().appendChatMessage(deviceId, msg);

    const pending: PendingOutbound = {
      localId, deviceId, text, frames, msgId, attempts: 0, timer: null,
    };
    this.retryQueue.set(msgId, pending);
    this._attemptSend(msgId);
  }

  // ── Private helpers ────────────────────────────────────────────────────────

  private _attemptSend(msgId: number): void {
    const pending = this.retryQueue.get(msgId);
    if (!pending) return;
    pending.attempts++;
    for (const frame of pending.frames) {
      try {
        writeCharacteristic(pending.deviceId, CHAT_SERVICE, RX_CHAR, frame, false);
      } catch { /* network error handled by timeout */ }
    }
    pending.timer = setTimeout(() => this._onAckTimeout(msgId), ACK_TIMEOUT_MS);
  }

  private _onAckTimeout(msgId: number): void {
    const pending = this.retryQueue.get(msgId);
    if (!pending) return;
    if (pending.attempts < MAX_RETRIES) {
      this._attemptSend(msgId);
    } else {
      this.retryQueue.delete(msgId);
      if (pending.localId >= 0) {
        try { updateMessageStatus(pending.localId, 'failed'); } catch { /* non-fatal */ }
      }
      usePeerStore.getState().updateMessageStatus(pending.deviceId, pending.localId, 'failed');
    }
  }

  private _handleAck(peerId: string, ackMsgId: number): void {
    const pending = this.retryQueue.get(ackMsgId);
    if (!pending || pending.deviceId !== peerId) return;
    if (pending.timer) clearTimeout(pending.timer);
    this.retryQueue.delete(ackMsgId);
    if (pending.localId >= 0) {
      try { updateMessageStatus(pending.localId, 'delivered'); } catch { /* non-fatal */ }
    }
    usePeerStore.getState().updateMessageStatus(peerId, pending.localId, 'delivered');
  }

  private _cancelPendingForDevice(deviceId: string): void {
    for (const [msgId, pending] of this.retryQueue) {
      if (pending.deviceId !== deviceId) continue;
      if (pending.timer) clearTimeout(pending.timer);
      this.retryQueue.delete(msgId);
      if (pending.localId >= 0) {
        try { updateMessageStatus(pending.localId, 'failed'); } catch { /* non-fatal */ }
      }
      usePeerStore.getState().updateMessageStatus(deviceId, pending.localId, 'failed');
    }
  }

  private _isChatPeer(device: BluetoothDevice): boolean {
    return (device.serviceUUIDs ?? []).some(
      (uuid) => uuid.toUpperCase() === CHAT_SERVICE,
    );
  }
}

export const peerService = new PeerService();
