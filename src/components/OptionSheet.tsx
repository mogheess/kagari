import React from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../theme/ThemeProvider';
import { Icon } from './Icon';
import { BottomSheet } from './BottomSheet';

export interface SheetOption<T> {
  value: T;
  label: string;
  /** Secondary text on the right, e.g. a count. */
  hint?: string;
}

/** A bottom sheet with a single-choice list; picking closes it. */
export function OptionSheet<T>({
  visible,
  title,
  options,
  selected,
  onSelect,
  onClose,
}: {
  visible: boolean;
  title: string;
  options: readonly SheetOption<T>[];
  selected: T;
  onSelect: (value: T) => void;
  onClose: () => void;
}) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  return (
    <BottomSheet
      visible={visible}
      onClose={onClose}
      scrollable
      style={[
        styles.sheet,
        { backgroundColor: theme.colors.bg, borderColor: theme.colors.border, paddingBottom: insets.bottom + 8 },
      ]}
    >
      <View style={styles.grabber} />
      <Text style={[theme.typography.heading, { color: theme.colors.text, marginBottom: 8 }]}>{title}</Text>
      <ScrollView showsVerticalScrollIndicator={false}>
        {options.map(opt => {
          const active = opt.value === selected;
          return (
            <Pressable
              key={String(opt.value)}
              onPress={() => {
                onSelect(opt.value);
                onClose();
              }}
              style={({ pressed }) => [styles.row, { opacity: pressed ? 0.6 : 1 }]}
            >
              <Text
                style={[
                  theme.typography.body,
                  { color: active ? theme.colors.accent : theme.colors.text, flex: 1, fontWeight: active ? '700' : '400' },
                ]}
                numberOfLines={1}
              >
                {opt.label}
              </Text>
              {opt.hint ? <Text style={{ color: theme.colors.textFaint, fontSize: 12.5 }}>{opt.hint}</Text> : null}
              {active ? <Icon name="check" size={18} color={theme.colors.accent} /> : <View style={{ width: 18 }} />}
            </Pressable>
          );
        })}
      </ScrollView>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  sheet: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    maxHeight: '70%',
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
    marginBottom: 12,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 13,
  },
});
