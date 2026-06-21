import React from 'react';
import { View } from 'react-native';
import { useTheme } from '../theme/ThemeProvider';
import { useAsync } from '../hooks/useAsync';
import { getEngine } from '../engine';
import { SectionHeader } from './SectionHeader';
import { CoverRail } from './CoverRail';
import { FeaturedHero } from './FeaturedHero';
import { blockLabel, type HomeBlock } from '../home/HomeConfig';
import type { MangaDto } from '../engine/types';

interface HomeBlockViewProps {
  block: HomeBlock;
  onOpenManga: (m: MangaDto) => void;
}

/** Renders one configurable home block by pulling from the engine. */
export function HomeBlockView({ block, onOpenManga }: HomeBlockViewProps) {
  const theme = useTheme();
  const engine = getEngine();

  const sourceId = block.sourceId ?? '1001';

  const { data, loading } = useAsync<MangaDto[]>(async () => {
    switch (block.kind) {
      case 'featured':
      case 'popular':
      case 'recommended': {
        const res = await engine.getPopular(sourceId, 1);
        return res.manga;
      }
      case 'latest': {
        const res = await engine.getLatest(sourceId, 1);
        return res.manga;
      }
      case 'continue': {
        // Stand-in for a local "history" table; reuse popular as a sample set.
        const res = await engine.getPopular(sourceId, 2);
        return res.manga.slice(0, 8);
      }
      default:
        return [];
    }
  }, [block.kind, sourceId]);

  if (block.kind === 'featured') {
    const hero = data?.[0];
    return (
      <View style={{ paddingHorizontal: theme.spacing.lg, marginBottom: theme.spacing.xxl }}>
        {hero ? (
          <FeaturedHero
            manga={hero}
            tagline="He killed for a crown. Now he'll burn the world."
            onPress={() => onOpenManga(hero)}
          />
        ) : null}
      </View>
    );
  }

  const isContinue = block.kind === 'continue';

  return (
    <View style={{ marginBottom: theme.spacing.xxl }}>
      <View style={{ paddingHorizontal: theme.spacing.lg, marginBottom: theme.spacing.md }}>
        <SectionHeader
          title={isContinue ? 'Continue' : blockLabel(block).split(' \u00B7 ')[0]}
          source={block.sourceName}
          onSeeAll={() => {}}
        />
      </View>
      <CoverRail
        data={data ?? []}
        loading={loading}
        coverWidth={isContinue ? 124 : 112}
        subtitleOf={m =>
          isContinue ? `Ch. ${(Math.abs(hashCode(m.url)) % 300) + 1}` : undefined
        }
        progressOf={isContinue ? m => ((Math.abs(hashCode(m.url)) % 90) + 5) / 100 : undefined}
        onPressItem={onOpenManga}
      />
    </View>
  );
}

function hashCode(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (Math.imul(31, h) + s.charCodeAt(i)) | 0;
  return h;
}
