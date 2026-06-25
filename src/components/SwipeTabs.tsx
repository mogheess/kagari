import React, { useEffect, useRef } from 'react';
import { StyleSheet, useWindowDimensions, type ViewStyle } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';

interface SwipeTabsProps {
  /** Active tab index. */
  index: number;
  /** Total number of tabs. */
  count: number;
  /** Called with the next index when a horizontal swipe crosses the threshold. */
  onIndexChange: (index: number) => void;
  children: React.ReactNode;
  style?: ViewStyle;
}

/**
 * Wraps tabbed content so a horizontal swipe moves to the adjacent tab, the way
 * Mihon's pager does. Vertical scrolling and inner horizontal rails keep working:
 * the pan only activates on a clear horizontal drag in a non-scrolling area and
 * yields to vertical movement. A light slide + fade plays when the tab changes.
 */
export function SwipeTabs({ index, count, onIndexChange, children, style }: SwipeTabsProps) {
  const { width } = useWindowDimensions();
  const indexSV = useSharedValue(index);
  const countSV = useSharedValue(count);
  const translateX = useSharedValue(0);
  const opacity = useSharedValue(1);
  const prev = useRef(index);

  useEffect(() => {
    indexSV.value = index;
  }, [index, indexSV]);
  useEffect(() => {
    countSV.value = count;
  }, [count, countSV]);

  // Subtle slide + fade in the direction of travel whenever the tab changes.
  useEffect(() => {
    const dir = index > prev.current ? 1 : index < prev.current ? -1 : 0;
    prev.current = index;
    if (dir === 0) return;
    translateX.value = dir * 20;
    opacity.value = 0.5;
    translateX.value = withTiming(0, { duration: 200 });
    opacity.value = withTiming(1, { duration: 200 });
  }, [index, opacity, translateX]);

  const pan = Gesture.Pan()
    .activeOffsetX([-24, 24])
    .failOffsetY([-18, 18])
    .onEnd(e => {
      'worklet';
      const far = Math.abs(e.translationX) > width * 0.2;
      const fast = Math.abs(e.velocityX) > 600;
      if (!far && !fast) return;
      const next = e.translationX < 0 ? indexSV.value + 1 : indexSV.value - 1;
      if (next < 0 || next > countSV.value - 1) return;
      runOnJS(onIndexChange)(next);
    });

  const animStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: translateX.value }],
    opacity: opacity.value,
  }));

  return (
    <GestureDetector gesture={pan}>
      <Animated.View style={[styles.fill, style]}>
        <Animated.View style={[styles.fill, animStyle]}>{children}</Animated.View>
      </Animated.View>
    </GestureDetector>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
});
