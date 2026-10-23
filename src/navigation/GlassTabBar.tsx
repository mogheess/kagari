import React, { useEffect, useRef, useState } from 'react';
import { Animated, Image, View, Text, Pressable, StyleSheet, Platform } from 'react-native';
import { BlurView } from '@react-native-community/blur';
import LinearGradient from 'react-native-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useBackdrop, useTheme } from '../theme/ThemeProvider';
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

interface Size {
  width: number;
  height: number;
}

interface GlassTabBarProps {
  active: TabKey;
  onChange: (key: TabKey) => void;
  /** Size of the area the backdrop wallpaper covers (the tabs' container). */
  stage?: Size;
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
 * one frame ("the app blinks when I press back").
 *
 * So Android fakes the glass instead (see AndroidGlass): the backdrop
 * wallpaper never moves, so a blurred copy of it, cut to exactly where the bar
 * sits, looks like the bar is frosting what's behind it, for a one-time
 * cost. Without a backdrop it's a translucent frosted panel.
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

export function GlassTabBar({ active, onChange, stage }: GlassTabBarProps) {
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

  // Like a drop of liquid, the pill stretches as it travels and settles back
  // round when it lands; further jumps stretch it more.
  const stretch = useRef(new Animated.Value(1)).current;
  const previousIndex = useRef(activeIndex);
  useEffect(() => {
    const distance = Math.abs(activeIndex - previousIndex.current);
    previousIndex.current = activeIndex;
    if (distance === 0) return;
    const pull = Animated.sequence([
      Animated.timing(stretch, {
        toValue: Math.min(1.25 + 0.12 * distance, 1.7),
        duration: 120,
        useNativeDriver,
      }),
      Animated.spring(stretch, { toValue: 1, damping: 9, stiffness: 180, mass: 0.6, useNativeDriver }),
    ]);
    pull.start();
    return () => pull.stop();
  }, [activeIndex, stretch]);
  const dark = theme.scheme === 'dark';
  const barFill = USE_BLUR ? theme.colors.glass : 'transparent';

  // Where the bar sits within the stage, to line the frosted wallpaper slice up.
  const [wrapY, setWrapY] = useState(0);
  const [barOrigin, setBarOrigin] = useState<{ x: number; y: number } | null>(null);

  return (
    <View
      style={[styles.wrap, { paddingBottom: Math.max(insets.bottom, 10) }]}
      pointerEvents="box-none"
      onLayout={e => setWrapY(e.nativeEvent.layout.y)}
    >
      <View
        onLayout={e => setBarOrigin({ x: e.nativeEvent.layout.x, y: e.nativeEvent.layout.y })}
        style={[
          styles.bar,
          styles.barEdge,
          {
            borderRadius: theme.radius.xxl,
            borderColor: theme.colors.glassHighlight,
            backgroundColor: barFill,
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
        ) : (
          <AndroidGlass
            stage={stage}
            origin={barOrigin ? { x: barOrigin.x, y: wrapY + barOrigin.y } : null}
          />
        )}
        {/* Thickness: the lower edge of the glass catches less light. */}
        <LinearGradient
          colors={dark ? ['rgba(0,0,0,0)', 'rgba(0,0,0,0.22)'] : ['rgba(0,0,0,0)', 'rgba(0,0,0,0.05)']}
          style={styles.depth}
        />
        {/* A specular streak along the top rim. */}
        <LinearGradient
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          colors={
            dark
              ? ['rgba(255,255,255,0)', 'rgba(255,255,255,0.45)', 'rgba(255,255,255,0)']
              : ['rgba(255,255,255,0)', 'rgba(255,255,255,1)', 'rgba(255,255,255,0)']
          }
          style={styles.rim}
        />
        <View style={styles.row} onLayout={e => setRowWidth(e.nativeEvent.layout.width)}>
          {rowWidth > 0 ? (
            <Animated.View
              pointerEvents="none"
              style={[
                styles.indicator,
                {
                  backgroundColor: withAlpha(theme.colors.accent, dark ? 0.2 : 0.16),
                  borderColor: withAlpha(theme.colors.accent, dark ? 0.35 : 0.3),
                  transform: [{ translateX }, { scaleX: stretch }],
                },
              ]}
            >
              {/* The drop's own highlight. */}
              <LinearGradient
                colors={
                  dark
                    ? ['rgba(255,255,255,0.18)', 'rgba(255,255,255,0)']
                    : ['rgba(255,255,255,0.75)', 'rgba(255,255,255,0)']
                }
                style={styles.dropShine}
              />
            </Animated.View>
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

/** Frosted glass without a live blur; see the note on GlassTabBar. */
function AndroidGlass({
  stage,
  origin,
}: {
  stage?: Size;
  origin: { x: number; y: number } | null;
}) {
  const theme = useTheme();
  const backdrop = useBackdrop();
  const dark = theme.scheme === 'dark';
  const frosted = backdrop && stage && origin;
  return (
    // Over a backdrop, not quite opaque, so what scrolls underneath shows
    // through faintly. Without one there's nothing worth seeing through, and
    // unblurred covers behind the bar just look busy.
    <View style={[styles.fill, frosted ? styles.glassBody : null]}>
      {frosted ? (
        <>
          {/* The thumbnail is plenty once blurred, and far cheaper to decode. */}
          <Image
            source={backdrop.thumb}
            blurRadius={8}
            resizeMode="cover"
            fadeDuration={0}
            style={[
              styles.slice,
              { left: -origin.x, top: -origin.y, width: stage.width, height: stage.height },
            ]}
          />
          {/* A lighter dim than the wallpaper's, so the art glows through the glass. */}
          <View
            style={[
              styles.fill,
              { backgroundColor: withAlpha(theme.colors.bg, dark ? 0.3 : 0.72) },
            ]}
          />
        </>
      ) : null}
      {/* Frosting: lifts the bar off what's behind it. */}
      <View
        style={[
          styles.fill,
          {
            backgroundColor: frosted
              ? dark
                ? 'rgba(255,255,255,0.09)'
                : 'rgba(255,255,255,0.45)'
              : withAlpha(theme.colors.elevated, 0.96),
          },
        ]}
      />
      {/* Light catching the top of the glass. */}
      <LinearGradient
        colors={
          dark
            ? ['rgba(255,255,255,0.16)', 'rgba(255,255,255,0)']
            : ['rgba(255,255,255,0.8)', 'rgba(255,255,255,0)']
        }
        style={styles.sheen}
      />
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
  fill: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  slice: {
    position: 'absolute',
  },
  barEdge: {
    borderWidth: 1,
  },
  glassBody: {
    opacity: 0.9,
  },
  sheen: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: '55%',
  },
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
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
  },
  dropShine: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: '60%',
  },
  depth: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: '45%',
  },
  rim: {
    position: 'absolute',
    top: 0,
    left: 24,
    right: 24,
    height: 1,
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
