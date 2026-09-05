import React, { useEffect, useState } from 'react';
import { StyleProp, View, ViewStyle } from 'react-native';
import LinearGradient from 'react-native-linear-gradient';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
  Easing,
} from 'react-native-reanimated';
import { useTheme } from '../theme/ThemeProvider';

interface SkeletonProps {
  width?: number | `${number}%`;
  height?: number;
  radius?: number;
  style?: StyleProp<ViewStyle>;
}

const SWEEP_MS = 1300;

/**
 * Loading placeholder with a highlight that sweeps left to right.
 *
 * This used to pulse opacity, which at the skeleton token's contrast (6–7%)
 * was close to invisible on both themes — a loading rail read as a row of
 * stale grey boxes. A moving highlight is legible at any contrast because the
 * eye tracks motion, not brightness.
 */
export function Skeleton({ width = '100%', height = 16, radius = 8, style }: SkeletonProps) {
  const theme = useTheme();
  const [measured, setMeasured] = useState(0);
  const progress = useSharedValue(0);

  useEffect(() => {
    progress.value = withRepeat(
      withTiming(1, { duration: SWEEP_MS, easing: Easing.inOut(Easing.quad) }),
      -1,
      false,
    );
  }, [progress]);

  // Travel from fully off the left edge to fully off the right.
  const sweep = useAnimatedStyle(() => ({
    transform: [{ translateX: -measured + progress.value * measured * 2 }],
  }));

  const highlight = theme.scheme === 'dark' ? 'rgba(255,255,255,0.09)' : 'rgba(255,255,255,0.75)';

  return (
    <View
      onLayout={e => setMeasured(e.nativeEvent.layout.width)}
      style={[
        {
          width,
          height,
          borderRadius: radius,
          backgroundColor: theme.colors.skeleton,
          overflow: 'hidden',
        },
        style,
      ]}
    >
      {measured > 0 ? (
        <Animated.View style={[{ position: 'absolute', top: 0, bottom: 0, width: measured }, sweep]}>
          <LinearGradient
            colors={['transparent', highlight, 'transparent']}
            start={{ x: 0, y: 0.5 }}
            end={{ x: 1, y: 0.5 }}
            style={{ flex: 1 }}
          />
        </Animated.View>
      ) : null}
    </View>
  );
}
