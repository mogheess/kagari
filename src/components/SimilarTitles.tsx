import React from 'react';
import { StyleSheet, View } from 'react-native';
import { CoverRail } from './CoverRail';
import { SectionHeader } from './SectionHeader';
import { useTheme } from '../theme/ThemeProvider';
import { useSimilarTitles } from '../library/similar';
import type { MangaDto } from '../engine/types';

interface SimilarTitlesProps {
  manga: MangaDto | undefined;
  /** Start looking only once the chapter list has loaded. */
  enabled: boolean;
  onOpen: (manga: MangaDto) => void;
}

/** "Similar titles" rail for the title page; renders nothing when there are none. */
export function SimilarTitles({ manga, enabled, onOpen }: SimilarTitlesProps) {
  const theme = useTheme();
  const { items, loading } = useSimilarTitles(manga, enabled);
  if (!loading && items.length === 0) return null;
  return (
    <View style={[styles.section, { marginTop: theme.spacing.md }]}>
      <View style={{ paddingHorizontal: theme.spacing.lg, marginBottom: theme.spacing.md }}>
        <SectionHeader title="Similar titles" />
      </View>
      <CoverRail data={items} loading={loading} coverWidth={96} onPressItem={onOpen} />
    </View>
  );
}

const styles = StyleSheet.create({
  section: {
    marginBottom: 4,
  },
});
