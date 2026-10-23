import React, { useMemo, useState } from 'react';
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
import { pickDefaultSource, sortSourcesForPicker } from '../utils/sourceSelect';
import { useHistory, historyToManga } from '../library/history';
import { useLibraryUpdates, updateToManga, type LibraryUpdate } from '../library/libraryUpdates';
import { filterByLanguages, useEnabledLanguages } from '../sources/languageFilter';
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
  if (block.kind === 'history') {
    return <HistoryBlock onOpenManga={onOpenManga} />;
  }
  if (block.kind === 'updates') {
    return <NewChaptersBlock onOpenManga={onOpenManga} />;
  }
  if (block.kind === 'perSource') {
    return <PerSourceBlock sources={sources} onOpenManga={onOpenManga} refreshKey={refreshKey} />;
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

/** How many rails "From your sources" shows at most, to keep Home's first load reasonable. */
const PER_SOURCE_MAX = 6;
/** Covers in the history and new-chapters rails. */
const RAIL_MAX = 12;

/**
 * The source a browse block pulls from: its own override, then the universal
 * source, then the smart default. A "latest" block skips sources without one.
 */
function resolveBlockSource(
  block: HomeBlock,
  sources: SourceDto[],
  universalSourceId: string | undefined,
  unhealthy: Set<string>,
): SourceDto | undefined {
  const wantsLatest = block.kind === 'latest';
  const ok = (s?: SourceDto) => !!s && (!wantsLatest || s.supportsLatest);
  const override = sources.find(s => s.id === block.sourceId);
  const universal = sources.find(s => s.id === universalSourceId);
  if (ok(override)) return override;
  if (ok(universal)) return universal;
  const fallback = pickDefaultSource(sources, { needsLatest: wantsLatest, unhealthy });
  return ok(fallback) ? fallback : undefined;
}

/** Recently read titles, newest first; the subtitle is the chapter you were on. */
function HistoryBlock({ onOpenManga }: { onOpenManga: (m: MangaDto) => void }) {
  const theme = useTheme();
  const history = useHistory();
  const recent = useMemo(
    () => history.slice().sort((a, b) => b.readAt - a.readAt).slice(0, RAIL_MAX),
    [history],
  );
  if (recent.length === 0) return null;
  const chapterOf = new Map(recent.map(e => [favoriteKey(e.sourceId, e.mangaUrl), e.chapterName]));
  return (
    <View style={{ marginBottom: theme.spacing.xxl }}>
      <View style={{ paddingHorizontal: theme.spacing.lg, marginBottom: theme.spacing.md }}>
        <SectionHeader title="Continue reading" />
      </View>
      <CoverRail
        data={recent.map(historyToManga)}
        coverWidth={112}
        subtitleOf={m => chapterOf.get(favoriteKey(m.sourceId, m.url))}
        onPressItem={onOpenManga}
      />
    </View>
  );
}

/** Library titles with new chapters (from the Updates feed), one cover each. */
function NewChaptersBlock({ onOpenManga }: { onOpenManga: (m: MangaDto) => void }) {
  const theme = useTheme();
  const { navigateTab } = useTabNav();
  const feed = useLibraryUpdates();
  const items = useMemo(() => {
    const seen = new Set<string>();
    const out: LibraryUpdate[] = [];
    for (const u of feed) {
      if (u.kind === 'added') continue;
      const key = favoriteKey(u.sourceId, u.mangaUrl);
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(u);
      if (out.length >= RAIL_MAX) break;
    }
    return out;
  }, [feed]);
  if (items.length === 0) return null;
  const countOf = new Map(items.map(u => [favoriteKey(u.sourceId, u.mangaUrl), u.newCount]));
  return (
    <View style={{ marginBottom: theme.spacing.xxl }}>
      <View style={{ paddingHorizontal: theme.spacing.lg, marginBottom: theme.spacing.md }}>
        <SectionHeader title="New chapters" onSeeAll={() => navigateTab('updates')} />
      </View>
      <CoverRail
        data={items.map(updateToManga)}
        coverWidth={112}
        subtitleOf={m => {
          const n = countOf.get(favoriteKey(m.sourceId, m.url)) ?? 0;
          return n === 1 ? '1 new chapter' : `${n} new chapters`;
        }}
        onPressItem={onOpenManga}
      />
    </View>
  );
}

/**
 * One rail per installed source (Latest where the source has it, else
 * Popular), so someone with several sources sees all of them without setting
 * Home up. Skips sources another enabled rail already shows, adult sources and
 * languages switched off in the source picker.
 */
function PerSourceBlock({
  sources,
  onOpenManga,
  refreshKey,
}: {
  sources: SourceDto[];
  onOpenManga: (m: MangaDto) => void;
  refreshKey: number;
}) {
  const { blocks, universalSourceId } = useHomeConfig();
  const health = useSourceHealth();
  const languages = useEnabledLanguages();
  const virtual = useMemo(() => {
    const unhealthy = unhealthyIds(health);
    const shown = new Set<string>();
    for (const b of blocks) {
      if (!b.enabled || (b.kind !== 'popular' && b.kind !== 'latest' && b.kind !== 'featured')) continue;
      const s = resolveBlockSource(b, sources, universalSourceId, unhealthy);
      if (s) shown.add(s.id);
    }
    return sortSourcesForPicker(filterByLanguages(sources, languages))
      .filter(s => !s.isNsfw && !shown.has(s.id))
      // Recently failing sources go last rather than leading the feed with errors.
      .sort((a, b) => Number(unhealthy.has(a.id)) - Number(unhealthy.has(b.id)))
      .slice(0, PER_SOURCE_MAX)
      .map<HomeBlock>(s => ({
        id: `auto:${s.id}`,
        kind: s.supportsLatest ? 'latest' : 'popular',
        sourceId: s.id,
        sourceName: s.name,
        enabled: true,
      }));
  }, [blocks, sources, universalSourceId, health, languages]);
  return (
    <>
      {virtual.map(b => (
        <BrowseBlock
          key={b.id}
          block={b}
          sources={sources}
          onOpenManga={onOpenManga}
          refreshKey={refreshKey}
        />
      ))}
    </>
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
  const query = block.kind === 'search' ? block.query?.trim() ?? '' : '';
  const source = resolveBlockSource(block, sources, universalSourceId, unhealthyIds(health));
  const usable = !!source && (block.kind !== 'search' || query.length > 0);
  const sourceId = source?.id;

  const { data, loading, error } = useAsync<MangaDto[]>(async () => {
    if (!sourceId || !usable) return [];
    try {
      const res = query
        ? await engine.search(sourceId, query, 1)
        : wantsLatest
          ? await engine.getLatest(sourceId, 1)
          : await engine.getPopular(sourceId, 1);
      recordSourceResult(sourceId, true);
      return res.manga;
    } catch (e) {
      recordSourceResult(sourceId, false);
      throw e;
    }
  }, [sourceId, block.kind, query, usable, refreshKey, retry]);

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
                  requestDiscover(sourceId, wantsLatest ? 'latest' : 'popular', query || undefined);
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
