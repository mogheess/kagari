import React, { useCallback, useMemo, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  Pressable,
  StyleSheet,
  ActivityIndicator,
  Alert,
  Modal,
  RefreshControl,
  ToastAndroid,
  useWindowDimensions,
} from 'react-native';
import LinearGradient from 'react-native-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useTheme } from '../theme/ThemeProvider';
import { useAsync } from '../hooks/useAsync';
import { getEngine } from '../engine';
import { peekManga, loadMangaDetails, loadChapters, invalidateManga } from '../engine/mangaCache';
import { Icon } from '../components/Icon';
import { Skeleton } from '../components/Skeleton';
import { RemoteImage } from '../components/RemoteImage';
import { CategoryAssignSheet } from '../components/CategoryAssignSheet';
import { SourcePickerSheet } from '../components/SourcePickerSheet';
import { seededColor, withAlpha } from '../utils/color';
import {
  toggleFavorite,
  useFavorite,
  setMangaCategories,
  findFavoritesByTitle,
  favoriteToManga,
  type FavoriteManga,
} from '../library/favorites';
import { useCategories } from '../library/categories';
import { recordRead } from '../library/history';
import { planMigration, migrateManga, type MigrationPlan } from '../library/migrate';
import { useChapterProgress, chapterKey, type ChapterProgress } from '../library/chapterProgress';
import {
  useDownloadEntry,
  enqueueDownload,
  removeDownload,
  retryDownload,
} from '../library/downloads';
import type { RootStackParamList } from '../navigation/types';
import type { MangaDto, ChapterDto, SourceDto } from '../engine/types';

function notify(message: string): void {
  ToastAndroid.show(message, ToastAndroid.SHORT);
}

/**
 * Picks the chapter to open for "Resume": the earliest chapter that hasn't been
 * read to the end, resuming mid-chapter when there's saved page progress. Falls
 * back to the first chapter (nothing read) or the newest (everything read).
 * `chaptersNewestFirst` is the source order (newest first), as rendered.
 */
function pickResume(
  chaptersNewestFirst: ChapterDto[],
  progress: Record<string, ChapterProgress>,
  sourceId: string,
): { chapter: ChapterDto; page: number; resuming: boolean } | null {
  if (chaptersNewestFirst.length === 0) return null;
  const oldestFirst = [...chaptersNewestFirst].reverse();
  let anyProgress = false;
  let firstUnread: { chapter: ChapterDto; prog?: ChapterProgress } | null = null;
  for (const chapter of oldestFirst) {
    const prog = progress[chapterKey(sourceId, chapter.url)];
    if (prog && (prog.read || prog.lastPage > 0)) anyProgress = true;
    if (!firstUnread && (!prog || !prog.read)) firstUnread = { chapter, prog };
  }
  const target = firstUnread ?? { chapter: oldestFirst[oldestFirst.length - 1], prog: undefined };
  const page =
    target.prog && !target.prog.read && target.prog.lastPage > 1 ? target.prog.lastPage - 1 : 0;
  return { chapter: target.chapter, page, resuming: anyProgress };
}

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

function formatProgress(p: ChapterProgress): string {
  return p.pageCount > 0 ? `Page ${p.lastPage} / ${p.pageCount}` : `Page ${p.lastPage}`;
}

export function MangaDetailScreen() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<Nav>();
  const { params } = useRoute<DetailRoute>();
  const { width } = useWindowDimensions();

  const [expanded, setExpanded] = useState(false);
  const [catSheet, setCatSheet] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [sortAsc, setSortAsc] = useState(false);
  const [sourceSheet, setSourceSheet] = useState(false);
  const [migratePick, setMigratePick] = useState(false);
  const [migrating, setMigrating] = useState(false);
  const [migrateTarget, setMigrateTarget] = useState<{
    to: MangaDto;
    toChapters: ChapterDto[];
    toSourceName?: string;
    plan: MigrationPlan;
  } | null>(null);
  // Search results for "migrate to another source" — the user picks the right
  // match instead of the app silently taking the first hit.
  const [migrateResults, setMigrateResults] = useState<{
    sourceId: string;
    sourceName?: string;
    query: string;
    results: MangaDto[];
  } | null>(null);
  // Candidate library copies for the duplicate-add prompt (same title, other
  // sources). The user picks which copy to migrate from.
  const [dupPrompt, setDupPrompt] = useState<FavoriteManga[] | null>(null);

  const cached = peekManga(params.sourceId, params.mangaUrl);
  const { data: details, reload: reloadDetails } = useAsync<MangaDto>(
    () => loadMangaDetails(params.sourceId, params.mangaUrl),
    [params.sourceId, params.mangaUrl],
    cached.details,
  );
  const {
    data: chapters,
    loading: chaptersLoading,
    error: chaptersError,
    reload: reloadChapters,
  } = useAsync<ChapterDto[]>(
    () => loadChapters(params.sourceId, params.mangaUrl),
    [params.sourceId, params.mangaUrl],
    cached.chapters,
  );

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    invalidateManga(params.sourceId, params.mangaUrl);
    reloadDetails();
    reloadChapters();
    // The reloads resolve quickly; release the spinner after a short beat.
    setTimeout(() => setRefreshing(false), 700);
  }, [params.sourceId, params.mangaUrl, reloadDetails, reloadChapters]);

  // Prefer freshly fetched details, but never let a live fetch that omits the
  // cover/author (common) wipe what we already had from the library/import
  // preview. Identity fields still come from details.
  const manga = useMemo<MangaDto | undefined>(() => {
    if (!details) return params.preview;
    if (!params.preview) return details;
    return {
      ...details,
      title: details.title || params.preview.title,
      thumbnailUrl: details.thumbnailUrl ?? params.preview.thumbnailUrl,
      author: details.author ?? params.preview.author,
    };
  }, [details, params.preview]);
  const tint = seededColor(manga?.thumbnailUrl ?? manga?.title ?? 'x', 0.5, 0.32);
  const backdropHeight = Math.round(width * 0.78);
  const progressMap = useChapterProgress();
  const favorite = useFavorite(params.sourceId, params.mangaUrl);
  const favorited = favorite != null;
  const categories = useCategories();
  const assignedNames = categories
    .filter(c => favorite?.categoryIds.includes(c.id))
    .map(c => c.name);

  const { data: sources } = useAsync<SourceDto[]>(() => getEngine().listSources(), []);
  const sourceName = sources?.find(s => s.id === params.sourceId)?.name;
  // Once the source list has loaded, a missing id means the extension that owns
  // this title isn't installed — the usual reason an imported manga shows a cover
  // but no chapters. Surface that instead of a silent empty list.
  const sourceMissing = sources != null && !sources.some(s => s.id === params.sourceId);
  const otherSourceCount = (sources ?? []).filter(s => s.id !== params.sourceId).length;

  // Chapters come from the source newest-first; sort toggle flips the display
  // only — resume always walks true reading order.
  const displayedChapters = useMemo(
    () => (sortAsc ? [...(chapters ?? [])].reverse() : chapters ?? []),
    [chapters, sortAsc],
  );
  const resume = useMemo(
    () => pickResume(chapters ?? [], progressMap, params.sourceId),
    [chapters, progressMap, params.sourceId],
  );

  const onToggleCategory = (categoryId: string) => {
    if (!favorite) return;
    const next = favorite.categoryIds.includes(categoryId)
      ? favorite.categoryIds.filter(id => id !== categoryId)
      : [...favorite.categoryIds, categoryId];
    setMangaCategories(params.sourceId, params.mangaUrl, next);
  };

  const openReader = (chapter: ChapterDto, initialPage?: number) => {
    if (manga) recordRead(manga, chapter);
    navigation.navigate('Reader', {
      sourceId: params.sourceId,
      mangaUrl: params.mangaUrl,
      mangaTitle: manga?.title,
      mangaThumbnailUrl: manga?.thumbnailUrl,
      chapter,
      chapters: chapters ?? [chapter],
      initialPage,
    });
  };

  const onOpenInBrowser = useCallback(async () => {
    setSourceSheet(false);
    try {
      const url = await getEngine().getMangaWebUrl(params.sourceId, params.mangaUrl);
      if (!url) {
        notify('No web address for this source');
        return;
      }
      await getEngine().openInWebView(url);
    } catch (e) {
      notify(e instanceof Error ? e.message : 'Could not open the page');
    }
  }, [params.sourceId, params.mangaUrl]);

  // Step 1 of migrate-to-source: search the chosen source and show the matches
  // so the user can pick the correct title (sources often return near-matches,
  // sequels or the wrong language as the first hit).
  const onMigrateTo = useCallback(
    async (targetSourceId: string) => {
      setMigratePick(false);
      const fromManga = manga;
      if (!fromManga?.title) {
        notify('Title not loaded yet');
        return;
      }
      if (targetSourceId === params.sourceId) return;
      setMigrating(true);
      try {
        const result = await getEngine().search(targetSourceId, fromManga.title, 1);
        const results = result.manga.slice(0, 30);
        if (results.length === 0) {
          notify('No matches found on that source');
          return;
        }
        setMigrateResults({
          sourceId: targetSourceId,
          sourceName: sources?.find(s => s.id === targetSourceId)?.name,
          query: fromManga.title,
          results,
        });
      } catch (e) {
        notify(e instanceof Error ? e.message : 'Migration search failed');
      } finally {
        setMigrating(false);
      }
    },
    [manga, params.sourceId, sources],
  );

  // Step 2 of migrate-to-source: the user picked a match — load its chapters and
  // either open it (nothing to carry) or confirm the migration.
  const onPickMigrateResult = useCallback(
    async (match: MangaDto) => {
      const picked = migrateResults;
      setMigrateResults(null);
      const fromManga = manga;
      if (!picked || !fromManga) return;
      setMigrating(true);
      try {
        let toChapters: ChapterDto[] = [];
        try {
          toChapters = await loadChapters(picked.sourceId, match.url);
        } catch {
          toChapters = [];
        }
        const plan = planMigration(fromManga, chapters ?? [], match);
        if (!plan.hasData) {
          navigation.push('MangaDetail', {
            sourceId: picked.sourceId,
            mangaUrl: match.url,
            preview: match,
          });
          return;
        }
        setMigrateTarget({ to: match, toChapters, toSourceName: picked.sourceName, plan });
      } catch (e) {
        notify(e instanceof Error ? e.message : 'Could not load that title');
      } finally {
        setMigrating(false);
      }
    },
    [migrateResults, manga, chapters, navigation],
  );

  const confirmMigrate = useCallback(
    (replace: boolean) => {
      const target = migrateTarget;
      if (!target || !manga) return;
      const summary = migrateManga({
        from: manga,
        to: target.to,
        fromChapters: chapters ?? [],
        toChapters: target.toChapters,
        replace,
      });
      setMigrateTarget(null);
      const bits: string[] = [];
      if (summary.chaptersMatched > 0) bits.push(`${summary.chaptersMatched} chapters`);
      if (summary.favoriteMoved) bits.push('library');
      if (summary.historyMoved && bits.length === 0) bits.push('history');
      notify(bits.length ? `Migrated ${bits.join(' + ')}` : 'Migrated');
      navigation.push('MangaDetail', {
        sourceId: target.to.sourceId,
        mangaUrl: target.to.url,
        preview: target.to,
      });
    },
    [migrateTarget, manga, chapters, navigation],
  );

  // Adds the current title to the library, but first checks whether the same
  // title is already followed on another source — if so, defer to a prompt so
  // the user can migrate their progress here instead of silently duplicating.
  const addToLibrary = useCallback(() => {
    if (!manga) return;
    const dups = findFavoritesByTitle(manga.title, { sourceId: manga.sourceId, url: manga.url });
    if (dups.length > 0) {
      setDupPrompt(dups);
      return;
    }
    const nowFav = toggleFavorite(manga);
    if (nowFav && categories.length > 0) setCatSheet(true);
  }, [manga, categories.length]);

  const onDupAddBoth = useCallback(() => {
    setDupPrompt(null);
    if (!manga) return;
    const nowFav = toggleFavorite(manga);
    if (nowFav && categories.length > 0) setCatSheet(true);
  }, [manga, categories.length]);

  // Migrate from the library copy the user picked in the duplicate prompt onto
  // this source, removing the old copy.
  const onDupMigrate = useCallback(
    async (existing: FavoriteManga) => {
      setDupPrompt(null);
      if (!manga) return;
      setMigrating(true);
      try {
        let fromChapters: ChapterDto[] = [];
        try {
          fromChapters = await loadChapters(existing.sourceId, existing.url);
        } catch {
          fromChapters = [];
        }
        const summary = migrateManga({
          from: favoriteToManga(existing),
          to: manga,
          fromChapters,
          toChapters: chapters ?? [],
          replace: true,
        });
        const bits: string[] = [];
        if (summary.chaptersMatched > 0) bits.push(`${summary.chaptersMatched} chapters`);
        if (summary.historyMoved && bits.length === 0) bits.push('history');
        notify(bits.length ? `Migrated here \u00B7 ${bits.join(' + ')}` : 'Migrated to this source');
      } catch (e) {
        notify(e instanceof Error ? e.message : 'Migration failed');
      } finally {
        setMigrating(false);
      }
    },
    [manga, chapters],
  );

  return (
    <View style={{ flex: 1, backgroundColor: theme.colors.bg }}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: 40 }}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={theme.colors.accent}
            colors={[theme.colors.accent]}
            progressBackgroundColor={theme.colors.surface}
            progressViewOffset={insets.top + 28}
          />
        }
      >
        {/* Backdrop */}
        <View style={{ height: backdropHeight }}>
          {manga?.thumbnailUrl ? (
            <RemoteImage
              uri={manga.thumbnailUrl}
              sourceId={params.sourceId}
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
            <RemoteImage
              uri={manga.thumbnailUrl}
              sourceId={params.sourceId}
              style={[styles.cover, { borderColor: theme.colors.border }]}
              fallback={<Skeleton width={108} height={158} radius={12} />}
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
            onPress={() => resume && openReader(resume.chapter, resume.page)}
            style={({ pressed }) => [styles.primaryBtn, { backgroundColor: theme.colors.accent, opacity: pressed ? 0.9 : 1 }]}
          >
            <Icon name="book" size={18} color={theme.colors.onAccent} />
            <Text style={{ color: theme.colors.onAccent, fontWeight: '700', fontSize: 15 }}>
              {resume?.resuming ? 'Resume' : 'Start reading'}
            </Text>
          </Pressable>
          <Pressable
            onPress={() => {
              if (!manga) return;
              if (favorited) {
                toggleFavorite(manga);
              } else {
                addToLibrary();
              }
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

        {/* Source attribution + actions (open in browser / migrate) */}
        <Pressable onPress={() => setSourceSheet(true)} style={styles.catRow}>
          <Icon name="globe" size={14} color={theme.colors.textMuted} />
          <Text style={{ color: theme.colors.textMuted, fontSize: 13, flex: 1 }} numberOfLines={1}>
            {sourceName ? `Source: ${sourceName}` : 'Source options'}
          </Text>
          <Icon name="chevronRight" size={15} color={theme.colors.textFaint} />
        </Pressable>

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
          <Pressable
            onPress={() => setSortAsc(a => !a)}
            hitSlop={8}
            disabled={!chapters?.length}
            style={styles.sortBtn}
          >
            <Text style={{ color: theme.colors.textMuted, fontSize: 12.5, fontWeight: '700' }}>
              {sortAsc ? 'Oldest first' : 'Newest first'}
            </Text>
            <Icon name="filter" size={16} color={theme.colors.textMuted} />
          </Pressable>
        </View>

        {!chapters && chaptersLoading ? (
          Array.from({ length: 6 }).map((_, i) => (
            <View key={i} style={{ paddingHorizontal: theme.spacing.lg, paddingVertical: 12 }}>
              <Skeleton width="60%" height={14} />
            </View>
          ))
        ) : displayedChapters.length === 0 ? (
          <ChaptersNotice
            sourceMissing={sourceMissing}
            error={chaptersError}
            canBrowse={!sourceMissing}
            canMigrate={otherSourceCount > 0}
            onRetry={onRefresh}
            onBrowse={() => setSourceSheet(true)}
            onMigrate={() => setMigratePick(true)}
          />
        ) : (
          displayedChapters.map((ch, i) => {
              const prog = progressMap[chapterKey(params.sourceId, ch.url)];
              const inProgress = !!prog && !prog.read && prog.lastPage > 0;
              return (
                <Pressable
                  key={`${ch.url}:${i}`}
                  onPress={() => openReader(ch)}
                  style={({ pressed }) => [
                    styles.chapterRow,
                    { borderColor: theme.colors.border, backgroundColor: pressed ? theme.colors.surface : 'transparent' },
                  ]}
                >
                  <View style={{ flex: 1 }}>
                    <Text
                      numberOfLines={1}
                      style={[
                        theme.typography.bodyStrong,
                        { color: prog?.read ? theme.colors.textFaint : theme.colors.text },
                      ]}
                    >
                      {ch.name}
                    </Text>
                    <View style={styles.chapterMeta}>
                      <Text style={{ color: theme.colors.textFaint, fontSize: 12 }}>
                        {formatDate(ch.dateUpload)}
                        {ch.scanlator ? `  \u00B7  ${ch.scanlator}` : ''}
                      </Text>
                      {inProgress ? (
                        <Text style={{ color: theme.colors.accent, fontSize: 12, fontWeight: '700' }}>
                          {formatProgress(prog)}
                        </Text>
                      ) : null}
                    </View>
                  </View>
                  <ChapterDownloadButton manga={manga} chapter={ch} />
                </Pressable>
              );
            })
        )}
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

      <SourceActionsSheet
        visible={sourceSheet}
        sourceName={sourceName}
        onOpenBrowser={onOpenInBrowser}
        onMigrate={() => {
          setSourceSheet(false);
          setMigratePick(true);
        }}
        onClose={() => setSourceSheet(false)}
      />

      <SourcePickerSheet
        visible={migratePick}
        sources={(sources ?? []).filter(s => s.id !== params.sourceId)}
        selectedId={params.sourceId}
        onSelect={onMigrateTo}
        onClose={() => setMigratePick(false)}
      />

      <MigrateConfirmSheet
        target={migrateTarget}
        fromSourceName={sourceName}
        onReplace={() => confirmMigrate(true)}
        onKeepBoth={() => confirmMigrate(false)}
        onClose={() => setMigrateTarget(null)}
      />

      <DuplicateAddSheet
        title={manga?.title}
        candidates={dupPrompt}
        sourceNameById={id => sources?.find(s => s.id === id)?.name}
        onMigrate={onDupMigrate}
        onAddBoth={onDupAddBoth}
        onClose={() => setDupPrompt(null)}
      />

      <MigrateResultPickSheet
        data={migrateResults}
        onPick={onPickMigrateResult}
        onClose={() => setMigrateResults(null)}
      />

      {migrating ? (
        <View style={styles.migrateOverlay}>
          <ActivityIndicator color="#fff" />
          <Text style={styles.migrateText}>{'Searching\u2026'}</Text>
        </View>
      ) : null}
    </View>
  );
}

/** Bottom sheet of actions for the source a manga belongs to. */
function SourceActionsSheet({
  visible,
  sourceName,
  onOpenBrowser,
  onMigrate,
  onClose,
}: {
  visible: boolean;
  sourceName?: string;
  onOpenBrowser: () => void;
  onMigrate: () => void;
  onClose: () => void;
}) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const items: { key: string; icon: 'globe' | 'arrowRight'; label: string; hint: string; onPress: () => void }[] = [
    {
      key: 'browser',
      icon: 'globe',
      label: 'Open in browser',
      hint: 'View the page or clear a Cloudflare check',
      onPress: onOpenBrowser,
    },
    {
      key: 'migrate',
      icon: 'arrowRight',
      label: 'Migrate to another source',
      hint: 'Find this title on a different source',
      onPress: onMigrate,
    },
  ];
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.sheetBackdrop} onPress={onClose} />
      <View
        style={[
          styles.sheet,
          { backgroundColor: theme.colors.bg, paddingBottom: insets.bottom + 10, borderColor: theme.colors.border },
        ]}
      >
        <View style={styles.grabber} />
        <Text style={[theme.typography.heading, { color: theme.colors.text, marginBottom: 2 }]}>
          {sourceName ?? 'Source'}
        </Text>
        <Text style={{ color: theme.colors.textMuted, fontSize: 12.5, marginBottom: 8 }}>
          If a source stops loading, open it in the browser to clear a block, or migrate the title.
        </Text>
        {items.map(item => (
          <Pressable
            key={item.key}
            onPress={item.onPress}
            style={({ pressed }) => [
              styles.actionRow,
              { backgroundColor: pressed ? theme.colors.surface : 'transparent' },
            ]}
          >
            <Icon name={item.icon} size={20} color={theme.colors.text} />
            <View style={{ flex: 1 }}>
              <Text style={[theme.typography.bodyStrong, { color: theme.colors.text }]}>
                {item.label}
              </Text>
              <Text style={{ color: theme.colors.textMuted, fontSize: 12.5, marginTop: 2 }}>
                {item.hint}
              </Text>
            </View>
          </Pressable>
        ))}
      </View>
    </Modal>
  );
}

/**
 * Confirms a migration once a match is found. Lets the user replace the original
 * (move + remove) or keep both, and explains that progress/categories/history
 * are copied. Surfaced only when there's local state worth carrying over.
 */
function MigrateConfirmSheet({
  target,
  fromSourceName,
  onReplace,
  onKeepBoth,
  onClose,
}: {
  target: { to: MangaDto; toSourceName?: string; plan: MigrationPlan } | null;
  fromSourceName?: string;
  onReplace: () => void;
  onKeepBoth: () => void;
  onClose: () => void;
}) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const toName = target?.toSourceName ?? 'the new source';
  const fromName = fromSourceName ?? 'the current source';
  const duplicate = target?.plan.targetDuplicate ?? false;
  return (
    <Modal visible={target != null} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.sheetBackdrop} onPress={onClose} />
      <View
        style={[
          styles.sheet,
          { backgroundColor: theme.colors.bg, paddingBottom: insets.bottom + 12, borderColor: theme.colors.border },
        ]}
      >
        <View style={styles.grabber} />
        <Text style={[theme.typography.heading, { color: theme.colors.text, marginBottom: 2 }]}>
          Migrate to {toName}?
        </Text>
        <Text style={{ color: theme.colors.textMuted, fontSize: 12.5, marginBottom: 14, lineHeight: 18 }}>
          {duplicate
            ? `"${target?.to.title}" is already in your library on ${toName}. Your reading progress, history and categories from ${fromName} will be copied onto it.`
            : `Your reading progress, history and categories will be copied to ${toName}.`}
        </Text>

        <Pressable
          onPress={onReplace}
          style={({ pressed }) => [
            styles.migrateChoice,
            { backgroundColor: theme.colors.accent, opacity: pressed ? 0.9 : 1 },
          ]}
        >
          <Icon name="arrowRight" size={18} color={theme.colors.onAccent} />
          <View style={{ flex: 1 }}>
            <Text style={{ color: theme.colors.onAccent, fontWeight: '700', fontSize: 14 }}>Replace</Text>
            <Text style={{ color: theme.colors.onAccent, opacity: 0.8, fontSize: 11.5, marginTop: 1 }}>
              Move here and remove the original from {fromName}
            </Text>
          </View>
        </Pressable>

        <Pressable
          onPress={onKeepBoth}
          style={({ pressed }) => [
            styles.migrateChoice,
            { borderWidth: StyleSheet.hairlineWidth, borderColor: theme.colors.border, opacity: pressed ? 0.7 : 1 },
          ]}
        >
          <Icon name="bookmark" size={18} color={theme.colors.text} />
          <View style={{ flex: 1 }}>
            <Text style={{ color: theme.colors.text, fontWeight: '700', fontSize: 14 }}>Keep both</Text>
            <Text style={{ color: theme.colors.textMuted, fontSize: 11.5, marginTop: 1 }}>
              Copy progress, keep the original too
            </Text>
          </View>
        </Pressable>

        <Pressable onPress={onClose} hitSlop={8} style={styles.migrateCancel}>
          <Text style={{ color: theme.colors.textMuted, fontSize: 13.5, fontWeight: '600' }}>Cancel</Text>
        </Pressable>
      </View>
    </Modal>
  );
}

/**
 * Shown when the user adds a title they already follow on another source. Lists
 * every matching library copy so the user picks which one to migrate their
 * reading state *from* (its old copy is removed) — instead of the app guessing —
 * or keeps both copies.
 */
function DuplicateAddSheet({
  title,
  candidates,
  sourceNameById,
  onMigrate,
  onAddBoth,
  onClose,
}: {
  title?: string;
  candidates: FavoriteManga[] | null;
  sourceNameById: (sourceId: string) => string | undefined;
  onMigrate: (existing: FavoriteManga) => void;
  onAddBoth: () => void;
  onClose: () => void;
}) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const list = candidates ?? [];
  const visible = list.length > 0;
  const multiple = list.length > 1;
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.sheetBackdrop} onPress={onClose} />
      <View
        style={[
          styles.sheet,
          { backgroundColor: theme.colors.bg, paddingBottom: insets.bottom + 12, borderColor: theme.colors.border },
        ]}
      >
        <View style={styles.grabber} />
        <Text style={[theme.typography.heading, { color: theme.colors.text, marginBottom: 2 }]}>
          Already in your library
        </Text>
        <Text style={{ color: theme.colors.textMuted, fontSize: 12.5, marginBottom: 12, lineHeight: 18 }}>
          {multiple
            ? `"${title ?? 'This title'}" matches more than one title in your library. Pick the copy to migrate your progress, history and categories from onto this source — or keep them all.`
            : `"${title ?? 'This title'}" is already in your library. Migrate your progress, history and categories onto this source, or keep both copies.`}
        </Text>

        <Text style={{ color: theme.colors.textFaint, fontSize: 11, fontWeight: '700', letterSpacing: 1, marginBottom: 6 }}>
          MIGRATE FROM
        </Text>
        <ScrollView style={styles.pickList} keyboardShouldPersistTaps="handled">
          {list.map(c => {
            const tint = seededColor(c.thumbnailUrl ?? c.title, 0.5, 0.3);
            return (
              <Pressable
                key={`${c.sourceId}\u0000${c.url}`}
                onPress={() => onMigrate(c)}
                style={({ pressed }) => [styles.pickRow, { backgroundColor: pressed ? theme.colors.surface : 'transparent' }]}
              >
                <View style={[styles.pickThumb, { backgroundColor: tint }]}>
                  {c.thumbnailUrl ? (
                    <RemoteImage uri={c.thumbnailUrl} sourceId={c.sourceId} style={StyleSheet.absoluteFill} resizeMode="cover" />
                  ) : null}
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[theme.typography.bodyStrong, { color: theme.colors.text }]} numberOfLines={1}>
                    {c.title}
                  </Text>
                  <Text style={{ color: theme.colors.textMuted, fontSize: 12, marginTop: 2 }} numberOfLines={1}>
                    {sourceNameById(c.sourceId) ?? 'Unknown source'}
                  </Text>
                </View>
                <Icon name="arrowRight" size={18} color={theme.colors.accent} />
              </Pressable>
            );
          })}
        </ScrollView>

        <Pressable
          onPress={onAddBoth}
          style={({ pressed }) => [
            styles.migrateChoice,
            { borderWidth: StyleSheet.hairlineWidth, borderColor: theme.colors.border, opacity: pressed ? 0.7 : 1, marginTop: 12 },
          ]}
        >
          <Icon name="bookmark" size={18} color={theme.colors.text} />
          <View style={{ flex: 1 }}>
            <Text style={{ color: theme.colors.text, fontWeight: '700', fontSize: 14 }}>Add anyway</Text>
            <Text style={{ color: theme.colors.textMuted, fontSize: 11.5, marginTop: 1 }}>
              {multiple ? 'Keep this copy and all the existing ones' : 'Keep both copies in your library'}
            </Text>
          </View>
        </Pressable>

        <Pressable onPress={onClose} hitSlop={8} style={styles.migrateCancel}>
          <Text style={{ color: theme.colors.textMuted, fontSize: 13.5, fontWeight: '600' }}>Cancel</Text>
        </Pressable>
      </View>
    </Modal>
  );
}

/**
 * Step between "migrate to another source" and the confirm sheet: shows the
 * search results from the chosen source so the user picks the right match rather
 * than the app taking the first hit (often a sequel, spin-off or wrong language).
 */
function MigrateResultPickSheet({
  data,
  onPick,
  onClose,
}: {
  data: { sourceId: string; sourceName?: string; query: string; results: MangaDto[] } | null;
  onPick: (match: MangaDto) => void;
  onClose: () => void;
}) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const results = data?.results ?? [];
  return (
    <Modal visible={data != null} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.sheetBackdrop} onPress={onClose} />
      <View
        style={[
          styles.sheet,
          { backgroundColor: theme.colors.bg, paddingBottom: insets.bottom + 12, borderColor: theme.colors.border },
        ]}
      >
        <View style={styles.grabber} />
        <Text style={[theme.typography.heading, { color: theme.colors.text, marginBottom: 2 }]}>
          Pick the match
        </Text>
        <Text style={{ color: theme.colors.textMuted, fontSize: 12.5, marginBottom: 12, lineHeight: 18 }}>
          {`Results on ${data?.sourceName ?? 'the source'} for "${data?.query ?? ''}". Choose the title to migrate your reading state onto.`}
        </Text>

        <ScrollView style={styles.pickList} keyboardShouldPersistTaps="handled">
          {results.map(m => {
            const tint = seededColor(m.thumbnailUrl ?? m.title, 0.5, 0.3);
            return (
              <Pressable
                key={m.url}
                onPress={() => onPick(m)}
                style={({ pressed }) => [styles.pickRow, { backgroundColor: pressed ? theme.colors.surface : 'transparent' }]}
              >
                <View style={[styles.pickThumb, { backgroundColor: tint }]}>
                  {m.thumbnailUrl ? (
                    <RemoteImage uri={m.thumbnailUrl} sourceId={m.sourceId} style={StyleSheet.absoluteFill} resizeMode="cover" />
                  ) : null}
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[theme.typography.bodyStrong, { color: theme.colors.text }]} numberOfLines={2}>
                    {m.title}
                  </Text>
                  {m.author ? (
                    <Text style={{ color: theme.colors.textMuted, fontSize: 12, marginTop: 2 }} numberOfLines={1}>
                      {m.author}
                    </Text>
                  ) : null}
                </View>
                <Icon name="arrowRight" size={18} color={theme.colors.accent} />
              </Pressable>
            );
          })}
        </ScrollView>

        <Pressable onPress={onClose} hitSlop={8} style={[styles.migrateCancel, { marginTop: 10 }]}>
          <Text style={{ color: theme.colors.textMuted, fontSize: 13.5, fontWeight: '600' }}>Cancel</Text>
        </Pressable>
      </View>
    </Modal>
  );
}

function cap(s: string): string {
  return s.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

/**
 * Shown in place of the chapter list when it's empty — most often because the
 * title's extension isn't installed (common after a Mihon import) or the source
 * is blocked/down. Explains why and offers the recovery paths the app already
 * has: retry, open in the browser (to clear a Cloudflare check), or migrate.
 */
function ChaptersNotice({
  sourceMissing,
  error,
  canBrowse,
  canMigrate,
  onRetry,
  onBrowse,
  onMigrate,
}: {
  sourceMissing: boolean;
  error: Error | null;
  canBrowse: boolean;
  canMigrate: boolean;
  onRetry: () => void;
  onBrowse: () => void;
  onMigrate: () => void;
}) {
  const theme = useTheme();
  const title = sourceMissing
    ? 'Source not installed'
    : error
      ? "Couldn't load chapters"
      : 'No chapters found';
  const message = sourceMissing
    ? "The extension this title came from isn't installed, so its chapters can't load. Install that extension, or migrate the title to a source you already have."
    : error
      ? 'The source blocked or failed the request. If it shows a Cloudflare check, open it in the browser to clear it, then retry — or migrate to another source.'
      : 'This source returned no chapters. Try again, open it in the browser, or migrate the title to another source.';

  const buttons: { key: string; label: string; icon: 'refresh' | 'globe' | 'arrowRight'; onPress: () => void; show: boolean }[] = [
    { key: 'retry', label: 'Retry', icon: 'refresh', onPress: onRetry, show: true },
    { key: 'browse', label: 'Open in browser', icon: 'globe', onPress: onBrowse, show: canBrowse },
    { key: 'migrate', label: 'Migrate', icon: 'arrowRight', onPress: onMigrate, show: canMigrate },
  ];

  return (
    <View style={styles.notice}>
      <Icon name={sourceMissing ? 'globe' : 'refresh'} size={22} color={theme.colors.textMuted} />
      <Text style={[theme.typography.bodyStrong, { color: theme.colors.text, marginTop: 8 }]}>
        {title}
      </Text>
      <Text
        style={{
          color: theme.colors.textMuted,
          fontSize: 12.5,
          lineHeight: 18,
          textAlign: 'center',
          marginTop: 4,
        }}
      >
        {message}
      </Text>
      <View style={styles.noticeBtnRow}>
        {buttons
          .filter(b => b.show)
          .map(b => (
            <Pressable
              key={b.key}
              onPress={b.onPress}
              style={({ pressed }) => [
                styles.noticeBtn,
                { borderColor: theme.colors.border, backgroundColor: pressed ? theme.colors.surface : 'transparent' },
              ]}
            >
              <Icon name={b.icon} size={15} color={theme.colors.text} />
              <Text style={{ color: theme.colors.text, fontSize: 12.5, fontWeight: '700' }}>
                {b.label}
              </Text>
            </Pressable>
          ))}
      </View>
    </View>
  );
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
  sortBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  chapterRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 13,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  chapterMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 2,
    flexWrap: 'wrap',
  },
  notice: {
    alignItems: 'center',
    paddingHorizontal: 28,
    paddingVertical: 22,
  },
  noticeBtnRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: 8,
    marginTop: 16,
  },
  noticeBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: 999,
    borderWidth: StyleSheet.hairlineWidth,
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
  sheetBackdrop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  sheet: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 18,
    paddingTop: 4,
  },
  grabber: {
    alignSelf: 'center',
    width: 38,
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(128,128,128,0.4)',
    marginTop: 8,
    marginBottom: 12,
  },
  actionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 14,
    paddingHorizontal: 8,
    borderRadius: 10,
  },
  migrateChoice: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 14,
    marginBottom: 10,
  },
  migrateCancel: {
    alignSelf: 'center',
    paddingVertical: 8,
    paddingHorizontal: 16,
    marginTop: 2,
  },
  migrateOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    backgroundColor: 'rgba(0,0,0,0.55)',
  },
  migrateText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  pickList: {
    maxHeight: 340,
  },
  pickRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 8,
    paddingHorizontal: 6,
    borderRadius: 12,
  },
  pickThumb: {
    width: 44,
    height: 60,
    borderRadius: 8,
    overflow: 'hidden',
  },
});
