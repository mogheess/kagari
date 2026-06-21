/**
 * Design tokens for the locked visual direction:
 * cinematic cover art + Linear-calm chrome + Notion modular home + glass nav.
 *
 * One restrained teal accent. Real color/energy comes from cover artwork
 * (see `dynamicColor` usage in the Featured hero), not from UI chrome.
 */

export type ColorScheme = 'light' | 'dark';

export interface Palette {
  /** App canvas background. */
  bg: string;
  /** Card / block surface sitting on the canvas. */
  surface: string;
  /** Slightly raised surface (e.g. dragged block, menus). */
  elevated: string;
  /** Hairline borders and separators. */
  border: string;
  /** Primary text. */
  text: string;
  /** Secondary / muted text. */
  textMuted: string;
  /** Faint text (timestamps, eyebrow labels). */
  textFaint: string;
  /** The single restrained accent. */
  accent: string;
  /** Accent used on top of accent-tinted fills. */
  onAccent: string;
  /** Translucent fill for frosted-glass surfaces (nav, headers). */
  glass: string;
  /** Bright top edge highlight for glass surfaces. */
  glassHighlight: string;
  /** Tint used behind blurred glass to keep contrast. */
  scrim: string;
  /** Skeleton shimmer base. */
  skeleton: string;
}

const dark: Palette = {
  bg: '#161618',
  surface: '#1E1E22',
  elevated: '#26262B',
  border: 'rgba(255,255,255,0.08)',
  text: '#F4F4F6',
  textMuted: '#9A9AA3',
  textFaint: '#6E6E77',
  accent: '#19B79E',
  onAccent: '#04221D',
  glass: 'rgba(28,28,32,0.62)',
  glassHighlight: 'rgba(255,255,255,0.10)',
  scrim: 'rgba(0,0,0,0.35)',
  skeleton: 'rgba(255,255,255,0.06)',
};

const light: Palette = {
  bg: '#FAF9F7',
  surface: '#FFFFFF',
  elevated: '#FFFFFF',
  border: 'rgba(0,0,0,0.07)',
  text: '#1A1A1D',
  textMuted: '#6B6B72',
  textFaint: '#9B9BA2',
  accent: '#0C8E79',
  onAccent: '#FFFFFF',
  glass: 'rgba(250,249,247,0.66)',
  glassHighlight: 'rgba(255,255,255,0.70)',
  scrim: 'rgba(255,255,255,0.30)',
  skeleton: 'rgba(0,0,0,0.05)',
};

export const palettes: Record<ColorScheme, Palette> = { dark, light };

/** 4pt spacing scale. */
export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 24,
  xxxl: 32,
} as const;

export const radius = {
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 28,
  pill: 999,
} as const;

/**
 * Type scale. Kept restrained and refined (Linear-style). `letterSpacing`
 * is intentionally tight on display sizes and tracked-out on eyebrow labels.
 */
export const typography = {
  display: { fontSize: 30, fontWeight: '700', letterSpacing: -0.5, lineHeight: 36 },
  title: { fontSize: 22, fontWeight: '700', letterSpacing: -0.3, lineHeight: 28 },
  heading: { fontSize: 17, fontWeight: '600', letterSpacing: -0.2, lineHeight: 22 },
  body: { fontSize: 15, fontWeight: '400', letterSpacing: 0, lineHeight: 21 },
  bodyStrong: { fontSize: 15, fontWeight: '600', letterSpacing: 0, lineHeight: 21 },
  caption: { fontSize: 12.5, fontWeight: '400', letterSpacing: 0, lineHeight: 16 },
  /** Eyebrow / section label, e.g. "FEATURED". */
  eyebrow: { fontSize: 11, fontWeight: '700', letterSpacing: 1.6, lineHeight: 14 },
} as const;

/** Spring presets for the premium, physics-based motion language. */
export const motion = {
  spring: { damping: 18, stiffness: 180, mass: 1 },
  springSnappy: { damping: 22, stiffness: 260, mass: 1 },
  springGentle: { damping: 20, stiffness: 120, mass: 1 },
  durationFast: 160,
  durationBase: 240,
} as const;

export type Spacing = typeof spacing;
export type Radius = typeof radius;
export type Typography = typeof typography;
