import React from 'react';
import { View, Text, Pressable, StyleSheet, FlatList, Alert } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useTheme } from '../theme/ThemeProvider';
import { Icon } from '../components/Icon';
import { RemoteImage } from '../components/RemoteImage';
import { useDownloads, removeDownload, type DownloadEntry } from '../library/downloads';
import type { RootStackParamList } from '../navigation/types';
import type { MangaDto, MangaStatus } from '../engine/types';

type Nav = NativeStackNavigationProp<RootStackParamList>;

/** All downloaded/queued chapters of a single manga, grouped together. */
interface MangaGroup {
  sourceId: string;
  mangaUrl: string;
  title: string;
  thumbnailUrl?: string;
  chapters: DownloadEntry[];
  done: number;
  active: number;
  errored: number;
  latest: number;
}

function groupByManga(entries: DownloadEntry[]): MangaGroup[] {
  const map = new Map<string, MangaGroup>();
  for (const e of entries) {
    const key = `${e.sourceId}:${e.mangaUrl}`;
    let g = map.get(key);
    if (!g) {
      g = {
        sourceId: e.sourceId,
        mangaUrl: e.mangaUrl,
        title: e.title,
        thumbnailUrl: e.thumbnailUrl,
        chapters: [],
        done: 0,
        active: 0,
        errored: 0,
        latest: 0,
      };
      map.set(key, g);
    }
    g.chapters.push(e);
    if (e.status === 'done') g.done += 1;
    else if (e.status === 'error') g.errored += 1;
    else g.active += 1;
    g.latest = Math.max(g.latest, e.createdAt);
  }
  return [...map.values()].sort(
    (a, b) => b.active - a.active || b.errored - a.errored || b.latest - a.latest,
  );
}

export function DownloadsScreen() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<Nav>();
  const downloads = useDownloads();
  const groups = groupByManga(downloads);

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
        data={groups}
        keyExtractor={g => `${g.sourceId}:${g.mangaUrl}`}
        contentContainerStyle={{ padding: theme.spacing.lg, paddingTop: 12 }}
        ListEmptyComponent={
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
        }
        renderItem={({ item }) => (
          <MangaGroupRow
            group={item}
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
    </View>
  );
}

function groupToManga(g: MangaGroup): MangaDto {
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

function MangaGroupRow({ group, onOpen }: { group: MangaGroup; onOpen: () => void }) {
  const theme = useTheme();
  const total = group.chapters.length;

  let subtitle: string;
  let subtitleColor = theme.colors.textFaint;
  if (group.active > 0) {
    subtitle = `Downloading \u00B7 ${group.done}/${total} chapters`;
    subtitleColor = theme.colors.accent;
  } else if (group.errored > 0) {
    subtitle = `${group.errored} failed \u00B7 ${group.done}/${total} saved`;
    subtitleColor = '#E5604D';
  } else {
    subtitle = `${total} ${total === 1 ? 'chapter' : 'chapters'} \u00B7 Saved offline`;
  }

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

  return (
    <Pressable
      onPress={onOpen}
      style={({ pressed }) => [
        styles.row,
        { backgroundColor: theme.colors.surface, borderColor: theme.colors.border, opacity: pressed ? 0.7 : 1 },
      ]}
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
      <Icon name="chevronRight" size={18} color={theme.colors.textFaint} />
    </Pressable>
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
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 10,
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    marginBottom: 10,
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
