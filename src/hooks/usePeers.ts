import { useEffect } from 'react';
import { peerService } from '../services/PeerService';
import { usePeerStore } from '../store/peerStore';
import { loadMessages, markConversationRead } from '../storage/ChatDb';
import type { PeerMessage } from '../store/peerStore';

// Module-level guard: subscribe once for the app's lifetime (same pattern as useScanner).
let started = false;

export function usePeers() {
  useEffect(() => {
    if (!started) {
      started = true;
      peerService.subscribe();
    }
    // Service listeners persist for app lifetime — no cleanup on unmount
    return () => {};
  }, []);

  const store = usePeerStore();
  return {
    ...store,
    startScan:  ()                          => peerService.startScan(),
    stopScan:   ()                          => peerService.stopScan(),
    connect:    (id: string)                => peerService.connect(id),
    disconnect: (id: string)                => peerService.disconnect(id),
    send:       (id: string, text: string)  => peerService.sendMessage(id, text),

    /** Load message history from SQLite into chatMessages[peerId]. */
    loadChatHistory: (peerId: string) => {
      try {
        const rows = loadMessages(peerId);
        const msgs: PeerMessage[] = rows.map((r) => ({
          peerId: r.peerId,
          text: r.text,
          ts: r.ts,
          outgoing: r.outgoing === 1,
          status: (r.status as PeerMessage['status']) ?? 'sent',
          localId: r.id,
        }));
        usePeerStore.getState().setChatMessages(peerId, msgs);
      } catch { /* DB may not be ready on first open */ }
    },

    /** Mark conversation as read both in DB and in the store. */
    markRead: (peerId: string) => {
      try { markConversationRead(peerId); } catch { /* non-fatal */ }
      usePeerStore.getState().markRead(peerId);
    },
  };
}

