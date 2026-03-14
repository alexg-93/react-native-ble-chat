import React, { useEffect } from 'react';
import { View, StyleSheet } from 'react-native';
import Animated, {
  useSharedValue, useAnimatedStyle,
  withRepeat, withTiming, withDelay, withSequence, cancelAnimation,
} from 'react-native-reanimated';

interface Props {
  isScanning: boolean;
}

export function RadarView({ isScanning }: Props) {
  const ring1 = useSharedValue(0);
  const ring2 = useSharedValue(0);
  const ring3 = useSharedValue(0);
  const dot   = useSharedValue(1);

  useEffect(() => {
    if (isScanning) {
      ring1.value = withRepeat(withTiming(1, { duration: 2000 }), -1, false);
      ring2.value = withDelay(650,  withRepeat(withTiming(1, { duration: 2000 }), -1, false));
      ring3.value = withDelay(1300, withRepeat(withTiming(1, { duration: 2000 }), -1, false));
      dot.value   = withRepeat(
        withSequence(withTiming(1.18, { duration: 700 }), withTiming(1, { duration: 700 })),
        -1, true
      );
    } else {
      [ring1, ring2, ring3, dot].forEach((sv) => cancelAnimation(sv));
      ring1.value = withTiming(0, { duration: 400 });
      ring2.value = withTiming(0, { duration: 400 });
      ring3.value = withTiming(0, { duration: 400 });
      dot.value   = withTiming(1, { duration: 300 });
    }
  }, [isScanning]);

  const r1Style = useAnimatedStyle(() => ({
    transform: [{ scale: 0.1 + ring1.value * 0.9 }],
    opacity: 0.85 * (1 - ring1.value),
  }));
  const r2Style = useAnimatedStyle(() => ({
    transform: [{ scale: 0.1 + ring2.value * 0.9 }],
    opacity: 0.85 * (1 - ring2.value),
  }));
  const r3Style = useAnimatedStyle(() => ({
    transform: [{ scale: 0.1 + ring3.value * 0.9 }],
    opacity: 0.85 * (1 - ring3.value),
  }));
  const dotStyle = useAnimatedStyle(() => ({ transform: [{ scale: dot.value }] }));

  if (!isScanning) return null;
  return (
    <View style={styles.container}>
      <Animated.View style={[styles.ring, styles.ringOuter, r1Style]} />
      <Animated.View style={[styles.ring, styles.ringMid,   r2Style]} />
      <Animated.View style={[styles.ring, styles.ringInner, r3Style]} />
      <Animated.View style={[styles.dot, dotStyle]} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center', justifyContent: 'center',
    width: 140, height: 140, alignSelf: 'center',
  },
  ring: { position: 'absolute', borderRadius: 100, borderWidth: 2 },
  ringOuter: { width: 120, height: 120, borderColor: '#2563eb' },
  ringMid:   { width: 120, height: 120, borderColor: '#60a5fa' },
  ringInner: { width: 120, height: 120, borderColor: '#93c5fd' },
  dot: { width: 14, height: 14, borderRadius: 7, backgroundColor: '#2563eb' },
});
