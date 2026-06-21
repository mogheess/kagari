import React, { useState } from 'react';
import {
  View,
  Text,
  Image,
  ScrollView,
  Pressable,
  StyleSheet,
  ActivityIndicator,
  Alert,
  useWindowDimensions,
} from 'react-native';
import LinearGradient from 'react-native-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useTheme } from '../theme/ThemeProvider';
import { useAsync } from '../hooks/useAsync';
import { getEngine } from '../engine';
import { Icon } from '../components/Icon';
import { Skeleton } from '../components/Skeleton';
import { CategoryAssignSheet } from '../components/CategoryAssignSheet';
import { seededColor, withAlpha } from '../utils/color';
import { toggleFavorite, useFavorite, setMangaCategories } from '../library/favorites';
import { useCategories } from '../library/categories';
import { recordRead } from '../library/history';
import {
  useDownloadEntry,
  enqueueDownload,
  removeDownload,
  retryDownload,
} from '../library/downloads';
import type { RootStackParamList } from '../navigation/types';
import type { MangaDto, ChapterDto } from '../engine/types';

type Nav = NativeStackNavigationProp<RootStackParamList>;
type DetailRoute = RouteProp<RootStackParamList, 'MangaDetail'>;

function formatDate(ms: number): string {
  if (!ms) return '';
  return new Date(ms).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

export function MangaDetailScreen() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<Nav>();
  const { params } = useRoute<DetailRoute>();
  const { width } = useWindowDimensions();
  const engine = getEngine();

  const [expanded, setExpanded] = useState(false);
  const [catSheet, setCatSheet] = useState(false);

  const { data: details } = useAsync<MangaDto>(
    () => engine.getMangaDetails(params.sourceId, params.mangaUrl),
    [params.sourceId, params.mangaUrl],
  );
  const { data: chapters, loading: chaptersLoading } = useAsync<ChapterDto[]>(
    () => engine.getChapters(params.sourceId, params.mangaUrl),
    [params.sourceId, params.mangaUrl],
  );

  const manga = details ?? params.preview;
  const tint = seededColor(manga?.thumbnailUrl ?? manga?.title ?? 'x', 0.5, 0.32);
  const backdropHeight = Math.round(width * 0.78);
  const favorite = useFavorite(params.sourceId, params.mangaUrl);
  const favorited = favorite != null;
  const categories = useCategories();
  const assignedNames = categories
    .filter(c => favorite?.categoryIds.includes(c.id))
    .map(c => c.name);

  const onToggleCategory = (categoryId: string) => {
    if (!favorite) return;
    const next = favorite.categoryIds.includes(categoryId)
      ? favorite.categoryIds.filter(id => id !== categoryId)
      : [...favorite.categoryIds, categoryId];
    setMangaCategories(params.sourceId, params.mangaUrl, next);
  };

  const openReader = (chapter: ChapterDto) => {
    if (manga) recordRead(manga, chapter);
    navigation.navigate('Reader', {
      sourceId: params.sourceId,
      mangaUrl: params.mangaUrl,
      chapter,
      chapters: chapters ?? [chapter],
    });
  };

  return (
    <View style={{ flex: 1, backgroundColor: theme.colors.bg }}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 40 }}>
        {/* Backdrop */}
        <View style={{ height: backdropHeight }}>
          {manga?.thumbnailUrl ? (
            <Image
              source={{ uri: manga.thumbnailUrl }}
              blurRadius={28}
              style={StyleSheet.absoluteFill}
              resizeMode="cover"
            />
          ) : null}
          <LinearGradient
            colors={[withAlpha(tint, 0.2), 'transparent', theme.colors.bg]}
            locations={[0, 0.45, 1]}
            style={StyleSheet.absoluteFill}
          />

          <Pressable
            onPress={() => navigation.goBack()}
            style={[styles.backBtn, { top: insets.top + 6, backgroundColor: theme.colors.scrim }]}
          >
            <Icon name="back" size={22} color={theme.colors.text} />
          </Pressable>
        </View>

        {/* Header block */}
        <View style={[styles.headerRow, { marginTop: -backdropHeight * 0.42 }]}>
          {manga?.thumbnailUrl ? (
            <Image
              source={{ uri: manga.thumbnailUrl }}
              style={[styles.cover, { borderColor: theme.colors.border }]}
            />
          ) : (
            <Skeleton width={108} height={158} radius={12} />
          )}
          <View style={styles.headerMeta}>
            <Text numberOfLines={3} style={[theme.typography.title, { color: theme.colors.text }]}>
              {manga?.title ?? 'Loading\u2026'}
            </Text>
            {manga?.author ? (
              <Text style={{ color: theme.colors.textMuted, marginTop: 4 }}>{manga.author}</Text>
            ) : null}
            {manga?.status ? (
              <View style={[styles.statusPill, { borderColor: theme.colors.border }]}>
                <View style={[styles.dot, { backgroundColor: theme.colors.accent }]} />
                <Text style={{ color: theme.colors.textMuted, fontSize: 12, fontWeight: '600' }}>
                  {cap(manga.status)}
                </Text>
              </View>
            ) : null}
          </View>
        </View>

        {/* Genres */}
        {manga?.genres?.length ? (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.genres}
          >
            {manga.genres.map(g => (
              <View key={g} style={[styles.genreChip, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border }]}>
                <Text style={{ color: theme.colors.textMuted, fontSize: 12.5 }}>{g}</Text>
              </View>
            ))}
          </ScrollView>
        ) : null}

        {/* Actions */}
        <View style={styles.actions}>
          <Pressable
            onPress={() => chapters?.length && openReader(chapters[chapters.length - 1])}
            style={({ pressed }) => [styles.primaryBtn, { backgroundColor: theme.colors.accent, opacity: pressed ? 0.9 : 1 }]}
          >
            <Icon name="book" size={18} color={theme.colors.onAccent} />
            <Text style={{ color: theme.colors.onAccent, fontWeight: '700', fontSize: 15 }}>
              Start Reading
            </Text>
          </Pressable>
          <Pressable
            onPress={() => {
              if (!manga) return;
              const nowFav = toggleFavorite(manga);
              if (nowFav && categories.length > 0) setCatSheet(true);
            }}
            onLongPress={() => favorited && setCatSheet(true)}
            style={[
              styles.secondaryBtn,
              {
                borderColor: favorited ? theme.colors.accent : theme.colors.border,
                backgroundColor: favorited ? withAlpha(theme.colors.accent, 0.14) : 'transparent',
              },
            ]}
          >
            <Icon
              name="bookmark"
              size={18}
              color={favorited ? theme.colors.accent : theme.colors.text}
              filled={favorited}
            />
          </Pressable>
        </View>

        {favorited ? (
          <Pressable onPress={() => setCatSheet(true)} style={styles.catRow}>
            <Icon name="bookmark" size={14} color={theme.colors.textMuted} />
            <Text style={{ color: theme.colors.textMuted, fontSize: 13, flex: 1 }} numberOfLines={1}>
              {assignedNames.length > 0 ? assignedNames.join(', ') : 'Add to category'}
            </Text>
            <Icon name="chevronRight" size={15} color={theme.colors.textFaint} />
          </Pressable>
        ) : null}

        {/* Description */}
        {manga?.description ? (
          <Pressable onPress={() => setExpanded(e => !e)} style={styles.descWrap}>
            <Text
              numberOfLines={expanded ? undefined : 3}
              style={[theme.typography.body, { color: theme.colors.textMuted }]}
            >
              {manga.description}
            </Text>
            <Icon name={expanded ? 'chevronDown' : 'chevronRight'} size={16} color={theme.colors.textFaint} />
          </Pressable>
        ) : null}

        {/* Chapters */}
        <View style={styles.chaptersHeader}>
          <Text style={[theme.typography.heading, { color: theme.colors.text }]}>
            Chapters{chapters ? ` (${chapters.length})` : ''}
          </Text>
          <Icon name="filter" size={18} color={theme.colors.textMuted} />
        </View>

        {chaptersLoading
          ? Array.from({ length: 6 }).map((_, i) => (
              <View key={i} style={{ paddingHorizontal: theme.spacing.lg, paddingVertical: 12 }}>
                <Skeleton width="60%" height={14} />
              </View>
            ))
          : (chapters ?? []).map((ch, i) => (
              <Pressable
                key={`${ch.url}:${i}`}
                onPress={() => openReader(ch)}
                style={({ pressed }) => [
                  styles.chapterRow,
                  { borderColor: theme.colors.border, backgroundColor: pressed ? theme.colors.surface : 'transparent' },
                ]}
              >
                <View style={{ flex: 1 }}>
                  <Text style={[theme.typography.bodyStrong, { color: theme.colors.text }]}>
                    {ch.name}
                  </Text>
                  <Text style={{ color: theme.colors.textFaint, fontSize: 12, marginTop: 2 }}>
                    {formatDate(ch.dateUpload)}
                    {ch.scanlator ? `  \u00B7  ${ch.scanlator}` : ''}
                  </Text>
                </View>
                <ChapterDownloadButton manga={manga} chapter={ch} />
              </Pressable>
            ))}
      </ScrollView>

      <CategoryAssignSheet
        visible={catSheet}
        selectedIds={favorite?.categoryIds ?? []}
        onToggle={onToggleCategory}
        onManage={() => {
          setCatSheet(false);
          navigation.navigate('Categories');
        }}
        onClose={() => setCatSheet(false)}
      />
    </View>
  );
}

function cap(s: string): string {
  return s.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

/** Per-chapter download control: download / progress / done / retry. */
function ChapterDownloadButton({
  manga,
  chapter,
}: {
  manga: MangaDto | undefined;
  chapter: ChapterDto;
}) {
  const theme = useTheme();
  const entry = useDownloadEntry(chapter.sourceId, chapter.url);
  const status = entry?.status;

  const onPress = () => {
    if (!status) {
      if (manga) enqueueDownload(manga, chapter);
      return;
    }
    if (status === 'error') {
      retryDownload(chapter.sourceId, chapter.url);
      return;
    }
    if (status === 'done') {
      Alert.alert('Remove download', `Delete the downloaded "${chapter.name}"?`, [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => removeDownload(chapter.sourceId, chapter.url),
        },
      ]);
      return;
    }
    // queued or downloading -> cancel
    removeDownload(chapter.sourceId, chapter.url);
  };

  let content: React.ReactNode;
  if (status === 'done') {
    content = (
      <View style={[styles.dlDone, { backgroundColor: theme.colors.accent }]}>
        <Icon name="check" size={12} color={theme.colors.bg} />
      </View>
    );
  } else if (status === 'downloading') {
    const pct =
      entry && entry.pageCount > 0 ? Math.round((entry.downloaded / entry.pageCount) * 100) : null;
    content =
      pct != null ? (
        <Text style={{ color: theme.colors.accent, fontSize: 11, fontWeight: '800' }}>{pct}%</Text>
      ) : (
        <ActivityIndicator size="small" color={theme.colors.accent} />
      );
  } else if (status === 'queued') {
    content = <ActivityIndicator size="small" color={theme.colors.textMuted} />;
  } else if (status === 'error') {
    content = <Icon name="refresh" size={17} color="#E5604D" />;
  } else {
    content = <Icon name="download" size={18} color={theme.colors.textMuted} />;
  }

  return (
    <Pressable hitSlop={10} onPress={onPress} style={styles.dlBtn}>
      {content}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  backBtn: {
    position: 'absolute',
    left: 14,
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerRow: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    gap: 14,
  },
  cover: {
    width: 108,
    height: 158,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
  },
  headerMeta: {
    flex: 1,
    justifyContent: 'flex-end',
    paddingBottom: 4,
  },
  statusPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    alignSelf: 'flex-start',
    marginTop: 10,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
    borderWidth: StyleSheet.hairlineWidth,
  },
  dot: { width: 6, height: 6, borderRadius: 3 },
  genres: {
    paddingHorizontal: 16,
    gap: 8,
    paddingTop: 16,
  },
  genreChip: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 999,
    borderWidth: StyleSheet.hairlineWidth,
  },
  actions: {
    flexDirection: 'row',
    gap: 10,
    paddingHorizontal: 16,
    paddingTop: 18,
  },
  primaryBtn: {
    flex: 1,
    flexDirection: 'row',
    gap: 8,
    alignItems: 'center',
    justifyContent: 'center',
    height: 50,
    borderRadius: 14,
  },
  secondaryBtn: {
    width: 50,
    height: 50,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: StyleSheet.hairlineWidth,
  },
  catRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginHorizontal: 16,
    marginTop: 14,
    paddingVertical: 0,
  },
  descWrap: {
    paddingHorizontal: 16,
    paddingTop: 18,
    gap: 6,
  },
  chaptersHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 26,
    paddingBottom: 10,
  },
  chapterRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 13,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  dlBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dlDone: {
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
