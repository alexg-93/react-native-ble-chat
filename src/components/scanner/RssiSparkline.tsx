import React from 'react';
import { View } from 'react-native';
import { rssiColor } from '../../utils/rssi';

interface Props {
  history: number[];
}

export function RssiSparkline({ history }: Props) {
  if (!history || history.length < 2) return null;
  const min = Math.min(...history);
  const max = Math.max(...history);
  const range = max - min || 1;
  return (
    <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 1, height: 32, marginTop: 4 }}>
      {history.map((v, i) => (
        <View
          key={i}
          style={{
            width: 3,
            height: 4 + ((v - min) / range) * 28,
            backgroundColor: rssiColor(v),
            borderRadius: 1,
          }}
        />
      ))}
    </View>
  );
}
