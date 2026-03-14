import React, { useEffect } from 'react';
import {
  View, Text, FlatList, TouchableOpacity, StyleSheet, ActivityIndicator, SafeAreaView,
} from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useScannerStore } from '../store/scannerStore';
import { ChevronLeft, AlertTriangle, CheckCircle } from 'lucide-react-native';
import { useGattDetail } from '../hooks/useGattDetail';
import { GattCharacteristicRow } from '../components/scanner/GattCharacteristicRow';
import { SERVICE_NAMES } from '../utils/gatt';
import type { ScannerStackParamList } from '../navigation/AppNavigator';

type Props = NativeStackScreenProps<ScannerStackParamList, 'GattDetail'>;

export function GattDetailScreen({ navigation, route }: Props) {
  const { deviceId } = route.params;
  const device = useScannerStore((s) => s.devices.find((d) => d.id === deviceId));
  const connState = useScannerStore((s) => s.connState[deviceId ?? '']);

  const {
    services, characteristics, values, notifying,
    charHistory, expandedHistory,
    loading, error,
    discover, readChar, toggleSubscribe, toggleHistory, cleanup,
  } = useGattDetail(deviceId ?? '');

  useEffect(() => {
    if (connState === 'connected') {
      discover();
    }
    return () => cleanup();
  }, [connState]);

  if (!deviceId || !device) {
    return (
      <SafeAreaView style={s.container}>
        <Text style={s.errorText}>Device not found. It may have been cleared.</Text>
        <TouchableOpacity style={s.backBtn} onPress={() => navigation.goBack()}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
            <ChevronLeft size={16} color="#2563eb" />
            <Text style={s.backBtnText}>Back</Text>
          </View>
        </TouchableOpacity>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={s.container}>
      <View style={s.deviceInfo}>
        <Text style={s.deviceName}>{device.name ?? '(unnamed)'}</Text>
        <Text style={s.deviceId}>{deviceId}</Text>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
          {connState === 'connected'
            ? <CheckCircle size={12} color="#16a34a" />
            : <AlertTriangle size={12} color="#f59e0b" />}
          <Text style={[s.connStatus, connState === 'connected' && s.connStatusConnected]}>
            {connState === 'connected' ? 'Connected' : 'Not connected'}
          </Text>
        </View>
      </View>

      {loading && (
        <View style={s.loadingRow}>
          <ActivityIndicator size="small" color="#2563eb" />
          <Text style={s.loadingText}>Discovering services…</Text>
        </View>
      )}

      {!!error && (
        <View style={s.errorBanner}>
          <Text style={s.errorText}>{error}</Text>
        </View>
      )}

      <FlatList
        data={services}
        keyExtractor={(svc) => svc.uuid}
        contentContainerStyle={s.listContent}
        renderItem={({ item: svc }) => {
          const svcKey = svc.uuid.toUpperCase().replace(/^0+/, '');
          const svcLabel = SERVICE_NAMES[svcKey] ?? svc.uuid;
          const chars = characteristics[svc.uuid] ?? [];
          return (
            <View style={s.svcSection}>
              <Text style={s.svcTitle}>{svcLabel}</Text>
              <Text style={s.svcUuid}>{svc.uuid}</Text>
              {chars.map((ch) => (
                <GattCharacteristicRow
                  key={ch.uuid}
                  ch={ch}
                  svcUUID={svc.uuid}
                  deviceId={deviceId}
                  value={values[ch.uuid]}
                  isNotifying={!!notifying[ch.uuid]}
                  charHistory={charHistory[ch.uuid] ?? []}
                  isHistoryExpanded={!!expandedHistory[ch.uuid]}
                  onToggleHistory={() => toggleHistory(ch.uuid)}
                  onRead={() => readChar(svc.uuid, ch.uuid)}
                  onToggleSubscribe={() => toggleSubscribe(svc.uuid, ch.uuid)}
                />
              ))}
            </View>
          );
        }}
        ListEmptyComponent={
          !loading ? (
            <View style={s.emptyContainer}>
              <Text style={s.emptyText}>
                {connState !== 'connected'
                  ? 'Connect to the device first to explore GATT services.'
                  : 'No services discovered yet. Tap Discover or wait…'}
              </Text>
              {connState === 'connected' && (
                <TouchableOpacity style={s.discoverBtn} onPress={discover} activeOpacity={0.7}>
                  <Text style={s.discoverBtnText}>Discover Services</Text>
                </TouchableOpacity>
              )}
            </View>
          ) : null
        }
      />
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  deviceInfo: { paddingHorizontal: 16, paddingTop: 12, paddingBottom: 10, borderBottomWidth: 1, borderBottomColor: '#e2e8f0' },
  deviceName: { fontSize: 18, fontWeight: '800', color: '#0f172a' },
  deviceId: { fontSize: 11, color: '#94a3b8', marginTop: 2 },
  connStatus: { fontSize: 12, color: '#94a3b8', marginTop: 4, fontWeight: '600' },
  connStatusConnected: { color: '#16a34a' },
  loadingRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 16, paddingVertical: 10 },
  loadingText: { fontSize: 13, color: '#6366f1' },
  errorBanner: { backgroundColor: '#fef2f2', marginHorizontal: 16, marginTop: 6, borderRadius: 8, padding: 10, borderLeftWidth: 3, borderLeftColor: '#dc2626' },
  errorText: { color: '#dc2626', fontSize: 12 },
  listContent: { paddingHorizontal: 16, paddingBottom: 40, paddingTop: 8 },
  svcSection: { marginBottom: 20 },
  svcTitle: { fontSize: 15, fontWeight: '700', color: '#0f172a' },
  svcUuid: { fontSize: 10, color: '#94a3b8', marginBottom: 6 },
  emptyContainer: { alignItems: 'center', paddingTop: 60, paddingHorizontal: 32 },
  emptyText: { fontSize: 14, color: '#94a3b8', textAlign: 'center', lineHeight: 20 },
  discoverBtn: { marginTop: 16, backgroundColor: '#2563eb', paddingHorizontal: 24, paddingVertical: 12, borderRadius: 10 },
  discoverBtnText: { color: '#fff', fontWeight: '700', fontSize: 14 },
  backBtn: { margin: 16, padding: 12 },
  backBtnText: { fontSize: 15, color: '#2563eb' },
});
