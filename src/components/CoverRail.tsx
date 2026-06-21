import React from 'react';
import { FlatList, View } from 'react-native';
import { Cover } from './Cover';
import { Skeleton } from './Skeleton';
import { useTheme } from '../theme/ThemeProvider';
import type { MangaDto } from '../engine/types';

interface CoverRailProps {
  data: MangaDto[];
  loading?: boolean;
  coverWidth?: number;
  subtitleOf?: (m: MangaDto) => string | undefined;
  progressOf?: (m: MangaDto) => number | undefined;
  onPressItem?: (m: MangaDto) => void;
}

/** Horizontal scrolling rail of covers, with skeleton placeholders. */
export function CoverRail({
  data,
  loading,
  coverWidth = 112,
  subtitleOf,
  progressOf,
  onPressItem,
}: CoverRailProps) {
  const theme = useTheme();

  if (loading) {
    return (
      <View style={{ flexDirection: 'row', paddingHorizontal: theme.spacing.lg, gap: 12 }}>
        {Array.from({ length: 4 }).map((_, i) => (
          <View key={i} style={{ gap: 6 }}>
            <Skeleton width={coverWidth} height={Math.round(coverWidth * 1.46)} radius={theme.radius.md} />
            <Skeleton width={coverWidth * 0.8} height={11} />
          </View>
        ))}
      </View>
    );
  }

  return (
    <FlatList
      horizontal
      showsHorizontalScrollIndicator={false}
      data={data}
      keyExtractor={(m, i) => `${m.sourceId}:${m.url}:${i}`}
      contentContainerStyle={{ paddingHorizontal: theme.spacing.lg, gap: 12 }}
      renderItem={({ item }) => (
        <Cover
          manga={item}
          width={coverWidth}
          subtitle={subtitleOf?.(item)}
          progress={progressOf?.(item)}
          onPress={() => onPressItem?.(item)}
        />
      )}
    />
  );
}
