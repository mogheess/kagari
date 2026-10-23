import React, { useEffect, useState } from 'react';
import { Image, StyleSheet, Text, View } from 'react-native';
import { useTheme } from '../theme/ThemeProvider';

interface ExtensionIconProps {
  /** Repo icon URL or the native `file://` render of an installed APK's icon. */
  uri?: string;
  /** Used for the letter tile when there's no icon or it fails to load. */
  name: string;
  size?: number;
}

/**
 * Extension launcher icon on a rounded tile. Falls back to the name's first
 * letter so a repo without icons, or one that's offline, still lines up.
 */
export function ExtensionIcon({ uri, name, size = 40 }: ExtensionIconProps) {
  const theme = useTheme();
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [uri]);
  const radius = Math.round(size / 4);
  const showImage = !!uri && !failed;
  return (
    <View
      style={[
        styles.tile,
        {
          width: size,
          height: size,
          borderRadius: radius,
          // Icons bring their own shape and padding; the tile only backs the letter.
          backgroundColor: showImage ? undefined : theme.colors.elevated,
        },
      ]}
    >
      {showImage ? (
        <Image
          source={{ uri }}
          onError={() => setFailed(true)}
          style={{ width: size, height: size }}
          resizeMode="cover"
          accessibilityIgnoresInvertColors
        />
      ) : (
        <Text style={[styles.letter, { color: theme.colors.textMuted, fontSize: Math.round(size * 0.38) }]}>
          {name.trim().charAt(0).toUpperCase() || '?'}
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  tile: {
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  letter: {
    fontWeight: '800',
  },
});
