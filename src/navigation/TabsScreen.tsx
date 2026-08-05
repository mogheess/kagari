import React, { useCallback, useEffect, useRef, useState } from 'react';
import { BackHandler, StyleSheet, View } from 'react-native';
import { useIsFocused } from '@react-navigation/native';
import { GlassTabBar } from './GlassTabBar';
import { HomeScreen } from '../screens/HomeScreen';
import { LibraryScreen } from '../screens/LibraryScreen';
import { DiscoverScreen } from '../screens/DiscoverScreen';
import { UpdatesScreen } from '../screens/UpdatesScreen';
import { ProfileScreen } from '../screens/ProfileScreen';
import { TabNavProvider } from './TabNav';
import type { TabKey } from './types';

const TABS: { key: TabKey; render: () => React.ReactNode }[] = [
  { key: 'home', render: () => <HomeScreen /> },
  { key: 'library', render: () => <LibraryScreen /> },
  { key: 'discover', render: () => <DiscoverScreen /> },
  { key: 'updates', render: () => <UpdatesScreen /> },
  { key: 'profile', render: () => <ProfileScreen /> },
];

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
 */
const FAR_FAR_AWAY = 30000;

export function TabsScreen() {
  const [active, setActive] = useState<TabKey>('home');
  const [mounted, setMounted] = useState<Set<TabKey>>(() => new Set<TabKey>(['home']));
  const isFocused = useIsFocused();

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

  const onBackPress = useCallback(() => {
    // One entry left means we're at the first tab visited: let the OS have the
    // press so back still exits from the app's start destination.
    if (history.current.length <= 1) return false;
    history.current = history.current.slice(0, -1);
    setActive(history.current[history.current.length - 1]);
    return true;
  }, []);

  useEffect(() => {
    // Only while the tab host is the top route — a stack screen above it
    // (detail, reader) must keep its own back behaviour.
    if (!isFocused) return;
    const sub = BackHandler.addEventListener('hardwareBackPress', onBackPress);
    return () => sub.remove();
  }, [isFocused, onBackPress]);

  return (
    <TabNavProvider active={active} navigateTab={navigateTab}>
      <View style={{ flex: 1 }}>
        <View style={{ flex: 1 }}>
          {TABS.map(tab => {
            if (!mounted.has(tab.key)) return null;
            const focused = tab.key === active;
            return (
              <View
                key={tab.key}
                style={styles.page}
                collapsable={false}
                pointerEvents={focused ? 'auto' : 'none'}
              >
                <View style={focused ? styles.attached : styles.detached}>{tab.render()}</View>
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
