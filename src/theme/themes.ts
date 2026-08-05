/**
 * Theme looks.
 *
 * Two, not a swatch menu. What varies is the *quality* of the surface — neutral
 * vs warm, and the contrast curve — which is a real choice. Hue isn't: a row of
 * tinted chromes reads as generic, and it competes with the cover art the app
 * is built around.
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
