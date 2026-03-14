import React, { useState, useCallback } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, FlatList,
  StyleSheet, SafeAreaView, ActivityIndicator,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { BottomTabNavigationProp } from '@react-navigation/bottom-tabs';
import { usePeers } from '../hooks/usePeers';
import { MessageCircle, ChevronUp, ChevronDown, Square, Search } from 'lucide-react-native';
import type { Peer, PeerConnectionState, PeerMessage } from '../store/peerStore';
import type { RootTabParamList } from '../navigation/AppNavigator';

// ── Constants ────────────────────────────────────────────────────────────────

const STATE_COLOR: Record<PeerConnectionState, string> = {
  discovered:   '#3b82f6',
  connecting:   '#f59e0b',
  handshaking:  '#f59e0b',
  paired:       '#22c55e',
  disconnected: '#94a3b8',
  failed:       '#ef4444',
};

const STATE_LABEL: Record<PeerConnectionState, string> = {
  discovered:   'Discovered',
  connecting:   'Connecting…',
  handshaking:  'Handshaking…',
  paired:       'Paired ✓',
  disconnected: 'Disconnected',
  failed:       'Failed',
};

// ── PeerCard ─────────────────────────────────────────────────────────────────

interface PeerCardProps {
  peer: Peer;
  messages: PeerMessage[];
  expanded: boolean;
  draft: string;
  onToggleExpand: () => void;
  onConnect: () => void;
  onDisconnect: () => void;
  onSend: (text: string) => void;
  onDraftChange: (text: string) => void;
}

function PeerCard({
  peer,
  messages,
  expanded,
  draft,
  onToggleExpand,
  onConnect,
  onDisconnect,
  onSend,
  onDraftChange,
}: PeerCardProps) {
  const navigation = useNavigation<BottomTabNavigationProp<RootTabParamList>>();
  const isActive   = peer.state === 'connecting' || peer.state === 'handshaking';
  const isPaired   = peer.state === 'paired';
  const canConnect = peer.state === 'discovered' || peer.state === 'disconnected' || peer.state === 'failed';

  const recentMessages = messages.slice(-20);

  return (
    <View style={s.card}>
      {/* ── Top row: name + state badge ── */}
      <View style={s.cardHeader}>
        <View style={s.cardInfo}>
          <Text style={s.peerName} numberOfLines={1}>{peer.name}</Text>
          <Text style={s.peerId} numberOfLines={1}>
            {peer.id.slice(0, 8)}…{peer.id.slice(-4)}
          </Text>
          {isPaired && peer.remotePeerId ? (
            <Text style={s.remotePeerId} numberOfLines={1}>
              Peer ID: {peer.remotePeerId.slice(0, 8)}…
            </Text>
          ) : null}
          {peer.error ? (
            <Text style={s.errorText}>{peer.error}</Text>
          ) : null}
        </View>
        <View style={s.cardRight}>
          <View style={[s.stateBadge, { backgroundColor: STATE_COLOR[peer.state] }]}>
            <Text style={s.stateText}>{STATE_LABEL[peer.state]}</Text>
          </View>
          <Text style={s.rssiText}>{peer.rssi} dBm</Text>
        </View>
      </View>

      {/* ── Action row ── */}
      <View style={s.cardActions}>
        {isActive && (
          <ActivityIndicator size="small" color={STATE_COLOR[peer.state]} style={s.spinner} />
        )}
        {canConnect && (
          <TouchableOpacity style={s.btnConnect} onPress={onConnect} activeOpacity={0.75}>
            <Text style={s.btnText}>Connect</Text>
          </TouchableOpacity>
        )}
        {isPaired && (
          <TouchableOpacity
            style={s.btnChat}
            onPress={() =>
              (navigation as any).navigate('Chat', {
                screen: 'ChatDetail',
                params: { peerId: peer.id, peerName: peer.name },
              })
            }
            activeOpacity={0.75}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <MessageCircle size={14} color="#fff" />
              <Text style={s.btnText}>Chat</Text>
            </View>
          </TouchableOpacity>
        )}
        {isPaired && (
          <TouchableOpacity style={s.btnToggle} onPress={onToggleExpand} activeOpacity={0.75}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
              {expanded ? <ChevronUp size={14} color="#fff" /> : <ChevronDown size={14} color="#fff" />}
              <Text style={s.btnText}>{expanded ? 'Hide' : 'Quick'}</Text>
            </View>
          </TouchableOpacity>
        )}
        {(isPaired || peer.state === 'disconnected') && (
          <TouchableOpacity style={s.btnDisconnect} onPress={onDisconnect} activeOpacity={0.75}>
            <Text style={s.btnText}>{isPaired ? 'Disconnect' : 'Remove'}</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* ── Expanded message panel (paired only) ── */}
      {isPaired && expanded && (
        <View style={s.msgPanel}>
          {recentMessages.length === 0 ? (
            <Text style={s.noMsgs}>No messages yet — send one below!</Text>
          ) : (
            recentMessages.map((msg, i) => (
              <View
                key={i}
                style={[s.msgRow, msg.outgoing ? s.msgRowOut : s.msgRowIn]}
              >
                <View style={[s.msgBubble, msg.outgoing ? s.bubbleOut : s.bubbleIn]}>
                  <Text style={[s.msgText, msg.outgoing ? s.msgTextOut : s.msgTextIn]}>
                    {msg.text}
                  </Text>
                </View>
                <Text style={s.msgTs}>{new Date(msg.ts).toLocaleTimeString()}</Text>
              </View>
            ))
          )}
          {/* Send row */}
          <View style={s.sendRow}>
            <TextInput
              style={s.sendInput}
              value={draft}
              onChangeText={onDraftChange}
              placeholder="Type a message…"
              placeholderTextColor="#94a3b8"
              returnKeyType="send"
              onSubmitEditing={() => { if (draft.trim()) { onSend(draft.trim()); } }}
            />
            <TouchableOpacity
              style={[s.sendBtn, !draft.trim() && s.sendBtnDisabled]}
              disabled={!draft.trim()}
              onPress={() => { if (draft.trim()) { onSend(draft.trim()); } }}
              activeOpacity={0.75}
            >
              <Text style={s.sendBtnText}>Send</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}
    </View>
  );
}

// ── PeersScreen ───────────────────────────────────────────────────────────────

export function PeersScreen() {
  const {
    scanning, peers, messages,
    startScan, stopScan, connect, disconnect, send,
  } = usePeers();

  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<Record<string, string>>({});

  const toggleExpand = useCallback((id: string) => {
    setExpandedId((prev) => (prev === id ? null : id));
  }, []);

  const handleSend = useCallback((id: string, text: string) => {
    send(id, text);
    setDrafts((d) => ({ ...d, [id]: '' }));
  }, [send]);

  const handleDraftChange = useCallback((id: string, text: string) => {
    setDrafts((d) => ({ ...d, [id]: text }));
  }, []);

  // Sort: active states first, then discovered, then disconnected/failed
  const sortedPeers = [...peers].sort((a, b) => {
    const order: Record<PeerConnectionState, number> = {
      paired: 0, handshaking: 1, connecting: 2, discovered: 3, disconnected: 4, failed: 5,
    };
    return (order[a.state] ?? 9) - (order[b.state] ?? 9) || b.lastSeen - a.lastSeen;
  });

  return (
    <SafeAreaView style={s.container}>
      {/* ── Header ── */}
      <View style={s.header}>
        <Text style={s.title}>BLE Peers</Text>
        <TouchableOpacity
          style={[s.scanBtn, scanning && s.scanBtnStop]}
          onPress={scanning ? stopScan : startScan}
          activeOpacity={0.75}
        >
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            {scanning ? <Square size={14} color="#fff" fill="#fff" /> : <Search size={14} color="#fff" />}
            <Text style={s.scanBtnText}>{scanning ? 'Stop' : 'Scan'}</Text>
          </View>
        </TouchableOpacity>
      </View>

      {/* ── Scan status bar ── */}
      {scanning && (
        <View style={s.scanBar}>
          <ActivityIndicator size="small" color="#2563eb" />
          <Text style={s.scanBarText}>Scanning for peers…</Text>
        </View>
      )}

      {/* ── Hint ── */}
      {!scanning && peers.length === 0 && (
        <View style={s.hint}>
          <Text style={s.hintEmoji}>🤝</Text>
          <Text style={s.hintTitle}>No peers discovered</Text>
          <Text style={s.hintSub}>
            Tap Scan to find nearby devices advertising the BLE chat service.{'\n'}
            Make sure the other device is advertising on its Peripheral tab.
          </Text>
        </View>
      )}

      {/* ── Peer list ── */}
      <FlatList
        data={sortedPeers}
        keyExtractor={(p) => p.id}
        contentContainerStyle={s.listContent}
        renderItem={({ item: peer }) => (
          <PeerCard
            peer={peer}
            messages={messages.filter((m) => m.peerId === peer.id)}
            expanded={expandedId === peer.id}
            draft={drafts[peer.id] ?? ''}
            onToggleExpand={() => toggleExpand(peer.id)}
            onConnect={() => connect(peer.id)}
            onDisconnect={() => disconnect(peer.id)}
            onSend={(text) => handleSend(peer.id, text)}
            onDraftChange={(text) => handleDraftChange(peer.id, text)}
          />
        )}
      />
    </SafeAreaView>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f8fafc' },

  // Header
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 14,
    backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#e2e8f0',
  },
  title: { fontSize: 20, fontWeight: '700', color: '#0f172a' },
  scanBtn: {
    paddingHorizontal: 14, paddingVertical: 8, borderRadius: 10,
    backgroundColor: '#2563eb',
  },
  scanBtnStop: { backgroundColor: '#dc2626' },
  scanBtnText: { color: '#fff', fontWeight: '700', fontSize: 14 },

  // Scan status
  scanBar: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    paddingHorizontal: 16, paddingVertical: 10,
    backgroundColor: '#eff6ff', borderBottomWidth: 1, borderBottomColor: '#bfdbfe',
  },
  scanBarText: { color: '#1e40af', fontSize: 13, fontWeight: '500' },

  // Empty hint
  hint: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32 },
  hintEmoji: { fontSize: 48, marginBottom: 12 },
  hintTitle: { fontSize: 18, fontWeight: '700', color: '#0f172a', marginBottom: 8 },
  hintSub: { fontSize: 14, color: '#64748b', textAlign: 'center', lineHeight: 22 },

  // List
  listContent: { padding: 12, gap: 12, paddingBottom: 24 },

  // Peer card
  card: {
    backgroundColor: '#fff', borderRadius: 14,
    shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 8, shadowOffset: { width: 0, height: 2 },
    elevation: 3, overflow: 'hidden',
  },
  cardHeader: {
    flexDirection: 'row', alignItems: 'flex-start',
    justifyContent: 'space-between', padding: 14,
  },
  cardInfo: { flex: 1, marginRight: 10 },
  peerName: { fontSize: 16, fontWeight: '700', color: '#0f172a', marginBottom: 2 },
  peerId:   { fontSize: 11, fontFamily: 'monospace', color: '#64748b', marginBottom: 2 },
  remotePeerId: { fontSize: 11, fontFamily: 'monospace', color: '#94a3b8', marginBottom: 2 },
  errorText: { fontSize: 12, color: '#dc2626', marginTop: 2 },
  cardRight: { alignItems: 'flex-end', gap: 6 },
  stateBadge: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8 },
  stateText: { color: '#fff', fontSize: 11, fontWeight: '700' },
  rssiText: { fontSize: 12, color: '#64748b', fontWeight: '500' },

  // Actions
  cardActions: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    paddingHorizontal: 14, paddingBottom: 12, flexWrap: 'wrap',
  },
  spinner: { marginRight: 4 },
  btnConnect:    { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 8, backgroundColor: '#2563eb' },
  btnChat:       { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 8, backgroundColor: '#7c3aed' },
  btnToggle:     { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 8, backgroundColor: '#0891b2' },
  btnDisconnect: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 8, backgroundColor: '#64748b' },
  btnText: { color: '#fff', fontSize: 13, fontWeight: '600' },

  // Message panel
  msgPanel: {
    borderTopWidth: 1, borderTopColor: '#e2e8f0',
    paddingHorizontal: 14, paddingTop: 12, paddingBottom: 4,
    backgroundColor: '#f8fafc',
  },
  noMsgs: { color: '#94a3b8', fontSize: 13, textAlign: 'center', marginBottom: 10 },
  msgRow: { marginBottom: 8 },
  msgRowOut: { alignItems: 'flex-end' },
  msgRowIn:  { alignItems: 'flex-start' },
  msgBubble: { maxWidth: '80%', borderRadius: 12, paddingHorizontal: 12, paddingVertical: 8 },
  bubbleOut: { backgroundColor: '#2563eb', borderBottomRightRadius: 2 },
  bubbleIn:  { backgroundColor: '#e2e8f0', borderBottomLeftRadius: 2 },
  msgText: { fontSize: 14, lineHeight: 20 },
  msgTextOut: { color: '#fff' },
  msgTextIn:  { color: '#0f172a' },
  msgTs: { fontSize: 10, color: '#94a3b8', marginTop: 2 },

  // Send
  sendRow: { flexDirection: 'row', gap: 8, marginTop: 8, marginBottom: 8 },
  sendInput: {
    flex: 1, backgroundColor: '#fff', borderRadius: 10, borderWidth: 1, borderColor: '#e2e8f0',
    paddingHorizontal: 12, paddingVertical: 9, fontSize: 14, color: '#0f172a',
  },
  sendBtn: {
    backgroundColor: '#2563eb', borderRadius: 10,
    paddingHorizontal: 16, paddingVertical: 9, justifyContent: 'center',
  },
  sendBtnDisabled: { backgroundColor: '#cbd5e1' },
  sendBtnText: { color: '#fff', fontWeight: '700', fontSize: 14 },
});
