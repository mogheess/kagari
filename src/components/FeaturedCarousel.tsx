import React, { useCallback, useEffect, useRef, useState } from 'react';
import { View, FlatList, useWindowDimensions, type ViewToken } from 'react-native';
import { useTheme } from '../theme/ThemeProvider';
import { FeaturedHero } from './FeaturedHero';
import type { MangaDto } from '../engine/types';

/** Time each featured hero stays on screen before auto-advancing. */
const ROTATE_MS = 5500;

/**
 * Editorial-style subtitle derived from data we already have in a browse stub.
 * Browse results aren't `initialized`, so there's no description/rating to use —
 * but genres are present, which gives a curated feel for free.
 */
function heroTagline(m: MangaDto): string | undefined {
  if (m.genres && m.genres.length > 0) return m.genres.slice(0, 3).join('  \u00B7  ');
  return undefined;
}

interface FeaturedCarouselProps {
  /** Pre-filtered pool (e.g. top popular with cover art). */
  data: MangaDto[];
  onOpenManga: (m: MangaDto) => void;
}

/**
 * Auto-rotating, swipeable featured hero. Cycles through the top picks on a
 * timer (paused while the user is dragging) and exposes page dots. Falls back to
 * a single static hero when there's only one item.
 */
export function FeaturedCarousel({ data, onOpenManga }: FeaturedCarouselProps) {
  const theme = useTheme();
  const { width } = useWindowDimensions();
  const listRef = useRef<FlatList<MangaDto>>(null);
  const [index, setIndex] = useState(0);
  const indexRef = useRef(0);
  const interacting = useRef(false);

  useEffect(() => {
    indexRef.current = index;
  }, [index]);

  useEffect(() => {
    if (data.length <= 1) return;
    const timer = setInterval(() => {
      if (interacting.current) return;
      const next = (indexRef.current + 1) % data.length;
      listRef.current?.scrollToOffset({ offset: next * width, animated: true });
      indexRef.current = next;
      setIndex(next);
    }, ROTATE_MS);
    return () => clearInterval(timer);
  }, [data.length, width]);

  const onViewable = useRef(({ viewableItems }: { viewableItems: ViewToken[] }) => {
    const first = viewableItems[0];
    if (first?.index != null) {
      indexRef.current = first.index;
      setIndex(first.index);
    }
  }).current;

  const viewabilityConfig = useRef({ itemVisiblePercentThreshold: 60 }).current;

  const renderItem = useCallback(
    ({ item }: { item: MangaDto }) => (
      <View style={{ width, paddingHorizontal: theme.spacing.lg }}>
        <FeaturedHero
          manga={item}
          tagline={heroTagline(item)}
          onPress={() => onOpenManga(item)}
        />
      </View>
    ),
    [width, theme.spacing.lg, onOpenManga],
  );

  if (data.length === 0) return null;

  if (data.length === 1) {
    return (
      <View
        style={{
          paddingHorizontal: theme.spacing.lg,
          marginBottom: theme.spacing.xxl,
        }}
      >
        <FeaturedHero
          manga={data[0]}
          tagline={heroTagline(data[0])}
          onPress={() => onOpenManga(data[0])}
        />
      </View>
    );
  }

  return (
    <View style={{ marginBottom: theme.spacing.xxl }}>
      <FlatList
        ref={listRef}
        data={data}
        keyExtractor={m => `${m.sourceId}:${m.url}`}
        renderItem={renderItem}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onScrollBeginDrag={() => {
          interacting.current = true;
        }}
        onMomentumScrollEnd={() => {
          interacting.current = false;
        }}
        onViewableItemsChanged={onViewable}
        viewabilityConfig={viewabilityConfig}
        getItemLayout={(_, i) => ({ length: width, offset: width * i, index: i })}
        initialNumToRender={1}
        maxToRenderPerBatch={2}
        windowSize={3}
      />
      <View
        style={{
          flexDirection: 'row',
          justifyContent: 'center',
          alignItems: 'center',
          gap: 6,
          marginTop: theme.spacing.md,
        }}
      >
        {data.map((m, i) => (
          <View
            key={`${m.sourceId}:${m.url}`}
            style={{
              width: i === index ? 18 : 6,
              height: 6,
              borderRadius: 3,
              backgroundColor: i === index ? theme.colors.accent : theme.colors.border,
            }}
          />
        ))}
      </View>
    </View>
  );
}
