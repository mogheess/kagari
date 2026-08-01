/**
 * Theme looks.
 *
 * Two, not a swatch menu. The app's direction is that colour comes from cover
 * artwork and the chrome stays out of the way (see `tokens.ts`), so shipping a
 * row of hue-shifted chromes would work against the thing that gives the app
 * its character. What varies here is the *quality* of the surface — neutral vs
 * warm, and the contrast curve — which is a real choice; hue isn't.
 *
 * Per-title colour is handled separately by `coverAccent.ts`, which pulls an
 * accent out of the cover being viewed.
 */
import type { ColorScheme, Palette } from './tokens';
import { palettes as inkPalettes } from './tokens';

export type ThemeId = 'ink' | 'paper';

export interface ThemePreset {
  id: ThemeId;
  name: string;
  hint: string;
  palettes: Record<ColorScheme, Palette>;
}

/**
 * Paper: warmer, softer, and noticeably higher contrast than Ink. Its dark
 * variant is a warm near-black rather than a neutral one, which reads closer to
 * an e-reader at night than a dimmed screen.
 */
const paper: Record<ColorScheme, Palette> = {
  dark: {
    bg: '#17150F',
    surface: '#211E16',
    elevated: '#2B271D',
    border: 'rgba(255,246,224,0.10)',
    text: '#F7F1E3',
    textMuted: '#A79E8A',
    textFaint: '#786F5D',
    accent: '#E8B860',
    onAccent: '#241A06',
    danger: '#E8776B',
    glass: 'rgba(28,25,18,0.64)',
    glassHighlight: 'rgba(255,246,224,0.12)',
    scrim: 'rgba(0,0,0,0.38)',
    skeleton: 'rgba(255,246,224,0.07)',
  },
  light: {
    bg: '#F6F1E6',
    surface: '#FFFDF8',
    elevated: '#FFFFFF',
    border: 'rgba(60,45,20,0.12)',
    text: '#1B1710',
    textMuted: '#5E5544',
    textFaint: '#8C8271',
    accent: '#9A6413',
    onAccent: '#FFFFFF',
    danger: '#C0392B',
    glass: 'rgba(246,241,230,0.70)',
    glassHighlight: 'rgba(255,255,255,0.75)',
    scrim: 'rgba(255,255,255,0.32)',
    skeleton: 'rgba(60,45,20,0.06)',
  },
};

export const THEMES: ThemePreset[] = [
  {
    id: 'ink',
    name: 'Ink',
    hint: 'Neutral and quiet, art leads',
    palettes: inkPalettes,
  },
  {
    id: 'paper',
    name: 'Paper',
    hint: 'Warm and higher contrast, easier for long reads',
    palettes: paper,
  },
];

export const DEFAULT_THEME_ID: ThemeId = 'ink';

export function themeById(id: ThemeId): ThemePreset {
  return THEMES.find(t => t.id === id) ?? THEMES[0];
}

/**
 * Collapses the dark palette to true black for OLED panels, where an unlit
 * pixel costs no power. Only the background layers move — text and accent stay
 * put so contrast is unchanged.
 */
export function applyAmoled(palette: Palette): Palette {
  return {
    ...palette,
    bg: '#000000',
    surface: '#0B0B0D',
    elevated: '#151517',
    glass: 'rgba(0,0,0,0.66)',
    scrim: 'rgba(0,0,0,0.55)',
  };
}

/** Swaps in a different accent, leaving every other token alone. */
export function applyAccent(palette: Palette, accent: string | null): Palette {
  if (!accent) return palette;
  return { ...palette, accent, onAccent: readableOn(accent) };
}

/**
 * Black or white text for a given fill, by perceived luminance. Needed because
 * a cover-derived accent has no `onAccent` picked for it in advance.
 */
export function readableOn(hex: string): string {
  const v = hex.replace('#', '');
  if (v.length < 6) return '#FFFFFF';
  const r = parseInt(v.slice(0, 2), 16) / 255;
  const g = parseInt(v.slice(2, 4), 16) / 255;
  const b = parseInt(v.slice(4, 6), 16) / 255;
  const lin = (c: number) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
  const luminance = 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
  return luminance > 0.45 ? '#141414' : '#FFFFFF';
}

/**
 * How tight the layout is. Not a colour, but it changes how the app feels far
 * more than hue does — and unlike hue it can't make anything unreadable.
 */
export type Density = 'comfortable' | 'compact';

/** Multiplier applied to spacing and row heights. */
export function densityScale(density: Density): number {
  return density === 'compact' ? 0.78 : 1;
}

/** How rounded surfaces are. */
export type Corners = 'soft' | 'sharp';

export function cornerScale(corners: Corners): number {
  return corners === 'sharp' ? 0.35 : 1;
}
