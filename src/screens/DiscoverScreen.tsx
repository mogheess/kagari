import React, { useEffect, useState } from 'react';
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
import { Icon } from '../components/Icon';
import { SourcePickerSheet } from '../components/SourcePickerSheet';
import { langLabel } from '../utils/lang';
import { pickDefaultSource, sortSourcesForPicker } from '../utils/sourceSelect';
import type { RootStackParamList } from '../navigation/types';
import type { MangaDto, SourceDto } from '../engine/types';

type Nav = NativeStackNavigationProp<RootStackParamList>;
const TAB_BAR_SPACE = 110;

export function DiscoverScreen() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<Nav>();
  const { width } = useWindowDimensions();
  const engine = getEngine();

  const [sources, setSources] = useState<SourceDto[]>([]);
  const [sourceId, setSourceId] = useState('');
  const [query, setQuery] = useState('');
  const [debounced, setDebounced] = useState('');
  const [pickerOpen, setPickerOpen] = useState(false);

  useEffect(() => {
    engine.listSources().then(s => {
      setSources(sortSourcesForPicker(s));
      const def = pickDefaultSource(s);
      if (def) setSourceId(def.id);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const t = setTimeout(() => setDebounced(query), 350);
    return () => clearTimeout(t);
  }, [query]);

  const { data, loading, error } = useAsync<MangaDto[]>(async () => {
    if (!sourceId) return [];
    if (debounced.trim()) {
      const res = await engine.search(sourceId, debounced, 1);
      return res.manga;
    }
    const res = await engine.getPopular(sourceId, 1);
    return res.manga;
  }, [sourceId, debounced]);

  const activeSource = sources.find(s => s.id === sourceId);

  const gap = 12;
  const cols = 3;
  const sidePad = theme.spacing.lg;
  const coverWidth = Math.floor((width - sidePad * 2 - gap * (cols - 1)) / cols);

  return (
    <View style={{ flex: 1, backgroundColor: theme.colors.bg }}>
      <FlatList
        data={loading ? [] : data ?? []}
        numColumns={cols}
        keyExtractor={(m, i) => `${m.url}:${i}`}
        showsVerticalScrollIndicator={false}
        columnWrapperStyle={{ paddingHorizontal: sidePad, gap }}
        contentContainerStyle={{ paddingTop: insets.top + 8, paddingBottom: TAB_BAR_SPACE, gap: 16 }}
        ListHeaderComponent={
          <View style={{ marginBottom: 16 }}>
            <Text
              style={[theme.typography.title, { color: theme.colors.text, paddingHorizontal: sidePad }]}
            >
              Discover
            </Text>

            <View
              style={[
                styles.searchBar,
                {
                  marginHorizontal: sidePad,
                  backgroundColor: theme.colors.surface,
                  borderColor: theme.colors.border,
                },
              ]}
            >
              <Icon name="search" size={18} color={theme.colors.textMuted} />
              <TextInput
                value={query}
                onChangeText={setQuery}
                placeholder="Search manga"
                placeholderTextColor={theme.colors.textFaint}
                style={[styles.input, { color: theme.colors.text }]}
                returnKeyType="search"
              />
            </View>

            {sources.length > 0 ? (
              <Pressable
                onPress={() => setPickerOpen(true)}
                style={({ pressed }) => [
                  styles.sourceSelect,
                  {
                    marginHorizontal: sidePad,
                    backgroundColor: theme.colors.surface,
                    borderColor: theme.colors.border,
                    opacity: pressed ? 0.85 : 1,
                  },
                ]}
              >
                <Icon name="globe" size={16} color={theme.colors.accent} />
                <View style={{ flex: 1 }}>
                  <Text numberOfLines={1} style={{ color: theme.colors.text, fontWeight: '700', fontSize: 14 }}>
                    {activeSource?.name ?? 'Select source'}
                  </Text>
                </View>
                {activeSource ? (
                  <Text style={[styles.selLang, { color: theme.colors.textMuted, borderColor: theme.colors.border }]}>
                    {langLabel(activeSource.lang)}
                  </Text>
                ) : null}
                <Icon name="chevronDown" size={16} color={theme.colors.textMuted} />
              </Pressable>
            ) : null}
          </View>
        }
        renderItem={({ item }) => (
          <Cover
            manga={item}
            width={coverWidth}
            onPress={() =>
              navigation.navigate('MangaDetail', {
                sourceId: item.sourceId,
                mangaUrl: item.url,
                preview: item,
              })
            }
          />
        )}
        ListEmptyComponent={
          loading ? (
            <View style={{ paddingTop: 64, alignItems: 'center' }}>
              <ActivityIndicator color={theme.colors.accent} />
            </View>
          ) : sources.length === 0 ? (
            <View style={{ paddingHorizontal: sidePad, paddingTop: 24 }}>
              <View
                style={[
                  styles.emptyCard,
                  { backgroundColor: theme.colors.surface, borderColor: theme.colors.border },
                ]}
              >
                <Icon name="globe" size={26} color={theme.colors.accent} />
                <Text style={[theme.typography.heading, { color: theme.colors.text, marginTop: 12 }]}>
                  No sources yet
                </Text>
                <Text
                  style={{
                    color: theme.colors.textMuted,
                    fontSize: 13.5,
                    lineHeight: 19,
                    textAlign: 'center',
                    marginTop: 6,
                  }}
                >
                  Add an extension repository, then install a source to start browsing and searching.
                </Text>
                <Pressable
                  onPress={() => navigation.navigate('Extensions')}
                  style={[styles.emptyBtn, { backgroundColor: theme.colors.accent }]}
                >
                  <Icon name="plus" size={16} color={theme.colors.onAccent} />
                  <Text style={{ color: theme.colors.onAccent, fontWeight: '700' }}>Add extensions</Text>
                </Pressable>
              </View>
            </View>
          ) : (
            <View style={{ paddingHorizontal: sidePad, paddingTop: 24 }}>
              <View
                style={[
                  styles.emptyCard,
                  { backgroundColor: theme.colors.surface, borderColor: theme.colors.border },
                ]}
              >
                <Icon
                  name={error ? 'globe' : 'search'}
                  size={26}
                  color={theme.colors.textMuted}
                />
                <Text style={[theme.typography.heading, { color: theme.colors.text, marginTop: 12 }]}>
                  {error
                    ? "This source didn't respond"
                    : debounced.trim()
                      ? 'No results'
                      : 'Nothing to show'}
                </Text>
                <Text
                  style={{
                    color: theme.colors.textMuted,
                    fontSize: 13.5,
                    lineHeight: 19,
                    textAlign: 'center',
                    marginTop: 6,
                  }}
                >
                  {error
                    ? `${activeSource?.name ?? 'The source'} returned an error${
                        /\b(\d{3})\b/.test(error.message) ? ` (${error.message})` : ''
                      }. It may be blocked or temporarily down — try another source.`
                    : debounced.trim()
                      ? `No manga matched "${debounced.trim()}" on ${activeSource?.name ?? 'this source'}.`
                      : 'Pick a source above to start browsing.'}
                </Text>
              </View>
            </View>
          )
        }
      />

      <SourcePickerSheet
        visible={pickerOpen}
        sources={sources}
        selectedId={sourceId}
        onSelect={setSourceId}
        onClose={() => setPickerOpen(false)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 14,
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
