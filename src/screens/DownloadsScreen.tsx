import React, { useMemo, useState } from 'react';
import { View, Text, Pressable, StyleSheet, FlatList, Alert, ScrollView, TextInput } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useTheme } from '../theme/ThemeProvider';
import { Icon } from '../components/Icon';
import { RemoteImage } from '../components/RemoteImage';
import { OptionSheet, type SheetOption } from '../components/OptionSheet';
import {
  useDownloads,
  useDownloadsPaused,
  removeDownload,
  retryDownload,
  retryFailed,
  cancelQueued,
  pauseDownloads,
  resumeDownloads,
  type DownloadEntry,
} from '../library/downloads';
import { useStorageLocation, describeStorageLocation } from '../library/storageLocation';
import {
  arrangeGroups,
  formatBytes,
  groupByManga,
  type DownloadGroup,
  type DownloadSort,
  type DownloadStatusFilter,
} from '../library/downloadsArrange';
import { useDownloadsView, setDownloadsView, resetDownloadsFilters } from '../library/downloadsView';
import { useGroupSizes } from '../library/downloadSizes';
import { useSources } from '../sources/sourcesStore';
import type { RootStackParamList } from '../navigation/types';
import type { MangaDto, MangaStatus } from '../engine/types';

type Nav = NativeStackNavigationProp<RootStackParamList>;

const SORTS: readonly SheetOption<DownloadSort>[] = [
  { value: 'recent', label: 'Recently downloaded' },
  { value: 'title', label: 'Title' },
  { value: 'source', label: 'Source' },
  { value: 'chapters', label: 'Most chapters' },
  { value: 'size', label: 'Size on disk' },
];

const STATUS_CHIPS: readonly { value: DownloadStatusFilter; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'active', label: 'Downloading' },
  { value: 'failed', label: 'Failed' },
  { value: 'done', label: 'Done' },
];

export function DownloadsScreen() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<Nav>();
  const downloads = useDownloads();
  const location = useStorageLocation();
  const view = useDownloadsView();
  const sources = useSources();
  const [query, setQuery] = useState('');
  const [sheet, setSheet] = useState<'sort' | 'source' | null>(null);
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(() => new Set());
  const paused = useDownloadsPaused();

  const toggleExpanded = (key: string) =>
    setExpanded(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  let queuedChapters = 0;
  let failedChapters = 0;
  for (const e of downloads) {
    if (e.status === 'queued' || e.status === 'downloading') queuedChapters += 1;
    else if (e.status === 'error') failedChapters += 1;
  }

  const groups = useMemo(() => groupByManga(downloads), [downloads]);
  const sizes = useGroupSizes(groups);
  const sourceNames = useMemo(() => new Map(sources.map(s => [s.id, s.name])), [sources]);

  // A saved source filter for a source with nothing downloaded any more would
  // hide everything with no visible reason; treat it as "all".
  const sourceFilter = view.sourceId && groups.some(g => g.sourceId === view.sourceId) ? view.sourceId : null;

  const shown = useMemo(
    () =>
      arrangeGroups(groups, {
        sort: view.sort,
        status: view.status,
        sourceId: sourceFilter,
        query,
        sourceNames,
        sizes,
      }),
    [groups, view.sort, view.status, sourceFilter, query, sourceNames, sizes],
  );

  const statusCounts = useMemo(() => {
    const counts: Record<DownloadStatusFilter, number> = { all: groups.length, active: 0, failed: 0, done: 0 };
    for (const g of groups) {
      if (g.active > 0) counts.active += 1;
      if (g.errored > 0) counts.failed += 1;
      if (g.done === g.chapters.length) counts.done += 1;
    }
    return counts;
  }, [groups]);

  const sourceOptions = useMemo<SheetOption<string | null>[]>(() => {
    const perSource = new Map<string, number>();
    for (const g of groups) perSource.set(g.sourceId, (perSource.get(g.sourceId) ?? 0) + 1);
    const opts = [...perSource.entries()]
      .map(([id, count]) => ({ value: id as string | null, label: sourceNames.get(id) ?? 'Source not installed', hint: String(count) }))
      .sort((a, b) => a.label.localeCompare(b.label));
    return [{ value: null, label: 'All sources', hint: String(groups.length) }, ...opts];
  }, [groups, sourceNames]);

  const sortLabel = SORTS.find(o => o.value === view.sort)?.label ?? 'Recently downloaded';
  const sourceLabel = sourceFilter ? sourceNames.get(sourceFilter) ?? 'Source not installed' : 'All sources';
  const filtering = view.status !== 'all' || sourceFilter != null || query.trim() !== '';

  const chip = (label: string, active: boolean, onPress: () => void, withCaret = false) => (
    <Pressable
      key={label}
      onPress={onPress}
      style={[
        styles.chip,
        active
          ? { backgroundColor: theme.colors.accent, borderColor: theme.colors.accent }
          : { backgroundColor: theme.colors.surface, borderColor: theme.colors.border },
      ]}
    >
      <Text style={{ color: active ? theme.colors.onAccent : theme.colors.text, fontSize: 12.5, fontWeight: '600' }}>
        {label}
      </Text>
      {withCaret ? (
        <Icon name="chevronDown" size={13} color={active ? theme.colors.onAccent : theme.colors.textMuted} />
      ) : null}
    </Pressable>
  );

  const toolbar =
    groups.length > 0 ? (
      <View style={{ marginBottom: 12 }}>
        {queuedChapters > 0 || failedChapters > 0 ? (
          <View style={[styles.queueBar, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border }]}>
            <Text style={{ color: theme.colors.text, fontSize: 13, flex: 1 }} numberOfLines={2}>
              {[
                queuedChapters > 0
                  ? paused
                    ? `Paused \u00B7 ${queuedChapters} waiting`
                    : `Downloading \u00B7 ${queuedChapters} in queue`
                  : null,
                failedChapters > 0 ? `${failedChapters} failed` : null,
              ]
                .filter(Boolean)
                .join(' \u00B7 ')}
            </Text>
            {queuedChapters > 0 ? (
              <Pressable
                onPress={paused ? resumeDownloads : pauseDownloads}
                style={[styles.barBtn, { borderColor: theme.colors.border }]}
              >
                <Text style={{ color: theme.colors.text, fontWeight: '700', fontSize: 12.5 }}>
                  {paused ? 'Resume' : 'Pause'}
                </Text>
              </Pressable>
            ) : null}
            {failedChapters > 0 ? (
              <Pressable onPress={() => retryFailed()} style={[styles.barBtn, { backgroundColor: theme.colors.accent, borderColor: theme.colors.accent }]}>
                <Text style={{ color: theme.colors.onAccent, fontWeight: '700', fontSize: 12.5 }}>Retry failed</Text>
              </Pressable>
            ) : null}
          </View>
        ) : null}
        <Text numberOfLines={1} style={{ color: theme.colors.textFaint, fontSize: 12, marginBottom: 10 }}>
          {`Saved to ${describeStorageLocation(location)}`}
        </Text>
        <View style={[styles.search, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border }]}>
          <Icon name="search" size={16} color={theme.colors.textMuted} />
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder="Search downloads"
            placeholderTextColor={theme.colors.textFaint}
            style={[styles.searchInput, { color: theme.colors.text }]}
            autoCorrect={false}
            returnKeyType="search"
          />
          {query ? (
            <Pressable hitSlop={8} onPress={() => setQuery('')}>
              <Icon name="close" size={16} color={theme.colors.textMuted} />
            </Pressable>
          ) : null}
        </View>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
          {chip(sortLabel, false, () => setSheet('sort'), true)}
          {STATUS_CHIPS.map(c =>
            chip(
              c.value === 'all' ? c.label : `${c.label} ${statusCounts[c.value]}`,
              view.status === c.value,
              () => setDownloadsView({ status: c.value }),
            ),
          )}
          {sourceOptions.length > 2 ? chip(sourceLabel, sourceFilter != null, () => setSheet('source'), true) : null}
        </ScrollView>
      </View>
    ) : null;

  return (
    <View style={{ flex: 1, backgroundColor: theme.colors.bg }}>
      <View style={[styles.header, { paddingTop: insets.top + 8, borderColor: theme.colors.border }]}>
        <Pressable hitSlop={10} onPress={() => navigation.goBack()} style={{ width: 60 }}>
          <Icon name="back" size={24} color={theme.colors.text} />
        </Pressable>
        <Text style={[theme.typography.heading, { color: theme.colors.text }]}>Downloads</Text>
        <View style={{ width: 60 }} />
      </View>

      <FlatList
        data={shown}
        keyExtractor={g => g.key}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ padding: theme.spacing.lg, paddingTop: 12 }}
        ListHeaderComponent={toolbar}
        ListEmptyComponent={
          groups.length > 0 && filtering ? (
            <View style={[styles.empty, { paddingTop: 48 }]}>
              <Text style={[theme.typography.heading, { color: theme.colors.text }]}>Nothing matches</Text>
              <Text style={{ color: theme.colors.textMuted, fontSize: 13.5, textAlign: 'center', marginTop: 6 }}>
                No downloads match these filters.
              </Text>
              <Pressable
                onPress={() => {
                  setQuery('');
                  resetDownloadsFilters();
                }}
                style={[styles.clearBtn, { borderColor: theme.colors.border, backgroundColor: theme.colors.surface }]}
              >
                <Text style={{ color: theme.colors.text, fontWeight: '700' }}>Clear filters</Text>
              </Pressable>
            </View>
          ) : (
            <View style={styles.empty}>
              <View style={[styles.emptyIcon, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border }]}>
                <Icon name="download" size={26} color={theme.colors.textMuted} />
              </View>
              <Text style={[theme.typography.heading, { color: theme.colors.text, marginTop: 16 }]}>
                No downloads yet
              </Text>
              <Text style={{ color: theme.colors.textMuted, fontSize: 13.5, textAlign: 'center', marginTop: 6, lineHeight: 20 }}>
                Tap the download icon next to a chapter to save it for offline reading.
              </Text>
            </View>
          )
        }
        renderItem={({ item }) => (
          <MangaGroupRow
            group={item}
            size={sizes.get(item.key)}
            paused={paused}
            expanded={expanded.has(item.key)}
            onToggle={() => toggleExpanded(item.key)}
            onOpen={() =>
              navigation.navigate('MangaDetail', {
                sourceId: item.sourceId,
                mangaUrl: item.mangaUrl,
                preview: groupToManga(item),
              })
            }
          />
        )}
      />

      <OptionSheet
        visible={sheet === 'sort'}
        title="Sort by"
        options={SORTS}
        selected={view.sort}
        onSelect={value => setDownloadsView({ sort: value })}
        onClose={() => setSheet(null)}
      />
      <OptionSheet
        visible={sheet === 'source'}
        title="Source"
        options={sourceOptions}
        selected={sourceFilter}
        onSelect={value => setDownloadsView({ sourceId: value })}
        onClose={() => setSheet(null)}
      />
    </View>
  );
}

function groupToManga(g: DownloadGroup): MangaDto {
  return {
    sourceId: g.sourceId,
    url: g.mangaUrl,
    title: g.title,
    thumbnailUrl: g.thumbnailUrl,
    genres: [],
    status: 'unknown' as MangaStatus,
    initialized: false,
  };
}

function MangaGroupRow({
  group,
  size,
  paused,
  expanded,
  onToggle,
  onOpen,
}: {
  group: DownloadGroup;
  size?: number;
  paused: boolean;
  expanded: boolean;
  onToggle: () => void;
  onOpen: () => void;
}) {
  const theme = useTheme();
  const total = group.chapters.length;

  let subtitle: string;
  let subtitleColor = theme.colors.textFaint;
  if (group.active > 0) {
    subtitle = `${paused ? 'Paused' : 'Downloading'} \u00B7 ${group.done}/${total} chapters`;
    subtitleColor = paused ? theme.colors.textMuted : theme.colors.accent;
  } else if (group.errored > 0) {
    subtitle = `${group.errored} failed \u00B7 ${group.done}/${total} saved`;
    subtitleColor = theme.colors.danger;
  } else {
    subtitle = `${total} ${total === 1 ? 'chapter' : 'chapters'} \u00B7 Saved offline`;
  }
  if (size != null && size > 0) subtitle += ` \u00B7 ${formatBytes(size)}`;

  const pct = total > 0 ? Math.round((group.done / total) * 100) : 0;

  const confirmDelete = () =>
    Alert.alert(
      'Remove downloads',
      `Delete all ${total} downloaded ${total === 1 ? 'chapter' : 'chapters'} of "${group.title}"?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => {
            for (const c of group.chapters) removeDownload(c.sourceId, c.chapterUrl);
          },
        },
      ],
    );

  const chapters = [...group.chapters].sort((a, b) => a.createdAt - b.createdAt);

  return (
    <View
      style={[
        styles.card,
        { backgroundColor: theme.colors.surface, borderColor: theme.colors.border },
      ]}
    >
      <Pressable
        onPress={onToggle}
        accessibilityState={{ expanded }}
        style={({ pressed }) => [styles.row, { opacity: pressed ? 0.7 : 1 }]}
      >
        <View style={[styles.thumb, { backgroundColor: theme.colors.elevated }]}>
          {group.thumbnailUrl ? (
            <RemoteImage
              uri={group.thumbnailUrl}
              sourceId={group.sourceId}
              style={StyleSheet.absoluteFill}
              resizeMode="cover"
            />
          ) : null}
        </View>
        <View style={{ flex: 1 }}>
          <Text style={[theme.typography.bodyStrong, { color: theme.colors.text }]} numberOfLines={1}>
            {group.title}
          </Text>
          <Text style={{ color: subtitleColor, fontSize: 12, marginTop: 3 }} numberOfLines={1}>
            {subtitle}
          </Text>
          {group.active > 0 ? (
            <View style={[styles.track, { backgroundColor: theme.colors.border }]}>
              <View style={[styles.fill, { backgroundColor: theme.colors.accent, width: `${pct}%` }]} />
            </View>
          ) : null}
        </View>

        <Pressable hitSlop={10} onPress={confirmDelete} style={styles.trash}>
          <Icon name="trash" size={18} color={theme.colors.textFaint} />
        </Pressable>
        <Icon name={expanded ? 'chevronDown' : 'chevronRight'} size={18} color={theme.colors.textFaint} />
      </Pressable>

      {expanded ? (
        <View style={[styles.chapters, { borderColor: theme.colors.border }]}>
          {chapters.map(c => (
            <ChapterLine key={c.chapterUrl} entry={c} paused={paused} />
          ))}
          <View style={styles.groupActions}>
            <Pressable onPress={onOpen} hitSlop={6}>
              <Text style={{ color: theme.colors.accent, fontWeight: '700', fontSize: 13 }}>Open title</Text>
            </Pressable>
            {group.errored > 0 ? (
              <Pressable onPress={() => retryFailed({ sourceId: group.sourceId, mangaUrl: group.mangaUrl })} hitSlop={6}>
                <Text style={{ color: theme.colors.text, fontWeight: '700', fontSize: 13 }}>Retry failed</Text>
              </Pressable>
            ) : null}
            {group.active > 0 ? (
              <Pressable onPress={() => cancelQueued(group.sourceId, group.mangaUrl)} hitSlop={6}>
                <Text style={{ color: theme.colors.text, fontWeight: '700', fontSize: 13 }}>Cancel queued</Text>
              </Pressable>
            ) : null}
          </View>
        </View>
      ) : null}
    </View>
  );
}

/** One chapter inside an expanded title: its state and the action that fits it. */
function ChapterLine({ entry, paused }: { entry: DownloadEntry; paused: boolean }) {
  const theme = useTheme();
  let status: string;
  let color = theme.colors.textFaint;
  switch (entry.status) {
    case 'done':
      status = `Saved \u00B7 ${entry.pageCount} pages`;
      break;
    case 'downloading':
      status = entry.pageCount > 0 ? `Downloading ${entry.downloaded}/${entry.pageCount}` : 'Starting\u2026';
      color = theme.colors.accent;
      break;
    case 'error':
      status = `Failed: ${entry.error ?? 'unknown error'}`;
      color = theme.colors.danger;
      break;
    default:
      status = paused ? 'Paused' : 'Queued';
  }

  const confirmDelete = () =>
    Alert.alert('Delete chapter', `Delete the downloaded "${entry.chapterName}"?`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => removeDownload(entry.sourceId, entry.chapterUrl) },
    ]);

  const action =
    entry.status === 'error'
      ? { icon: 'refresh' as const, label: 'Retry', onPress: () => retryDownload(entry.sourceId, entry.chapterUrl) }
      : entry.status === 'done'
        ? { icon: 'trash' as const, label: 'Delete', onPress: confirmDelete }
        : { icon: 'close' as const, label: 'Cancel', onPress: () => removeDownload(entry.sourceId, entry.chapterUrl) };

  return (
    <View style={styles.chapterLine}>
      <View style={{ flex: 1 }}>
        <Text style={{ color: theme.colors.text, fontSize: 13.5 }} numberOfLines={1}>
          {entry.chapterName}
        </Text>
        <Text style={{ color, fontSize: 12, marginTop: 2 }} numberOfLines={2}>
          {status}
        </Text>
      </View>
      <Pressable
        hitSlop={10}
        onPress={action.onPress}
        accessibilityLabel={`${action.label} ${entry.chapterName}`}
        style={styles.trash}
      >
        <Icon name={action.icon} size={17} color={entry.status === 'error' ? theme.colors.accent : theme.colors.textFaint} />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingBottom: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  card: {
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    marginBottom: 10,
    overflow: 'hidden',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 10,
  },
  chapters: {
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 14,
    paddingTop: 4,
    paddingBottom: 10,
  },
  chapterLine: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 8,
  },
  groupActions: {
    flexDirection: 'row',
    gap: 22,
    paddingTop: 8,
  },
  queueBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    padding: 12,
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    marginBottom: 12,
  },
  barBtn: {
    paddingHorizontal: 12,
    height: 32,
    borderRadius: 999,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
    justifyContent: 'center',
  },
  thumb: {
    width: 46,
    height: 64,
    borderRadius: 8,
    overflow: 'hidden',
  },
  track: {
    height: 3,
    borderRadius: 2,
    marginTop: 7,
    overflow: 'hidden',
  },
  fill: {
    height: 3,
    borderRadius: 2,
  },
  trash: {
    width: 34,
    height: 34,
    alignItems: 'center',
    justifyContent: 'center',
  },
  search: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
    height: 40,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
  },
  searchInput: {
    flex: 1,
    fontSize: 14,
    paddingVertical: 0,
  },
  chips: {
    gap: 8,
    paddingTop: 10,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 12,
    height: 32,
    borderRadius: 999,
    borderWidth: StyleSheet.hairlineWidth,
  },
  clearBtn: {
    marginTop: 16,
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
  },
  empty: {
    alignItems: 'center',
    paddingTop: 90,
    paddingHorizontal: 40,
  },
  emptyIcon: {
    width: 60,
    height: 60,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: StyleSheet.hairlineWidth,
  },
});
