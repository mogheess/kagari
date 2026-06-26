import React, { useCallback, useMemo, useState } from 'react';
import { View, Text, StyleSheet, Pressable, Image, FlatList, RefreshControl, ScrollView } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useTheme } from '../theme/ThemeProvider';
import { Icon } from '../components/Icon';
import { SwipeTabs } from '../components/SwipeTabs';
import { ConfirmDialog } from '../components/ConfirmDialog';
import {
  useHistory,
  removeFromHistory,
  clearHistory,
  historyToManga,
  reloadHistory,
  type HistoryEntry,
} from '../library/history';
import { seededColor } from '../utils/color';
import type { RootStackParamList } from '../navigation/types';

type Nav = NativeStackNavigationProp<RootStackParamList>;
type Tab = 'updates' | 'history';
const TAB_BAR_SPACE = 110;

function dayLabel(ms: number): string {
  const d = new Date(ms);
  const today = new Date();
  const yesterday = new Date();
  yesterday.setDate(today.getDate() - 1);
  const sameDay = (a: Date, b: Date) =>
    a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
  if (sameDay(d, today)) return 'Today';
  if (sameDay(d, yesterday)) return 'Yesterday';
  return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

function timeAgo(ms: number): string {
  const diff = Date.now() - ms;
  const min = Math.floor(diff / 60000);
  if (min < 1) return 'just now';
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  return new Date(ms).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
}

type Row = { kind: 'header'; key: string; label: string } | { kind: 'entry'; key: string; entry: HistoryEntry };

export function UpdatesScreen() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<Nav>();
  const history = useHistory();
  const [tab, setTab] = useState<Tab>('history');
  const [refreshing, setRefreshing] = useState(false);
  const [confirmClear, setConfirmClear] = useState(false);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await reloadHistory();
    setRefreshing(false);
  }, []);

  const rows = useMemo<Row[]>(() => {
    const out: Row[] = [];
    let lastDay = '';
    for (const e of history) {
      const label = dayLabel(e.readAt);
      if (label !== lastDay) {
        out.push({ kind: 'header', key: `h:${label}`, label });
        lastDay = label;
      }
      out.push({ kind: 'entry', key: `${e.sourceId}:${e.mangaUrl}`, entry: e });
    }
    return out;
  }, [history]);

  const openManga = (e: HistoryEntry) =>
    navigation.navigate('MangaDetail', {
      sourceId: e.sourceId,
      mangaUrl: e.mangaUrl,
      preview: historyToManga(e),
    });

  return (
    <View style={{ flex: 1, backgroundColor: theme.colors.bg }}>
      <View style={{ paddingTop: insets.top + 8, paddingHorizontal: theme.spacing.lg }}>
        <View style={styles.titleRow}>
          <Text style={[theme.typography.title, { color: theme.colors.text }]}>Activity</Text>
          {tab === 'history' && history.length > 0 ? (
            <Pressable hitSlop={8} onPress={() => setConfirmClear(true)}>
              <Text style={{ color: theme.colors.accent, fontWeight: '700', fontSize: 13 }}>Clear</Text>
            </Pressable>
          ) : null}
        </View>

        <View style={[styles.segment, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border }]}>
          {(['updates', 'history'] as const).map(t => {
            const active = tab === t;
            return (
              <Pressable
                key={t}
                onPress={() => setTab(t)}
                style={[styles.segmentItem, active && { backgroundColor: theme.colors.accent }]}
              >
                <Text
                  style={{
                    color: active ? theme.colors.onAccent : theme.colors.textMuted,
                    fontWeight: '700',
                    fontSize: 13,
                  }}
                >
                  {t === 'updates' ? 'Updates' : 'History'}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </View>

      <SwipeTabs
        index={tab === 'updates' ? 0 : 1}
        count={2}
        onIndexChange={i => setTab(i === 0 ? 'updates' : 'history')}
      >
        {tab === 'updates' ? (
          <EmptyState
            icon="updates"
            title="No updates yet"
            subtitle="New chapters from the manga in your library will land here. Pull down to check for updates."
            refreshing={refreshing}
            onRefresh={onRefresh}
          />
        ) : history.length === 0 ? (
          <EmptyState
            icon="book"
            title="No reading history"
            subtitle="Chapters you open show up here so you can pick up right where you left off."
          />
        ) : (
          <FlatList
            data={rows}
            keyExtractor={r => r.key}
            style={{ flex: 1 }}
            showsVerticalScrollIndicator={false}
            contentContainerStyle={{ paddingTop: 14, paddingBottom: TAB_BAR_SPACE, paddingHorizontal: theme.spacing.lg }}
            renderItem={({ item }) => {
              if (item.kind === 'header') {
                return <Text style={[styles.dayHeader, { color: theme.colors.textFaint }]}>{item.label.toUpperCase()}</Text>;
              }
              return (
                <HistoryRow
                  entry={item.entry}
                  onPress={() => openManga(item.entry)}
                  onRemove={() => removeFromHistory(item.entry.sourceId, item.entry.mangaUrl)}
                />
              );
            }}
          />
        )}
      </SwipeTabs>

      <ConfirmDialog
        visible={confirmClear}
        title="Clear reading history?"
        message="This removes every entry from your history. This can't be undone."
        confirmLabel="Clear"
        cancelLabel="Cancel"
        destructive
        onConfirm={() => {
          clearHistory();
          setConfirmClear(false);
        }}
        onCancel={() => setConfirmClear(false)}
      />
    </View>
  );
}

function HistoryRow({
  entry,
  onPress,
  onRemove,
}: {
  entry: HistoryEntry;
  onPress: () => void;
  onRemove: () => void;
}) {
  const theme = useTheme();
  const tint = seededColor(entry.thumbnailUrl ?? entry.title, 0.5, 0.3);
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.row, { opacity: pressed ? 0.7 : 1 }]}
    >
      <View style={[styles.thumb, { backgroundColor: tint }]}>
        {entry.thumbnailUrl ? (
          <Image source={{ uri: entry.thumbnailUrl }} style={StyleSheet.absoluteFill} resizeMode="cover" />
        ) : null}
      </View>
      <View style={{ flex: 1 }}>
        <Text style={[theme.typography.bodyStrong, { color: theme.colors.text }]} numberOfLines={1}>
          {entry.title}
        </Text>
        <Text style={{ color: theme.colors.textMuted, fontSize: 12.5, marginTop: 2 }} numberOfLines={1}>
          {entry.chapterName}
        </Text>
        <Text style={{ color: theme.colors.textFaint, fontSize: 11.5, marginTop: 3 }}>
          {entry.lastPage && entry.pageCount
            ? `Page ${Math.min(entry.lastPage, entry.pageCount)} of ${entry.pageCount} \u00B7 ${timeAgo(entry.readAt)}`
            : timeAgo(entry.readAt)}
        </Text>
        {entry.lastPage && entry.pageCount ? (
          <View style={[styles.progressTrack, { backgroundColor: theme.colors.border }]}>
            <View
              style={[
                styles.progressFill,
                {
                  backgroundColor: theme.colors.accent,
                  width: `${Math.min(100, Math.round((entry.lastPage / entry.pageCount) * 100))}%`,
                },
              ]}
            />
          </View>
        ) : null}
      </View>
      <Pressable hitSlop={10} onPress={onRemove} style={{ padding: 4 }}>
        <Icon name="close" size={18} color={theme.colors.textFaint} />
      </Pressable>
    </Pressable>
  );
}

function EmptyState({
  icon,
  title,
  subtitle,
  refreshing,
  onRefresh,
}: {
  icon: 'updates' | 'book';
  title: string;
  subtitle: string;
  refreshing?: boolean;
  onRefresh?: () => void;
}) {
  const theme = useTheme();
  return (
    <ScrollView
      style={{ flex: 1 }}
      contentContainerStyle={[styles.center, { paddingBottom: TAB_BAR_SPACE }]}
      showsVerticalScrollIndicator={false}
      refreshControl={
        onRefresh ? (
          <RefreshControl
            refreshing={!!refreshing}
            onRefresh={onRefresh}
            tintColor={theme.colors.accent}
            colors={[theme.colors.accent]}
            progressBackgroundColor={theme.colors.surface}
          />
        ) : undefined
      }
    >
      <View style={[styles.emptyIcon, { backgroundColor: theme.colors.elevated, borderColor: theme.colors.border }]}>
        <Icon name={icon} size={30} color={theme.colors.accent} />
      </View>
      <Text style={[theme.typography.heading, { color: theme.colors.text, marginTop: 18 }]}>{title}</Text>
      <Text style={[styles.sub, { color: theme.colors.textMuted }]}>{subtitle}</Text>
      {onRefresh ? (
        <View style={styles.pullHint}>
          <Icon name="refresh" size={13} color={theme.colors.textFaint} />
          <Text style={{ color: theme.colors.textFaint, fontSize: 12.5, fontWeight: '600' }}>Pull to refresh</Text>
        </View>
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  segment: {
    flexDirection: 'row',
    padding: 3,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    gap: 3,
    marginBottom: 4,
  },
  segmentItem: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 8,
    borderRadius: 9,
  },
  dayHeader: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1.2,
    marginTop: 16,
    marginBottom: 6,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 8,
  },
  thumb: {
    width: 46,
    height: 64,
    borderRadius: 8,
    overflow: 'hidden',
  },
  progressTrack: {
    height: 3,
    borderRadius: 2,
    marginTop: 6,
    overflow: 'hidden',
  },
  progressFill: {
    height: 3,
    borderRadius: 2,
  },
  center: {
    flexGrow: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
  },
  emptyIcon: {
    width: 72,
    height: 72,
    borderRadius: 36,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: StyleSheet.hairlineWidth,
  },
  sub: {
    fontSize: 13.5,
    lineHeight: 20,
    textAlign: 'center',
    marginTop: 8,
    maxWidth: 300,
  },
  pullHint: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 20,
  },
});
