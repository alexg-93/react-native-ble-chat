import React, { useMemo } from 'react';
import {
  View, Text, TextInput, FlatList, TouchableOpacity, StyleSheet, SafeAreaView,
} from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useScanner } from '../hooks/useScanner';
import { usePrefsStore } from '../store/prefsStore';
import { DeviceCard } from '../components/scanner/DeviceCard';
import { RadarView } from '../components/scanner/RadarView';
import { StateBadge } from '../components/common/StateBadge';
import { SortChips } from '../components/common/SortChips';
import { EmptyState } from '../components/common/EmptyState';
import { Toggle } from '../components/common/Toggle';
import { Radio } from 'lucide-react-native';
import { ScannerDevice } from '../store/scannerStore';
import { timeAgo } from '../utils/time';
import type { ScannerStackParamList } from '../navigation/AppNavigator';

type Props = NativeStackScreenProps<ScannerStackParamList, 'Scanner'>;

export function ScannerScreen({ navigation }: Props) {
  const {
    btState, scanning, devices, connState, rssiHistory,
    search, sortMode, expandedId, countdown, error, staleDevices, staleTimestamp,
    startScan, stopScan, connect, disconnect,
    setSearch, setSortMode, setExpandedId,
  } = useScanner();

  const { favorites, toggleFavorite, isFavorite, autoReconnect, setAutoReconnect } = usePrefsStore();

  const sorted = useMemo(() => {
    let list = devices.filter((d) => {
      if (!search) return true;
      const q = search.toLowerCase();
      return d.name?.toLowerCase().includes(q) || d.id.toLowerCase().includes(q);
    });
    if (sortMode === 'rssi') list = [...list].sort((a, b) => b.rssi - a.rssi);
    else if (sortMode === 'lastSeen') list = [...list].sort((a, b) => b.lastSeen - a.lastSeen);
    else if (sortMode === 'name') list = [...list].sort((a, b) => (a.name ?? a.id).localeCompare(b.name ?? b.id));
    else if (sortMode === 'favorites') {
      list = list.filter((d) => isFavorite(d.id));
      list = [...list].sort((a, b) => b.lastSeen - a.lastSeen);
    }
    return list;
  }, [devices, search, sortMode, favorites]);

  function handleConnect(device: ScannerDevice) {
    const cState = connState[device.id];
    if (cState === 'connected') {
      navigation.navigate('GattDetail', { deviceId: device.id });
    } else {
      connect(device.id);
    }
  }

  return (
    <SafeAreaView style={s.container}>
      {/* Header */}
      <View style={s.header}>
        <RadarView isScanning={scanning} />
        <View style={s.headerText}>
          <Text style={s.title}>BLE Scanner</Text>
          {scanning ? (
            <Text style={s.subtitle}>Scanning… {countdown > 0 ? `${countdown}s` : ''}</Text>
          ) : (
            <Text style={s.subtitle}>{devices.length} device{devices.length !== 1 ? 's' : ''} found</Text>
          )}
        </View>
        <TouchableOpacity
          style={[s.scanBtn, scanning && s.scanBtnStop]}
          onPress={scanning ? stopScan : startScan}
          activeOpacity={0.7}>
          <Text style={s.scanBtnText}>{scanning ? 'Stop' : 'Scan'}</Text>
        </TouchableOpacity>
      </View>

      <StateBadge state={btState} />

      {!!error && (
        <View style={s.errorBanner}>
          <Text style={s.errorText}>{error}</Text>
        </View>
      )}

      <Toggle
        label="Auto-reconnect favorites"
        value={autoReconnect}
        onValueChange={setAutoReconnect}
      />
      <SortChips value={sortMode} onChange={setSortMode} />
      <TextInput
        style={s.searchInput}
        placeholder="Search by name or ID…"
        placeholderTextColor="#94a3b8"
        value={search}
        onChangeText={setSearch}
        clearButtonMode="while-editing"
      />

      {!scanning && devices.length === 0 && staleDevices && staleDevices.length > 0 && (
        <View style={s.staleBanner}>
          <Text style={s.staleText}>
            Last scan: {staleTimestamp ? timeAgo(staleTimestamp) : ''} — showing {staleDevices.length} cached device{staleDevices.length !== 1 ? 's' : ''}
          </Text>
        </View>
      )}

      <FlatList
        data={sorted.length > 0 ? sorted : (!scanning && staleDevices ? staleDevices : [])}
        keyExtractor={(d) => d.id}
        contentContainerStyle={s.listContent}
        renderItem={({ item }) => {
          const cState = connState[item.id];
          return (
            <DeviceCard
              device={item}
              isExpanded={expandedId === item.id}
              isConnected={cState === 'connected'}
              isConnecting={cState === 'connecting'}
              isFavorite={isFavorite(item.id)}
              rssiHistory={rssiHistory[item.id] ?? []}
              scanning={scanning}
              isNew={false}
              onPress={() => setExpandedId(expandedId === item.id ? null : item.id)}
              onConnect={() => handleConnect(item)}
              onDisconnect={() => disconnect(item.id)}
              onToggleFavorite={() => toggleFavorite(item.id)}
            />
          );
        }}
        ListEmptyComponent={
          scanning ? null : (
            <EmptyState
              icon={<Radio size={48} color="#94a3b8" />}
              title="No devices found"
              subtitle="Tap Scan to start scanning for nearby Bluetooth devices"
            />
          )
        }
      />
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingTop: 12, paddingBottom: 8, gap: 12 },
  headerText: { flex: 1 },
  title: { fontSize: 20, fontWeight: '800', color: '#0f172a' },
  subtitle: { fontSize: 13, color: '#64748b', marginTop: 2 },
  scanBtn: { backgroundColor: '#2563eb', paddingHorizontal: 20, paddingVertical: 10, borderRadius: 10 },
  scanBtnStop: { backgroundColor: '#dc2626' },
  scanBtnText: { color: '#fff', fontWeight: '700', fontSize: 15 },
  errorBanner: { backgroundColor: '#fef2f2', marginHorizontal: 16, marginTop: 6, borderRadius: 8, padding: 10, borderLeftWidth: 3, borderLeftColor: '#dc2626' },
  errorText: { color: '#dc2626', fontSize: 12 },
  searchInput: { marginHorizontal: 16, marginTop: 8, backgroundColor: '#f1f5f9', borderRadius: 10, paddingHorizontal: 14, paddingVertical: 10, fontSize: 14, color: '#0f172a' },
  staleBanner: { backgroundColor: '#fefce8', marginHorizontal: 16, marginTop: 6, borderRadius: 8, padding: 8 },
  staleText: { fontSize: 12, color: '#854d0e', textAlign: 'center' },
  listContent: { paddingHorizontal: 16, paddingBottom: 32, paddingTop: 8 },
});
