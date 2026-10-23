import React, { useEffect, useRef, useState } from 'react';
import { Animated, View, Text, Pressable, StyleSheet, Platform } from 'react-native';
import { BlurView } from '@react-native-community/blur';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../theme/ThemeProvider';
import { withAlpha } from '../utils/color';
import { Icon, type IconName } from '../components/Icon';
import { useUnseenUpdateCount } from '../library/libraryUpdates';
import type { TabKey } from './types';

const TABS: { key: TabKey; label: string; icon: IconName }[] = [
  { key: 'home', label: 'Home', icon: 'home' },
  { key: 'library', label: 'Library', icon: 'library' },
  { key: 'discover', label: 'Discover', icon: 'discover' },
  { key: 'updates', label: 'Updates', icon: 'updates' },
  { key: 'profile', label: 'Profile', icon: 'profile' },
];

interface GlassTabBarProps {
  active: TabKey;
  onChange: (key: TabKey) => void;
}

/**
 * Floating bottom navigation. On iOS it is frosted glass: a real backdrop blur
 * with a translucent fill and a hairline top highlight.
 *
 * On Android the blur is deliberately off. There is no compositor-level blur
 * for a view; the BlurView library emulates one by redrawing the *entire*
 * activity content into a bitmap on every pre-draw, so every scrolled or
 * animated frame is rendered twice or more. That is a constant cost on every
 * screen for one small bar, and the extra draw pass also collided with the
 * fragment framework's dismissal animation, painting a just-popped screen for
 * one frame ("the app blinks when I press back"). A solid elevated surface is
 * cheaper and reads the same.
 */
const USE_BLUR = Platform.OS === 'ios';

/** The pill behind the active tab's icon. */
const INDICATOR_WIDTH = 56;
const INDICATOR_HEIGHT = 32;
const ROW_PADDING_TOP = 8;
const SPRING = { damping: 18, stiffness: 220, mass: 0.7 };
/**
 * Plain Animated on the native driver, not Reanimated: switching tabs mounts a
 * whole screen in the same commit, and the Reanimated version's final position
 * never reached the screen, leaving the pill one tab behind.
 */
const useNativeDriver = true;

export function GlassTabBar({ active, onChange }: GlassTabBarProps) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const unseenUpdates = useUnseenUpdateCount();
  const activeIndex = Math.max(0, TABS.findIndex(tab => tab.key === active));

  // The indicator slides between tabs rather than jumping, so the eye follows
  // the switch. Tab widths are equal, so one measurement places it.
  const [rowWidth, setRowWidth] = useState(0);
  const position = useRef(new Animated.Value(activeIndex)).current;
  useEffect(() => {
    const spring = Animated.spring(position, { toValue: activeIndex, ...SPRING, useNativeDriver });
    spring.start();
    return () => spring.stop();
  }, [activeIndex, position]);
  const tabWidth = rowWidth / TABS.length;
  const firstX = (tabWidth - INDICATOR_WIDTH) / 2;
  const translateX = position.interpolate({
    inputRange: [0, TABS.length - 1],
    outputRange: [firstX, firstX + (TABS.length - 1) * tabWidth],
  });

  return (
    <View style={[styles.wrap, { paddingBottom: Math.max(insets.bottom, 10) }]} pointerEvents="box-none">
      <View
        style={[
          styles.bar,
          {
            borderRadius: theme.radius.xxl,
            borderColor: USE_BLUR ? theme.colors.glassHighlight : theme.colors.border,
            backgroundColor: USE_BLUR ? theme.colors.glass : theme.colors.elevated,
          },
        ]}
      >
        {USE_BLUR ? (
          <BlurView
            style={StyleSheet.absoluteFill}
            blurType={theme.scheme === 'dark' ? 'dark' : 'light'}
            blurAmount={20}
            reducedTransparencyFallbackColor={theme.colors.surface}
          />
        ) : null}
        <View style={styles.row} onLayout={e => setRowWidth(e.nativeEvent.layout.width)}>
          {rowWidth > 0 ? (
            <Animated.View
              pointerEvents="none"
              style={[
                styles.indicator,
                {
                  backgroundColor: withAlpha(theme.colors.accent, theme.scheme === 'dark' ? 0.2 : 0.16),
                  transform: [{ translateX }],
                },
              ]}
            />
          ) : null}
          {TABS.map(tab => (
            <TabButton
              key={tab.key}
              tab={tab}
              active={tab.key === active}
              badge={tab.key === 'updates' ? unseenUpdates : 0}
              onPress={() => onChange(tab.key)}
            />
          ))}
        </View>
      </View>
    </View>
  );
}

function TabButton({
  tab,
  active,
  badge,
  onPress,
}: {
  tab: { key: TabKey; label: string; icon: IconName };
  active: boolean;
  /** Count shown on the icon; 0 hides it. */
  badge: number;
  onPress: () => void;
}) {
  const theme = useTheme();
  const pressed = useRef(new Animated.Value(1)).current;
  const color = active ? theme.colors.accent : theme.colors.textMuted;
  const badgeText = badge > 99 ? '99+' : String(badge);

  return (
    <Pressable
      style={styles.tab}
      onPress={onPress}
      onPressIn={() => {
        Animated.timing(pressed, { toValue: 0.9, duration: 90, useNativeDriver }).start();
      }}
      onPressOut={() => {
        Animated.spring(pressed, { toValue: 1, ...SPRING, useNativeDriver }).start();
      }}
      hitSlop={6}
      accessibilityRole="tab"
      accessibilityState={{ selected: active }}
      accessibilityLabel={badge > 0 ? `${tab.label}, ${badgeText} new` : tab.label}
    >
      <Animated.View style={[styles.iconBox, { transform: [{ scale: pressed }] }]}>
        <Icon name={tab.icon} size={22} color={color} filled={active} />
        {badge > 0 ? (
          <View
            style={[
              styles.badge,
              { backgroundColor: theme.colors.accent, borderColor: theme.colors.elevated },
            ]}
          >
            <Text style={[styles.badgeText, { color: theme.colors.onAccent }]}>{badgeText}</Text>
          </View>
        ) : null}
      </Animated.View>
      <Text
        numberOfLines={1}
        style={[styles.label, active ? styles.labelActive : null, { color }]}
      >
        {tab.label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: 14,
    alignItems: 'center',
  },
  bar: {
    width: '100%',
    overflow: 'hidden',
    borderWidth: StyleSheet.hairlineWidth,
    ...Platform.select({
      android: { elevation: 12 },
      default: {
        shadowColor: '#000',
        shadowOpacity: 0.18,
        shadowRadius: 18,
        shadowOffset: { width: 0, height: 8 },
      },
    }),
  },
  row: {
    flexDirection: 'row',
    paddingTop: ROW_PADDING_TOP,
    paddingBottom: 8,
  },
  indicator: {
    position: 'absolute',
    top: ROW_PADDING_TOP,
    left: 0,
    width: INDICATOR_WIDTH,
    height: INDICATOR_HEIGHT,
    borderRadius: INDICATOR_HEIGHT / 2,
  },
  tab: {
    flex: 1,
    alignItems: 'center',
  },
  iconBox: {
    width: INDICATOR_WIDTH,
    height: INDICATOR_HEIGHT,
    alignItems: 'center',
    justifyContent: 'center',
  },
  label: {
    fontSize: 11,
    fontWeight: '500',
    marginTop: 3,
    letterSpacing: 0.1,
  },
  labelActive: {
    fontWeight: '700',
  },
  badge: {
    position: 'absolute',
    top: 0,
    left: INDICATOR_WIDTH / 2 + 4,
    minWidth: 17,
    height: 17,
    paddingHorizontal: 4,
    borderRadius: 9,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeText: {
    fontSize: 9.5,
    fontWeight: '800',
  },
});
