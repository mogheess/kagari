import React, { useMemo, useState } from 'react';
import { View, Text, Pressable, StyleSheet, ScrollView, Switch, TextInput } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useSources } from '../sources/sourcesStore';
import { useNavigation } from '@react-navigation/native';
import { useTheme } from '../theme/ThemeProvider';
import { useHomeConfig, blockLabel, isBrowseBlock, type HomeBlockKind } from '../home/HomeConfig';
import { Icon } from '../components/Icon';
import { SourcePickerSheet } from '../components/SourcePickerSheet';
import { sortSourcesForPicker, pickDefaultSource } from '../utils/sourceSelect';
import { langLabel } from '../utils/lang';

const UNIVERSAL = '__universal__';
const NEW_SECTION = '__new__';

type AddableKind = Extract<HomeBlockKind, 'popular' | 'latest' | 'search'>;

const ADDABLE: { kind: AddableKind; label: string }[] = [
  { kind: 'latest', label: 'Latest' },
  { kind: 'popular', label: 'Popular' },
  { kind: 'search', label: 'Saved search' },
];

/** What the built-ins that don't browse one source show, for the section list. */
const DESCRIPTIONS: Partial<Record<HomeBlockKind, string>> = {
  history: 'Titles you read recently, where you left off',
  updates: 'Library titles with new chapters',
  continue: 'Everything in your library',
  perSource: 'A rail for each installed source',
};

interface Draft {
  kind: AddableKind;
  query: string;
  sourceId?: string;
  sourceName?: string;
}

export function CustomizeHomeScreen() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const navigation = useNavigation();
  const {
    blocks,
    addBlock,
    removeBlock,
    toggle,
    move,
    setSource,
    clearSource,
    clearAllSources,
    universalSourceId,
    universalSourceName,
    setUniversalSource,
  } = useHomeConfig();

  const allSources = useSources();
  const sources = useMemo(() => sortSourcesForPicker(allSources), [allSources]);
  const [pickerFor, setPickerFor] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const draftReady =
    !!draft?.sourceId && (draft.kind !== 'search' || draft.query.trim().length > 0);

  const commitDraft = () => {
    if (!draft || !draftReady) return;
    addBlock({
      kind: draft.kind,
      sourceId: draft.sourceId,
      sourceName: draft.sourceName,
      query: draft.kind === 'search' ? draft.query.trim() : undefined,
    });
    setDraft(null);
  };

  const pickerBlock = blocks.find(b => b.id === pickerFor);
  const universalSource = sources.find(s => s.id === universalSourceId);
  // What "Auto" actually resolves to, so the universal default isn't a mystery.
  const autoDefault = sources.length ? pickDefaultSource(sources) : undefined;
  const hasOverrides = blocks.some(b => b.sourceId);

  return (
    <View style={{ flex: 1, backgroundColor: theme.colors.bg }}>
      <View style={[styles.header, { paddingTop: insets.top + 8, borderColor: theme.colors.border }]}>
        <Pressable hitSlop={10} onPress={() => navigation.goBack()} style={{ width: 60 }}>
          <Icon name="back" size={24} color={theme.colors.text} />
        </Pressable>
        <Text style={[theme.typography.heading, { color: theme.colors.text }]}>Customize Home</Text>
        <Pressable hitSlop={10} onPress={() => navigation.goBack()} style={{ width: 60, alignItems: 'flex-end' }}>
          <Text style={{ color: theme.colors.accent, fontWeight: '700', fontSize: 15 }}>Done</Text>
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={{ padding: theme.spacing.lg, paddingBottom: 40 }}>
        <Text style={{ color: theme.colors.textMuted, textAlign: 'center', marginBottom: 18, fontSize: 13 }}>
          Pick one source for the whole home screen, or override individual sections.
        </Text>

        <View style={[styles.block, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border }]}>
          <Text style={[theme.typography.bodyStrong, { color: theme.colors.text }]}>Universal source</Text>
          <Text style={{ color: theme.colors.textMuted, fontSize: 12.5, marginTop: 2 }}>
            Every section uses this unless it has its own override.
          </Text>
          <Pressable
            onPress={() => setPickerFor(UNIVERSAL)}
            style={({ pressed }) => [
              styles.sourceRow,
              { borderColor: theme.colors.border, opacity: pressed ? 0.7 : 1 },
            ]}
          >
            <Icon name="globe" size={15} color={theme.colors.accent} />
            <Text style={{ color: theme.colors.textMuted, fontSize: 13, flex: 1 }} numberOfLines={1}>
              {universalSource?.name ??
                universalSourceName ??
                (autoDefault ? `Auto \u00B7 ${autoDefault.name}` : 'Auto (smart default)')}
            </Text>
            {universalSource ? (
              <Text style={[styles.langTag, { color: theme.colors.textMuted, borderColor: theme.colors.border }]}>
                {langLabel(universalSource.lang)}
              </Text>
            ) : null}
            {universalSourceId ? (
              <Pressable hitSlop={8} onPress={() => setUniversalSource(undefined, undefined)}>
                <Icon name="close" size={16} color={theme.colors.textFaint} />
              </Pressable>
            ) : null}
            <Icon name="chevronRight" size={15} color={theme.colors.textFaint} />
          </Pressable>

          {hasOverrides ? (
            <Pressable
              onPress={clearAllSources}
              style={({ pressed }) => [styles.applyAll, { opacity: pressed ? 0.6 : 1 }]}
            >
              <Icon name="refresh" size={14} color={theme.colors.accent} />
              <Text style={{ color: theme.colors.accent, fontWeight: '700', fontSize: 12.5 }}>
                Apply to all sections
              </Text>
            </Pressable>
          ) : null}
        </View>

        <Text style={{ color: theme.colors.textFaint, marginBottom: 10, marginTop: 4, fontSize: 12 }}>
          SECTIONS
        </Text>

        {blocks.map((block, index) => {
          const browse = isBrowseBlock(block);
          const blockSource = sources.find(s => s.id === block.sourceId);
          return (
            <View
              key={block.id}
              style={[styles.block, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border }]}
            >
              <View style={styles.topRow}>
                <View style={styles.moveCol}>
                  <Pressable hitSlop={6} onPress={() => move(index, index - 1)} disabled={index === 0}>
                    <Icon name="chevronDown" size={16} color={index === 0 ? theme.colors.textFaint : theme.colors.textMuted} />
                  </Pressable>
                  <Icon name="drag" size={18} color={theme.colors.textFaint} />
                  <Pressable
                    hitSlop={6}
                    onPress={() => move(index, index + 1)}
                    disabled={index === blocks.length - 1}
                    style={{ transform: [{ rotate: '180deg' }] }}
                  >
                    <Icon
                      name="chevronDown"
                      size={16}
                      color={index === blocks.length - 1 ? theme.colors.textFaint : theme.colors.textMuted}
                    />
                  </Pressable>
                </View>

                <View style={styles.flex}>
                  <Text style={[theme.typography.bodyStrong, { color: theme.colors.text }]}>
                    {blockLabel(block).split(' \u00B7 ')[0]}
                  </Text>
                  {DESCRIPTIONS[block.kind] ? (
                    <Text style={[styles.description, { color: theme.colors.textMuted }]}>
                      {DESCRIPTIONS[block.kind]}
                    </Text>
                  ) : null}
                </View>

                {block.custom ? (
                  <Pressable hitSlop={8} onPress={() => removeBlock(block.id)}>
                    <Icon name="trash" size={18} color={theme.colors.textMuted} />
                  </Pressable>
                ) : null}

                <Switch
                  value={block.enabled}
                  onValueChange={() => toggle(block.id)}
                  trackColor={{ true: theme.colors.accent, false: theme.colors.border }}
                  thumbColor="#fff"
                />
              </View>

              {browse ? (
                <Pressable
                  onPress={() => setPickerFor(block.id)}
                  style={({ pressed }) => [
                    styles.sourceRow,
                    { borderColor: theme.colors.border, opacity: pressed ? 0.7 : 1 },
                  ]}
                >
                  <Icon name="globe" size={15} color={theme.colors.accent} />
                  <Text style={{ color: theme.colors.textMuted, fontSize: 13, flex: 1 }} numberOfLines={1}>
                    {blockSource
                      ? blockSource.name
                      : universalSource
                        ? `Universal \u00B7 ${universalSource.name}`
                        : 'Auto (smart default)'}
                  </Text>
                  {blockSource ? (
                    <>
                      <Text style={[styles.langTag, { color: theme.colors.textMuted, borderColor: theme.colors.border }]}>
                        {langLabel(blockSource.lang)}
                      </Text>
                      <Pressable hitSlop={8} onPress={() => clearSource(block.id)}>
                        <Icon name="close" size={16} color={theme.colors.textFaint} />
                      </Pressable>
                    </>
                  ) : null}
                  <Icon name="chevronRight" size={15} color={theme.colors.textFaint} />
                </Pressable>
              ) : null}
            </View>
          );
        })}

        {draft ? (
          <View style={[styles.block, { backgroundColor: theme.colors.surface, borderColor: theme.colors.accent }]}>
            <Text style={[theme.typography.bodyStrong, { color: theme.colors.text }]}>New section</Text>
            <View style={styles.chipRow}>
              {ADDABLE.map(opt => {
                const selected = draft.kind === opt.kind;
                return (
                  <Pressable
                    key={opt.kind}
                    onPress={() => setDraft({ ...draft, kind: opt.kind })}
                    style={[
                      styles.chip,
                      selected
                        ? { backgroundColor: theme.colors.accent, borderColor: theme.colors.accent }
                        : { borderColor: theme.colors.border },
                    ]}
                  >
                    <Text
                      style={[
                        styles.chipLabel,
                        { color: selected ? theme.colors.onAccent : theme.colors.textMuted },
                      ]}
                    >
                      {opt.label}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
            {draft.kind === 'search' ? (
              <TextInput
                value={draft.query}
                onChangeText={query => setDraft({ ...draft, query })}
                placeholder="Search for…"
                placeholderTextColor={theme.colors.textFaint}
                autoCorrect={false}
                returnKeyType="done"
                style={[styles.input, { color: theme.colors.text, borderColor: theme.colors.border }]}
              />
            ) : null}
            <Pressable
              onPress={() => setPickerFor(NEW_SECTION)}
              style={({ pressed }) => [
                styles.sourceRow,
                { borderColor: theme.colors.border, opacity: pressed ? 0.7 : 1 },
              ]}
            >
              <Icon name="globe" size={15} color={theme.colors.accent} />
              <Text style={[styles.flex, styles.sourceLabel, { color: theme.colors.textMuted }]} numberOfLines={1}>
                {draft.sourceName ?? 'Choose a source'}
              </Text>
              <Icon name="chevronRight" size={15} color={theme.colors.textFaint} />
            </Pressable>
            <View style={styles.draftActions}>
              <Pressable hitSlop={8} onPress={() => setDraft(null)}>
                <Text style={[styles.actionLabel, { color: theme.colors.textMuted }]}>Cancel</Text>
              </Pressable>
              <Pressable hitSlop={8} onPress={commitDraft} disabled={!draftReady}>
                <Text
                  style={[
                    styles.actionLabel,
                    { color: draftReady ? theme.colors.accent : theme.colors.textFaint },
                  ]}
                >
                  Add
                </Text>
              </Pressable>
            </View>
          </View>
        ) : (
          <Pressable
            onPress={() => setDraft({ kind: 'latest', query: '' })}
            style={({ pressed }) => [
              styles.addButton,
              { borderColor: theme.colors.border, opacity: pressed ? 0.7 : 1 },
            ]}
          >
            <Icon name="plus" size={16} color={theme.colors.accent} />
            <Text style={[styles.actionLabel, { color: theme.colors.accent }]}>Add section</Text>
          </Pressable>
        )}

        <Text style={{ color: theme.colors.textFaint, textAlign: 'center', marginTop: 8, fontSize: 12 }}>
          Sections pull from your installed extensions
        </Text>
      </ScrollView>

      <SourcePickerSheet
        visible={pickerFor != null}
        sources={sources}
        selectedId={
          (pickerFor === UNIVERSAL
            ? universalSourceId
            : pickerFor === NEW_SECTION
              ? draft?.sourceId
              : pickerBlock?.sourceId) ?? ''
        }
        onSelect={id => {
          const s = sources.find(x => x.id === id);
          if (!s) return;
          if (pickerFor === UNIVERSAL) setUniversalSource(s.id, s.name);
          else if (pickerFor === NEW_SECTION) {
            setDraft(d => (d ? { ...d, sourceId: s.id, sourceName: s.name } : d));
          } else if (pickerFor) setSource(pickerFor, s.id, s.name);
        }}
        onClose={() => setPickerFor(null)}
      />
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
  block: {
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    marginBottom: 12,
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  moveCol: {
    alignItems: 'center',
    gap: 1,
  },
  sourceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  applyAll: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    marginTop: 10,
  },
  flex: {
    flex: 1,
  },
  description: {
    fontSize: 12,
    marginTop: 2,
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 12,
  },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 999,
    borderWidth: StyleSheet.hairlineWidth,
  },
  chipLabel: {
    fontSize: 12.5,
    fontWeight: '700',
  },
  input: {
    marginTop: 12,
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
    fontSize: 14,
  },
  sourceLabel: {
    fontSize: 13,
  },
  draftActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 22,
    marginTop: 14,
  },
  actionLabel: {
    fontSize: 14,
    fontWeight: '700',
  },
  addButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 13,
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    borderStyle: 'dashed',
    marginBottom: 12,
  },
  langTag: {
    fontSize: 11,
    fontWeight: '700',
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 6,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
  },
});
