/**
 * Draggable scrollbar thumb for a long `ScrollView`.
 *
 * A chapter list runs to several hundred rows, so reaching the far end by
 * swiping takes many flings. Dragging this thumb maps directly onto the scroll
 * range, making either end one gesture away.
 *
 * The thumb fades in while the list moves (or while it's being dragged) and
 * fades out after a short idle, so it doesn't sit on top of the content.
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated,
  PanResponder,
  StyleSheet,
  View,
  type ScrollView,
} from 'react-native';
import { useTheme } from '../theme/ThemeProvider';

interface Props {
  scrollRef: React.RefObject<ScrollView | null>;
  /** Total scrollable content height, from `onContentSizeChange`. */
  contentHeight: number;
  /** Visible height of the scroll view, from `onLayout`. */
  viewportHeight: number;
  /** Current scroll offset, from `onScroll`. */
  scrollY: number;
  /** Space to leave clear at the top and bottom of the track. */
  topInset?: number;
  bottomInset?: number;
}

const THUMB_HEIGHT = 52;
const THUMB_WIDTH = 8;
const TOUCH_WIDTH = 36;
/** Below this the list is short enough to swipe; don't clutter it with a thumb. */
const MIN_OVERFLOW_RATIO = 2;
const FADE_OUT_DELAY = 1400;

export function FastScroller({
  scrollRef,
  contentHeight,
  viewportHeight,
  scrollY,
  topInset = 0,
  bottomInset = 0,
}: Props) {
  const theme = useTheme();
  const [dragging, setDragging] = useState(false);
  // Mirrors the fade so the touch strip can be made inert while hidden — an
  // invisible grab area down the right edge would otherwise swallow ordinary
  // scroll gestures on the content behind it.
  const [visible, setVisible] = useState(false);
  const opacity = useRef(new Animated.Value(0)).current;
  const fadeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const trackHeight = Math.max(0, viewportHeight - topInset - bottomInset);
  const maxScroll = Math.max(0, contentHeight - viewportHeight);
  const travel = Math.max(0, trackHeight - THUMB_HEIGHT);
  const enabled = viewportHeight > 0 && contentHeight > viewportHeight * MIN_OVERFLOW_RATIO;

  // Where the thumb sits for the current scroll offset. While dragging, the
  // ScrollView's own onScroll drives this, so the thumb tracks the finger
  // without a second source of truth.
  const thumbTop = maxScroll > 0 ? (scrollY / maxScroll) * travel : 0;

  const show = useCallback(() => {
    if (fadeTimer.current) clearTimeout(fadeTimer.current);
    setVisible(true);
    Animated.timing(opacity, { toValue: 1, duration: 120, useNativeDriver: true }).start();
  }, [opacity]);

  const scheduleHide = useCallback(() => {
    if (fadeTimer.current) clearTimeout(fadeTimer.current);
    fadeTimer.current = setTimeout(() => {
      Animated.timing(opacity, { toValue: 0, duration: 260, useNativeDriver: true }).start(
        ({ finished }) => {
          if (finished) setVisible(false);
        },
      );
    }, FADE_OUT_DELAY);
  }, [opacity]);

  // Any scroll movement reveals the thumb; dragging keeps it pinned visible.
  useEffect(() => {
    if (!enabled) return;
    show();
    if (!dragging) scheduleHide();
  }, [scrollY, dragging, enabled, show, scheduleHide]);

  useEffect(
    () => () => {
      if (fadeTimer.current) clearTimeout(fadeTimer.current);
    },
    [],
  );

  // Ref mirrors so the PanResponder (created once) always reads live geometry.
  const geometry = useRef({ travel, maxScroll, thumbTop });
  geometry.current = { travel, maxScroll, thumbTop };

  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: () => true,
        onPanResponderGrant: () => {
          setDragging(true);
          show();
        },
        onPanResponderMove: (_evt, gesture) => {
          const { travel: t, maxScroll: m, thumbTop: start } = geometry.current;
          if (t <= 0 || m <= 0) return;
          const next = Math.min(Math.max(start + gesture.dy, 0), t);
          scrollRef.current?.scrollTo({ y: (next / t) * m, animated: false });
        },
        onPanResponderRelease: () => {
          setDragging(false);
          scheduleHide();
        },
        onPanResponderTerminate: () => {
          setDragging(false);
          scheduleHide();
        },
      }),
    // `geometry` is a ref, so the responder never needs rebuilding.
    [scrollRef, show, scheduleHide],
  );

  if (!enabled) return null;

  return (
    <Animated.View
      pointerEvents="box-none"
      style={[styles.track, { top: topInset, height: trackHeight, opacity }]}
    >
      <View
        {...panResponder.panHandlers}
        pointerEvents={visible ? 'auto' : 'none'}
        style={[styles.touchArea, { transform: [{ translateY: thumbTop }] }]}
      >
        <View
          style={[
            styles.thumb,
            {
              backgroundColor: dragging ? theme.colors.accent : theme.colors.textFaint,
              width: dragging ? THUMB_WIDTH + 2 : THUMB_WIDTH,
            },
          ]}
        />
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  track: {
    position: 'absolute',
    right: 0,
    width: TOUCH_WIDTH,
  },
  touchArea: {
    height: THUMB_HEIGHT,
    width: TOUCH_WIDTH,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    paddingRight: 4,
  },
  thumb: {
    height: THUMB_HEIGHT - 12,
    borderRadius: 999,
  },
});
