import React, { useEffect } from 'react';
import { View } from 'react-native';
import Animated, {
  useSharedValue, useAnimatedStyle,
  withRepeat, withTiming, withDelay, withSequence, cancelAnimation,
} from 'react-native-reanimated';
import { rssiColor } from '../../utils/rssi';

interface Props {
  rssi: number;
  isScanning: boolean;
}

export function SignalBars({ rssi, isScanning }: Props) {
  const a0 = useSharedValue(1);
  const a1 = useSharedValue(1);
  const a2 = useSharedValue(1);
  const a3 = useSharedValue(1);
  const svs = [a0, a1, a2, a3];

  useEffect(() => {
    if (isScanning) {
      svs.forEach((sv, i) => {
        sv.value = withDelay(
          i * 80,
          withRepeat(
            withSequence(withTiming(1.12, { duration: 400 }), withTiming(1, { duration: 400 })),
            -1, true
          )
        );
      });
    } else {
      svs.forEach((sv) => { cancelAnimation(sv); sv.value = withTiming(1, { duration: 200 }); });
    }
  }, [isScanning]);

  const s0 = useAnimatedStyle(() => ({ transform: [{ scaleY: a0.value }] }));
  const s1 = useAnimatedStyle(() => ({ transform: [{ scaleY: a1.value }] }));
  const s2 = useAnimatedStyle(() => ({ transform: [{ scaleY: a2.value }] }));
  const s3 = useAnimatedStyle(() => ({ transform: [{ scaleY: a3.value }] }));
  const animStyles = [s0, s1, s2, s3];

  const color = rssiColor(rssi);
  const thresholds = [-90, -80, -65, -50];
  const heights    = [4,    8,   12,  16];

  return (
    <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 2, height: 18 }}>
      {thresholds.map((thresh, i) => (
        <Animated.View
          key={i}
          style={[
            { width: 5, height: heights[i], borderRadius: 2,
              backgroundColor: rssi >= thresh ? color : '#e2e8f0' },
            animStyles[i],
          ]}
        />
      ))}
    </View>
  );
}
