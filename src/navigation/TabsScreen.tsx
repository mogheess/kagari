import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { BackHandler, StyleSheet, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { GlassTabBar } from './GlassTabBar';
import { HomeScreen } from '../screens/HomeScreen';
import { LibraryScreen } from '../screens/LibraryScreen';
import { DiscoverScreen } from '../screens/DiscoverScreen';
import { UpdatesScreen } from '../screens/UpdatesScreen';
import { ProfileScreen } from '../screens/ProfileScreen';
import { TabNavProvider } from './TabNav';
import type { TabKey } from './types';

const TAB_ORDER: TabKey[] = ['home', 'library', 'discover', 'updates', 'profile'];

/**
 * Hosts the five tabs and overlays the floating glass nav. Each tab is mounted
 * lazily on first visit and then kept alive (hidden) so switching back is
 * instant — no re-fetching the home rails or losing scroll position.
 *
 * Hidden tabs are NOT hidden with `display: 'none'`: toggling display forces
 * the incoming screen through a full relayout + draw in a single frame, which
 * on Android flashes the previous tab's stale frame during the switch. Instead
 * (like react-navigation's ResourceSavingView) every tab stays laid out inside
 * an absolute, clipped wrapper and inactive ones are shoved far off-screen, so
 * activating a tab is just a cheap position change.
 *
 * Because every visited tab stays mounted, a re-render of this component is a
 * re-render of up to five full screens. Two things keep that from happening on
 * navigation: the tab elements are created once and reused (React skips a
 * subtree handed the identical element), and focus is tracked in a ref via
 * navigation events rather than `useIsFocused`, which would re-render the host
 * on every push and pop of a stack screen — right in the middle of the
 * transition animation, which showed up as a flash.
 */
const FAR_FAR_AWAY = 30000;

export function TabsScreen() {
  const navigation = useNavigation();
  const [active, setActive] = useState<TabKey>('home');
  const [mounted, setMounted] = useState<Set<TabKey>>(() => new Set<TabKey>(['home']));

  // Created once. Rendering the same element reference each time lets React
  // bail out of the whole subtree, so switching tabs re-lays-out the wrappers
  // without re-rendering the screens inside them.
  const elements = useMemo<Record<TabKey, React.ReactNode>>(
    () => ({
      home: <HomeScreen />,
      library: <LibraryScreen />,
      discover: <DiscoverScreen />,
      updates: <UpdatesScreen />,
      profile: <ProfileScreen />,
    }),
    [],
  );

  // Tabs are local state rather than routes, so the root stack never grows when
  // you switch tabs and Android's back press has nothing to pop — it falls
  // through to the OS and closes the app. Keep a visit history and retrace it,
  // which is what react-navigation's `history` backBehavior does: each tab
  // appears at most once, revisiting moves it to the top.
  const history = useRef<TabKey[]>(['home']);

  const navigateTab = useCallback((key: TabKey) => {
    setMounted(prev => (prev.has(key) ? prev : new Set(prev).add(key)));
    setActive(prev => {
      if (prev === key) return prev;
      history.current = [...history.current.filter(k => k !== key), key];
      return key;
    });
  }, []);

  // Whether the tab host is the top route. A ref, deliberately: reading this
  // through a hook would re-render the host — and every mounted tab — each
  // time a detail or reader screen is pushed or popped.
  const focused = useRef(true);
  useEffect(() => {
    const onFocus = navigation.addListener('focus', () => {
      focused.current = true;
    });
    const onBlur = navigation.addListener('blur', () => {
      focused.current = false;
    });
    return () => {
      onFocus();
      onBlur();
    };
  }, [navigation]);

  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      // A stack screen above us (detail, reader) owns back while it's showing.
      if (!focused.current) return false;
      // One entry left means we're at the first tab visited: let the OS have the
      // press so back still exits from the app's start destination.
      if (history.current.length <= 1) return false;
      history.current = history.current.slice(0, -1);
      setActive(history.current[history.current.length - 1]);
      return true;
    });
    return () => sub.remove();
  }, []);

  return (
    <TabNavProvider active={active} navigateTab={navigateTab}>
      <View style={{ flex: 1 }}>
        <View style={{ flex: 1 }}>
          {TAB_ORDER.map(key => {
            if (!mounted.has(key)) return null;
            const isActive = key === active;
            return (
              <View
                key={key}
                style={styles.page}
                collapsable={false}
                pointerEvents={isActive ? 'auto' : 'none'}
              >
                <View style={isActive ? styles.attached : styles.detached}>{elements[key]}</View>
              </View>
            );
          })}
        </View>
        <GlassTabBar active={active} onChange={navigateTab} />
      </View>
    </TabNavProvider>
  );
}

const styles = StyleSheet.create({
  page: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    overflow: 'hidden',
  },
  attached: {
    flex: 1,
  },
  detached: {
    flex: 1,
    top: FAR_FAR_AWAY,
  },
});
