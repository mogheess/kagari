import React, { useState } from 'react';
import { View } from 'react-native';
import { GlassTabBar } from './GlassTabBar';
import { HomeScreen } from '../screens/HomeScreen';
import { LibraryScreen } from '../screens/LibraryScreen';
import { DiscoverScreen } from '../screens/DiscoverScreen';
import { UpdatesScreen } from '../screens/UpdatesScreen';
import { ProfileScreen } from '../screens/ProfileScreen';
import type { TabKey } from './types';

/** Hosts the five tabs and overlays the floating glass nav. */
export function TabsScreen() {
  const [active, setActive] = useState<TabKey>('home');

  return (
    <View style={{ flex: 1 }}>
      <View style={{ flex: 1 }}>
        {active === 'home' && <HomeScreen />}
        {active === 'library' && <LibraryScreen />}
        {active === 'discover' && <DiscoverScreen />}
        {active === 'updates' && <UpdatesScreen />}
        {active === 'profile' && <ProfileScreen />}
      </View>
      <GlassTabBar active={active} onChange={setActive} />
    </View>
  );
}
