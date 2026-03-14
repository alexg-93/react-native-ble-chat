import React from 'react';
import { View, Text, Switch, StyleSheet } from 'react-native';

interface Props {
  label: string;
  value: boolean;
  onValueChange: (v: boolean) => void;
}

export function Toggle({ label, value, onValueChange }: Props) {
  return (
    <View style={s.row}>
      <Text style={s.label}>{label}</Text>
      <Switch value={value} onValueChange={onValueChange} trackColor={{ true: '#2563eb' }} />
    </View>
  );
}

const s = StyleSheet.create({
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 10 },
  label: { fontSize: 14, color: '#0f172a', fontWeight: '500' },
});
