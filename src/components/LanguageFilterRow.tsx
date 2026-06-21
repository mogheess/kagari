import React, { useMemo } from 'react';
import { ScrollView, Pressable, Text, StyleSheet } from 'react-native';
import { useTheme } from '../theme/ThemeProvider';
import { langLabel } from '../utils/lang';
import { useEnabledLanguages, toggleLanguage, clearLanguages } from '../sources/languageFilter';
import type { SourceDto } from '../engine/types';

/**
 * Horizontal "enabled languages" filter, built from the languages actually
 * present in the given sources. "All" clears the filter. Hidden when there's
 * only one language to choose from (nothing to filter).
 */
export function LanguageFilterRow({ sources }: { sources: SourceDto[] }) {
  const theme = useTheme();
  const enabled = useEnabledLanguages();

  const langs = useMemo(() => {
    const set = new Set(sources.map(s => s.lang).filter(Boolean));
    return [...set].sort(
      (a, b) => Number(b === 'en') - Number(a === 'en') || langLabel(a).localeCompare(langLabel(b)),
    );
  }, [sources]);

  if (langs.length < 2) return null;

  const chip = (key: string, label: string, active: boolean, onPress: () => void) => (
    <Pressable
      key={key}
      onPress={onPress}
      style={[
        styles.chip,
        {
          backgroundColor: active ? theme.colors.accent : theme.colors.surface,
          borderColor: active ? theme.colors.accent : theme.colors.border,
        },
      ]}
    >
      <Text style={{ color: active ? theme.colors.onAccent : theme.colors.textMuted, fontWeight: '700', fontSize: 12.5 }}>
        {label}
      </Text>
    </Pressable>
  );

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.row}
      keyboardShouldPersistTaps="handled"
    >
      {chip('all', 'All', enabled.length === 0, clearLanguages)}
      {langs.map(l => chip(l, langLabel(l), enabled.includes(l), () => toggleLanguage(l)))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  row: {
    gap: 7,
    paddingVertical: 8,
    paddingRight: 8,
  },
  chip: {
    paddingHorizontal: 12,
    height: 32,
    borderRadius: 9,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
