import React, { useCallback, useState } from 'react';
import {
  View,
  Text,
  FlatList,
  ScrollView,
  Pressable,
  StyleSheet,
  RefreshControl,
  useWindowDimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useTheme } from '../theme/ThemeProvider';
import { Cover } from '../components/Cover';
import { Icon } from '../components/Icon';
import { CollectionCard } from '../components/CollectionCard';
import { SwipeTabs } from '../components/SwipeTabs';
import { useAsync } from '../hooks/useAsync';
import { getEngine } from '../engine';
import { useFavorites, favoriteToManga, reloadFavorites } from '../library/favorites';
import { useCategories } from '../library/categories';
import {
  useLibraryCollections,
  useLibraryViewMode,
  setLibraryViewMode,
  type LibraryCollection,
  type LibraryCollections,
} from '../library/collections';
import type { RootStackParamList } from '../navigation/types';
import type { MangaDto, SourceDto } from '../engine/types';

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
  const viewMode = useLibraryViewMode();
  const engine = getEngine();
  const { data: sources } = useAsync<SourceDto[]>(() => engine.listSources(), []);
  const collections = useLibraryCollections(sources ?? []);

  const [openId, setOpenId] = useState<string | null>(null);
  const [selected, setSelected] = useState<string>(ALL);
  const [refreshing, setRefreshing] = useState(false);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await reloadFavorites();
    setRefreshing(false);
  }, []);

  const sidePad = theme.spacing.lg;
  const openManga = useCallback(
    (m: MangaDto) =>
      navigation.navigate('MangaDetail', { sourceId: m.sourceId, mangaUrl: m.url, preview: m }),
    [navigation],
  );

  // --- Cover grid sizing (3 columns) ---
  const gridGap = 12;
  const cols = 3;
  const coverWidth = Math.floor((width - sidePad * 2 - gridGap * (cols - 1)) / cols);

  const refreshControl = (
    <RefreshControl
      refreshing={refreshing}
      onRefresh={onRefresh}
      tintColor={theme.colors.accent}
      colors={[theme.colors.accent]}
      progressBackgroundColor={theme.colors.surface}
    />
  );

  const renderCover = useCallback(
    ({ item }: { item: MangaDto }) => (
      <Cover manga={item} width={coverWidth} onPress={() => openManga(item)} />
    ),
    [coverWidth, openManga],
  );

  // --- Empty library: one premium empty state regardless of mode ---
  if (favorites.length === 0) {
    return (
      <View style={{ flex: 1, backgroundColor: theme.colors.bg }}>
        <View style={{ paddingTop: insets.top + 8, paddingBottom: 12 }}>
          <View style={[styles.header, { paddingHorizontal: sidePad }]}>
            <Text style={[theme.typography.title, { color: theme.colors.text }]}>Library</Text>
          </View>
        </View>
        <LibraryEmpty />
      </View>
    );
  }

  // --- Opened folder: filtered cover grid with a back affordance ---
  const opened = openId ? findCollection(collections, openId) : undefined;
  if (openId && opened) {
    const items = opened.items.map(favoriteToManga);
    return (
      <View style={{ flex: 1, backgroundColor: theme.colors.bg }}>
        <View style={{ paddingTop: insets.top + 8, paddingBottom: 12 }}>
          <View style={[styles.header, { paddingHorizontal: sidePad }]}>
            <Pressable hitSlop={10} onPress={() => setOpenId(null)} style={styles.backRow}>
              <Icon name="back" size={22} color={theme.colors.text} />
              <Text style={[theme.typography.title, { color: theme.colors.text }]} numberOfLines={1}>
                {opened.label}
              </Text>
            </Pressable>
            <Text style={{ color: theme.colors.textFaint, fontSize: 13 }}>
              {opened.items.length}
            </Text>
          </View>
        </View>
        <FlatList
          data={items}
          numColumns={cols}
          style={{ flex: 1 }}
          keyExtractor={(m, i) => `${m.sourceId}:${m.url}:${i}`}
          showsVerticalScrollIndicator={false}
          columnWrapperStyle={{ paddingHorizontal: sidePad, gap: gridGap }}
          contentContainerStyle={{ paddingTop: 4, paddingBottom: TAB_BAR_SPACE, gap: 16 }}
          refreshControl={refreshControl}
          renderItem={renderCover}
          ListEmptyComponent={<FolderEmpty />}
        />
      </View>
    );
  }

  // --- Default header (shared by folders + shelf) ---
  const header = (
    <View style={{ paddingTop: insets.top + 8, paddingBottom: 12 }}>
      <View style={[styles.header, { paddingHorizontal: sidePad }]}>
        <Text style={[theme.typography.title, { color: theme.colors.text }]}>Library</Text>
        <View style={styles.headerActions}>
          <View style={[styles.viewSeg, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border }]}>
            <ViewToggle active={viewMode === 'folders'} icon="grid" onPress={() => setLibraryViewMode('folders')} />
            <ViewToggle active={viewMode === 'shelf'} icon="library" onPress={() => setLibraryViewMode('shelf')} />
          </View>
          <Pressable hitSlop={10} onPress={() => navigation.navigate('Categories')}>
            <Icon name="settings" size={21} color={theme.colors.text} />
          </Pressable>
        </View>
      </View>
    </View>
  );

  // --- Folders view ---
  if (viewMode === 'folders') {
    const cardGap = 12;
    const cardWidth = Math.floor((width - sidePad * 2 - cardGap) / 2);
    return (
      <View style={{ flex: 1, backgroundColor: theme.colors.bg }}>
        {header}
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{
            paddingHorizontal: sidePad,
            paddingTop: 4,
            paddingBottom: TAB_BAR_SPACE,
          }}
          refreshControl={refreshControl}
        >
          <SectionLabel text="COLLECTIONS" />
          <View style={[styles.wrap, { gap: cardGap }]}>
            <CollectionCard
              label="All"
              items={collections.all.items}
              width={cardWidth}
              onPress={() => setOpenId('all')}
            />
            {collections.manual.map(c => (
              <CollectionCard
                key={c.id}
                label={c.label}
                items={c.items}
                width={cardWidth}
                onPress={() => setOpenId(c.id)}
              />
            ))}
          </View>

          {collections.smart.length > 0 ? (
            <>
              <SectionLabel text="SMART" style={{ marginTop: 22 }} />
              <View style={[styles.wrap, { gap: cardGap }]}>
                {collections.smart.map(c => (
                  <CollectionCard
                    key={c.id}
                    label={c.label}
                    items={c.items}
                    width={cardWidth}
                    onPress={() => setOpenId(c.id)}
                  />
                ))}
              </View>
            </>
          ) : null}
        </ScrollView>
      </View>
    );
  }

  // --- Shelf view (flat grid with category chips) ---
  const hasUncategorized = favorites.some(f => f.categoryIds.length === 0);
  const chips: { id: string; label: string }[] = [{ id: ALL, label: 'All' }];
  for (const c of categories) chips.push({ id: c.id, label: c.name });
  if (hasUncategorized && categories.length > 0) chips.push({ id: UNCATEGORIZED, label: 'Uncategorized' });

  const selIdx = Math.max(0, chips.findIndex(c => c.id === selected));
  const shelfList =
    selected === ALL
      ? favorites
      : selected === UNCATEGORIZED
        ? favorites.filter(f => f.categoryIds.length === 0)
        : favorites.filter(f => f.categoryIds.includes(selected));
  const visible = shelfList.map(favoriteToManga);

  return (
    <View style={{ flex: 1, backgroundColor: theme.colors.bg }}>
      {header}
      {chips.length > 1 ? (
        <FlatList
          horizontal
          showsHorizontalScrollIndicator={false}
          data={chips}
          keyExtractor={c => c.id}
          style={{ flexGrow: 0, marginBottom: 12 }}
          contentContainerStyle={{ paddingHorizontal: sidePad, gap: 8 }}
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
          columnWrapperStyle={{ paddingHorizontal: sidePad, gap: gridGap }}
          contentContainerStyle={{ paddingTop: 4, paddingBottom: TAB_BAR_SPACE, gap: 16 }}
          refreshControl={refreshControl}
          ListEmptyComponent={<FolderEmpty categoryView={selected !== ALL} />}
          renderItem={renderCover}
        />
      </SwipeTabs>
    </View>
  );
}

function findCollection(c: LibraryCollections, id: string): LibraryCollection | undefined {
  if (id === 'all') return c.all;
  return c.manual.find(x => x.id === id) ?? c.smart.find(x => x.id === id);
}

function ViewToggle({ active, icon, onPress }: { active: boolean; icon: 'grid' | 'library'; onPress: () => void }) {
  const theme = useTheme();
  return (
    <Pressable
      onPress={onPress}
      style={[styles.viewSegItem, active && { backgroundColor: theme.colors.accent }]}
    >
      <Icon name={icon} size={15} color={active ? theme.colors.onAccent : theme.colors.textMuted} />
    </Pressable>
  );
}

function SectionLabel({ text, style }: { text: string; style?: object }) {
  const theme = useTheme();
  return (
    <Text style={[styles.sectionLabel, { color: theme.colors.textFaint }, style]}>{text}</Text>
  );
}

function LibraryEmpty() {
  const theme = useTheme();
  return (
    <View style={styles.empty}>
      <View style={[styles.emptyIcon, { backgroundColor: theme.colors.elevated, borderColor: theme.colors.border }]}>
        <Icon name="bookmark" size={30} color={theme.colors.accent} />
      </View>
      <Text style={[theme.typography.heading, { color: theme.colors.text, marginTop: 18 }]}>
        No saved manga yet
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
        Tap the bookmark on any manga to add it here, then group titles into folders.
      </Text>
    </View>
  );
}

function FolderEmpty({ categoryView }: { categoryView?: boolean }) {
  const theme = useTheme();
  return (
    <View style={styles.empty}>
      <View style={[styles.emptyIcon, { backgroundColor: theme.colors.elevated, borderColor: theme.colors.border }]}>
        <Icon name="bookmark" size={30} color={theme.colors.accent} />
      </View>
      <Text style={[theme.typography.heading, { color: theme.colors.text, marginTop: 18 }]}>
        Nothing here yet
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
        {categoryView
          ? 'Assign manga to this category from their detail page.'
          : 'Titles you add to this collection will show up here.'}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  backRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flex: 1,
  },
  viewSeg: {
    flexDirection: 'row',
    padding: 3,
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
    gap: 3,
  },
  viewSegItem: {
    width: 30,
    height: 28,
    borderRadius: 7,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sectionLabel: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1.4,
    marginBottom: 12,
    marginTop: 6,
  },
  wrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
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
