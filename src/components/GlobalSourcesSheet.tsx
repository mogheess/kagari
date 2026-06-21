import React, { useMemo, useState } from 'react';
import { View, Text, TextInput, FlatList, Pressable, Modal, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../theme/ThemeProvider';
import { Icon } from './Icon';
import { langLabel } from '../utils/lang';
import { LanguageFilterRow } from './LanguageFilterRow';
import { useEnabledLanguages, filterByLanguages } from '../sources/languageFilter';
import { usePinnedSources, togglePinned } from '../sources/pinned';
import type { SourceDto } from '../engine/types';

interface GlobalSourcesSheetProps {
  visible: boolean;
  sources: SourceDto[];
  onClose: () => void;
}

type Row =
  | { kind: 'group'; key: string; label: string }
  | { kind: 'source'; key: string; source: SourceDto };

/** Cleans an extension package id into a readable group label. */
function extLabel(pkg: string): string {
  const seg = pkg.split('.').pop() ?? pkg;
  return seg.charAt(0).toUpperCase() + seg.slice(1);
}

/**
 * Multi-select chooser for which sources global search queries. This is the
 * "pinned" set: checking a source includes it in global search. Grouped by
 * extension and filterable, matching the single-select `SourcePickerSheet`.
 */
export function GlobalSourcesSheet({ visible, sources, onClose }: GlobalSourcesSheetProps) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const pinned = usePinnedSources();
  const [query, setQuery] = useState('');
  const enabledLangs = useEnabledLanguages();

  const pinnedCount = pinned.length;

  const rows = useMemo<Row[]>(() => {
    const byLang = filterByLanguages(sources, enabledLangs);
    const q = query.trim().toLowerCase();
    const filtered = q
      ? byLang.filter(
          s =>
            s.name.toLowerCase().includes(q) ||
            s.lang.toLowerCase().includes(q) ||
            extLabel(s.extensionPkg).toLowerCase().includes(q),
        )
      : byLang;

    const groups = new Map<string, SourceDto[]>();
    for (const s of filtered) {
      const arr = groups.get(s.extensionPkg) ?? [];
      arr.push(s);
      groups.set(s.extensionPkg, arr);
    }

    const out: Row[] = [];
    const sortedGroups = [...groups.entries()].sort((a, b) =>
      extLabel(a[0]).localeCompare(extLabel(b[0])),
    );
    for (const [pkg, list] of sortedGroups) {
      list.sort(
        (a, b) =>
          Number(b.lang === 'en') - Number(a.lang === 'en') ||
          a.lang.localeCompare(b.lang) ||
          a.name.localeCompare(b.name),
      );
      out.push({ kind: 'group', key: `g:${pkg}`, label: extLabel(pkg) });
      for (const s of list) out.push({ kind: 'source', key: s.id, source: s });
    }
    return out;
  }, [sources, query, enabledLangs]);

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose} />
      <View
        style={[
          styles.sheet,
          { backgroundColor: theme.colors.bg, paddingBottom: insets.bottom + 8, borderColor: theme.colors.border },
        ]}
      >
        <View style={styles.grabber} />
        <View style={styles.headerRow}>
          <View>
            <Text style={[theme.typography.heading, { color: theme.colors.text }]}>Search sources</Text>
            <Text style={{ color: theme.colors.textMuted, fontSize: 12.5, marginTop: 2 }}>
              {pinnedCount > 0 ? `${pinnedCount} selected for global search` : 'Select sources to search'}
            </Text>
          </View>
          <Pressable hitSlop={10} onPress={onClose}>
            <Icon name="close" size={22} color={theme.colors.textMuted} />
          </Pressable>
        </View>

        <View style={[styles.search, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border }]}>
          <Icon name="search" size={17} color={theme.colors.textMuted} />
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder="Filter sources"
            placeholderTextColor={theme.colors.textFaint}
            style={[styles.searchInput, { color: theme.colors.text }]}
            autoCorrect={false}
          />
        </View>

        <LanguageFilterRow sources={sources} />

        <FlatList
          data={rows}
          keyExtractor={r => r.key}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingBottom: 12 }}
          renderItem={({ item }) => {
            if (item.kind === 'group') {
              return (
                <Text style={[styles.groupLabel, { color: theme.colors.textFaint }]}>
                  {item.label.toUpperCase()}
                </Text>
              );
            }
            const s = item.source;
            const checked = pinned.includes(s.id);
            return (
              <Pressable
                onPress={() => togglePinned(s.id)}
                style={({ pressed }) => [
                  styles.row,
                  { backgroundColor: pressed ? theme.colors.surface : 'transparent' },
                ]}
              >
                <View
                  style={[
                    styles.checkbox,
                    {
                      borderColor: checked ? theme.colors.accent : theme.colors.border,
                      backgroundColor: checked ? theme.colors.accent : 'transparent',
                    },
                  ]}
                >
                  {checked ? <Icon name="check" size={14} color={theme.colors.onAccent} /> : null}
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[theme.typography.bodyStrong, { color: theme.colors.text }]}>{s.name}</Text>
                  <View style={styles.tags}>
                    <Text style={[styles.langTag, { color: theme.colors.textMuted, borderColor: theme.colors.border }]}>
                      {langLabel(s.lang)}
                    </Text>
                    {s.isNsfw ? (
                      <Text style={[styles.nsfwTag, { color: theme.colors.onAccent, backgroundColor: theme.colors.accent }]}>
                        18+
                      </Text>
                    ) : null}
                  </View>
                </View>
              </Pressable>
            );
          }}
        />
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
    maxHeight: '78%',
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
    marginBottom: 12,
  },
  search: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
    height: 42,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    marginBottom: 8,
  },
  searchInput: {
    flex: 1,
    fontSize: 15,
    padding: 0,
  },
  groupLabel: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1.2,
    marginTop: 14,
    marginBottom: 4,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 12,
    paddingHorizontal: 8,
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
  tags: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 4,
  },
  langTag: {
    fontSize: 11,
    fontWeight: '600',
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 6,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
  },
  nsfwTag: {
    fontSize: 10,
    fontWeight: '800',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
    overflow: 'hidden',
  },
});
