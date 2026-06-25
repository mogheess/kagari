import React, { useCallback, useMemo, useState } from 'react';
import { View, Text, FlatList, Pressable, StyleSheet, RefreshControl, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useTheme } from '../theme/ThemeProvider';
import { Cover } from '../components/Cover';
import { Icon } from '../components/Icon';
import { SwipeTabs } from '../components/SwipeTabs';
import { useFavorites, favoriteToManga, reloadFavorites } from '../library/favorites';
import { useCategories } from '../library/categories';
import type { RootStackParamList } from '../navigation/types';

type Nav = NativeStackNavigationProp<RootStackParamList>;

const TAB_BAR_SPACE = 110;
const ALL = '__all__';
const UNCATEGORIZED = '__uncat__';

export function LibraryScreen() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<Nav>();
  const { width } = useWindowDimensions();

  const favorites = useFavorites();
  const categories = useCategories();
  const [selected, setSelected] = useState<string>(ALL);
  const [refreshing, setRefreshing] = useState(false);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await reloadFavorites();
    setRefreshing(false);
  }, []);

  const hasUncategorized = favorites.some(f => f.categoryIds.length === 0);

  const chips = useMemo(() => {
    const out: { id: string; label: string }[] = [{ id: ALL, label: 'All' }];
    for (const c of categories) out.push({ id: c.id, label: c.name });
    if (hasUncategorized && categories.length > 0) {
      out.push({ id: UNCATEGORIZED, label: 'Uncategorized' });
    }
    return out;
  }, [categories, hasUncategorized]);

  const selIdx = Math.max(0, chips.findIndex(c => c.id === selected));

  const visible = useMemo(() => {
    const list =
      selected === ALL
        ? favorites
        : selected === UNCATEGORIZED
          ? favorites.filter(f => f.categoryIds.length === 0)
          : favorites.filter(f => f.categoryIds.includes(selected));
    return list.map(favoriteToManga);
  }, [favorites, selected]);

  const gap = 12;
  const cols = 3;
  const sidePad = theme.spacing.lg;
  const coverWidth = Math.floor((width - sidePad * 2 - gap * (cols - 1)) / cols);

  return (
    <View style={{ flex: 1, backgroundColor: theme.colors.bg }}>
      <View style={{ paddingTop: insets.top + 8, paddingBottom: 12 }}>
        <View style={[styles.header, { paddingHorizontal: sidePad }]}>
          <Text style={[theme.typography.title, { color: theme.colors.text }]}>Library</Text>
          <Pressable hitSlop={10} onPress={() => navigation.navigate('Categories')}>
            <Icon name="settings" size={21} color={theme.colors.text} />
          </Pressable>
        </View>

        {chips.length > 1 ? (
          <FlatList
            horizontal
            showsHorizontalScrollIndicator={false}
            data={chips}
            keyExtractor={c => c.id}
            contentContainerStyle={{ paddingHorizontal: sidePad, gap: 8, marginTop: 14 }}
            renderItem={({ item }) => {
              const active = item.id === selected;
              return (
                <Pressable
                  onPress={() => setSelected(item.id)}
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
                    {item.label}
                  </Text>
                </Pressable>
              );
            }}
          />
        ) : null}
      </View>

      <SwipeTabs
        index={selIdx}
        count={Math.max(1, chips.length)}
        onIndexChange={i => setSelected(chips[i]?.id ?? ALL)}
      >
        <FlatList
          data={visible}
          numColumns={cols}
          style={{ flex: 1 }}
          keyExtractor={(m, i) => `${m.sourceId}:${m.url}:${i}`}
          showsVerticalScrollIndicator={false}
          columnWrapperStyle={{ paddingHorizontal: sidePad, gap }}
          contentContainerStyle={{ paddingTop: 4, paddingBottom: TAB_BAR_SPACE, gap: 16 }}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor={theme.colors.accent}
              colors={[theme.colors.accent]}
              progressBackgroundColor={theme.colors.surface}
            />
          }
          ListEmptyComponent={
            <View style={styles.empty}>
              <View style={[styles.emptyIcon, { backgroundColor: theme.colors.elevated, borderColor: theme.colors.border }]}>
                <Icon name="bookmark" size={30} color={theme.colors.accent} />
              </View>
              <Text style={[theme.typography.heading, { color: theme.colors.text, marginTop: 18 }]}>
                {selected === ALL ? 'No saved manga yet' : 'Nothing in this category'}
              </Text>
              <Text
                style={{
                  color: theme.colors.textMuted,
                  fontSize: 13.5,
                  lineHeight: 20,
                  textAlign: 'center',
                  marginTop: 8,
                  maxWidth: 300,
                }}
              >
                {selected === ALL
                  ? 'Tap the bookmark on any manga to add it here.'
                  : 'Assign manga to this category from their detail page.'}
              </Text>
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
        />
      </SwipeTabs>
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  chip: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 999,
    borderWidth: StyleSheet.hairlineWidth,
  },
  empty: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
    paddingTop: 80,
  },
  emptyIcon: {
    width: 72,
    height: 72,
    borderRadius: 36,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: StyleSheet.hairlineWidth,
  },
});
