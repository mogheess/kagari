import React from 'react';
import { View, Text, FlatList, StyleSheet, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useTheme } from '../theme/ThemeProvider';
import { Cover } from '../components/Cover';
import { Icon } from '../components/Icon';
import { useFavorites, favoriteToManga } from '../library/favorites';
import type { RootStackParamList } from '../navigation/types';

type Nav = NativeStackNavigationProp<RootStackParamList>;

const TAB_BAR_SPACE = 110;

export function LibraryScreen() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<Nav>();
  const { width } = useWindowDimensions();

  const favorites = useFavorites();
  const data = favorites.map(favoriteToManga);

  const gap = 12;
  const cols = 3;
  const sidePad = theme.spacing.lg;
  const coverWidth = Math.floor((width - sidePad * 2 - gap * (cols - 1)) / cols);

  return (
    <View style={{ flex: 1, backgroundColor: theme.colors.bg }}>
      <FlatList
        data={data}
        numColumns={cols}
        keyExtractor={(m, i) => `${m.sourceId}:${m.url}:${i}`}
        showsVerticalScrollIndicator={false}
        columnWrapperStyle={{ paddingHorizontal: sidePad, gap }}
        contentContainerStyle={{ paddingTop: insets.top + 8, paddingBottom: TAB_BAR_SPACE, gap: 16 }}
        ListHeaderComponent={
          <View style={[styles.header, { paddingHorizontal: sidePad }]}>
            <Text style={[theme.typography.title, { color: theme.colors.text }]}>Library</Text>
            <Text style={{ color: theme.colors.textMuted, fontSize: 13 }}>
              {favorites.length > 0 ? `${favorites.length} saved` : ''}
            </Text>
          </View>
        }
        ListEmptyComponent={
          <View style={styles.empty}>
            <View style={[styles.emptyIcon, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border }]}>
              <Icon name="bookmark" size={26} color={theme.colors.textMuted} />
            </View>
            <Text style={[theme.typography.heading, { color: theme.colors.text, marginTop: 16 }]}>
              No saved manga yet
            </Text>
            <Text
              style={{
                color: theme.colors.textMuted,
                fontSize: 13.5,
                lineHeight: 20,
                textAlign: 'center',
                marginTop: 6,
              }}
            >
              Tap the bookmark on any manga to add it here.
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
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  empty: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 48,
    paddingTop: 80,
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
