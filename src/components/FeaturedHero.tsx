import React from 'react';
import { View, Text, Image, Pressable, StyleSheet, useWindowDimensions } from 'react-native';
import LinearGradient from 'react-native-linear-gradient';
import { useTheme } from '../theme/ThemeProvider';
import { Icon } from './Icon';
import type { MangaDto } from '../engine/types';

interface FeaturedHeroProps {
  manga: MangaDto;
  tagline?: string;
  onPress?: () => void;
}

/**
 * Tall rounded poster hero. Sized to portrait cover proportions so the artwork
 * fills the card edge-to-edge; a bottom scrim keeps the title legible.
 */
export function FeaturedHero({ manga, tagline, onPress }: FeaturedHeroProps) {
  const theme = useTheme();
  const { width } = useWindowDimensions();
  const cardWidth = width - theme.spacing.lg * 2;
  // Portrait-leaning poster: tall enough that the cover fills the card with only
  // a small symmetric crop, without dominating the screen.
  const cardHeight = Math.round(cardWidth * 0.85);

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.card,
        {
          width: cardWidth,
          height: cardHeight,
          borderRadius: theme.radius.lg,
          backgroundColor: theme.colors.surface,
          transform: [{ scale: pressed ? 0.99 : 1 }],
        },
      ]}
    >
      {manga.thumbnailUrl ? (
        <Image
          source={{ uri: manga.thumbnailUrl }}
          style={StyleSheet.absoluteFill}
          resizeMode="cover"
        />
      ) : null}

      <LinearGradient
        colors={['rgba(0,0,0,0)', 'rgba(0,0,0,0.35)', 'rgba(0,0,0,0.85)']}
        locations={[0.5, 0.8, 1]}
        style={StyleSheet.absoluteFill}
      />

      <View style={styles.content}>
        <Text style={[theme.typography.eyebrow, styles.eyebrow]}>FEATURED</Text>
        <Text numberOfLines={1} style={[theme.typography.display, styles.title]}>
          {manga.title}
        </Text>
        {tagline ? (
          <Text numberOfLines={1} style={styles.tagline}>
            {tagline}
          </Text>
        ) : null}

        <View style={styles.readPill}>
          <Icon name="book" size={16} color="#fff" />
          <Text style={styles.readText}>Read</Text>
          <Icon name="chevronRight" size={15} color="#fff" />
        </View>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    overflow: 'hidden',
  },
  content: {
    position: 'absolute',
    left: 18,
    right: 18,
    bottom: 16,
  },
  eyebrow: {
    color: 'rgba(255,255,255,0.85)',
    marginBottom: 6,
  },
  title: {
    color: '#fff',
  },
  tagline: {
    color: 'rgba(255,255,255,0.82)',
    fontSize: 13.5,
    marginTop: 3,
  },
  readPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    alignSelf: 'flex-start',
    marginTop: 14,
    paddingVertical: 9,
    paddingHorizontal: 14,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.16)',
  },
  readText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 14,
  },
});
