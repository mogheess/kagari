import React, { useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  FlatList,
  Pressable,
  StyleSheet,
  ActivityIndicator,
  useWindowDimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useTheme } from '../theme/ThemeProvider';
import { useAsync } from '../hooks/useAsync';
import { getEngine } from '../engine';
import { Cover } from '../components/Cover';
import { CoverRail } from '../components/CoverRail';
import { Icon } from '../components/Icon';
import { SourcePickerSheet } from '../components/SourcePickerSheet';
import { GlobalSourcesSheet } from '../components/GlobalSourcesSheet';
import { usePinnedSources } from '../sources/pinned';
import { useSourceHealth, unhealthyIds, recordSourceResult } from '../sources/sourceHealth';
import { langLabel } from '../utils/lang';
import { pickDefaultSource, sortSourcesForPicker } from '../utils/sourceSelect';
import type { RootStackParamList } from '../navigation/types';
import type { MangaDto, SourceDto } from '../engine/types';

type Nav = NativeStackNavigationProp<RootStackParamList>;
type DiscoverMode = 'source' | 'global';
const TAB_BAR_SPACE = 110;

/** Shared muted paragraph style for the empty/info cards. */
function emptyText(theme: ReturnType<typeof useTheme>) {
  return {
    color: theme.colors.textMuted,
    fontSize: 13.5,
    lineHeight: 19,
    textAlign: 'center' as const,
    marginTop: 6,
  };
}

export function DiscoverScreen() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<Nav>();
  const engine = getEngine();

  const [mode, setMode] = useState<DiscoverMode>('source');
  const [sources, setSources] = useState<SourceDto[]>([]);
  const [sourceId, setSourceId] = useState('');
  const [query, setQuery] = useState('');
  const [debounced, setDebounced] = useState('');
  const [pickerOpen, setPickerOpen] = useState(false);
  const [chooserOpen, setChooserOpen] = useState(false);

  const pinned = usePinnedSources();
  const health = useSourceHealth();
  const userPicked = useRef(false);

  useEffect(() => {
    engine.listSources().then(s => setSources(sortSourcesForPicker(s)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Choose (and auto-correct) the default source until the user picks one. If the
  // current default is a source that recently errored, fall back to a working one.
  useEffect(() => {
    if (sources.length === 0 || userPicked.current) return;
    const unhealthy = unhealthyIds(health);
    const current = sources.find(s => s.id === sourceId);
    if (current && !unhealthy.has(current.id)) return;
    const def = pickDefaultSource(sources, { unhealthy });
    if (def && def.id !== sourceId) setSourceId(def.id);
  }, [sources, health, sourceId]);

  const selectSource = (id: string) => {
    userPicked.current = true;
    setSourceId(id);
  };

  useEffect(() => {
    const t = setTimeout(() => setDebounced(query), 350);
    return () => clearTimeout(t);
  }, [query]);

  const openManga = (m: MangaDto) =>
    navigation.navigate('MangaDetail', { sourceId: m.sourceId, mangaUrl: m.url, preview: m });

  const sidePad = theme.spacing.lg;

  return (
    <View style={{ flex: 1, backgroundColor: theme.colors.bg }}>
      <View
        style={[
          styles.stickyHeader,
          { paddingTop: insets.top + 8, paddingHorizontal: sidePad, backgroundColor: theme.colors.bg },
        ]}
      >
        <Text style={[theme.typography.title, { color: theme.colors.text }]}>Discover</Text>

        {/* Source | Global segmented toggle */}
        <View style={[styles.segment, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border }]}>
          {(['source', 'global'] as const).map(m => {
            const active = mode === m;
            return (
              <Pressable
                key={m}
                onPress={() => setMode(m)}
                style={[styles.segmentItem, active && { backgroundColor: theme.colors.accent }]}
              >
                <Icon
                  name={m === 'source' ? 'grid' : 'search'}
                  size={15}
                  color={active ? theme.colors.onAccent : theme.colors.textMuted}
                />
                <Text
                  style={{
                    color: active ? theme.colors.onAccent : theme.colors.textMuted,
                    fontWeight: '700',
                    fontSize: 13,
                  }}
                >
                  {m === 'source' ? 'Source' : 'Global'}
                </Text>
              </Pressable>
            );
          })}
        </View>

        <View style={[styles.searchBar, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border }]}>
          <Icon name="search" size={18} color={theme.colors.textMuted} />
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder={mode === 'global' ? 'Search all selected sources' : 'Search manga'}
            placeholderTextColor={theme.colors.textFaint}
            style={[styles.input, { color: theme.colors.text }]}
            returnKeyType="search"
          />
        </View>

        {mode === 'source' ? (
          <SourceSelectPill
            source={sources.find(s => s.id === sourceId)}
            visible={sources.length > 0}
            onPress={() => setPickerOpen(true)}
          />
        ) : (
          <Pressable
            onPress={() => setChooserOpen(true)}
            style={({ pressed }) => [
              styles.sourceSelect,
              { backgroundColor: theme.colors.surface, borderColor: theme.colors.border, opacity: pressed ? 0.85 : 1 },
            ]}
          >
            <Icon name="globe" size={16} color={theme.colors.accent} />
            <Text style={{ color: theme.colors.text, fontWeight: '700', fontSize: 14, flex: 1 }} numberOfLines={1}>
              {pinned.length > 0 ? `${pinned.length} source${pinned.length === 1 ? '' : 's'} selected` : 'Choose sources'}
            </Text>
            <Icon name="chevronDown" size={16} color={theme.colors.textMuted} />
          </Pressable>
        )}
      </View>

      {mode === 'source' ? (
        <SourceBrowse
          sourceId={sourceId}
          source={sources.find(s => s.id === sourceId)}
          query={debounced}
          sourcesCount={sources.length}
          onOpenManga={openManga}
          onAddExtensions={() => navigation.navigate('Extensions')}
        />
      ) : (
        <GlobalSearch
          sources={sources}
          pinned={pinned}
          query={debounced}
          onOpenManga={openManga}
          onOpenSource={s => {
            selectSource(s.id);
            setMode('source');
          }}
          onChooseSources={() => setChooserOpen(true)}
        />
      )}

      <SourcePickerSheet
        visible={pickerOpen}
        sources={sources}
        selectedId={sourceId}
        onSelect={selectSource}
        onClose={() => setPickerOpen(false)}
      />
      <GlobalSourcesSheet visible={chooserOpen} sources={sources} onClose={() => setChooserOpen(false)} />
    </View>
  );
}

function SourceSelectPill({
  source,
  visible,
  onPress,
}: {
  source?: SourceDto;
  visible: boolean;
  onPress: () => void;
}) {
  const theme = useTheme();
  if (!visible) return null;
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.sourceSelect,
        { backgroundColor: theme.colors.surface, borderColor: theme.colors.border, opacity: pressed ? 0.85 : 1 },
      ]}
    >
      <Icon name="globe" size={16} color={theme.colors.accent} />
      <View style={{ flex: 1 }}>
        <Text numberOfLines={1} style={{ color: theme.colors.text, fontWeight: '700', fontSize: 14 }}>
          {source?.name ?? 'Select source'}
        </Text>
      </View>
      {source ? (
        <Text style={[styles.selLang, { color: theme.colors.textMuted, borderColor: theme.colors.border }]}>
          {langLabel(source.lang)}
        </Text>
      ) : null}
      <Icon name="chevronDown" size={16} color={theme.colors.textMuted} />
    </Pressable>
  );
}

/** Single-source browse/search (the "individual" mode). */
function SourceBrowse({
  sourceId,
  source,
  query,
  sourcesCount,
  onOpenManga,
  onAddExtensions,
}: {
  sourceId: string;
  source?: SourceDto;
  query: string;
  sourcesCount: number;
  onOpenManga: (m: MangaDto) => void;
  onAddExtensions: () => void;
}) {
  const theme = useTheme();
  const engine = getEngine();
  const { width } = useWindowDimensions();

  const { data, loading, error } = useAsync<MangaDto[]>(async () => {
    if (!sourceId) return [];
    try {
      const res = query.trim()
        ? await engine.search(sourceId, query, 1)
        : await engine.getPopular(sourceId, 1);
      recordSourceResult(sourceId, true);
      return res.manga;
    } catch (e) {
      recordSourceResult(sourceId, false);
      throw e;
    }
  }, [sourceId, query]);

  const gap = 12;
  const cols = 3;
  const sidePad = theme.spacing.lg;
  const coverWidth = Math.floor((width - sidePad * 2 - gap * (cols - 1)) / cols);

  return (
    <FlatList
      data={loading ? [] : data ?? []}
      numColumns={cols}
      keyExtractor={(m, i) => `${m.url}:${i}`}
      showsVerticalScrollIndicator={false}
      columnWrapperStyle={{ paddingHorizontal: sidePad, gap }}
      contentContainerStyle={{ paddingTop: 14, paddingBottom: TAB_BAR_SPACE, gap: 16 }}
      renderItem={({ item }) => <Cover manga={item} width={coverWidth} onPress={() => onOpenManga(item)} />}
      ListEmptyComponent={
        loading ? (
          <View style={{ paddingTop: 64, alignItems: 'center' }}>
            <ActivityIndicator color={theme.colors.accent} />
          </View>
        ) : sourcesCount === 0 ? (
          <View style={{ paddingHorizontal: sidePad, paddingTop: 24 }}>
            <View style={[styles.emptyCard, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border }]}>
              <Icon name="globe" size={26} color={theme.colors.accent} />
              <Text style={[theme.typography.heading, { color: theme.colors.text, marginTop: 12 }]}>No sources yet</Text>
              <Text style={emptyText(theme)}>
                Add an extension repository, then install a source to start browsing and searching.
              </Text>
              <Pressable onPress={onAddExtensions} style={[styles.emptyBtn, { backgroundColor: theme.colors.accent }]}>
                <Icon name="plus" size={16} color={theme.colors.onAccent} />
                <Text style={{ color: theme.colors.onAccent, fontWeight: '700' }}>Add extensions</Text>
              </Pressable>
            </View>
          </View>
        ) : (
          <View style={{ paddingHorizontal: sidePad, paddingTop: 24 }}>
            <View style={[styles.emptyCard, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border }]}>
              <Icon name={error ? 'globe' : 'search'} size={26} color={theme.colors.textMuted} />
              <Text style={[theme.typography.heading, { color: theme.colors.text, marginTop: 12 }]}>
                {error ? "This source didn't respond" : query.trim() ? 'No results' : 'Nothing to show'}
              </Text>
              <Text style={emptyText(theme)}>
                {error
                  ? `${source?.name ?? 'The source'} returned an error${
                      /\b(\d{3})\b/.test(error.message) ? ` (${error.message})` : ''
                    }. It may be blocked or temporarily down. Try another source.`
                  : query.trim()
                    ? `No manga matched "${query.trim()}" on ${source?.name ?? 'this source'}.`
                    : 'Pick a source above to start browsing.'}
              </Text>
            </View>
          </View>
        )
      }
    />
  );
}

/** Global search: fans the query out to the pinned sources, one rail each. */
function GlobalSearch({
  sources,
  pinned,
  query,
  onOpenManga,
  onOpenSource,
  onChooseSources,
}: {
  sources: SourceDto[];
  pinned: string[];
  query: string;
  onOpenManga: (m: MangaDto) => void;
  onOpenSource: (s: SourceDto) => void;
  onChooseSources: () => void;
}) {
  const theme = useTheme();
  const sidePad = theme.spacing.lg;
  const pinnedSources = sources.filter(s => pinned.includes(s.id));

  if (pinnedSources.length === 0) {
    return (
      <View style={{ paddingHorizontal: sidePad, paddingTop: 24 }}>
        <View style={[styles.emptyCard, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border }]}>
          <Icon name="globe" size={26} color={theme.colors.accent} />
          <Text style={[theme.typography.heading, { color: theme.colors.text, marginTop: 12 }]}>No sources selected</Text>
          <Text style={emptyText(theme)}>
            Global search queries the sources you choose. Pick a few to search them all at once.
          </Text>
          <Pressable onPress={onChooseSources} style={[styles.emptyBtn, { backgroundColor: theme.colors.accent }]}>
            <Icon name="plus" size={16} color={theme.colors.onAccent} />
            <Text style={{ color: theme.colors.onAccent, fontWeight: '700' }}>Choose sources</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  if (!query.trim()) {
    return (
      <View style={{ alignItems: 'center', paddingTop: 64, paddingHorizontal: 40 }}>
        <Icon name="search" size={26} color={theme.colors.textMuted} />
        <Text style={[theme.typography.heading, { color: theme.colors.text, marginTop: 12, textAlign: 'center' }]}>
          Search {pinnedSources.length} source{pinnedSources.length === 1 ? '' : 's'} at once
        </Text>
        <Text style={[emptyText(theme), { marginTop: 6 }]}>
          Type above to search your selected sources together.
        </Text>
      </View>
    );
  }

  return (
    <FlatList
      data={pinnedSources}
      keyExtractor={s => s.id}
      showsVerticalScrollIndicator={false}
      contentContainerStyle={{ paddingTop: 14, paddingBottom: TAB_BAR_SPACE }}
      renderItem={({ item }) => (
        <GlobalSearchRow source={item} query={query} onOpenManga={onOpenManga} onOpenSource={onOpenSource} />
      )}
    />
  );
}

function GlobalSearchRow({
  source,
  query,
  onOpenManga,
  onOpenSource,
}: {
  source: SourceDto;
  query: string;
  onOpenManga: (m: MangaDto) => void;
  onOpenSource: (s: SourceDto) => void;
}) {
  const theme = useTheme();
  const engine = getEngine();

  const { data, loading, error } = useAsync<MangaDto[]>(async () => {
    try {
      const res = await engine.search(source.id, query, 1);
      recordSourceResult(source.id, true);
      return res.manga.slice(0, 15);
    } catch (e) {
      recordSourceResult(source.id, false);
      throw e;
    }
  }, [source.id, query]);

  const count = data?.length ?? 0;

  return (
    <View style={{ marginBottom: theme.spacing.xl }}>
      <Pressable
        onPress={() => onOpenSource(source)}
        style={({ pressed }) => [styles.railHeader, { paddingHorizontal: theme.spacing.lg, opacity: pressed ? 0.7 : 1 }]}
      >
        <Text style={[theme.typography.bodyStrong, { color: theme.colors.text }]} numberOfLines={1}>
          {source.name}
        </Text>
        <Text style={[styles.selLang, { color: theme.colors.textMuted, borderColor: theme.colors.border }]}>
          {langLabel(source.lang)}
        </Text>
        <View style={{ flex: 1 }} />
        <Icon name="chevronRight" size={16} color={theme.colors.textFaint} />
      </Pressable>

      {loading ? (
        <CoverRail data={[]} loading coverWidth={108} onPressItem={onOpenManga} />
      ) : error ? (
        <Text style={[styles.railNote, { color: theme.colors.textFaint }]}>Couldn't reach this source</Text>
      ) : count === 0 ? (
        <Text style={[styles.railNote, { color: theme.colors.textFaint }]}>No results</Text>
      ) : (
        <CoverRail data={data ?? []} loading={false} coverWidth={108} onPressItem={onOpenManga} />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  stickyHeader: {
    paddingBottom: 14,
  },
  segment: {
    flexDirection: 'row',
    marginTop: 14,
    padding: 3,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    gap: 3,
  },
  segmentItem: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 8,
    borderRadius: 9,
  },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 12,
    paddingHorizontal: 14,
    height: 44,
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
  },
  input: {
    flex: 1,
    fontSize: 15,
    padding: 0,
  },
  sourceSelect: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginTop: 12,
    paddingHorizontal: 14,
    height: 46,
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
  },
  selLang: {
    fontSize: 11,
    fontWeight: '700',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 7,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
  },
  railHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 10,
  },
  railNote: {
    paddingHorizontal: 16,
    fontSize: 13,
    paddingVertical: 8,
  },
  emptyCard: {
    alignItems: 'center',
    padding: 24,
    borderRadius: 18,
    borderWidth: StyleSheet.hairlineWidth,
  },
  emptyBtn: {
    flexDirection: 'row',
    gap: 8,
    alignItems: 'center',
    justifyContent: 'center',
    height: 46,
    paddingHorizontal: 20,
    borderRadius: 14,
    marginTop: 18,
  },
});
