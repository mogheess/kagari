/**
 * Background artwork for the main tabs, picked in Appearance. Original images
 * made for the app (no characters, text or borrowed styles), bundled as small
 * WebPs so they work offline. They sit behind the top of each tab and fade
 * into the theme's background (see ScreenBackdrop), so cover art still leads.
 */
import type { ImageSourcePropType } from 'react-native';

export type BackdropId = 'none' | 'ink' | 'screentone' | 'neon' | 'sakura';

export interface Backdrop {
  id: Exclude<BackdropId, 'none'>;
  name: string;
  hint: string;
  image: ImageSourcePropType;
  /** Small copy for the picker, so it doesn't decode four full images. */
  thumb: ImageSourcePropType;
}

export const BACKDROPS: readonly Backdrop[] = [
  {
    id: 'ink',
    name: 'Ink',
    hint: 'Misty ink-wash mountains',
    image: require('../assets/backdrops/ink.webp'),
    thumb: require('../assets/backdrops/ink-thumb.webp'),
  },
  {
    id: 'screentone',
    name: 'Screentone',
    hint: 'Halftone and speed lines',
    image: require('../assets/backdrops/screentone.webp'),
    thumb: require('../assets/backdrops/screentone-thumb.webp'),
  },
  {
    id: 'neon',
    name: 'Neon rain',
    hint: 'Rooftops on a wet night',
    image: require('../assets/backdrops/neon.webp'),
    thumb: require('../assets/backdrops/neon-thumb.webp'),
  },
  {
    id: 'sakura',
    name: 'Sakura dusk',
    hint: 'Blossoms against twilight',
    image: require('../assets/backdrops/sakura.webp'),
    thumb: require('../assets/backdrops/sakura-thumb.webp'),
  },
];

/** The backdrop for an id, or undefined for none and for ids no longer shipped. */
export function backdropById(id: string | undefined): Backdrop | undefined {
  return BACKDROPS.find(b => b.id === id);
}
