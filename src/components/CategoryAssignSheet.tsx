import React from 'react';
import { View, Text, Pressable, Modal, FlatList, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../theme/ThemeProvider';
import { Icon } from './Icon';
import { useCategories } from '../library/categories';

interface CategoryAssignSheetProps {
  visible: boolean;
  selectedIds: string[];
  onToggle: (categoryId: string) => void;
  onManage: () => void;
  onClose: () => void;
}

/** Checkbox sheet for assigning a manga to one or more library categories. */
export function CategoryAssignSheet({
  visible,
  selectedIds,
  onToggle,
  onManage,
  onClose,
}: CategoryAssignSheetProps) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const categories = useCategories();

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose} />
      <View
        style={[
          styles.sheet,
          {
            backgroundColor: theme.colors.bg,
            paddingBottom: insets.bottom + 10,
            borderColor: theme.colors.border,
          },
        ]}
      >
        <View style={styles.grabber} />
        <View style={styles.headerRow}>
          <Text style={[theme.typography.heading, { color: theme.colors.text }]}>Categories</Text>
          <Pressable hitSlop={10} onPress={onClose}>
            <Icon name="close" size={22} color={theme.colors.textMuted} />
          </Pressable>
        </View>

        {categories.length === 0 ? (
          <View style={{ paddingVertical: 24, alignItems: 'center' }}>
            <Text style={{ color: theme.colors.textMuted, fontSize: 13.5, textAlign: 'center' }}>
              You haven't created any categories yet.
            </Text>
          </View>
        ) : (
          <FlatList
            data={categories}
            keyExtractor={c => c.id}
            style={{ maxHeight: 320 }}
            renderItem={({ item }) => {
              const on = selectedIds.includes(item.id);
              return (
                <Pressable
                  onPress={() => onToggle(item.id)}
                  style={({ pressed }) => [
                    styles.row,
                    { backgroundColor: pressed ? theme.colors.surface : 'transparent' },
                  ]}
                >
                  <View
                    style={[
                      styles.checkbox,
                      {
                        borderColor: on ? theme.colors.accent : theme.colors.border,
                        backgroundColor: on ? theme.colors.accent : 'transparent',
                      },
                    ]}
                  >
                    {on ? <Icon name="check" size={14} color={theme.colors.onAccent} /> : null}
                  </View>
                  <Text style={[theme.typography.body, { color: theme.colors.text, flex: 1 }]}>
                    {item.name}
                  </Text>
                </Pressable>
              );
            }}
          />
        )}

        <Pressable
          onPress={onManage}
          style={[styles.manageBtn, { borderColor: theme.colors.border }]}
        >
          <Icon name="plus" size={16} color={theme.colors.accent} />
          <Text style={{ color: theme.colors.accent, fontWeight: '700' }}>Manage categories</Text>
        </Pressable>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  sheet: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 18,
  },
  grabber: {
    alignSelf: 'center',
    width: 38,
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(128,128,128,0.4)',
    marginTop: 8,
    marginBottom: 8,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 13,
    paddingHorizontal: 6,
    borderRadius: 10,
  },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 6,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  manageBtn: {
    flexDirection: 'row',
    gap: 8,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    borderRadius: 12,
    borderWidth: 1.5,
    borderStyle: 'dashed',
    marginTop: 10,
  },
});
