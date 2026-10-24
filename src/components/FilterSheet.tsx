import React, { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../theme/ThemeProvider';
import { Icon } from './Icon';
import type { FilterDto } from '../engine/types';
import { countChanged, nextTriState, updateFilterAt, type FilterPath } from '../sources/filters';
import { BottomSheet } from './BottomSheet';

/**
 * Edits a source's search filters. Changes stay in a draft until Apply, so
 * closing the sheet never half-applies a filter set.
 */
export function FilterSheet({
  visible,
  sourceName,
  current,
  defaults,
  onApply,
  onClose,
}: {
  visible: boolean;
  sourceName?: string;
  current: readonly FilterDto[];
  defaults: readonly FilterDto[];
  onApply: (filters: FilterDto[]) => void;
  onClose: () => void;
}) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const [draft, setDraft] = useState<FilterDto[]>(() => [...current]);

  useEffect(() => {
    if (visible) setDraft([...current]);
  }, [visible, current]);

  const edit = (path: FilterPath, update: (f: FilterDto) => FilterDto) =>
    setDraft(d => updateFilterAt(d, path, update));

  const changed = countChanged(draft, defaults);

  return (
    <BottomSheet
      visible={visible}
      onClose={onClose}
      scrollable
      style={[
        styles.sheet,
        { backgroundColor: theme.colors.bg, borderColor: theme.colors.border, paddingBottom: insets.bottom + 10 },
      ]}
    >
      <View style={styles.grabber} />
      <View style={styles.headerRow}>
        <Text style={[theme.typography.heading, { color: theme.colors.text, flex: 1 }]} numberOfLines={1}>
          {sourceName ? `Filters · ${sourceName}` : 'Filters'}
        </Text>
        <Pressable hitSlop={10} onPress={onClose}>
          <Icon name="close" size={22} color={theme.colors.textMuted} />
        </Pressable>
      </View>
      <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled" style={{ flexGrow: 0 }}>
        {draft.map((f, i) => (
          <FilterControl key={`${i}:${f.type}`} filter={f} path={[i]} onEdit={edit} />
        ))}
      </ScrollView>
      <View style={styles.footer}>
        <Pressable
          onPress={() => setDraft([...defaults])}
          disabled={changed === 0}
          style={[styles.footerBtn, { borderColor: theme.colors.border, opacity: changed === 0 ? 0.5 : 1 }]}
        >
          <Text style={{ color: theme.colors.text, fontWeight: '700' }}>Reset</Text>
        </Pressable>
        <Pressable
          onPress={() => {
            onApply(draft);
            onClose();
          }}
          style={[styles.footerBtn, { backgroundColor: theme.colors.accent, borderColor: theme.colors.accent, flex: 2 }]}
        >
          <Text style={{ color: theme.colors.onAccent, fontWeight: '700' }}>
            {changed > 0 ? `Apply (${changed})` : 'Apply'}
          </Text>
        </Pressable>
      </View>
    </BottomSheet>
  );
}

function Box({ state }: { state: 'off' | 'on' | 'excluded' }) {
  const theme = useTheme();
  const on = state !== 'off';
  const color = state === 'excluded' ? theme.colors.danger : theme.colors.accent;
  return (
    <View
      style={[
        styles.box,
        { borderColor: on ? color : theme.colors.textFaint, backgroundColor: on ? color : 'transparent' },
      ]}
    >
      {state === 'on' ? <Icon name="check" size={14} color={theme.colors.onAccent} strokeWidth={2.6} /> : null}
      {state === 'excluded' ? <Icon name="minus" size={14} color={theme.colors.onAccent} strokeWidth={2.6} /> : null}
    </View>
  );
}

function FilterControl({
  filter,
  path,
  onEdit,
}: {
  filter: FilterDto;
  path: FilterPath;
  onEdit: (path: FilterPath, update: (f: FilterDto) => FilterDto) => void;
}) {
  const theme = useTheme();
  const [open, setOpen] = useState(false);
  const label = (text: string) => (
    <Text style={[theme.typography.body, { color: theme.colors.text, flex: 1 }]} numberOfLines={2}>
      {text}
    </Text>
  );

  switch (filter.type) {
    case 'header':
      return filter.name ? (
        <Text style={[styles.headerText, { color: theme.colors.textFaint }]}>{filter.name}</Text>
      ) : null;
    case 'separator':
      return <View style={[styles.separator, { backgroundColor: theme.colors.border }]} />;
    case 'text':
      return (
        <View style={styles.block}>
          <Text style={{ color: theme.colors.textMuted, fontSize: 12.5, marginBottom: 6 }}>{filter.name}</Text>
          <TextInput
            value={filter.state}
            onChangeText={text => onEdit(path, f => (f.type === 'text' ? { ...f, state: text } : f))}
            placeholder={filter.name}
            placeholderTextColor={theme.colors.textFaint}
            style={[styles.input, { color: theme.colors.text, borderColor: theme.colors.border, backgroundColor: theme.colors.surface }]}
          />
        </View>
      );
    case 'checkbox':
      return (
        <Pressable
          style={styles.row}
          onPress={() => onEdit(path, f => (f.type === 'checkbox' ? { ...f, state: !f.state } : f))}
        >
          {label(filter.name)}
          <Box state={filter.state ? 'on' : 'off'} />
        </Pressable>
      );
    case 'tristate':
      return (
        <Pressable
          style={styles.row}
          onPress={() => onEdit(path, f => (f.type === 'tristate' ? { ...f, state: nextTriState(f.state) } : f))}
        >
          {label(filter.name)}
          <Box state={filter.state === 1 ? 'on' : filter.state === 2 ? 'excluded' : 'off'} />
        </Pressable>
      );
    case 'select':
      return (
        <View>
          <Pressable style={styles.row} onPress={() => setOpen(o => !o)}>
            {label(filter.name)}
            <Text style={{ color: theme.colors.accent, fontSize: 13.5, maxWidth: '50%' }} numberOfLines={1}>
              {filter.values[filter.state] ?? ''}
            </Text>
            <Icon name={open ? 'chevronDown' : 'chevronRight'} size={16} color={theme.colors.textFaint} />
          </Pressable>
          {open ? (
            <View style={[styles.nested, { borderColor: theme.colors.border }]}>
              {filter.values.map((v, idx) => (
                <Pressable
                  key={`${idx}:${v}`}
                  style={styles.option}
                  onPress={() => {
                    onEdit(path, f => (f.type === 'select' ? { ...f, state: idx } : f));
                    setOpen(false);
                  }}
                >
                  <Text style={{ color: idx === filter.state ? theme.colors.accent : theme.colors.text, flex: 1 }}>{v}</Text>
                  {idx === filter.state ? <Icon name="check" size={16} color={theme.colors.accent} /> : null}
                </Pressable>
              ))}
            </View>
          ) : null}
        </View>
      );
    case 'sort':
      return (
        <View style={styles.block}>
          <Text style={{ color: theme.colors.textMuted, fontSize: 12.5, marginBottom: 2 }}>{filter.name}</Text>
          {filter.values.map((v, idx) => {
            const active = filter.state?.index === idx;
            return (
              <Pressable
                key={`${idx}:${v}`}
                style={styles.option}
                onPress={() =>
                  onEdit(path, f =>
                    f.type === 'sort'
                      ? {
                          ...f,
                          // Tapping the active option flips the direction.
                          state: { index: idx, ascending: active ? !(f.state?.ascending ?? false) : false },
                        }
                      : f,
                  )
                }
              >
                <Text style={{ color: active ? theme.colors.accent : theme.colors.text, flex: 1, fontWeight: active ? '700' : '400' }}>
                  {v}
                </Text>
                {active ? (
                  <Text style={{ color: theme.colors.accent, fontSize: 12.5, fontWeight: '700' }}>
                    {filter.state?.ascending ? 'Ascending ↑' : 'Descending ↓'}
                  </Text>
                ) : null}
              </Pressable>
            );
          })}
        </View>
      );
    case 'group': {
      const picked = filter.filters.filter(
        c => (c.type === 'checkbox' && c.state) || (c.type === 'tristate' && c.state !== 0),
      ).length;
      return (
        <View>
          <Pressable style={styles.row} onPress={() => setOpen(o => !o)}>
            {label(filter.name)}
            {picked > 0 ? <Text style={{ color: theme.colors.accent, fontSize: 13 }}>{picked} selected</Text> : null}
            <Icon name={open ? 'chevronDown' : 'chevronRight'} size={16} color={theme.colors.textFaint} />
          </Pressable>
          {open ? (
            <View style={[styles.nested, { borderColor: theme.colors.border }]}>
              {filter.filters.map((child, idx) => (
                <FilterControl key={`${idx}:${child.type}`} filter={child} path={[...path, idx]} onEdit={onEdit} />
              ))}
            </View>
          ) : null}
        </View>
      );
    }
    default:
      return null;
  }
}

const styles = StyleSheet.create({
  sheet: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    maxHeight: '85%',
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
    marginBottom: 10,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 6,
  },
  headerText: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1.2,
    textTransform: 'uppercase',
    marginTop: 14,
    marginBottom: 2,
  },
  separator: {
    height: StyleSheet.hairlineWidth,
    marginVertical: 8,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 11,
  },
  block: {
    paddingVertical: 8,
  },
  nested: {
    borderLeftWidth: 2,
    paddingLeft: 12,
    marginLeft: 4,
    marginBottom: 6,
  },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 9,
  },
  input: {
    height: 40,
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 12,
    fontSize: 14,
  },
  box: {
    width: 22,
    height: 22,
    borderRadius: 6,
    borderWidth: 1.6,
    alignItems: 'center',
    justifyContent: 'center',
  },
  footer: {
    flexDirection: 'row',
    gap: 10,
    paddingTop: 12,
  },
  footerBtn: {
    flex: 1,
    height: 46,
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
