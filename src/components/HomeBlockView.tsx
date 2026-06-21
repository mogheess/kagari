import React from 'react';
import { View } from 'react-native';
import { useTheme } from '../theme/ThemeProvider';
import { useAsync } from '../hooks/useAsync';
import { getEngine } from '../engine';
import { SectionHeader } from './SectionHeader';
import { CoverRail } from './CoverRail';
import { FeaturedHero } from './FeaturedHero';
import { blockLabel, type HomeBlock } from '../home/HomeConfig';
import { useFavorites, favoriteToManga } from '../library/favorites';
import type { MangaDto, SourceDto } from '../engine/types';

interface HomeBlockViewProps {
  block: HomeBlock;
  sources: SourceDto[];
  onOpenManga: (m: MangaDto) => void;
}

/**
 * Renders one configurable home block. Browse rails (featured/popular/latest)
 * pull from a real installed source; the "Continue" rail shows the local
 * library (favorites). Empty rails render nothing so the Home stays tidy.
 */
export function HomeBlockView({ block, sources, onOpenManga }: HomeBlockViewProps) {
  if (block.kind === 'continue') {
    return <ContinueBlock onOpenManga={onOpenManga} />;
  }
  return <BrowseBlock block={block} sources={sources} onOpenManga={onOpenManga} />;
}

function ContinueBlock({ onOpenManga }: { onOpenManga: (m: MangaDto) => void }) {
  const theme = useTheme();
  const favorites = useFavorites();
  if (favorites.length === 0) return null;

  return (
    <View style={{ marginBottom: theme.spacing.xxl }}>
      <View style={{ paddingHorizontal: theme.spacing.lg, marginBottom: theme.spacing.md }}>
        <SectionHeader title="Library" onSeeAll={() => {}} />
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
}: {
  block: HomeBlock;
  sources: SourceDto[];
  onOpenManga: (m: MangaDto) => void;
}) {
  const theme = useTheme();
  const engine = getEngine();

  const source = sources.find(s => s.id === block.sourceId) ?? sources[0];
  const wantsLatest = block.kind === 'latest';
  const usable = source && (!wantsLatest || source.supportsLatest);
  const sourceId = source?.id;

  const { data, loading } = useAsync<MangaDto[]>(async () => {
    if (!sourceId || !usable) return [];
    if (wantsLatest) {
      const res = await engine.getLatest(sourceId, 1);
      return res.manga;
    }
    const res = await engine.getPopular(sourceId, 1);
    return res.manga;
  }, [sourceId, block.kind, usable]);

  if (!usable) return null;
  if (!loading && (data?.length ?? 0) === 0) return null;

  if (block.kind === 'featured') {
    const hero = data?.[0];
    return (
      <View style={{ paddingHorizontal: theme.spacing.lg, marginBottom: theme.spacing.xxl }}>
        {hero ? <FeaturedHero manga={hero} onPress={() => onOpenManga(hero)} /> : null}
      </View>
    );
  }

  return (
    <View style={{ marginBottom: theme.spacing.xxl }}>
      <View style={{ paddingHorizontal: theme.spacing.lg, marginBottom: theme.spacing.md }}>
        <SectionHeader
          title={blockLabel(block).split(' \u00B7 ')[0]}
          source={source?.name}
          onSeeAll={() => {}}
        />
      </View>
      <CoverRail data={data ?? []} loading={loading} coverWidth={112} onPressItem={onOpenManga} />
    </View>
  );
}
