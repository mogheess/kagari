import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated,
  Easing,
  Modal,
  PanResponder,
  Pressable,
  StyleSheet,
  useWindowDimensions,
  type LayoutChangeEvent,
  type StyleProp,
  type ViewStyle,
} from 'react-native';

const OPEN_MS = 240;
const CLOSE_MS = 200;
/** Drag past this share of the sheet's height (or this many dp) and it closes. */
const CLOSE_SHARE = 0.25;
const CLOSE_MIN_DP = 80;
/** A downward flick this fast (dp per ms) closes it whatever the distance. */
const CLOSE_VELOCITY = 0.7;
/** In a sheet whose body scrolls, only drags starting this near its top move it. */
const HEADER_ZONE_DP = 76;

/**
 * A bottom sheet: the panel slides up while the backdrop behind it fades in,
 * and it closes from a backdrop tap, the back button, or a drag down (past a
 * quarter of its height, or a flick). A short drag springs back.
 *
 * The parent owns `visible` and `onClose` as with a `Modal`; the sheet stays
 * mounted until its closing animation ends. `style` is the panel's style.
 *
 * `Modal`'s own slide animation moved the dimmed backdrop down with the panel,
 * so the modal doesn't animate and this does it instead. Core `Animated` and
 * `PanResponder`, not Gesture Handler: on Android a `Modal` is its own window,
 * outside the app's gesture root.
 *
 * `scrollable` is for sheets with a list in them. A drag in the list scrolls
 * the list, so only drags from the top of the sheet (handle and title) move it.
 */
export function BottomSheet({
  visible,
  onClose,
  style,
  scrollable = false,
  children,
}: {
  visible: boolean;
  onClose: () => void;
  style?: StyleProp<ViewStyle>;
  scrollable?: boolean;
  children: React.ReactNode;
}) {
  const { height: windowHeight } = useWindowDimensions();
  const [mounted, setMounted] = useState(visible);
  const [sheetHeight, setSheetHeight] = useState(0);
  // How far the panel sits below its resting place: 0 open, its height closed.
  const offset = useRef(new Animated.Value(windowHeight)).current;
  const frame = useRef({ top: 0, height: 0 });
  // The responder is made once; a fresh one mid-drag would drop the gesture.
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  const visibleRef = useRef(visible);
  visibleRef.current = visible;

  useEffect(() => {
    if (visible) {
      if (mounted && frame.current.height > 0) {
        // Reopened while closing: head back up from where it is.
        Animated.timing(offset, {
          toValue: 0,
          duration: OPEN_MS,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }).start();
      }
      setMounted(true);
      return;
    }
    if (!mounted) return;
    const closedAt = frame.current.height || windowHeight;
    const anim = Animated.timing(offset, {
      toValue: closedAt,
      duration: CLOSE_MS,
      easing: Easing.in(Easing.quad),
      useNativeDriver: true,
    });
    anim.start(({ finished }) => {
      if (finished) setMounted(false);
    });
    return () => anim.stop();
  }, [visible, mounted, offset, windowHeight]);

  const onLayout = (e: LayoutChangeEvent) => {
    const { y, height } = e.nativeEvent.layout;
    const first = frame.current.height === 0;
    frame.current = { top: y, height };
    setSheetHeight(height);
    if (first && visible) {
      // Opens from just below the screen edge, now that its height is known.
      offset.setValue(height);
      Animated.timing(offset, {
        toValue: 0,
        duration: OPEN_MS,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }).start();
    }
  };

  // A fresh panel measures itself again on the next open.
  useEffect(() => {
    if (!mounted) {
      frame.current = { top: 0, height: 0 };
      offset.setValue(windowHeight);
    }
  }, [mounted, offset, windowHeight]);

  const responder = useMemo(() => {
    const settle = () =>
      Animated.spring(offset, { toValue: 0, useNativeDriver: true, bounciness: 0, speed: 18 }).start();
    /** Whether a touch that starts at this page y may drag the sheet. */
    const inDragZone = (pageY: number) =>
      !scrollable || pageY - frame.current.top < HEADER_ZONE_DP;
    return PanResponder.create({
      // Plain content (a title, padding) takes no touch of its own, and a
      // touch nothing took at the start is never offered to the move check
      // below, so the sheet takes it up front.
      onStartShouldSetPanResponder: e => inDragZone(e.nativeEvent.pageY),
      // A drag that starts on a row, which took the touch, moves the sheet
      // once it's clearly downward. `y0` is only set once the sheet has the
      // touch, so the start is where it is now less how far it has moved.
      onMoveShouldSetPanResponder: (_e, g) =>
        g.dy >= 8 && Math.abs(g.dy) >= Math.abs(g.dx) * 1.5 && inDragZone(g.moveY - g.dy),
      onPanResponderMove: (_e, g) => offset.setValue(Math.max(0, g.dy)),
      onPanResponderTerminationRequest: () => false,
      onPanResponderRelease: (_e, g) => {
        const height = frame.current.height;
        if (g.dy > Math.max(CLOSE_MIN_DP, height * CLOSE_SHARE) || g.vy > CLOSE_VELOCITY) {
          // The parent turns `visible` off and the close animation carries on
          // from where the finger left the panel. A parent that keeps it open
          // gets the panel back.
          onCloseRef.current();
          requestAnimationFrame(() => {
            if (visibleRef.current) settle();
          });
        } else {
          settle();
        }
      },
      onPanResponderTerminate: settle,
    });
  }, [offset, scrollable]);

  const backdropOpacity = offset.interpolate({
    inputRange: [0, sheetHeight || windowHeight],
    outputRange: [1, 0],
    extrapolate: 'clamp',
  });

  return (
    <Modal visible={mounted} transparent animationType="none" onRequestClose={onClose}>
      <Animated.View style={[styles.backdrop, { opacity: backdropOpacity }]}>
        <Pressable style={styles.fill} onPress={onClose} />
      </Animated.View>
      <Animated.View
        {...responder.panHandlers}
        onLayout={onLayout}
        style={[style, { transform: [{ translateY: offset }] }]}
      >
        {children}
      </Animated.View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  fill: {
    flex: 1,
  },
});
