import React, { useMemo } from 'react';
import { View, Text, Pressable, StyleSheet, FlatList } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useTheme } from '../theme/ThemeProvider';
import { Icon } from '../components/Icon';
import { RemoteImage } from '../components/RemoteImage';
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
import { queueGroups, type QueueGroup } from '../library/downloadQueue';
import type { RootStackParamList } from '../navigation/types';
import type { MangaStatus } from '../engine/types';

type Nav = NativeStackNavigationProp<RootStackParamList>;

/** Chapters listed per title before the rest collapse into a count. */
const LINES_PER_TITLE = 4;

/**
 * What's still to download, and what failed, grouped by title. Finished
 * chapters aren't listed: like Mihon, they show on their titles in the Library
 * (with a badge) and on the title page.
 */
export function DownloadQueueScreen() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<Nav>();
  const entries = useDownloads();
  const paused = useDownloadsPaused();
  const groups = useMemo(() => queueGroups(entries), [entries]);

  let waiting = 0;
  let failed = 0;
  for (const g of groups) {
    waiting += g.active.length;
    failed += g.failed.length;
  }

  const openTitle = (g: QueueGroup) =>
    navigation.navigate('MangaDetail', {
      sourceId: g.sourceId,
      mangaUrl: g.mangaUrl,
      preview: {
        sourceId: g.sourceId,
        url: g.mangaUrl,
        title: g.title,
        thumbnailUrl: g.thumbnailUrl,
        genres: [],
        status: 'unknown' as MangaStatus,
        initialized: false,
      },
    });

  const summary = [
    waiting > 0 ? (paused ? `Paused · ${waiting} waiting` : `${waiting} to download`) : null,
    failed > 0 ? `${failed} failed` : null,
  ]
    .filter(Boolean)
    .join(' · ');

  return (
    <View style={{ flex: 1, backgroundColor: theme.colors.bg }}>
      <View style={[styles.header, { paddingTop: insets.top + 8, borderColor: theme.colors.border }]}>
        <Pressable hitSlop={10} onPress={() => navigation.goBack()} style={styles.headerSide}>
          <Icon name="back" size={24} color={theme.colors.text} />
        </Pressable>
        <Text style={[theme.typography.heading, { color: theme.colors.text }]}>Download queue</Text>
        <View style={[styles.headerSide, styles.headerRight]}>
          {waiting > 0 ? (
            <Pressable hitSlop={10} onPress={paused ? resumeDownloads : pauseDownloads}>
              <Text style={{ color: theme.colors.accent, fontWeight: '700', fontSize: 14 }}>
                {paused ? 'Resume' : 'Pause'}
              </Text>
            </Pressable>
          ) : null}
        </View>
      </View>

      <FlatList
        data={groups}
        keyExtractor={g => g.key}
        contentContainerStyle={{ padding: theme.spacing.lg, paddingTop: 12 }}
        ListHeaderComponent={
          groups.length > 0 ? (
            <View style={[styles.summary, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border }]}>
              <Text style={{ color: theme.colors.text, fontSize: 13, flex: 1 }} numberOfLines={2}>
                {summary}
              </Text>
              {failed > 0 ? (
                <Pressable
                  onPress={() => retryFailed()}
                  style={[styles.pill, { backgroundColor: theme.colors.accent, borderColor: theme.colors.accent }]}
                >
                  <Text style={{ color: theme.colors.onAccent, fontWeight: '700', fontSize: 12.5 }}>Retry failed</Text>
                </Pressable>
              ) : null}
            </View>
          ) : null
        }
        ListEmptyComponent={
          <View style={styles.empty}>
            <View style={[styles.emptyIcon, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border }]}>
              <Icon name="download" size={26} color={theme.colors.textMuted} />
            </View>
            <Text style={[theme.typography.heading, { color: theme.colors.text, marginTop: 16 }]}>
              Nothing to download
            </Text>
            <Text style={[styles.emptyText, { color: theme.colors.textMuted }]}>
              Downloaded chapters stay with their titles: look for the badge on covers in your
              Library, or the Downloaded collection.
            </Text>
          </View>
        }
        renderItem={({ item }) => (
          <QueueCard group={item} paused={paused} onOpen={() => openTitle(item)} />
        )}
      />
    </View>
  );
}

function QueueCard({ group, paused, onOpen }: { group: QueueGroup; paused: boolean; onOpen: () => void }) {
  const theme = useTheme();
  const current = group.active.find(e => e.status === 'downloading');
  const lines = [...group.active, ...group.failed];
  const shown = lines.slice(0, LINES_PER_TITLE);
  const hidden = lines.length - shown.length;

  let subtitle: string;
  let subtitleColor = theme.colors.textMuted;
  if (current) {
    subtitle = current.pageCount > 0
      ? `${current.chapterName} · page ${current.downloaded} of ${current.pageCount}`
      : `${current.chapterName} · starting…`;
    subtitleColor = theme.colors.accent;
  } else if (group.active.length > 0) {
    subtitle = `${paused ? 'Paused' : 'Waiting'} · ${group.active.length} ${group.active.length === 1 ? 'chapter' : 'chapters'}`;
  } else {
    subtitle = `${group.failed.length} failed`;
    subtitleColor = theme.colors.danger;
  }
  const pct = current && current.pageCount > 0 ? Math.round((current.downloaded / current.pageCount) * 100) : 0;

  return (
    <View style={[styles.card, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border }]}>
      <Pressable onPress={onOpen} style={({ pressed }) => [styles.row, { opacity: pressed ? 0.7 : 1 }]}>
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
          {current ? (
            <View style={[styles.track, { backgroundColor: theme.colors.border }]}>
              <View style={[styles.fill, { backgroundColor: theme.colors.accent, width: `${pct}%` }]} />
            </View>
          ) : null}
        </View>
        <Icon name="chevronRight" size={18} color={theme.colors.textFaint} />
      </Pressable>

      <View style={[styles.lines, { borderColor: theme.colors.border }]}>
        {shown.map(e => (
          <QueueLine key={e.chapterUrl} entry={e} paused={paused} />
        ))}
        {hidden > 0 ? (
          <Text style={{ color: theme.colors.textFaint, fontSize: 12.5, paddingVertical: 6 }}>
            {`and ${hidden} more`}
          </Text>
        ) : null}
        <View style={styles.groupActions}>
          {group.failed.length > 0 ? (
            <Pressable onPress={() => retryFailed({ sourceId: group.sourceId, mangaUrl: group.mangaUrl })} hitSlop={6}>
              <Text style={{ color: theme.colors.accent, fontWeight: '700', fontSize: 13 }}>Retry failed</Text>
            </Pressable>
          ) : null}
          {group.active.length > 0 ? (
            <Pressable onPress={() => cancelQueued(group.sourceId, group.mangaUrl)} hitSlop={6}>
              <Text style={{ color: theme.colors.text, fontWeight: '700', fontSize: 13 }}>Cancel all</Text>
            </Pressable>
          ) : null}
        </View>
      </View>
    </View>
  );
}

/** One chapter in the queue: its state and the action that fits it. */
function QueueLine({ entry, paused }: { entry: DownloadEntry; paused: boolean }) {
  const theme = useTheme();
  let status: string;
  let color = theme.colors.textFaint;
  if (entry.status === 'downloading') {
    status = entry.pageCount > 0 ? `Downloading ${entry.downloaded}/${entry.pageCount}` : 'Starting…';
    color = theme.colors.accent;
  } else if (entry.status === 'error') {
    status = `Failed: ${entry.error ?? 'unknown error'}`;
    color = theme.colors.danger;
  } else {
    status = paused ? 'Paused' : 'Waiting';
  }
  const failed = entry.status === 'error';
  return (
    <View style={styles.line}>
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
        onPress={() =>
          failed ? retryDownload(entry.sourceId, entry.chapterUrl) : removeDownload(entry.sourceId, entry.chapterUrl)
        }
        accessibilityLabel={`${failed ? 'Retry' : 'Cancel'} ${entry.chapterName}`}
        style={styles.lineAction}
      >
        <Icon name={failed ? 'refresh' : 'close'} size={17} color={failed ? theme.colors.accent : theme.colors.textFaint} />
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
  headerSide: {
    width: 64,
  },
  headerRight: {
    alignItems: 'flex-end',
  },
  summary: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    padding: 12,
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    marginBottom: 12,
  },
  pill: {
    paddingHorizontal: 12,
    height: 32,
    borderRadius: 999,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
    justifyContent: 'center',
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
  lines: {
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 14,
    paddingTop: 4,
    paddingBottom: 10,
  },
  line: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 8,
  },
  lineAction: {
    width: 34,
    height: 34,
    alignItems: 'center',
    justifyContent: 'center',
  },
  groupActions: {
    flexDirection: 'row',
    gap: 22,
    paddingTop: 8,
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
  emptyText: {
    fontSize: 13.5,
    textAlign: 'center',
    marginTop: 6,
    lineHeight: 20,
  },
});
