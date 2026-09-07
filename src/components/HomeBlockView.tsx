import React, { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { Icon } from './Icon';
import { useTheme } from '../theme/ThemeProvider';
import { useAsync } from '../hooks/useAsync';
import { getEngine } from '../engine';
import { SectionHeader } from './SectionHeader';
import { CoverRail } from './CoverRail';
import { FeaturedCarousel } from './FeaturedCarousel';
import { blockLabel, useHomeConfig, type HomeBlock } from '../home/HomeConfig';
import { useFavorites, favoriteToManga, useFavoriteKeySet, favoriteKey } from '../library/favorites';
import { pickDefaultSource } from '../utils/sourceSelect';
import { useSourceHealth, unhealthyIds, recordSourceResult } from '../sources/sourceHealth';
import { requestDiscover } from '../sources/discoverIntent';
import { useTabNav } from '../navigation/TabNav';
import type { MangaDto, SourceDto } from '../engine/types';

/** How many top-popular entries the featured carousel rotates through. */
const FEATURED_COUNT = 6;

interface HomeBlockViewProps {
  block: HomeBlock;
  sources: SourceDto[];
  onOpenManga: (m: MangaDto) => void;
  /** Bumped by pull-to-refresh to force browse rails to re-fetch. */
  refreshKey?: number;
}

/**
 * Renders one configurable home block. Browse rails (featured/popular/latest)
 * pull from a real installed source; the "Continue" rail shows the local
 * library (favorites). A browse rail that fails or comes back empty says so
 * in place, with a retry — silently vanishing made a blocked source look like
 * the home screen losing sections at random.
 */
export function HomeBlockView({ block, sources, onOpenManga, refreshKey = 0 }: HomeBlockViewProps) {
  if (block.kind === 'continue') {
    return <ContinueBlock onOpenManga={onOpenManga} />;
  }
  return (
    <BrowseBlock
      block={block}
      sources={sources}
      onOpenManga={onOpenManga}
      refreshKey={refreshKey}
    />
  );
}

function ContinueBlock({ onOpenManga }: { onOpenManga: (m: MangaDto) => void }) {
  const theme = useTheme();
  const { navigateTab } = useTabNav();
  const favorites = useFavorites();
  if (favorites.length === 0) return null;

  return (
    <View style={{ marginBottom: theme.spacing.xxl }}>
      <View style={{ paddingHorizontal: theme.spacing.lg, marginBottom: theme.spacing.md }}>
        <SectionHeader title="Library" onSeeAll={() => navigateTab('library')} />
      </View>
      <CoverRail
        data={favorites.map(favoriteToManga)}
        loading={false}
        coverWidth={124}
        onPressItem={onOpenManga}
      />
    </View>
  );
}

function BrowseBlock({
  block,
  sources,
  onOpenManga,
  refreshKey,
}: {
  block: HomeBlock;
  sources: SourceDto[];
  onOpenManga: (m: MangaDto) => void;
  refreshKey: number;
}) {
  const theme = useTheme();
  const engine = getEngine();
  const { navigateTab } = useTabNav();
  const { universalSourceId } = useHomeConfig();
  const health = useSourceHealth();
  const favKeys = useFavoriteKeySet();
  const [retry, setRetry] = useState(0);

  const wantsLatest = block.kind === 'latest';
  // Resolution order: per-section override -> universal source -> smart default.
  // Skip any candidate that can't satisfy a "latest" section.
  const ok = (s?: SourceDto) => !!s && (!wantsLatest || s.supportsLatest);
  const override = sources.find(s => s.id === block.sourceId);
  const universal = sources.find(s => s.id === universalSourceId);
  const source = ok(override)
    ? override
    : ok(universal)
      ? universal
      : pickDefaultSource(sources, { needsLatest: wantsLatest, unhealthy: unhealthyIds(health) });
  const usable = ok(source);
  const sourceId = source?.id;

  const { data, loading, error } = useAsync<MangaDto[]>(async () => {
    if (!sourceId || !usable) return [];
    try {
      const res = wantsLatest
        ? await engine.getLatest(sourceId, 1)
        : await engine.getPopular(sourceId, 1);
      recordSourceResult(sourceId, true);
      return res.manga;
    } catch (e) {
      recordSourceResult(sourceId, false);
      throw e;
    }
  }, [sourceId, block.kind, usable, refreshKey, retry]);

  if (!usable) return null;
  // On a failed fetch `data` still holds the PREVIOUS source's titles (useAsync
  // keeps stale data), so a failed rail must never render `data` — it shows a
  // notice instead, which also tells the user *which* source is the problem.
  const failed = !!error || (!loading && (data?.length ?? 0) === 0);

  if (block.kind === 'featured') {
    const pool = (data ?? []).filter(m => !!m.thumbnailUrl).slice(0, FEATURED_COUNT);
    if (failed || (!loading && pool.length === 0)) {
      // The hero used to step aside when its source failed, which read as the
      // recommendation "randomly disappearing". Say why, and offer a retry.
      return (
        <View style={{ marginBottom: theme.spacing.xxl }}>
          <View style={{ paddingHorizontal: theme.spacing.lg, marginBottom: theme.spacing.md }}>
            <SectionHeader title="Featured" source={source?.name} />
          </View>
          <RailNotice
            message={
              error
                ? `${source?.name ?? 'This source'} didn't respond. It may be blocked or down.`
                : `${source?.name ?? 'This source'} had nothing to feature.`
            }
            onRetry={() => setRetry(n => n + 1)}
          />
        </View>
      );
    }
    if (pool.length === 0) return null;
    return <FeaturedCarousel data={pool} onOpenManga={onOpenManga} />;
  }

  return (
    <View style={{ marginBottom: theme.spacing.xxl }}>
      <View style={{ paddingHorizontal: theme.spacing.lg, marginBottom: theme.spacing.md }}>
        <SectionHeader
          title={blockLabel(block).split(' \u00B7 ')[0]}
          source={source?.name}
          onSeeAll={
            sourceId
              ? () => {
                  requestDiscover(sourceId, wantsLatest ? 'latest' : 'popular');
                  navigateTab('discover');
                }
              : undefined
          }
        />
      </View>
      {failed ? (
        <RailNotice
          message={
            error
              ? `${source?.name ?? 'This source'} didn't respond. It may be blocked or down.`
              : `${source?.name ?? 'This source'} returned nothing here.`
          }
          onRetry={() => setRetry(n => n + 1)}
        />
      ) : (
        <CoverRail
          data={data ?? []}
          loading={loading}
          coverWidth={112}
          inLibraryOf={m => favKeys.has(favoriteKey(m.sourceId, m.url))}
          onPressItem={onOpenManga}
        />
      )}
    </View>
  );
}

/** In-place notice for a rail whose source failed, so the section doesn't vanish. */
function RailNotice({ message, onRetry }: { message: string; onRetry: () => void }) {
  const theme = useTheme();
  return (
    <View
      style={{
        marginHorizontal: theme.spacing.lg,
        padding: theme.spacing.md,
        borderRadius: theme.radius.md,
        backgroundColor: theme.colors.surface,
        borderWidth: 1,
        borderColor: theme.colors.border,
        flexDirection: 'row',
        alignItems: 'center',
        gap: theme.spacing.md,
      }}
    >
      <Text style={{ flex: 1, color: theme.colors.textMuted, fontSize: 12.5 }}>{message}</Text>
      <Pressable
        onPress={onRetry}
        hitSlop={8}
        style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}
      >
        <Icon name="refresh" size={14} color={theme.colors.accent} />
        <Text style={{ color: theme.colors.accent, fontWeight: '700', fontSize: 12.5 }}>Retry</Text>
      </Pressable>
    </View>
  );
}
