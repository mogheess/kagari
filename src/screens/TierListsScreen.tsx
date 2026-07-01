import React, { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Icon } from '../components/Icon';
import { RemoteImage } from '../components/RemoteImage';
import { getEngine } from '../engine';
import type { TierListExportOrientation } from '../engine/types';
import { useTheme } from '../theme/ThemeProvider';
import {
  favoriteKey,
  favoriteToManga,
  useFavorites,
  type FavoriteManga,
} from '../library/favorites';
import {
  addMangaToTier,
  addTierRow,
  deleteTierRow,
  moveMangaToTier,
  moveTierRow,
  removeMangaFromTiers,
  updateTierRow,
  useTierRows,
  type TierRow,
} from '../library/tierLists';
import type { RootStackParamList } from '../navigation/types';

type Nav = NativeStackNavigationProp<RootStackParamList>;

const COLOR_SWATCHES = [
  '#F87171',
  '#FB923C',
  '#F59E0B',
  '#34D399',
  '#2DD4BF',
  '#60A5FA',
  '#A78BFA',
  '#F472B6',
  '#9CA3AF',
];

export function TierListsScreen() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<Nav>();
  const rows = useTierRows();
  const favorites = useFavorites();
  const favoritesByKey = useMemo(() => {
    const map = new Map<string, FavoriteManga>();
    for (const item of favorites) map.set(favoriteKey(item.sourceId, item.url), item);
    return map;
  }, [favorites]);

  const [pickerRow, setPickerRow] = useState<TierRow | null>(null);
  const [editingRow, setEditingRow] = useState<TierRow | null>(null);
  const [moving, setMoving] = useState<{ key: string; title: string } | null>(null);
  const [exporting, setExporting] = useState(false);

  const openManga = (item: FavoriteManga) => {
    navigation.navigate('MangaDetail', {
      sourceId: item.sourceId,
      mangaUrl: item.url,
      preview: favoriteToManga(item),
    });
  };

  const onMangaLongPress = (item: FavoriteManga) => {
    const key = favoriteKey(item.sourceId, item.url);
    Alert.alert(item.title, 'Move or remove this title from your tier list.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Move', onPress: () => setMoving({ key, title: item.title }) },
      {
        text: 'Remove',
        style: 'destructive',
        onPress: () => removeMangaFromTiers(key),
      },
    ]);
  };

  const exportImage = async (
    orientation: TierListExportOrientation,
    action: 'save' | 'share',
  ) => {
    try {
      setExporting(true);
      const engine = getEngine();
      const exportRows = await Promise.all(
        rows.map(async row => ({
          name: row.name,
          color: row.color,
          items: await Promise.all(
            row.mangaKeys
              .map(key => favoritesByKey.get(key))
              .filter((item): item is FavoriteManga => !!item)
              .map(async item => {
                let coverUri: string | undefined;
                if (item.thumbnailUrl) {
                  try {
                    const resolved = await engine.fetchCover(item.sourceId, item.thumbnailUrl);
                    coverUri = resolved.startsWith('file://') ? resolved : undefined;
                  } catch {
                    coverUri = undefined;
                  }
                }
                return { title: item.title, coverUri };
              }),
          ),
        })),
      );
      const uri = await engine.renderTierListImage({
        title: 'Kagari Tier List',
        orientation,
        rows: exportRows,
      });
      if (action === 'save') {
        await engine.saveImageToGallery(uri);
        Alert.alert('Saved', `Tier list saved as a high-quality ${orientation} image.`);
      } else {
        await engine.shareImage(uri);
      }
    } catch (error) {
      Alert.alert('Export failed', error instanceof Error ? error.message : 'Could not export the tier list.');
    } finally {
      setExporting(false);
    }
  };

  const openExportMenu = () => {
    Alert.alert('Export tier list', 'Choose an image layout.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Save landscape', onPress: () => void exportImage('landscape', 'save') },
      { text: 'Save vertical', onPress: () => void exportImage('vertical', 'save') },
      { text: 'Share landscape', onPress: () => void exportImage('landscape', 'share') },
      { text: 'Share vertical', onPress: () => void exportImage('vertical', 'share') },
    ]);
  };

  return (
    <View style={{ flex: 1, backgroundColor: theme.colors.bg }}>
      <View style={[styles.header, { paddingTop: insets.top + 8, borderColor: theme.colors.border }]}>
        <Pressable hitSlop={10} onPress={() => navigation.goBack()} style={styles.headerSide}>
          <Icon name="back" size={24} color={theme.colors.text} />
        </Pressable>
        <Text style={[theme.typography.heading, { color: theme.colors.text }]}>Tier Lists</Text>
        <View style={[styles.headerSide, styles.headerRight, styles.headerActions]}>
          {exporting ? (
            <ActivityIndicator size="small" color={theme.colors.accent} />
          ) : (
            <Pressable hitSlop={10} onPress={openExportMenu} disabled={favorites.length === 0}>
              <Icon name="download" size={21} color={favorites.length === 0 ? theme.colors.textFaint : theme.colors.text} />
            </Pressable>
          )}
          <Pressable hitSlop={10} onPress={addTierRow}>
            <Icon name="plus" size={22} color={theme.colors.text} />
          </Pressable>
        </View>
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ padding: theme.spacing.lg, paddingBottom: 44 }}
      >
        {favorites.length === 0 ? (
          <EmptyLibrary />
        ) : (
          <>
            <Text style={[styles.help, { color: theme.colors.textMuted }]}>
              Add titles from your Library into custom tiers. Long-press a title to move or remove it.
            </Text>
            {rows.map((row, index) => (
              <TierRowView
                key={row.id}
                row={row}
                isFirst={index === 0}
                isLast={index === rows.length - 1}
                favoritesByKey={favoritesByKey}
                onAdd={() => setPickerRow(row)}
                onEdit={() => setEditingRow(row)}
                onOpenManga={openManga}
                onMangaLongPress={onMangaLongPress}
              />
            ))}
          </>
        )}
      </ScrollView>

      <AddMangaSheet
        row={pickerRow}
        favorites={favorites}
        onClose={() => setPickerRow(null)}
      />
      <EditTierSheet
        row={editingRow}
        rowCount={rows.length}
        onClose={() => setEditingRow(null)}
      />
      <MoveMangaSheet
        moving={moving}
        rows={rows}
        onClose={() => setMoving(null)}
      />
    </View>
  );
}

function TierRowView({
  row,
  isFirst,
  isLast,
  favoritesByKey,
  onAdd,
  onEdit,
  onOpenManga,
  onMangaLongPress,
}: {
  row: TierRow;
  isFirst: boolean;
  isLast: boolean;
  favoritesByKey: Map<string, FavoriteManga>;
  onAdd: () => void;
  onEdit: () => void;
  onOpenManga: (item: FavoriteManga) => void;
  onMangaLongPress: (item: FavoriteManga) => void;
}) {
  const theme = useTheme();
  const items = row.mangaKeys
    .map(key => favoritesByKey.get(key))
    .filter((item): item is FavoriteManga => !!item);

  return (
    <View style={[styles.tierCard, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border }]}>
      <View style={styles.tierTop}>
        <View style={[styles.tierBadge, { backgroundColor: row.color }]}>
          <Text style={styles.tierBadgeText}>{row.name.slice(0, 2).toUpperCase()}</Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={[theme.typography.bodyStrong, { color: theme.colors.text }]} numberOfLines={1}>
            {row.name}
          </Text>
          <Text style={{ color: theme.colors.textFaint, fontSize: 12, marginTop: 1 }}>
            {items.length} {items.length === 1 ? 'title' : 'titles'}
          </Text>
        </View>
        <View style={styles.rowActions}>
          <Pressable
            hitSlop={6}
            disabled={isFirst}
            onPress={() => moveTierRow(row.id, -1)}
            style={{ transform: [{ rotate: '180deg' }], opacity: isFirst ? 0.35 : 1 }}
          >
            <Icon name="chevronDown" size={16} color={theme.colors.textMuted} />
          </Pressable>
          <Pressable
            hitSlop={6}
            disabled={isLast}
            onPress={() => moveTierRow(row.id, 1)}
            style={{ opacity: isLast ? 0.35 : 1 }}
          >
            <Icon name="chevronDown" size={16} color={theme.colors.textMuted} />
          </Pressable>
          <Pressable hitSlop={8} onPress={onEdit}>
            <Icon name="edit" size={17} color={theme.colors.textMuted} />
          </Pressable>
        </View>
      </View>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.tierItems}
      >
        {items.map(item => (
          <Pressable
            key={favoriteKey(item.sourceId, item.url)}
            onPress={() => onOpenManga(item)}
            onLongPress={() => onMangaLongPress(item)}
            delayLongPress={300}
            style={styles.tierItem}
          >
            <View style={[styles.cover, { backgroundColor: theme.colors.elevated }]}>
              {item.thumbnailUrl ? (
                <RemoteImage
                  uri={item.thumbnailUrl}
                  sourceId={item.sourceId}
                  style={styles.coverImage}
                  resizeMode="cover"
                />
              ) : (
                <Icon name="bookmark" size={20} color={theme.colors.textFaint} />
              )}
            </View>
            <Text numberOfLines={2} style={[styles.itemTitle, { color: theme.colors.text }]}>
              {item.title}
            </Text>
          </Pressable>
        ))}
        <Pressable
          onPress={onAdd}
          style={[styles.addItem, { borderColor: theme.colors.border, backgroundColor: theme.colors.elevated }]}
        >
          <Icon name="plus" size={20} color={theme.colors.textMuted} />
          <Text style={{ color: theme.colors.textMuted, fontSize: 12, fontWeight: '700' }}>Add</Text>
        </Pressable>
      </ScrollView>
    </View>
  );
}

function AddMangaSheet({
  row,
  favorites,
  onClose,
}: {
  row: TierRow | null;
  favorites: FavoriteManga[];
  onClose: () => void;
}) {
  const theme = useTheme();
  return (
    <Modal visible={!!row} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose} />
      <View style={[styles.sheet, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border }]}>
        <SheetHeader title={`Add to ${row?.name ?? 'tier'}`} onClose={onClose} />
        <FlatList
          data={favorites}
          keyExtractor={item => favoriteKey(item.sourceId, item.url)}
          style={styles.sheetList}
          renderItem={({ item }) => {
            const selected = !!row?.mangaKeys.includes(favoriteKey(item.sourceId, item.url));
            return (
              <Pressable
                onPress={() => {
                  if (row) addMangaToTier(row.id, item);
                  onClose();
                }}
                style={({ pressed }) => [
                  styles.pickRow,
                  { backgroundColor: pressed ? theme.colors.elevated : 'transparent' },
                ]}
              >
                <SmallCover item={item} />
                <Text style={[theme.typography.body, { color: theme.colors.text, flex: 1 }]} numberOfLines={1}>
                  {item.title}
                </Text>
                {selected ? <Icon name="check" size={18} color={theme.colors.accent} /> : null}
              </Pressable>
            );
          }}
        />
      </View>
    </Modal>
  );
}

function EditTierSheet({
  row,
  rowCount,
  onClose,
}: {
  row: TierRow | null;
  rowCount: number;
  onClose: () => void;
}) {
  const theme = useTheme();
  const [name, setName] = useState(row?.name ?? '');
  const [color, setColor] = useState(row?.color ?? COLOR_SWATCHES[0]);

  React.useEffect(() => {
    setName(row?.name ?? '');
    setColor(row?.color ?? COLOR_SWATCHES[0]);
  }, [row]);

  const save = () => {
    if (row) updateTierRow(row.id, { name, color });
    onClose();
  };

  const confirmDelete = () => {
    if (!row) return;
    Alert.alert('Delete tier', `Remove "${row.name}" from this tier list?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () => {
          deleteTierRow(row.id);
          onClose();
        },
      },
    ]);
  };

  return (
    <Modal visible={!!row} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose} />
      <View style={[styles.sheet, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border }]}>
        <SheetHeader title="Edit tier" onClose={onClose} />
        <TextInput
          value={name}
          onChangeText={setName}
          placeholder="Tier name"
          placeholderTextColor={theme.colors.textFaint}
          style={[
            styles.nameInput,
            { color: theme.colors.text, borderColor: theme.colors.border, backgroundColor: theme.colors.elevated },
          ]}
          autoCorrect={false}
          returnKeyType="done"
          onSubmitEditing={save}
        />
        <View style={styles.swatches}>
          {COLOR_SWATCHES.map(swatch => (
            <Pressable
              key={swatch}
              onPress={() => setColor(swatch)}
              style={[
                styles.swatch,
                {
                  backgroundColor: swatch,
                  borderColor: color === swatch ? theme.colors.text : 'transparent',
                },
              ]}
            />
          ))}
        </View>
        <View style={styles.sheetActions}>
          <Pressable
            onPress={confirmDelete}
            disabled={rowCount <= 1}
            style={[styles.secondaryBtn, { borderColor: theme.colors.border, opacity: rowCount <= 1 ? 0.4 : 1 }]}
          >
            <Text style={{ color: theme.colors.danger, fontWeight: '700' }}>Delete</Text>
          </Pressable>
          <Pressable onPress={save} style={[styles.primaryBtn, { backgroundColor: theme.colors.accent }]}>
            <Text style={{ color: theme.colors.onAccent, fontWeight: '800' }}>Save</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

function MoveMangaSheet({
  moving,
  rows,
  onClose,
}: {
  moving: { key: string; title: string } | null;
  rows: TierRow[];
  onClose: () => void;
}) {
  const theme = useTheme();
  return (
    <Modal visible={!!moving} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose} />
      <View style={[styles.sheet, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border }]}>
        <SheetHeader title="Move title" onClose={onClose} />
        <Text style={[theme.typography.caption, { color: theme.colors.textMuted, marginBottom: 8 }]} numberOfLines={2}>
          {moving?.title}
        </Text>
        {rows.map(row => (
          <Pressable
            key={row.id}
            onPress={() => {
              if (moving) moveMangaToTier(moving.key, row.id);
              onClose();
            }}
            style={({ pressed }) => [
              styles.moveRow,
              { backgroundColor: pressed ? theme.colors.elevated : 'transparent' },
            ]}
          >
            <View style={[styles.moveDot, { backgroundColor: row.color }]} />
            <Text style={[theme.typography.body, { color: theme.colors.text }]}>{row.name}</Text>
          </Pressable>
        ))}
      </View>
    </Modal>
  );
}

function SheetHeader({ title, onClose }: { title: string; onClose: () => void }) {
  const theme = useTheme();
  return (
    <View style={styles.sheetHeader}>
      <Text style={[theme.typography.heading, { color: theme.colors.text }]}>{title}</Text>
      <Pressable hitSlop={8} onPress={onClose}>
        <Icon name="close" size={20} color={theme.colors.textMuted} />
      </Pressable>
    </View>
  );
}

function SmallCover({ item }: { item: FavoriteManga }) {
  const theme = useTheme();
  return (
    <View style={[styles.smallCover, { backgroundColor: theme.colors.elevated }]}>
      {item.thumbnailUrl ? (
        <RemoteImage
          uri={item.thumbnailUrl}
          sourceId={item.sourceId}
          style={styles.coverImage}
          resizeMode="cover"
        />
      ) : (
        <Icon name="bookmark" size={16} color={theme.colors.textFaint} />
      )}
    </View>
  );
}

function EmptyLibrary() {
  const theme = useTheme();
  return (
    <View style={styles.empty}>
      <View style={[styles.emptyIcon, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border }]}>
        <Icon name="grid" size={24} color={theme.colors.textMuted} />
      </View>
      <Text style={[theme.typography.bodyStrong, { color: theme.colors.text, marginTop: 14 }]}>
        No library titles yet
      </Text>
      <Text style={{ color: theme.colors.textMuted, fontSize: 13, textAlign: 'center', marginTop: 4 }}>
        Add manga to your Library first, then arrange them into tiers here.
      </Text>
    </View>
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
  headerSide: {
    width: 60,
  },
  headerRight: {
    alignItems: 'flex-end',
  },
  headerActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    alignItems: 'center',
    gap: 14,
  },
  help: {
    fontSize: 13,
    lineHeight: 18,
    marginBottom: 14,
  },
  tierCard: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 16,
    marginBottom: 14,
    overflow: 'hidden',
  },
  tierTop: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 12,
  },
  tierBadge: {
    width: 48,
    height: 48,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tierBadgeText: {
    color: '#111',
    fontSize: 14,
    fontWeight: '900',
  },
  rowActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  tierItems: {
    gap: 12,
    paddingHorizontal: 12,
    paddingBottom: 14,
  },
  tierItem: {
    width: 72,
  },
  cover: {
    width: 72,
    height: 104,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  coverImage: {
    width: '100%',
    height: '100%',
  },
  itemTitle: {
    fontSize: 11,
    fontWeight: '600',
    lineHeight: 14,
    marginTop: 6,
  },
  addItem: {
    width: 72,
    height: 104,
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  backdrop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.45)',
  },
  sheet: {
    position: 'absolute',
    left: 14,
    right: 14,
    bottom: 18,
    maxHeight: '76%',
    borderRadius: 18,
    borderWidth: StyleSheet.hairlineWidth,
    padding: 14,
  },
  sheetHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  sheetList: {
    maxHeight: 420,
  },
  pickRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 9,
    paddingHorizontal: 6,
    borderRadius: 12,
  },
  smallCover: {
    width: 34,
    height: 48,
    borderRadius: 7,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  nameInput: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
    fontWeight: '600',
  },
  swatches: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginTop: 14,
  },
  swatch: {
    width: 34,
    height: 34,
    borderRadius: 17,
    borderWidth: 3,
  },
  sheetActions: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 18,
  },
  secondaryBtn: {
    flex: 1,
    height: 44,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryBtn: {
    flex: 1,
    height: 44,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  moveRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 12,
    paddingHorizontal: 6,
    borderRadius: 12,
  },
  moveDot: {
    width: 14,
    height: 14,
    borderRadius: 7,
  },
  empty: {
    alignItems: 'center',
    paddingHorizontal: 34,
    paddingTop: 60,
  },
  emptyIcon: {
    width: 58,
    height: 58,
    borderRadius: 18,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
