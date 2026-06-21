import React from 'react';
import { View, Text, FlatList, Image, Pressable, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useTheme } from '../theme/ThemeProvider';
import { useAsync } from '../hooks/useAsync';
import { getEngine } from '../engine';
import type { RootStackParamList } from '../navigation/types';
import type { MangaDto } from '../engine/types';

type Nav = NativeStackNavigationProp<RootStackParamList>;
const TAB_BAR_SPACE = 110;

export function UpdatesScreen() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<Nav>();
  const engine = getEngine();

  const { data } = useAsync<MangaDto[]>(async () => {
    const res = await engine.getLatest('1002', 1);
    return res.manga;
  }, []);

  return (
    <View style={{ flex: 1, backgroundColor: theme.colors.bg }}>
      <FlatList
        data={data ?? []}
        keyExtractor={(m, i) => `${m.url}:${i}`}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingTop: insets.top + 8, paddingBottom: TAB_BAR_SPACE }}
        ListHeaderComponent={
          <Text
            style={[
              theme.typography.title,
              { color: theme.colors.text, paddingHorizontal: theme.spacing.lg, marginBottom: 12 },
            ]}
          >
            Updates
          </Text>
        }
        renderItem={({ item, index }) => (
          <Pressable
            onPress={() =>
              navigation.navigate('MangaDetail', {
                sourceId: item.sourceId,
                mangaUrl: item.url,
                preview: item,
              })
            }
            style={[styles.row, { paddingHorizontal: theme.spacing.lg }]}
          >
            <Image
              source={{ uri: item.thumbnailUrl }}
              style={[styles.thumb, { backgroundColor: theme.colors.skeleton }]}
            />
            <View style={{ flex: 1 }}>
              <Text numberOfLines={1} style={[theme.typography.bodyStrong, { color: theme.colors.text }]}>
                {item.title}
              </Text>
              <Text style={{ color: theme.colors.textMuted, fontSize: 13, marginTop: 2 }}>
                Chapter {(index % 50) + 1}
              </Text>
            </View>
            <Text style={{ color: theme.colors.textFaint, fontSize: 12 }}>{index + 1}h ago</Text>
          </Pressable>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 8,
  },
  thumb: {
    width: 44,
    height: 60,
    borderRadius: 8,
  },
});
