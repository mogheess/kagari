/**
 * Background artwork for the main tabs, picked in Appearance. Original images
 * made for the app (no characters, text or borrowed styles), bundled as small
 * WebPs so they work offline. ScreenBackdrop draws one as a fixed wallpaper
 * behind the main tabs, dimmed so cover art and text still lead.
 *
 * Each one also recolours the app to match its art: an accent taken from the
 * picture and a light tint in the background layers. These are curated, not a
 * free hue picker, so every pair was checked for contrast: on-accent text on
 * the accent at least 4.5:1, the accent as text on the background around
 * 4.5:1 or better, in dark and light.
 */
import type { ImageSourcePropType } from 'react-native';
import type { ColorScheme, Palette } from './tokens';

/** The palette fields a backdrop replaces; everything else stays the look's own. */
export type BackdropColors = Pick<
  Palette,
  'bg' | 'surface' | 'elevated' | 'accent' | 'onAccent' | 'glass'
>;

export type BackdropId = 'none' | 'ink' | 'screentone' | 'neon' | 'sakura';

export interface Backdrop {
  id: Exclude<BackdropId, 'none'>;
  name: string;
  hint: string;
  image: ImageSourcePropType;
  /** Small copy for the picker, so it doesn't decode four full images. */
  thumb: ImageSourcePropType;
  colors: Record<ColorScheme, BackdropColors>;
}

export const BACKDROPS: readonly Backdrop[] = [
  {
    id: 'ink',
    name: 'Ink',
    hint: 'Misty ink-wash mountains',
    image: require('../assets/backdrops/ink.webp'),
    thumb: require('../assets/backdrops/ink-thumb.webp'),
    // The moon's brass on warm graphite.
    colors: {
      dark: {
        bg: '#141412',
        surface: '#1C1C19',
        elevated: '#262621',
        accent: '#E0A548',
        onAccent: '#241703',
        glass: 'rgba(30,30,26,0.62)',
      },
      light: {
        bg: '#F5F4EF',
        surface: '#FFFFFF',
        elevated: '#FFFFFF',
        accent: '#A96410',
        onAccent: '#FFFFFF',
        glass: 'rgba(250,249,245,0.66)',
      },
    },
  },
  {
    id: 'screentone',
    name: 'Screentone',
    hint: 'Halftone and speed lines',
    image: require('../assets/backdrops/screentone.webp'),
    thumb: require('../assets/backdrops/screentone-thumb.webp'),
    // Printed-page monochrome: a silver accent on true greys.
    colors: {
      dark: {
        bg: '#111111',
        surface: '#1A1A1A',
        elevated: '#242424',
        accent: '#D5D9E0',
        onAccent: '#15171B',
        glass: 'rgba(26,26,26,0.62)',
      },
      light: {
        bg: '#F4F4F4',
        surface: '#FFFFFF',
        elevated: '#FFFFFF',
        accent: '#3A3F48',
        onAccent: '#FFFFFF',
        glass: 'rgba(248,248,248,0.66)',
      },
    },
  },
  {
    id: 'neon',
    name: 'Neon rain',
    hint: 'Rooftops on a wet night',
    image: require('../assets/backdrops/neon.webp'),
    thumb: require('../assets/backdrops/neon-thumb.webp'),
    // Neon teal over a cold, wet night.
    colors: {
      dark: {
        bg: '#0D1417',
        surface: '#141D21',
        elevated: '#1C272C',
        accent: '#3FD8C8',
        onAccent: '#06221F',
        glass: 'rgba(18,28,32,0.62)',
      },
      light: {
        bg: '#EFF6F6',
        surface: '#FFFFFF',
        elevated: '#FFFFFF',
        accent: '#0A766D',
        onAccent: '#FFFFFF',
        glass: 'rgba(244,250,250,0.66)',
      },
    },
  },
  {
    id: 'sakura',
    name: 'Sakura dusk',
    hint: 'Blossoms against twilight',
    image: require('../assets/backdrops/sakura.webp'),
    thumb: require('../assets/backdrops/sakura-thumb.webp'),
    // Blossom pink on violet twilight.
    colors: {
      dark: {
        bg: '#15111B',
        surface: '#1E1926',
        elevated: '#282233',
        accent: '#F4A3C8',
        onAccent: '#3A0E24',
        glass: 'rgba(32,26,40,0.62)',
      },
      light: {
        bg: '#F8F2F6',
        surface: '#FFFFFF',
        elevated: '#FFFFFF',
        accent: '#B4386F',
        onAccent: '#FFFFFF',
        glass: 'rgba(252,246,250,0.66)',
      },
    },
  },
];

/** The backdrop for an id, or undefined for none and for ids no longer shipped. */
export function backdropById(id: string | undefined): Backdrop | undefined {
  return BACKDROPS.find(b => b.id === id);
}
