import React from 'react';
import { View, Text, StyleSheet } from 'react-native';

interface Props {
  icon?: React.ReactNode;
  title: string;
  subtitle?: string;
}

export function EmptyState({ icon, title, subtitle }: Props) {
  return (
    <View style={s.container}>
      {icon && <View style={s.iconWrap}>{icon}</View>}
      <Text style={s.title}>{title}</Text>
      {!!subtitle && <Text style={s.subtitle}>{subtitle}</Text>}
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 60, paddingHorizontal: 32 },
  iconWrap: { marginBottom: 16 },
  title: { fontSize: 17, fontWeight: '700', color: '#0f172a', textAlign: 'center' },
  subtitle: { fontSize: 13, color: '#94a3b8', textAlign: 'center', marginTop: 8, lineHeight: 18 },
});

