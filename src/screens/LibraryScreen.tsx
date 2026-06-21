import React, { useState } from 'react';
import {
  View,
  Text,
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
import type { MangaDto } from '../engine/types';

type Nav = NativeStackNavigationProp<RootStackParamList>;

const FILTERS = ['All', 'Reading', 'Completed', 'On Hold'];
const TAB_BAR_SPACE = 110;

export function LibraryScreen() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<Nav>();
  const { width } = useWindowDimensions();
  const [filter, setFilter] = useState('All');

  const engine = getEngine();
  const { data, loading } = useAsync<MangaDto[]>(async () => {
    const res = await engine.getPopular('1001', 1);
    return res.manga;
  }, []);

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
            <View style={[styles.header, { paddingHorizontal: sidePad }]}>
              <Text style={[theme.typography.title, { color: theme.colors.text }]}>Library</Text>
              <View style={styles.actions}>
                <Icon name="search" size={21} color={theme.colors.text} />
                <Icon name="filter" size={21} color={theme.colors.text} />
              </View>
            </View>
            <FlatList
              horizontal
              showsHorizontalScrollIndicator={false}
              data={FILTERS}
              keyExtractor={f => f}
              contentContainerStyle={{ paddingHorizontal: sidePad, gap: 8, marginTop: 14 }}
              renderItem={({ item }) => {
                const active = item === filter;
                return (
                  <Pressable
                    onPress={() => setFilter(item)}
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
                      {item}
                    </Text>
                  </Pressable>
                );
              }}
            />
          </View>
        }
        renderItem={({ item, index }) => (
          <Cover
            manga={item}
            width={coverWidth}
            badge={(index * 7) % 40}
            onPress={() =>
              navigation.navigate('MangaDetail', {
                sourceId: item.sourceId,
                mangaUrl: item.url,
                preview: item,
              })
            }
          />
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  actions: {
    flexDirection: 'row',
    gap: 16,
  },
  chip: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 999,
    borderWidth: StyleSheet.hairlineWidth,
  },
});
