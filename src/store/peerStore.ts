import { create } from 'zustand';
import type { StoredConversation } from '../storage/ChatDb';

export type { StoredConversation };

// ── Types ──────────────────────────────────────────────────────────────────────

/** Lifecycle state for a discovered BLE peer. */
export type PeerConnectionState =
  | 'discovered'   // seen in scan, not yet connected
  | 'connecting'   // connectToDevice() called
  | 'handshaking'  // connected, running GATT handshake
  | 'paired'       // handshake done, Peer-ID exchanged, TX subscribed
  | 'disconnected' // connection dropped
  | 'failed';      // connection or handshake failed

export interface Peer {
  id: string;           // CBPeripheral UUID
  name: string;         // advertisement name or truncated id
  rssi: number;
  remotePeerId: string; // stable UUID from Peer-ID GATT characteristic
  state: PeerConnectionState;
  error?: string;
  lastSeen: number;     // ms timestamp
}

export interface PeerMessage {
  peerId: string;    // device ID of the peer connection
  text: string;
  ts: number;
  outgoing: boolean;
  status?: 'sending' | 'sent' | 'delivered' | 'failed';
  localId?: number; // SQLite row id for updateMessageStatus
}

// ── Store ──────────────────────────────────────────────────────────────────────

interface PeerStoreState {
  scanning: boolean;
  peers: Peer[];
  messages: PeerMessage[];            // live in-session buffer (Peers tab)
  conversations: StoredConversation[]; // persisted conversation list (Chat tab)
  chatMessages: Record<string, PeerMessage[]>; // history for open ChatDetailScreen
  /** Set of deviceIds whose remote peer is currently typing. */
  peerTyping: Set<string>;

  setScanning: (v: boolean) => void;
  /** Insert or update a peer record. Does not downgrade an active connection state. */
  upsertPeer: (p: Pick<Peer, 'id' | 'name' | 'rssi' | 'lastSeen'>) => void;
  setPeerState: (id: string, state: PeerConnectionState, remotePeerId?: string, error?: string) => void;
  addMessage: (msg: PeerMessage) => void;
  clearPeers: () => void;
  setConversations: (convs: StoredConversation[]) => void;
  upsertConversation: (conv: StoredConversation) => void;
  setChatMessages: (peerId: string, msgs: PeerMessage[]) => void;
  appendChatMessage: (peerId: string, msg: PeerMessage) => void;
  updateMessageStatus: (peerId: string, localId: number, status: PeerMessage['status']) => void;
  setTyping: (peerId: string, isTyping: boolean) => void;
  markRead: (peerId: string) => void;
}

const ACTIVE_STATES: PeerConnectionState[] = ['connecting', 'handshaking', 'paired'];

export const usePeerStore = create<PeerStoreState>((set) => ({
  scanning: false,
  peers: [],
  messages: [],
  conversations: [],
  chatMessages: {},
  peerTyping: new Set<string>(),

  setScanning: (scanning) => set({ scanning }),

  upsertPeer: ({ id, name, rssi, lastSeen }) =>
    set((s) => {
      const i = s.peers.findIndex((p) => p.id === id);
      if (i !== -1) {
        const existing = s.peers[i];
        const updated = [...s.peers];
        if (ACTIVE_STATES.includes(existing.state)) {
          // Only refresh rssi/lastSeen when actively connecting — don't reset state
          updated[i] = { ...existing, rssi, lastSeen };
        } else {
          updated[i] = {
            ...existing,
            name: name || existing.name,
            rssi,
            lastSeen,
            state: 'discovered',
          };
        }
        return { peers: updated };
      }
      return {
        peers: [
          ...s.peers,
          { id, name, rssi, remotePeerId: '', state: 'discovered', lastSeen },
        ],
      };
    }),

  setPeerState: (id, state, remotePeerId, error) =>
    set((s) => ({
      peers: s.peers.map((p) =>
        p.id === id
          ? {
              ...p,
              state,
              ...(remotePeerId !== undefined ? { remotePeerId } : {}),
              // Clear stale error on success; preserve on intermediate states
              error: state === 'paired' ? undefined : (error ?? p.error),
            }
          : p,
      ),
    })),

  addMessage: (msg) =>
    set((s) => ({ messages: [...s.messages, msg].slice(-500) })),

  clearPeers: () => set({ peers: [], messages: [] }),

  setConversations: (conversations) => set({ conversations }),

  upsertConversation: (conv) =>
    set((s) => {
      const i = s.conversations.findIndex((c) => c.peerId === conv.peerId);
      if (i === -1) return { conversations: [conv, ...s.conversations] };
      const updated = [...s.conversations];
      updated[i] = conv;
      // Re-sort by lastTs DESC
      updated.sort((a, b) => b.lastTs - a.lastTs);
      return { conversations: updated };
    }),

  setChatMessages: (peerId, msgs) =>
    set((s) => ({ chatMessages: { ...s.chatMessages, [peerId]: msgs } })),

  appendChatMessage: (peerId, msg) =>
    set((s) => {
      const existing = s.chatMessages[peerId] ?? [];
      return { chatMessages: { ...s.chatMessages, [peerId]: [...existing, msg] } };
    }),

  updateMessageStatus: (peerId, localId, status) =>
    set((s) => {
      const msgs = s.chatMessages[peerId];
      if (!msgs) return {};
      return {
        chatMessages: {
          ...s.chatMessages,
          [peerId]: msgs.map((m) =>
            m.localId === localId ? { ...m, status } : m
          ),
        },
      };
    }),

  setTyping: (peerId, isTyping) =>
    set((s) => {
      const next = new Set(s.peerTyping);
      if (isTyping) next.add(peerId); else next.delete(peerId);
      return { peerTyping: next };
    }),

  markRead: (peerId) =>
    set((s) => ({
      conversations: s.conversations.map((c) =>
        c.peerId === peerId ? { ...c, unread: 0 } : c
      ),
    })),
}));
