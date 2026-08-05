/**
 * Design tokens for the locked visual direction:
 * cinematic cover art + Linear-calm chrome + Notion modular home + glass nav.
 *
 * One restrained ember/amber accent. Real color/energy comes from cover artwork
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
  /** Error / destructive state (sparingly used). */
  danger: string;
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
  // Layers step further apart than they used to: at 8-point gaps the canvas,
  // cards and menus read as one flat sheet, and nothing on screen has weight.
  bg: '#121316',
  surface: '#1B1D22',
  elevated: '#24272E',
  // Slightly stronger so a hairline still reads once cards carry a shadow.
  border: 'rgba(255,255,255,0.10)',
  text: '#F2F3F5',
  textMuted: '#9BA0AA',
  textFaint: '#6B7080',
  // Pulled back from a hot signal-orange to something closer to brass; it sits
  // beside cover art all day and shouldn't compete with it.
  accent: '#E0A548',
  onAccent: '#241703',
  danger: '#FF6B6B',
  glass: 'rgba(28,28,32,0.62)',
  glassHighlight: 'rgba(255,255,255,0.10)',
  scrim: 'rgba(0,0,0,0.35)',
  skeleton: 'rgba(255,255,255,0.06)',
};

const light: Palette = {
  bg: '#F7F7F9',
  surface: '#FFFFFF',
  elevated: '#FFFFFF',
  border: 'rgba(16,18,24,0.08)',
  text: '#16171B',
  textMuted: '#61656E',
  textFaint: '#8E939E',
  accent: '#A96410',
  onAccent: '#FFFFFF',
  danger: '#D92D20',
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
 * Elevation.
 *
 * The UI was entirely flat: every surface was distinguished only by a hairline
 * border, so cards, sheets and menus all sat on the same plane. Depth is what
 * separates them without adding more lines or more colour.
 *
 * Values are deliberately soft and near-black — on a dark canvas a visible grey
 * shadow reads as smudge rather than depth.
 */
export const elevation = {
  /** Cards and rows resting on the canvas. */
  card: {
    shadowColor: '#000',
    shadowOpacity: 0.18,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 3 },
    elevation: 2,
  },
  /** Cover art, which should feel like a physical object. */
  cover: {
    shadowColor: '#000',
    shadowOpacity: 0.3,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 5 },
    elevation: 5,
  },
  /** Sheets and menus lifted above everything. */
  overlay: {
    shadowColor: '#000',
    shadowOpacity: 0.34,
    shadowRadius: 26,
    shadowOffset: { width: 0, height: -6 },
    elevation: 16,
  },
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
export type Elevation = typeof elevation;
export type Typography = typeof typography;
