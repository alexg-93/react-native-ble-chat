import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { MessageCircle } from 'lucide-react-native';

export function ChatScreen() {
  return (
    <View style={s.container}>
      <MessageCircle size={48} color="#94a3b8" />
      <Text style={s.title}>Chat</Text>
      <Text style={s.sub}>Coming in Phase 4</Text>
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#fff' },
  emoji: { fontSize: 48, marginBottom: 16 },
  title: { fontSize: 22, fontWeight: '700', color: '#0f172a' },
  sub: { fontSize: 14, color: '#94a3b8', marginTop: 6 },
});
