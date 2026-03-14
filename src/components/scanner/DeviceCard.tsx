import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ActivityIndicator } from 'react-native';
import Animated, { FadeInLeft } from 'react-native-reanimated';
import { Link2, Radio, Star, Search, Plug, X } from 'lucide-react-native';
import { SignalBars } from './SignalBars';
import { RssiSparkline } from './RssiSparkline';
import { estimateDistance } from '../../utils/rssi';
import { timeAgo } from '../../utils/time';
import { getDeviceDisplayName } from '../../utils/deviceName';
import { MANUFACTURER_NAMES } from '../../utils/manufacturers';
import { SERVICE_NAMES } from '../../utils/gatt';
import { ScannerDevice } from '../../store/scannerStore';

interface Props {
  device: ScannerDevice;
  isExpanded: boolean;
  isConnected: boolean;
  isConnecting: boolean;
  isFavorite: boolean;
  rssiHistory: number[];
  scanning: boolean;
  isNew: boolean;
  onPress: () => void;
  onConnect: () => void;
  onDisconnect: () => void;
  onToggleFavorite: () => void;
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={s.detailRow}>
      <Text style={s.detailLabel}>{label}</Text>
      <Text style={s.detailValue} selectable>{value}</Text>
    </View>
  );
}

export function DeviceCard({
  device: d,
  isExpanded,
  isConnected,
  isConnecting,
  isFavorite,
  rssiHistory,
  scanning,
  isNew,
  onPress,
  onConnect,
  onDisconnect,
  onToggleFavorite,
}: Props) {
  const displayName = getDeviceDisplayName(d);
  const isInferred = !d.name && displayName;

  return (
    <Animated.View
      entering={isNew ? FadeInLeft.duration(300) : undefined}
      style={{ alignSelf: 'stretch' }}>
      <TouchableOpacity
        style={[s.card, isConnected && s.cardConnected]}
        activeOpacity={0.7}
        onPress={onPress}>

        {/* Top row: name + signal */}
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <View style={{ flex: 1, marginRight: 8 }}>
            <Text style={s.deviceName}>{displayName || '(unnamed)'}</Text>
            {!!isInferred && <Text style={s.inferredLabel}>inferred from ad data</Text>}
            {isConnected && <Text style={s.connectedLabel}>● Connected</Text>}
          </View>
          <View style={{ alignItems: 'flex-end' }}>
            <SignalBars rssi={d.rssi} isScanning={scanning} />
            <Text style={s.rssiText}>{d.rssi} dBm</Text>
            <Text style={s.distText}>≈ {estimateDistance(d.rssi, d.txPowerLevel)}</Text>
          </View>
        </View>

        {/* Tags */}
        <View style={s.tagRow}>
          <View style={[s.tag, { backgroundColor: d.isConnectable ? '#dbeafe' : '#f3f4f6', flexDirection: 'row', alignItems: 'center', gap: 3 }]}>
            {d.isConnectable ? <Link2 size={10} color="#475569" /> : <Radio size={10} color="#475569" />}
            <Text style={s.tagText}>{d.isConnectable ? 'connectable' : 'beacon'}</Text>
          </View>
          {d.manufacturerId != null && MANUFACTURER_NAMES[d.manufacturerId] && (
            <View style={[s.tag, { backgroundColor: '#fef3c7' }]}>
              <Text style={s.tagText}>{MANUFACTURER_NAMES[d.manufacturerId]}</Text>
            </View>
          )}
          {d.serviceUUIDs?.map((uuid) => {
            const key = uuid.toUpperCase().replace(/^0+/, '');
            const label = SERVICE_NAMES[key];
            return label ? (
              <View key={uuid} style={[s.tag, { backgroundColor: '#ede9fe' }]}>
                <Text style={s.tagText}>{label}</Text>
              </View>
            ) : null;
          })}
        </View>

        {/* Expanded detail */}
        {isExpanded && (
          <View style={s.expandedSection}>
            <DetailRow label="Device ID" value={d.id} />
            {d.txPowerLevel != null && (
              <DetailRow label="TX Power" value={`${d.txPowerLevel} dBm`} />
            )}
            {d.manufacturerId != null && (
              <DetailRow
                label="Manufacturer ID"
                value={`${d.manufacturerId} (${MANUFACTURER_NAMES[d.manufacturerId] || 'Unknown'})`}
              />
            )}
            {d.serviceUUIDs && d.serviceUUIDs.length > 0 && (
              <DetailRow label="Services" value={d.serviceUUIDs.join(', ')} />
            )}
            <DetailRow label="Est. Distance" value={estimateDistance(d.rssi, d.txPowerLevel)} />
            {!!d.firstSeen && (
              <DetailRow label="First Seen" value={new Date(d.firstSeen).toLocaleTimeString()} />
            )}
            {!!d.lastSeen && (
              <DetailRow label="Last Seen" value={timeAgo(d.lastSeen)} />
            )}

            {/* RSSI sparkline */}
            {rssiHistory.length > 1 && (
              <View style={[s.detailRow, { alignItems: 'flex-end' }]}>
                <Text style={s.detailLabel}>RSSI Trend</Text>
                <RssiSparkline history={rssiHistory} />
              </View>
            )}

            {/* Favorite toggle */}
            <TouchableOpacity style={s.favoriteRow} onPress={onToggleFavorite} activeOpacity={0.7}>
              <Star size={16} color={isFavorite ? '#f59e0b' : '#94a3b8'} fill={isFavorite ? '#f59e0b' : 'none'} />
              <Text style={s.favoriteText}>{isFavorite ? 'Remove from Favorites' : 'Add to Favorites'}</Text>
            </TouchableOpacity>

            {/* Connect / Disconnect */}
            {d.isConnectable && (
              <View style={{ marginTop: 10, flexDirection: 'row', gap: 8 }}>
                <TouchableOpacity
                  style={[
                    s.connectBtn,
                    isConnected && s.connectBtnConnected,
                    isConnecting && s.connectBtnConnecting,
                  ]}
                  onPress={onConnect}
                  disabled={isConnecting}
                  activeOpacity={0.7}>
                  {isConnecting ? (
                    <ActivityIndicator size="small" color="#fff" />
                  ) : (
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                      {isConnected ? <Search size={14} color="#fff" /> : <Plug size={14} color="#fff" />}
                      <Text style={s.connectBtnText}>{isConnected ? 'Explore GATT' : 'Connect'}</Text>
                    </View>
                  )}
                </TouchableOpacity>
                {isConnected && (
                  <TouchableOpacity style={s.disconnectBtn} onPress={onDisconnect} activeOpacity={0.7}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    <X size={14} color="#dc2626" />
                    <Text style={s.disconnectBtnText}>Disconnect</Text>
                  </View>
                  </TouchableOpacity>
                )}
              </View>
            )}
          </View>
        )}

        {/* Collapsed footer */}
        {!isExpanded && (
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 4 }}>
            <Text style={s.deviceId}>
              {d.id.substring(0, 18)}…  •  {d.lastSeen ? timeAgo(d.lastSeen) : ''}  •  tap for details
            </Text>
            <TouchableOpacity
              onPress={onToggleFavorite}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              activeOpacity={0.6}>
              <Star size={16} color={isFavorite ? '#f59e0b' : '#94a3b8'} fill={isFavorite ? '#f59e0b' : 'none'} />
            </TouchableOpacity>
          </View>
        )}
      </TouchableOpacity>
    </Animated.View>
  );
}

const s = StyleSheet.create({
  card: {
    backgroundColor: '#f8fafc', borderRadius: 12, padding: 14,
    marginVertical: 4, alignSelf: 'stretch',
    borderWidth: 1, borderColor: '#e2e8f0',
  },
  cardConnected: { borderColor: '#22c55e', borderWidth: 2 },
  deviceName: { fontWeight: '700', fontSize: 15 },
  inferredLabel: { fontSize: 10, color: '#94a3b8', fontStyle: 'italic', marginTop: 1 },
  connectedLabel: { fontSize: 11, color: '#16a34a', fontWeight: '700', marginTop: 2 },
  rssiText: { fontSize: 10, color: '#64748b', marginTop: 2 },
  distText: { fontSize: 10, color: '#6366f1', marginTop: 1 },
  tagRow: { flexDirection: 'row', gap: 6, marginTop: 6, flexWrap: 'wrap' },
  tag: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
  tagText: { fontSize: 11, color: '#475569' },
  deviceId: { fontSize: 10, color: '#94a3b8', marginTop: 6 },
  expandedSection: { marginTop: 10, paddingTop: 10, borderTopWidth: 1, borderTopColor: '#e2e8f0' },
  detailRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 4 },
  detailLabel: { fontSize: 12, color: '#64748b', fontWeight: '500' },
  detailValue: { fontSize: 12, color: '#0f172a', fontWeight: '600', maxWidth: '60%', textAlign: 'right' },
  favoriteRow: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 8, marginTop: 2 },
  favoriteText: { fontSize: 13, color: '#f59e0b', fontWeight: '600' },
  connectBtn: {
    flex: 1, backgroundColor: '#2563eb', paddingVertical: 10,
    borderRadius: 10, alignItems: 'center',
  },
  connectBtnConnected: { backgroundColor: '#0369a1' },
  connectBtnConnecting: { backgroundColor: '#93c5fd' },
  connectBtnText: { color: '#fff', fontSize: 14, fontWeight: '700' },
  disconnectBtn: {
    backgroundColor: '#fef2f2', paddingHorizontal: 14, paddingVertical: 10,
    borderRadius: 10, alignItems: 'center', borderWidth: 1, borderColor: '#fca5a5',
  },
  disconnectBtnText: { color: '#dc2626', fontSize: 13, fontWeight: '700' },
});
