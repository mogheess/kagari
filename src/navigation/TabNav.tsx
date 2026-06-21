import React, { createContext, useContext } from 'react';
import type { TabKey } from './types';

/**
 * Lets screens inside the tab host switch tabs (e.g. Home's settings shortcut
 * jumping to the Profile/Settings tab, or an empty state linking to Discover).
 * The tab host owns the active-tab state and supplies the setter here.
 */
interface TabNavValue {
  active: TabKey;
  navigateTab: (key: TabKey) => void;
}

const TabNavContext = createContext<TabNavValue>({ active: 'home', navigateTab: () => {} });

export function TabNavProvider({
  active,
  navigateTab,
  children,
}: TabNavValue & { children: React.ReactNode }) {
  return (
    <TabNavContext.Provider value={{ active, navigateTab }}>{children}</TabNavContext.Provider>
  );
}

export function useTabNav(): TabNavValue {
  return useContext(TabNavContext);
}
