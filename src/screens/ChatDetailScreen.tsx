import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, FlatList,
  StyleSheet, KeyboardAvoidingView, Platform, ActivityIndicator, Animated,
} from 'react-native';
import { useRoute, useIsFocused } from '@react-navigation/native';
import type { RouteProp } from '@react-navigation/native';
import { usePeers } from '../hooks/usePeers';
import { WifiOff, Send, Clock, Check, CheckCheck, AlertCircle } from 'lucide-react-native';
import type { ChatStackParamList } from '../navigation/AppNavigator';

type Route = RouteProp<ChatStackParamList, 'ChatDetail'>;

function formatTime(ts: number): string {
  return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function TypingDots() {
  const dot0 = useRef(new Animated.Value(0)).current;
  const dot1 = useRef(new Animated.Value(0)).current;
  const dot2 = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const make = (v: Animated.Value, delay: number) =>
      Animated.loop(
        Animated.sequence([
          Animated.delay(delay),
          Animated.timing(v, { toValue: 1, duration: 300, useNativeDriver: true }),
          Animated.timing(v, { toValue: 0, duration: 300, useNativeDriver: true }),
          Animated.delay(450 - delay),
        ]),
      );
    const a0 = make(dot0, 0);
    const a1 = make(dot1, 150);
    const a2 = make(dot2, 300);
    a0.start(); a1.start(); a2.start();
    return () => { a0.stop(); a1.stop(); a2.stop(); };
  }, [dot0, dot1, dot2]);

  const dotStyle = (v: Animated.Value) => ({
    opacity: v.interpolate({ inputRange: [0, 1], outputRange: [0.3, 1] }),
    transform: [{ scale: v.interpolate({ inputRange: [0, 1], outputRange: [0.7, 1.1] }) }],
  });

  return (
    <View style={s.dotsRow}>
      <Animated.View style={[s.dot, dotStyle(dot0)]} />
      <Animated.View style={[s.dot, dotStyle(dot1)]} />
      <Animated.View style={[s.dot, dotStyle(dot2)]} />
    </View>
  );
}

export function ChatDetailScreen() {
  const route = useRoute<Route>();
  const { peerId, peerName } = route.params;
  const isFocused = useIsFocused();

  const { peers, chatMessages, peerTyping, send, sendTyping, connect, loadChatHistory, markRead } = usePeers();

  const peer = peers.find((p) => p.id === peerId);
  const isPaired = peer?.state === 'paired';
  const isConnecting = peer?.state === 'connecting' || peer?.state === 'handshaking';
  const canSend = isPaired;

  const isRemoteTyping = peerTyping.has(peerId);

  const messages = chatMessages[peerId] ?? [];
  const [draft, setDraft] = useState('');
  const listRef = useRef<FlatList>(null);
  const typingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Load history from DB on mount
  useEffect(() => {
    loadChatHistory(peerId);
  }, [peerId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Mark as read when screen is focused
  useEffect(() => {
    if (isFocused) markRead(peerId);
  }, [isFocused, peerId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-scroll to bottom on new message
  useEffect(() => {
    if (messages.length > 0) {
      setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 100);
    }
  }, [messages.length]);

  const handleDraftChange = useCallback((text: string) => {
    setDraft(text);
    if (!canSend) return;
    if (typingTimerRef.current) clearTimeout(typingTimerRef.current);
    if (text.trim()) {
      typingTimerRef.current = setTimeout(() => sendTyping(peerId, true), 400);
    } else {
      sendTyping(peerId, false);
    }
  }, [canSend, peerId, sendTyping]);

  const handleSend = useCallback(() => {
    const text = draft.trim();
    if (!text || !canSend) return;
    if (typingTimerRef.current) clearTimeout(typingTimerRef.current);
    sendTyping(peerId, false);
    setDraft('');
    send(peerId, text);
  }, [draft, canSend, peerId, send, sendTyping]);

  return (
    <KeyboardAvoidingView
      style={s.flex}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={88}
    >
      {/* ── Connection status bar ── */}
      {!isPaired && (
        <View style={[s.statusBar, isConnecting ? s.statusConnecting : s.statusOffline]}>
          {isConnecting ? (
            <>
              <ActivityIndicator size="small" color="#fff" />
              <Text style={s.statusText}>Connecting…</Text>
            </>
          ) : (
            <>
              <WifiOff size={14} color="#fff" />
              <Text style={s.statusText}>Peer offline</Text>
              {(peer?.state === 'disconnected' || peer?.state === 'discovered' || !peer) && (
                <TouchableOpacity onPress={() => connect(peerId)} style={s.reconnectBtn}>
                  <Text style={s.reconnectText}>Reconnect</Text>
                </TouchableOpacity>
              )}
            </>
          )}
        </View>
      )}

      {/* ── Message list ── */}
      <FlatList
        ref={listRef}
        data={messages}
        keyExtractor={(_, i) => String(i)}
        contentContainerStyle={s.listContent}
        onContentSizeChange={() =>
          listRef.current?.scrollToEnd({ animated: false })
        }
        ListEmptyComponent={
          <View style={s.emptyWrap}>
            <Text style={s.emptyText}>
              {isPaired
                ? 'Say hello! No messages yet.'
                : 'Connect to this peer to start a conversation.'}
            </Text>
          </View>
        }
        renderItem={({ item, index }) => {
          const prev = messages[index - 1];
          const showTime = !prev || item.ts - prev.ts > 5 * 60 * 1000; // 5 min gap
          return (
            <View>
              {showTime && (
                <Text style={s.timeLabel}>{formatTime(item.ts)}</Text>
              )}
              {item.outgoing ? (
                <View style={[s.bubbleRow, s.bubbleRowOut]}>
                  <View style={s.bubbleColOut}>
                    <View style={[s.bubble, s.bubbleOut]}>
                      <Text style={[s.bubbleText, s.bubbleTextOut]}>{item.text}</Text>
                    </View>
                    <View style={s.deliveryBadge}>
                      {item.status === 'sending' && (
                        <>
                          <Clock size={11} color="#94a3b8" />
                          <Text style={s.deliveryText}>Sending…</Text>
                        </>
                      )}
                      {(!item.status || item.status === 'sent') && (
                        <Check size={11} color="#94a3b8" />
                      )}
                      {item.status === 'delivered' && (
                        <CheckCheck size={11} color="#2563eb" />
                      )}
                      {item.status === 'failed' && (
                        <TouchableOpacity style={s.retryBtn} onPress={() => send(peerId, item.text)}>
                          <AlertCircle size={11} color="#dc2626" />
                          <Text style={s.retryText}>Tap to retry</Text>
                        </TouchableOpacity>
                      )}
                    </View>
                  </View>
                </View>
              ) : (
                <View style={[s.bubbleRow, s.bubbleRowIn]}>
                  <View style={[s.bubble, s.bubbleIn]}>
                    <Text style={[s.bubbleText, s.bubbleTextIn]}>{item.text}</Text>
                  </View>
                </View>
              )}
            </View>
          );
        }}
      />

      {/* ── Typing indicator ── */}
      {isRemoteTyping && (
        <View style={[s.bubbleRow, s.bubbleRowIn, s.typingRow]}>
          <View style={[s.bubble, s.bubbleIn, s.typingBubble]}>
            <TypingDots />
          </View>
        </View>
      )}

      {/* ── Input bar ── */}
      <View style={s.inputBar}>
        <TextInput
          style={s.input}
          value={draft}
          onChangeText={handleDraftChange}
          placeholder={canSend ? 'Message…' : 'Connect to send messages'}
          placeholderTextColor="#94a3b8"
          editable={canSend}
          multiline
          maxLength={4000}
          returnKeyType="default"
        />
        <TouchableOpacity
          style={[s.sendBtn, (!draft.trim() || !canSend) && s.sendBtnDisabled]}
          onPress={handleSend}
          disabled={!draft.trim() || !canSend}
          activeOpacity={0.75}
        >
          <Send size={18} color="#fff" />
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

const s = StyleSheet.create({
  flex: { flex: 1, backgroundColor: '#f8fafc' },

  // Status bar
  statusBar: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    paddingHorizontal: 16, paddingVertical: 10,
  },
  statusConnecting: { backgroundColor: '#f59e0b' },
  statusOffline:    { backgroundColor: '#64748b' },
  statusText: { color: '#fff', fontSize: 13, fontWeight: '600', flex: 1 },
  reconnectBtn: {
    paddingHorizontal: 12, paddingVertical: 5, borderRadius: 8,
    backgroundColor: 'rgba(255,255,255,0.25)',
  },
  reconnectText: { color: '#fff', fontSize: 12, fontWeight: '700' },

  // Messages
  listContent: { padding: 16, paddingBottom: 8, flexGrow: 1, justifyContent: 'flex-end' },
  emptyWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 40 },
  emptyText: { color: '#94a3b8', fontSize: 14, textAlign: 'center' },

  timeLabel: {
    textAlign: 'center', fontSize: 11, color: '#94a3b8',
    marginVertical: 8,
  },
  bubbleRow: { flexDirection: 'row', marginBottom: 4 },
  bubbleRowOut: { justifyContent: 'flex-end' },
  bubbleRowIn:  { justifyContent: 'flex-start' },
  // bubble = shared padding/radius only; maxWidth is on bubbleIn (direct child of row)
  // and on bubbleColOut (outgoing wrapper, also a direct child of row) → % resolves correctly
  bubble: {
    borderRadius: 18, paddingHorizontal: 14, paddingVertical: 10,
  },
  bubbleOut: { backgroundColor: '#2563eb', borderBottomRightRadius: 4 },
  bubbleIn:  { maxWidth: '75%', backgroundColor: '#fff', borderBottomLeftRadius: 4,
               shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 4, shadowOffset: { width: 0, height: 1 }, elevation: 1 },
  bubbleText: { fontSize: 15, lineHeight: 21 },
  bubbleTextOut: { color: '#fff' },
  bubbleTextIn:  { color: '#0f172a' },

  // Delivery status
  bubbleColOut: { maxWidth: '75%', alignItems: 'flex-end' },
  deliveryBadge: { flexDirection: 'row', alignItems: 'center', gap: 3, marginTop: 2, marginRight: 4 },
  deliveryText:  { fontSize: 10, color: '#94a3b8' },
  retryBtn:      { flexDirection: 'row', alignItems: 'center', gap: 3 },
  retryText:     { fontSize: 10, color: '#dc2626' },

  // Input
  inputBar: {
    flexDirection: 'row', alignItems: 'flex-end', gap: 8,
    paddingHorizontal: 12, paddingVertical: 10,
    backgroundColor: '#fff', borderTopWidth: 1, borderTopColor: '#e2e8f0',
  },
  input: {
    flex: 1, minHeight: 40, maxHeight: 120,
    backgroundColor: '#f1f5f9', borderRadius: 20,
    paddingHorizontal: 16, paddingVertical: 10,
    fontSize: 15, color: '#0f172a',
  },
  sendBtn: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: '#2563eb', alignItems: 'center', justifyContent: 'center',
  },
  sendBtnDisabled: { backgroundColor: '#cbd5e1' },
  sendIcon: { color: '#fff', fontSize: 20, fontWeight: '700', lineHeight: 22 },

  // Typing indicator
  typingRow: { paddingHorizontal: 16, paddingBottom: 4 },
  typingBubble: { paddingVertical: 8, paddingHorizontal: 12 },
  dotsRow: { flexDirection: 'row', alignItems: 'center', gap: 5, height: 20 },
  dot: {
    width: 8, height: 8, borderRadius: 4,
    backgroundColor: '#94a3b8',
  },
});
