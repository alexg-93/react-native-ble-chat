import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Alert, Platform } from 'react-native';
import { writeCharacteristic } from '../../../modules/expo-bluetooth-scanner';
import { charDisplayName, decodeCharValue } from '../../utils/gatt';
import { timeAgo } from '../../utils/time';

export interface GattCharacteristic {
  uuid: string;
  properties: string[];
  value?: string;
}

interface Props {
  ch: GattCharacteristic;
  svcUUID: string;
  deviceId: string;
  value?: string;
  isNotifying: boolean;
  charHistory: Array<{ value: string; ts: number }>;
  isHistoryExpanded: boolean;
  onToggleHistory: () => void;
  onRead: () => void;
  onToggleSubscribe: () => void;
}

export function GattCharacteristicRow({
  ch,
  svcUUID,
  deviceId,
  value,
  isNotifying,
  charHistory,
  isHistoryExpanded,
  onToggleHistory,
  onRead,
  onToggleSubscribe,
}: Props) {
  const [writing, setWriting] = useState(false);
  const props = ch.properties.map((p) => p.toLowerCase());
  const canRead = props.includes('read');
  const canWrite = props.includes('write') || props.includes('writewithoutresponse');
  const canNotify = props.includes('notify') || props.includes('indicate');

  function handleWrite() {
    if (Platform.OS !== 'ios') {
      Alert.alert('Write not supported on this platform');
      return;
    }
    Alert.prompt(
      'Write Characteristic',
      `Enter hex or text value for\n${charDisplayName(ch.uuid)}`,
      (input) => {
        if (!input) return;
        setWriting(true);
        try {
          writeCharacteristic(deviceId, svcUUID, ch.uuid, input, true);
        } finally {
          setWriting(false);
        }
      },
      'plain-text',
    );
  }

  const decoded = value ? decodeCharValue(value) : null;

  return (
    <View style={s.container}>
      <View style={s.header}>
        <Text style={s.charName}>{charDisplayName(ch.uuid)}</Text>
        <Text style={s.uuid}>{ch.uuid}</Text>
        <Text style={s.props}>Props: {ch.properties.join(', ')}</Text>
      </View>

      {decoded != null && (
        <Text style={s.valueText}>Value: {decoded}</Text>
      )}

      {/* Action buttons */}
      <View style={s.btnRow}>
        {canRead && (
          <TouchableOpacity style={s.btn} onPress={onRead} activeOpacity={0.7}>
            <Text style={s.btnText}>Read</Text>
          </TouchableOpacity>
        )}
        {canWrite && (
          <TouchableOpacity style={[s.btn, writing && s.btnDisabled]} onPress={handleWrite} disabled={writing} activeOpacity={0.7}>
            <Text style={s.btnText}>{writing ? 'Writing…' : 'Write'}</Text>
          </TouchableOpacity>
        )}
        {canNotify && (
          <TouchableOpacity
            style={[s.btn, isNotifying && s.btnActive]}
            onPress={onToggleSubscribe}
            activeOpacity={0.7}>
            <Text style={[s.btnText, isNotifying && s.btnActiveText]}>
              {isNotifying ? '● Notifying' : 'Notify'}
            </Text>
          </TouchableOpacity>
        )}
      </View>

      {/* History */}
      {charHistory.length > 0 && (
        <TouchableOpacity onPress={onToggleHistory} activeOpacity={0.7}>
          <Text style={s.historyToggle}>
            {isHistoryExpanded ? '▾' : '▸'} History ({charHistory.length})
          </Text>
        </TouchableOpacity>
      )}
      {isHistoryExpanded &&
        charHistory
          .slice()
          .reverse()
          .map((entry, i) => (
            <View key={i} style={s.historyRow}>
              <Text style={s.historyValue}>{decodeCharValue(entry.value) ?? entry.value}</Text>
              <Text style={s.historyTs}>{timeAgo(entry.ts)}</Text>
            </View>
          ))}
    </View>
  );
}

const s = StyleSheet.create({
  container: { backgroundColor: '#fff', borderRadius: 8, padding: 10, marginVertical: 4, borderWidth: 1, borderColor: '#e2e8f0' },
  header: { marginBottom: 6 },
  charName: { fontWeight: '700', fontSize: 13, color: '#0f172a' },
  uuid: { fontSize: 10, color: '#94a3b8', marginTop: 1 },
  props: { fontSize: 11, color: '#6366f1', marginTop: 2 },
  valueText: { fontSize: 12, color: '#166534', backgroundColor: '#dcfce7', padding: 6, borderRadius: 6, marginVertical: 4, fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace' },
  btnRow: { flexDirection: 'row', gap: 6, marginTop: 6 },
  btn: { paddingHorizontal: 12, paddingVertical: 6, backgroundColor: '#e0e7ff', borderRadius: 8 },
  btnDisabled: { opacity: 0.5 },
  btnActive: { backgroundColor: '#6366f1' },
  btnText: { fontSize: 12, color: '#3730a3', fontWeight: '600' },
  btnActiveText: { color: '#fff' },
  historyToggle: { fontSize: 12, color: '#6366f1', marginTop: 8, fontWeight: '600' },
  historyRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 3, borderTopWidth: 1, borderTopColor: '#f1f5f9', marginTop: 2 },
  historyValue: { fontSize: 11, color: '#0f172a', flex: 1 },
  historyTs: { fontSize: 10, color: '#94a3b8' },
});
