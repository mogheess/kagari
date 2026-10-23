import React, { createContext, useContext, useEffect, useState } from 'react';
import { NavigationContext } from '@react-navigation/native';

/**
 * Whether the tab a component lives in is the one on screen. Tabs stay mounted
 * (moved off-screen) when inactive, so their content needs telling.
 */
const TabVisibleContext = createContext(true);

export function TabVisibilityProvider({
  visible,
  children,
}: {
  visible: boolean;
  children: React.ReactNode;
}) {
  return <TabVisibleContext.Provider value={visible}>{children}</TabVisibleContext.Provider>;
}

/**
 * True while the component's screen is actually showing: its stack screen is
 * focused (not covered by, say, the reader) and, inside the tab host, its tab
 * is the active one. Use it to pause loops (animations, timers) that would
 * otherwise keep running on screens nobody can see.
 */
export function useScreenVisible(): boolean {
  const tabVisible = useContext(TabVisibleContext);
  // Read the context directly rather than useIsFocused so this also works
  // outside a navigator (treated as visible) instead of throwing.
  const navigation = useContext(NavigationContext);
  const [focused, setFocused] = useState(() => navigation?.isFocused() ?? true);

  useEffect(() => {
    if (!navigation) return;
    setFocused(navigation.isFocused());
    const offFocus = navigation.addListener('focus', () => setFocused(true));
    const offBlur = navigation.addListener('blur', () => setFocused(false));
    return () => {
      offFocus();
      offBlur();
    };
  }, [navigation]);

  return tabVisible && focused;
}
