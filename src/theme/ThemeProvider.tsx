import React, { createContext, useContext, useEffect, useMemo, useState, useCallback } from 'react';
import { useColorScheme } from 'react-native';
import { makePersistence } from '../store/persist';
import {
  spacing,
  radius,
  elevation,
  typography,
  motion,
  type ColorScheme,
  type Palette,
} from './tokens';
import {
  DEFAULT_THEME_ID,
  applyAmoled,
  cornerScale,
  densityScale,
  themeById,
  type Corners,
  type Density,
  type ThemeId,
} from './themes';

export type ThemePreference = 'system' | 'light' | 'dark';

/** Dark by default; persisted so the user's choice sticks across launches. */
const DEFAULT_PREFERENCE: ThemePreference = 'dark';
const prefStore = makePersistence<ThemePreference>('@kagari/theme-preference/v1');

/** Appearance beyond light/dark. */
export interface Appearance {
  themeId: ThemeId;
  amoled: boolean;
  density: Density;
  corners: Corners;
}

const DEFAULT_APPEARANCE: Appearance = {
  themeId: DEFAULT_THEME_ID,
  amoled: false,
  density: 'comfortable',
  corners: 'soft',
};

const appearanceStore = makePersistence<Appearance>('@kagari/appearance/v1');

export interface Theme {
  scheme: ColorScheme;
  colors: Palette;
  spacing: typeof spacing;
  radius: typeof radius;
  elevation: typeof elevation;
  typography: typeof typography;
  motion: typeof motion;
}

interface ThemeContextValue {
  theme: Theme;
  preference: ThemePreference;
  setPreference: (p: ThemePreference) => void;
  appearance: Appearance;
  setAppearance: (next: Partial<Appearance>) => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const systemScheme = useColorScheme();
  const [preference, setPreference] = useState<ThemePreference>(DEFAULT_PREFERENCE);
  const [appearance, setAppearanceState] = useState<Appearance>(DEFAULT_APPEARANCE);

  useEffect(() => {
    let active = true;
    prefStore.load().then(stored => {
      if (active && (stored === 'system' || stored === 'light' || stored === 'dark')) {
        setPreference(stored);
      }
    });
    appearanceStore.load().then(stored => {
      // Merge rather than replace: a stored value written before a field
      // existed must not knock out that field's default.
      if (active && stored) setAppearanceState(a => ({ ...a, ...stored }));
    });
    return () => {
      active = false;
    };
  }, []);

  const scheme: ColorScheme =
    preference === 'system' ? (systemScheme === 'light' ? 'light' : 'dark') : preference;

  const theme = useMemo<Theme>(() => {
    const preset = themeById(appearance.themeId);
    let colors = preset.palettes[scheme];
    // AMOLED only means anything on a dark canvas.
    if (appearance.amoled && scheme === 'dark') colors = applyAmoled(colors);

    // Density and corners scale the shipped scales rather than replacing them,
    // so the proportions of the design survive both settings.
    const d = densityScale(appearance.density);
    const c = cornerScale(appearance.corners);
    const scaledSpacing = Object.fromEntries(
      Object.entries(spacing).map(([k, v]) => [k, Math.round(v * d)]),
    ) as typeof spacing;
    const scaledRadius = Object.fromEntries(
      Object.entries(radius).map(([k, v]) => [k, k === 'pill' ? v : Math.round(v * c)]),
    ) as typeof radius;

    return {
      scheme,
      colors,
      spacing: scaledSpacing,
      radius: scaledRadius,
      elevation,
      typography,
      motion,
    };
  }, [scheme, appearance]);

  const setPref = useCallback((p: ThemePreference) => {
    setPreference(p);
    prefStore.save(p);
  }, []);

  const setAppearance = useCallback((next: Partial<Appearance>) => {
    setAppearanceState(prev => {
      const merged = { ...prev, ...next };
      appearanceStore.save(merged);
      return merged;
    });
  }, []);

  // Keep out anything that changes during navigation: every `useTheme()` caller
  // re-renders when this value does, and every tab stays mounted.
  const value = useMemo(
    () => ({ theme, preference, setPreference: setPref, appearance, setAppearance }),
    [theme, preference, setPref, appearance, setAppearance],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): Theme {
  const ctx = useContext(ThemeContext);
  if (!ctx) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return ctx.theme;
}

export function useThemePreference(): {
  preference: ThemePreference;
  setPreference: (p: ThemePreference) => void;
} {
  const ctx = useContext(ThemeContext);
  if (!ctx) {
    throw new Error('useThemePreference must be used within a ThemeProvider');
  }
  return { preference: ctx.preference, setPreference: ctx.setPreference };
}

export function useAppearance(): {
  appearance: Appearance;
  setAppearance: (next: Partial<Appearance>) => void;
} {
  const ctx = useContext(ThemeContext);
  if (!ctx) {
    throw new Error('useAppearance must be used within a ThemeProvider');
  }
  return { appearance: ctx.appearance, setAppearance: ctx.setAppearance };
}
