import React from 'react';
import { View } from 'react-native';
import { useTheme } from '../theme/ThemeProvider';
import { useAsync } from '../hooks/useAsync';
import { getEngine } from '../engine';
import { SectionHeader } from './SectionHeader';
import { CoverRail } from './CoverRail';
import { FeaturedCarousel } from './FeaturedCarousel';
import { blockLabel, useHomeConfig, type HomeBlock } from '../home/HomeConfig';
import { useFavorites, favoriteToManga } from '../library/favorites';
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
 * library (favorites). Empty rails render nothing so the Home stays tidy.
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

  const { data, loading } = useAsync<MangaDto[]>(async () => {
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
  }, [sourceId, block.kind, usable, refreshKey]);

  if (!usable) return null;
  if (!loading && (data?.length ?? 0) === 0) return null;

  if (block.kind === 'featured') {
    const pool = (data ?? []).filter(m => !!m.thumbnailUrl).slice(0, FEATURED_COUNT);
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
      <CoverRail data={data ?? []} loading={loading} coverWidth={112} onPressItem={onOpenManga} />
    </View>
  );
}
