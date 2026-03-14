import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Signal, Clock, AlignLeft, Star } from 'lucide-react-native';
import { SortMode } from '../../store/scannerStore';

const chips: { label: string; value: SortMode; Icon: React.ComponentType<{ size?: number; color?: string }> }[] = [
  { label: 'RSSI',      value: 'rssi',      Icon: Signal    },
  { label: 'Last Seen', value: 'lastSeen',  Icon: Clock     },
  { label: 'Name',      value: 'name',      Icon: AlignLeft },
  { label: 'Favorites', value: 'favorites', Icon: Star      },
];

interface Props {
  value: SortMode;
  onChange: (mode: SortMode) => void;
}

export function SortChips({ value, onChange }: Props) {
  return (
    <View style={s.row}>
      {chips.map((c) => {
        const active = c.value === value;
        return (
          <TouchableOpacity
            key={c.value}
            style={[s.chip, active && s.chipActive]}
            onPress={() => onChange(c.value)}
            activeOpacity={0.7}>
            <View style={s.chipInner}>
              <c.Icon size={12} color={active ? '#fff' : '#475569'} />
              <Text style={[s.chipText, active && s.chipTextActive]}>{c.label}</Text>
            </View>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

const s = StyleSheet.create({
  row: { flexDirection: 'row', gap: 6, flexWrap: 'wrap', marginHorizontal: 16, marginTop: 6 },
  chip: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8, borderWidth: 1, borderColor: '#cbd5e1', backgroundColor: '#f8fafc' },
  chipActive: { backgroundColor: '#2563eb', borderColor: '#2563eb' },
  chipInner: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  chipText: { fontSize: 12, color: '#475569', fontWeight: '500' },
  chipTextActive: { color: '#fff' },
});


