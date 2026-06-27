import React from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { useTheme } from '../theme/ThemeProvider';
import { Icon } from './Icon';
import { RemoteImage } from './RemoteImage';
import type { FavoriteManga } from '../library/favorites';

interface CollageCover {
  uri: string;
  sourceId: string;
}

interface CollectionCardProps {
  label: string;
  items: FavoriteManga[];
  width: number;
  onPress?: () => void;
  onLongPress?: () => void;
  /** Custom cover override; falls back to an auto collage of the titles. */
  coverUri?: string;
}

/**
 * A library "folder": a cover collage (up to 4 of its titles), the name, and a
 * count. The collage adapts to how many covers are available so even a one-title
 * folder still looks intentional.
 */
export function CollectionCard({
  label,
  items,
  width,
  onPress,
  onLongPress,
  coverUri,
}: CollectionCardProps) {
  const theme = useTheme();
  const art = Math.round(width * 0.66);
  const covers: CollageCover[] = items
    .filter(i => !!i.thumbnailUrl)
    .slice(0, 4)
    .map(i => ({ uri: i.thumbnailUrl as string, sourceId: i.sourceId }));

  return (
    <Pressable
      onPress={onPress}
      onLongPress={onLongPress}
      delayLongPress={300}
      style={({ pressed }) => [{ width, opacity: pressed ? 0.85 : 1 }]}
    >
      <View
        style={[
          styles.art,
          {
            width,
            height: art,
            borderRadius: theme.radius.lg,
            backgroundColor: theme.colors.surface,
            borderColor: theme.colors.border,
          },
        ]}
      >
        {coverUri ? (
          <RemoteImage uri={coverUri} style={styles.full} resizeMode="cover" />
        ) : (
          <>
            <Collage covers={covers} muted={theme.colors.skeleton} />
            {covers.length === 0 ? (
              <View style={styles.emptyArt}>
                <Icon name="bookmark" size={24} color={theme.colors.textFaint} />
              </View>
            ) : null}
          </>
        )}
      </View>
      <Text
        numberOfLines={1}
        style={[styles.label, theme.typography.caption, { color: theme.colors.text }]}
      >
        {label}
      </Text>
      <Text style={[styles.count, { color: theme.colors.textFaint }]}>
        {items.length} {items.length === 1 ? 'title' : 'titles'}
      </Text>
    </Pressable>
  );
}

function Collage({ covers, muted }: { covers: CollageCover[]; muted: string }) {
  if (covers.length === 0) return null;
  if (covers.length === 1) {
    return (
      <RemoteImage
        uri={covers[0].uri}
        sourceId={covers[0].sourceId}
        style={styles.full}
        resizeMode="cover"
      />
    );
  }
  // 2 covers -> two full-height columns; 3-4 -> 2x2 grid (4th cell muted when 3).
  const cellHeight = covers.length === 2 ? '100%' : '50%';
  const slots = covers.length === 2 ? 2 : 4;
  const cells = [];
  for (let i = 0; i < slots; i++) {
    const cover = covers[i];
    cells.push(
      cover ? (
        <RemoteImage
          key={i}
          uri={cover.uri}
          sourceId={cover.sourceId}
          style={{ width: '50%', height: cellHeight }}
          resizeMode="cover"
        />
      ) : (
        <View key={i} style={{ width: '50%', height: cellHeight, backgroundColor: muted }} />
      ),
    );
  }
  return <View style={styles.grid}>{cells}</View>;
}

const styles = StyleSheet.create({
  art: {
    overflow: 'hidden',
    borderWidth: StyleSheet.hairlineWidth,
  },
  full: {
    width: '100%',
    height: '100%',
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    width: '100%',
    height: '100%',
  },
  emptyArt: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  label: {
    marginTop: 8,
    fontWeight: '600',
  },
  count: {
    marginTop: 1,
    fontSize: 11,
  },
});
