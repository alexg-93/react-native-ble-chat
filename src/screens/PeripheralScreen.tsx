import React, { useState } from 'react';
import { usePrefsStore } from '../store/prefsStore';
import {
  View, Text, TextInput, TouchableOpacity, FlatList,
  StyleSheet, SafeAreaView,
} from 'react-native';
import { AlertTriangle, Square, Radio, Wifi, WifiOff, Users } from 'lucide-react-native';
import { usePeripheral } from '../hooks/usePeripheral';

export function PeripheralScreen() {
  const {
    localPeerId,
    peripheralState,
    isAdvertising,
    subscriberCount,
    receivedMessages,
    error,
    start,
    stop,
    send,
  } = usePeripheral();

  const { advertisedName, setAdvertisedName } = usePrefsStore();
  const [localName, setLocalName] = useState(() => advertisedName || 'MyBLEDevice');
  const [outgoing, setOutgoing] = useState('');

  const canAdvertise = peripheralState === 'poweredOn';
  const isUnsupported = peripheralState === 'unsupported';

  return (
    <SafeAreaView style={s.container}>
      {/* Header */}
      <View style={s.header}>
        <Text style={s.title}>BLE Peripheral</Text>
        <View style={[s.stateDot, canAdvertise ? s.stateDotOn : s.stateDotOff]} />
      </View>

      {/* Simulator / unsupported notice */}
      {isUnsupported && (
        <View style={s.warnBanner}>
          <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 8 }}>
            <AlertTriangle size={16} color="#92400e" style={{ marginTop: 2 }} />
            <Text style={s.warnText}>
              BLE peripheral role is not supported on the iOS Simulator.{'\n'}
              Please run on a real device.
            </Text>
          </View>
        </View>
      )}

      {/* Peer ID */}
      <View style={s.section}>
        <Text style={s.label}>Local Peer ID</Text>
        <Text style={s.mono} numberOfLines={1} ellipsizeMode="middle">{localPeerId}</Text>
      </View>

      {/* Advertised name */}
      <View style={s.section}>
        <Text style={s.label}>Advertised Name</Text>
        <TextInput
          style={s.input}
          value={localName}
          onChangeText={(text) => { setLocalName(text); setAdvertisedName(text); }}
          editable={!isAdvertising}
          placeholder="Device name…"
          placeholderTextColor="#94a3b8"
        />
      </View>

      {/* Advertise button */}
      <TouchableOpacity
        style={[s.btn, isAdvertising ? s.btnStop : s.btnStart, !canAdvertise && s.btnDisabled]}
        onPress={() => (isAdvertising ? stop() : start(localName))}
        disabled={!canAdvertise}
        activeOpacity={0.75}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          {isAdvertising ? <Square size={16} color="#fff" fill="#fff" /> : <Radio size={16} color="#fff" />}
          <Text style={s.btnText}>{isAdvertising ? 'Stop Advertising' : 'Start Advertising'}</Text>
        </View>
      </TouchableOpacity>

      {/* Status row */}
      <View style={s.statusRow}>
        <View style={[s.statusBadge, { flexDirection: 'row', alignItems: 'center', gap: 6 }]}>
          {isAdvertising ? <Wifi size={14} color="#16a34a" /> : <WifiOff size={14} color="#94a3b8" />}
          <Text style={s.statusText}>{isAdvertising ? 'Advertising' : 'Idle'}</Text>
        </View>
        <View style={[s.statusBadge, { flexDirection: 'row', alignItems: 'center', gap: 6 }]}>
          <Users size={14} color="#475569" />
          <Text style={s.statusText}>{subscriberCount} subscriber{subscriberCount !== 1 ? 's' : ''}</Text>
        </View>
      </View>

      {!!error && (
        <View style={s.errorBanner}>
          <Text style={s.errorText}>{error}</Text>
        </View>
      )}

      {/* Send message */}
      <View style={s.sendRow}>
        <TextInput
          style={s.sendInput}
          value={outgoing}
          onChangeText={setOutgoing}
          placeholder="Message to send…"
          placeholderTextColor="#94a3b8"
          editable={subscriberCount > 0}
        />
        <TouchableOpacity
          style={[s.sendBtn, subscriberCount === 0 && s.btnDisabled]}
          onPress={() => { if (outgoing) { send(outgoing); setOutgoing(''); } }}
          disabled={subscriberCount === 0}
          activeOpacity={0.75}>
          <Text style={s.sendBtnText}>Send</Text>
        </TouchableOpacity>
      </View>

      {/* Received messages */}
      <Text style={s.sectionTitle}>Received Messages</Text>
      <FlatList
        data={[...receivedMessages].reverse()}
        keyExtractor={(_, i) => String(i)}
        contentContainerStyle={s.listContent}
        renderItem={({ item }) => (
            <View style={s.msgRow}>
              <Text style={s.msgText}>{item.text}</Text>
              <Text style={s.msgTs}>{new Date(item.ts).toLocaleTimeString()}</Text>
            </View>
          )}
        ListEmptyComponent={
          <Text style={s.empty}>No messages received yet</Text>
        }
      />
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingTop: 12, paddingBottom: 4 },
  title: { fontSize: 20, fontWeight: '800', color: '#0f172a', flex: 1 },
  stateDot: { width: 10, height: 10, borderRadius: 5 },
  stateDotOn: { backgroundColor: '#16a34a' },
  stateDotOff: { backgroundColor: '#94a3b8' },
  section: { paddingHorizontal: 16, marginTop: 12 },
  label: { fontSize: 12, fontWeight: '600', color: '#64748b', marginBottom: 4, textTransform: 'uppercase', letterSpacing: 0.5 },
  mono: { fontSize: 12, color: '#475569', fontFamily: 'Courier', backgroundColor: '#f1f5f9', padding: 8, borderRadius: 6 },
  input: { backgroundColor: '#f1f5f9', borderRadius: 10, paddingHorizontal: 14, paddingVertical: 10, fontSize: 14, color: '#0f172a' },
  btn: { marginHorizontal: 16, marginTop: 16, borderRadius: 12, paddingVertical: 14, alignItems: 'center' },
  btnStart: { backgroundColor: '#2563eb' },
  btnStop: { backgroundColor: '#dc2626' },
  btnDisabled: { opacity: 0.4 },
  btnText: { color: '#fff', fontWeight: '700', fontSize: 15 },
  statusRow: { flexDirection: 'row', gap: 8, paddingHorizontal: 16, marginTop: 10 },
  statusBadge: { backgroundColor: '#f1f5f9', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6 },
  statusText: { fontSize: 13, color: '#475569', fontWeight: '500' },
  errorBanner: { backgroundColor: '#fef2f2', marginHorizontal: 16, marginTop: 8, borderRadius: 8, padding: 10, borderLeftWidth: 3, borderLeftColor: '#dc2626' },
  errorText: { color: '#dc2626', fontSize: 12 },
  warnBanner: { backgroundColor: '#fffbeb', marginHorizontal: 16, marginTop: 8, borderRadius: 8, padding: 12, borderLeftWidth: 3, borderLeftColor: '#d97706' },
  warnText: { color: '#92400e', fontSize: 13, lineHeight: 20 },
  sendRow: { flexDirection: 'row', gap: 8, paddingHorizontal: 16, marginTop: 12 },
  sendInput: { flex: 1, backgroundColor: '#f1f5f9', borderRadius: 10, paddingHorizontal: 14, paddingVertical: 10, fontSize: 14, color: '#0f172a' },
  sendBtn: { backgroundColor: '#2563eb', borderRadius: 10, paddingHorizontal: 18, paddingVertical: 10, justifyContent: 'center' },
  sendBtnText: { color: '#fff', fontWeight: '700', fontSize: 14 },
  sectionTitle: { fontSize: 13, fontWeight: '700', color: '#0f172a', paddingHorizontal: 16, marginTop: 16, marginBottom: 6 },
  listContent: { paddingHorizontal: 16, paddingBottom: 32 },
  msgRow: { backgroundColor: '#f8fafc', borderRadius: 8, padding: 10, marginBottom: 6, borderLeftWidth: 3, borderLeftColor: '#2563eb' },
  msgText: { fontSize: 14, color: '#0f172a' },
  msgTs: { fontSize: 10, color: '#94a3b8', marginTop: 2 },
  empty: { textAlign: 'center', color: '#94a3b8', paddingTop: 32, fontSize: 14 },
});
