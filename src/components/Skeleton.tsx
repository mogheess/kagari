import React, { useEffect, useRef, useState } from 'react';
import { Animated, Easing, StyleProp, View, ViewStyle } from 'react-native';
import LinearGradient from 'react-native-linear-gradient';
import { useTheme } from '../theme/ThemeProvider';
import { useScreenVisible } from '../navigation/screenVisibility';

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
 *
 * The sweep runs on the native animation driver and stops while its screen is
 * hidden. As a Reanimated loop it committed the whole shadow tree every frame,
 * and screens kept alive under the reader kept theirs running: an idle reader
 * held the UI thread at 70–90%.
 */
export function Skeleton({ width = '100%', height = 16, radius = 8, style }: SkeletonProps) {
  const theme = useTheme();
  const visible = useScreenVisible();
  const [measured, setMeasured] = useState(0);
  const progress = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!visible || measured <= 0) return;
    progress.setValue(0);
    const loop = Animated.loop(
      Animated.timing(progress, {
        toValue: 1,
        duration: SWEEP_MS,
        easing: Easing.inOut(Easing.quad),
        useNativeDriver: true,
      }),
    );
    loop.start();
    return () => loop.stop();
  }, [visible, measured, progress]);

  // Travel from fully off the left edge to fully off the right.
  const translateX = progress.interpolate({
    inputRange: [0, 1],
    outputRange: [-measured, measured],
  });

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
        <Animated.View
          style={{
            position: 'absolute',
            top: 0,
            bottom: 0,
            width: measured,
            transform: [{ translateX }],
          }}
        >
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
