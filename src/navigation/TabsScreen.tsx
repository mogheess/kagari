import React, { useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';
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
 */
export function TabsScreen() {
  const [active, setActive] = useState<TabKey>('home');
  const [mounted, setMounted] = useState<Set<TabKey>>(() => new Set<TabKey>(['home']));

  const navigateTab = useMemo(
    () => (key: TabKey) => {
      setMounted(prev => (prev.has(key) ? prev : new Set(prev).add(key)));
      setActive(key);
    },
    [],
  );

  return (
    <TabNavProvider active={active} navigateTab={navigateTab}>
      <View style={{ flex: 1 }}>
        <View style={{ flex: 1 }}>
          {TABS.map(tab =>
            mounted.has(tab.key) ? (
              <View
                key={tab.key}
                style={tab.key === active ? styles.active : styles.hidden}
                pointerEvents={tab.key === active ? 'auto' : 'none'}
              >
                {tab.render()}
              </View>
            ) : null,
          )}
        </View>
        <GlassTabBar active={active} onChange={navigateTab} />
      </View>
    </TabNavProvider>
  );
}

const styles = StyleSheet.create({
  active: {
    flex: 1,
  },
  hidden: {
    display: 'none',
  },
});
