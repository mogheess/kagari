import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  FlatList,
  Pressable,
  StyleSheet,
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
  const [sourceId, setSourceId] = useState('1001');
  const [query, setQuery] = useState('');
  const [debounced, setDebounced] = useState('');

  useEffect(() => {
    engine.listSources().then(s => {
      setSources(s);
      if (s[0]) setSourceId(s[0].id);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const t = setTimeout(() => setDebounced(query), 350);
    return () => clearTimeout(t);
  }, [query]);

  const { data, loading } = useAsync<MangaDto[]>(async () => {
    if (debounced.trim()) {
      const res = await engine.search(sourceId, debounced, 1);
      return res.manga;
    }
    const res = await engine.getPopular(sourceId, 1);
    return res.manga;
  }, [sourceId, debounced]);

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

            <FlatList
              horizontal
              showsHorizontalScrollIndicator={false}
              data={sources}
              keyExtractor={s => s.id}
              contentContainerStyle={{ paddingHorizontal: sidePad, gap: 8, marginTop: 14 }}
              renderItem={({ item }) => {
                const active = item.id === sourceId;
                return (
                  <Pressable
                    onPress={() => setSourceId(item.id)}
                    style={[
                      styles.chip,
                      {
                        backgroundColor: active ? theme.colors.accent : theme.colors.surface,
                        borderColor: active ? theme.colors.accent : theme.colors.border,
                      },
                    ]}
                  >
                    <Text
                      style={{
                        color: active ? theme.colors.onAccent : theme.colors.textMuted,
                        fontWeight: '600',
                        fontSize: 13,
                      }}
                    >
                      {item.name}
                    </Text>
                  </Pressable>
                );
              }}
            />
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
          !loading && sources.length === 0 ? (
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
          ) : null
        }
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
  chip: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 999,
    borderWidth: StyleSheet.hairlineWidth,
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
