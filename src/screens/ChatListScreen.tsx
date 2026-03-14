import React from 'react';
import {
  View, Text, TouchableOpacity, FlatList, StyleSheet, SafeAreaView,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { usePeers } from '../hooks/usePeers';
import { MessageCircle } from 'lucide-react-native';
import type { ChatStackParamList } from '../navigation/AppNavigator';
import type { StoredConversation } from '../store/peerStore';

type Nav = NativeStackNavigationProp<ChatStackParamList, 'ChatList'>;

function formatTime(ts: number): string {
  const d = new Date(ts);
  const now = new Date();
  const isToday =
    d.getDate() === now.getDate() &&
    d.getMonth() === now.getMonth() &&
    d.getFullYear() === now.getFullYear();
  return isToday
    ? d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    : d.toLocaleDateString([], { month: 'short', day: 'numeric' });
}

function ConversationRow({ conv }: { conv: StoredConversation }) {
  const navigation = useNavigation<Nav>();

  return (
    <TouchableOpacity
      style={s.row}
      onPress={() =>
        navigation.navigate('ChatDetail', {
          peerId: conv.peerId,
          peerName: conv.peerName || conv.peerId.slice(0, 8),
        })
      }
      activeOpacity={0.7}
    >
      {/* Avatar circle */}
      <View style={s.avatar}>
        <Text style={s.avatarText}>
          {(conv.peerName || '?')[0].toUpperCase()}
        </Text>
      </View>

      {/* Content */}
      <View style={s.rowContent}>
        <View style={s.rowTop}>
          <Text style={s.rowName} numberOfLines={1}>
            {conv.peerName || conv.peerId.slice(0, 8)}
          </Text>
          {conv.lastTs > 0 && (
            <Text style={s.rowTime}>{formatTime(conv.lastTs)}</Text>
          )}
        </View>
        <View style={s.rowBottom}>
          <Text style={s.rowPreview} numberOfLines={1}>
            {conv.lastText || 'No messages yet'}
          </Text>
          {conv.unread > 0 && (
            <View style={s.badge}>
              <Text style={s.badgeText}>
                {conv.unread > 99 ? '99+' : String(conv.unread)}
              </Text>
            </View>
          )}
        </View>
      </View>
    </TouchableOpacity>
  );
}

export function ChatListScreen() {
  const { conversations } = usePeers();

  return (
    <SafeAreaView style={s.container}>
      <FlatList
        data={conversations}
        keyExtractor={(c) => c.peerId}
        renderItem={({ item }) => <ConversationRow conv={item} />}
        ItemSeparatorComponent={() => <View style={s.separator} />}
        contentContainerStyle={conversations.length === 0 ? s.emptyContainer : s.listContent}
        ListEmptyComponent={
          <View style={s.empty}>
            <MessageCircle size={48} color="#94a3b8" />
            <Text style={s.emptyTitle}>No conversations yet</Text>
            <Text style={s.emptySub}>
              Connect to a peer on the Peers tab to start chatting.
            </Text>
          </View>
        }
      />
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  listContent: { paddingBottom: 24 },
  emptyContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },

  // Row
  row: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 16, paddingVertical: 12,
    backgroundColor: '#fff',
  },
  separator: { height: 1, backgroundColor: '#f1f5f9', marginLeft: 76 },

  // Avatar
  avatar: {
    width: 48, height: 48, borderRadius: 24,
    backgroundColor: '#2563eb', alignItems: 'center', justifyContent: 'center',
    marginRight: 12,
  },
  avatarText: { color: '#fff', fontSize: 20, fontWeight: '700' },

  // Row content
  rowContent: { flex: 1 },
  rowTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 3 },
  rowName: { fontSize: 16, fontWeight: '600', color: '#0f172a', flex: 1, marginRight: 8 },
  rowTime: { fontSize: 12, color: '#94a3b8' },
  rowBottom: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  rowPreview: { fontSize: 14, color: '#64748b', flex: 1, marginRight: 8 },

  // Unread badge
  badge: {
    minWidth: 20, height: 20, borderRadius: 10,
    backgroundColor: '#2563eb', alignItems: 'center', justifyContent: 'center',
    paddingHorizontal: 5,
  },
  badgeText: { color: '#fff', fontSize: 11, fontWeight: '700' },

  // Empty state
  empty: { alignItems: 'center', paddingHorizontal: 32 },
  emptyEmoji: { fontSize: 48, marginBottom: 12 },
  emptyTitle: { fontSize: 20, fontWeight: '700', color: '#0f172a', marginBottom: 8 },
  emptySub: { fontSize: 14, color: '#64748b', textAlign: 'center', lineHeight: 22 },
});
