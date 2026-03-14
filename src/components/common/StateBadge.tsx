import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { BluetoothState } from '../../store/scannerStore';

const BADGE: Record<BluetoothState, { bg: string; text: string; label: string }> = {
  unknown:      { bg: '#f1f5f9', text: '#64748b', label: 'Bluetooth: Unknown' },
  unsupported:  { bg: '#fee2e2', text: '#dc2626', label: 'Bluetooth: Unsupported' },
  unauthorized: { bg: '#fef3c7', text: '#b45309', label: 'Bluetooth: Permission Denied' },
  poweredOff:   { bg: '#fef3c7', text: '#b45309', label: 'Bluetooth is Off' },
  poweredOn:    { bg: '#dcfce7', text: '#16a34a', label: 'Bluetooth: Ready' },
  resetting:    { bg: '#e0e7ff', text: '#4338ca', label: 'Bluetooth: Resetting…' },
};

export function StateBadge({ state }: { state: BluetoothState }) {
  const cfg = BADGE[state] ?? BADGE.unknown;
  if (state === 'poweredOn') return null;
  return (
    <View style={[s.badge, { backgroundColor: cfg.bg }]}>
      <Text style={[s.label, { color: cfg.text }]}>{cfg.label}</Text>
    </View>
  );
}

const s = StyleSheet.create({
  badge: { marginHorizontal: 16, marginTop: 8, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 8 },
  label: { fontSize: 13, fontWeight: '600', textAlign: 'center' },
});
