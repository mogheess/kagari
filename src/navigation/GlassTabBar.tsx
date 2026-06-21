import React from 'react';
import { View, Text, Pressable, StyleSheet, Platform } from 'react-native';
import { BlurView } from '@react-native-community/blur';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, {
  useAnimatedStyle,
  withTiming,
  useDerivedValue,
} from 'react-native-reanimated';
import { useTheme } from '../theme/ThemeProvider';
import { Icon, type IconName } from '../components/Icon';
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
 * Floating frosted-glass bottom navigation. Real backdrop blur via BlurView,
 * with a translucent fill + hairline top highlight as the premium "glass" cue.
 * Falls back gracefully to the translucent fill if blur is unavailable.
 */
export function GlassTabBar({ active, onChange }: GlassTabBarProps) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();

  return (
    <View style={[styles.wrap, { paddingBottom: Math.max(insets.bottom, 10) }]} pointerEvents="box-none">
      <View
        style={[
          styles.bar,
          {
            borderRadius: theme.radius.xxl,
            borderColor: theme.colors.glassHighlight,
            backgroundColor: theme.colors.glass,
          },
        ]}
      >
        <BlurView
          style={StyleSheet.absoluteFill}
          blurType={theme.scheme === 'dark' ? 'dark' : 'light'}
          blurAmount={20}
          reducedTransparencyFallbackColor={theme.colors.surface}
        />
        <View style={styles.row}>
          {TABS.map(tab => (
            <TabButton
              key={tab.key}
              tab={tab}
              active={tab.key === active}
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
  onPress,
}: {
  tab: { key: TabKey; label: string; icon: IconName };
  active: boolean;
  onPress: () => void;
}) {
  const theme = useTheme();
  const activeValue = useDerivedValue(() => withTiming(active ? 1 : 0, { duration: 180 }), [active]);

  const labelStyle = useAnimatedStyle(() => ({
    opacity: 0.55 + activeValue.value * 0.45,
  }));

  const color = active ? theme.colors.accent : theme.colors.textMuted;

  return (
    <Pressable style={styles.tab} onPress={onPress} hitSlop={6}>
      <Icon name={tab.icon} size={23} color={color} filled={active && tab.icon === 'home'} />
      <Animated.View style={labelStyle}>
        <Text style={[styles.label, { color }]}>{tab.label}</Text>
      </Animated.View>
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
    paddingVertical: 10,
    paddingHorizontal: 6,
  },
  tab: {
    flex: 1,
    alignItems: 'center',
    gap: 3,
  },
  label: {
    fontSize: 10.5,
    fontWeight: '600',
  },
});
