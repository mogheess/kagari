import React from 'react';
import { Image, StyleSheet, View } from 'react-native';
import { useBackdrop, useTheme } from '../theme/ThemeProvider';
import { withAlpha } from '../utils/color';

/**
 * The picked backdrop, drawn once behind all the main tabs as a fixed
 * wallpaper: it fills the screen and stays put while the tabs scroll over it,
 * so it shows between rails and around cards everywhere, not only above the
 * first section (Home's featured banner covers the top). An even scrim of the
 * background colour keeps text readable; light themes wash the dark art out
 * further, so it reads as a tint rather than a dark patch.
 */
export function ScreenBackdrop() {
  const theme = useTheme();
  const backdrop = useBackdrop();
  if (!backdrop) return null;

  const bg = theme.colors.bg;
  // How much of the background colour lies over the art.
  const scrim = withAlpha(bg, theme.scheme === 'light' ? 0.84 : 0.45);

  return (
    <View pointerEvents="none" style={[styles.fill, { backgroundColor: bg }]}>
      <Image
        source={backdrop.image}
        style={styles.fill}
        resizeMode="cover"
        fadeDuration={0}
        accessibilityIgnoresInvertColors
      />
      <View style={[styles.fill, { backgroundColor: scrim }]} />
    </View>
  );
}

const styles = StyleSheet.create({
  fill: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
});
