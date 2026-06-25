import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  Pressable,
  StyleSheet,
  FlatList,
  Alert,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { useTheme } from '../theme/ThemeProvider';
import { Icon } from '../components/Icon';
import { useFavorites } from '../library/favorites';
import {
  useCategories,
  addCategory,
  renameCategory,
  deleteCategory,
  moveCategory,
  type Category,
} from '../library/categories';

export function CategoriesScreen() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const navigation = useNavigation();
  const categories = useCategories();
  const favorites = useFavorites();
  const [name, setName] = useState('');

  const countFor = (id: string) => favorites.filter(f => f.categoryIds.includes(id)).length;
  const uncategorized = favorites.filter(f => f.categoryIds.length === 0).length;

  const onAdd = () => {
    const created = addCategory(name);
    if (created) {
      setName('');
    } else if (name.trim()) {
      Alert.alert('Category exists', 'A category with that name already exists.');
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: theme.colors.bg }}>
      <View style={[styles.header, { paddingTop: insets.top + 8, borderColor: theme.colors.border }]}>
        <Pressable hitSlop={10} onPress={() => navigation.goBack()} style={{ width: 60 }}>
          <Icon name="back" size={24} color={theme.colors.text} />
        </Pressable>
        <Text style={[theme.typography.heading, { color: theme.colors.text }]}>Categories</Text>
        <View style={{ width: 60 }} />
      </View>

      <View style={[styles.addRow, { paddingHorizontal: theme.spacing.lg }]}>
        <View
          style={[
            styles.input,
            { backgroundColor: theme.colors.surface, borderColor: theme.colors.border },
          ]}
        >
          <Icon name="plus" size={18} color={theme.colors.textMuted} />
          <TextInput
            value={name}
            onChangeText={setName}
            placeholder="New category name"
            placeholderTextColor={theme.colors.textFaint}
            style={[styles.inputText, { color: theme.colors.text }]}
            autoCorrect={false}
            returnKeyType="done"
            onSubmitEditing={onAdd}
          />
        </View>
        <Pressable
          onPress={onAdd}
          disabled={!name.trim()}
          style={[
            styles.addBtn,
            { backgroundColor: name.trim() ? theme.colors.accent : theme.colors.surface },
          ]}
        >
          <Text
            style={{
              color: name.trim() ? theme.colors.onAccent : theme.colors.textFaint,
              fontWeight: '700',
            }}
          >
            Add
          </Text>
        </Pressable>
      </View>

      <FlatList
        data={categories}
        keyExtractor={c => c.id}
        contentContainerStyle={{ padding: theme.spacing.lg, paddingTop: 8 }}
        ListEmptyComponent={
          <View style={styles.empty}>
            <View style={[styles.emptyIcon, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border }]}>
              <Icon name="bookmark" size={24} color={theme.colors.textMuted} />
            </View>
            <Text style={[theme.typography.bodyStrong, { color: theme.colors.text, marginTop: 14 }]}>
              No categories yet
            </Text>
            <Text style={{ color: theme.colors.textMuted, fontSize: 13, textAlign: 'center', marginTop: 4 }}>
              Create one above to organize your library, then assign manga from their detail page.
            </Text>
          </View>
        }
        ListFooterComponent={
          categories.length > 0 ? (
            <View style={[styles.footerRow, { borderColor: theme.colors.border }]}>
              <Icon name="library" size={16} color={theme.colors.textFaint} />
              <Text style={{ color: theme.colors.textMuted, fontSize: 13, flex: 1 }}>Uncategorized</Text>
              <Text style={{ color: theme.colors.textFaint, fontSize: 12.5 }}>{uncategorized}</Text>
            </View>
          ) : null
        }
        renderItem={({ item, index }) => (
          <CategoryRow
            category={item}
            count={countFor(item.id)}
            isFirst={index === 0}
            isLast={index === categories.length - 1}
          />
        )}
      />
    </View>
  );
}

function CategoryRow({
  category,
  count,
  isFirst,
  isLast,
}: {
  category: Category;
  count: number;
  isFirst: boolean;
  isLast: boolean;
}) {
  const theme = useTheme();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(category.name);

  const commit = () => {
    renameCategory(category.id, draft);
    setEditing(false);
  };

  const confirmDelete = () => {
    Alert.alert('Delete category', `Remove "${category.name}"? Manga stay in your library.`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => deleteCategory(category.id) },
    ]);
  };

  return (
    <View
      style={[styles.row, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border }]}
    >
      <View style={styles.reorder}>
        <Pressable
          hitSlop={6}
          disabled={isFirst}
          onPress={() => moveCategory(category.id, -1)}
          style={{ transform: [{ rotate: '180deg' }] }}
        >
          <Icon name="chevronDown" size={15} color={isFirst ? theme.colors.textFaint : theme.colors.textMuted} />
        </Pressable>
        <Pressable hitSlop={6} disabled={isLast} onPress={() => moveCategory(category.id, 1)}>
          <Icon name="chevronDown" size={15} color={isLast ? theme.colors.textFaint : theme.colors.textMuted} />
        </Pressable>
      </View>

      {editing ? (
        <TextInput
          value={draft}
          onChangeText={setDraft}
          autoFocus
          onSubmitEditing={commit}
          onBlur={commit}
          style={[theme.typography.body, styles.rowInput, { color: theme.colors.text }]}
        />
      ) : (
        <View style={{ flex: 1 }}>
          <Text style={[theme.typography.body, { color: theme.colors.text }]}>{category.name}</Text>
          <Text style={{ color: theme.colors.textFaint, fontSize: 12, marginTop: 1 }}>
            {count} {count === 1 ? 'title' : 'titles'}
          </Text>
        </View>
      )}
      <Pressable hitSlop={8} onPress={() => (editing ? commit() : setEditing(true))}>
        <Icon name={editing ? 'check' : 'edit'} size={18} color={theme.colors.textMuted} />
      </Pressable>
      <Pressable hitSlop={8} onPress={confirmDelete} style={{ marginLeft: 14 }}>
        <Icon name="trash" size={18} color={theme.colors.textFaint} />
      </Pressable>
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
  addRow: {
    flexDirection: 'row',
    gap: 10,
    paddingTop: 16,
    paddingBottom: 8,
  },
  input: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
    height: 46,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
  },
  inputText: {
    flex: 1,
    fontSize: 15,
    padding: 0,
  },
  addBtn: {
    paddingHorizontal: 18,
    height: 46,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    marginBottom: 10,
  },
  reorder: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  footerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 14,
    paddingVertical: 14,
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    borderStyle: 'dashed',
    marginTop: 4,
  },
  rowInput: {
    flex: 1,
    padding: 0,
  },
  empty: {
    alignItems: 'center',
    paddingTop: 60,
    paddingHorizontal: 40,
  },
  emptyIcon: {
    width: 56,
    height: 56,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: StyleSheet.hairlineWidth,
  },
});
