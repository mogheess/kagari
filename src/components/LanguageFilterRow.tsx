import React, { useMemo } from 'react';
import { ScrollView, Pressable, Text, StyleSheet } from 'react-native';
import { useTheme } from '../theme/ThemeProvider';
import { compareLanguages, langLabel } from '../utils/lang';
import {
  clearLanguages,
  isLanguageEnabled,
  setLanguages,
  toggleLanguage,
  useEnabledLanguages,
} from '../sources/languageFilter';
import { usePhoneLanguages } from '../sources/languageOrder';
import type { SourceDto } from '../engine/types';

/**
 * Horizontal "enabled languages" filter, built from the languages actually
 * present in the given sources. "All" clears the filter. Hidden when there's
 * only one language to choose from (nothing to filter).
 */
export function LanguageFilterRow({ sources }: { sources: SourceDto[] }) {
  const theme = useTheme();
  const enabled = useEnabledLanguages();
  // Not the enabled ones: a chip would jump away from the finger when tapped.
  const preferred = usePhoneLanguages();

  const langs = useMemo(() => {
    const set = new Set(sources.map(s => s.lang).filter(Boolean));
    return [...set].sort((a, b) => compareLanguages(a, b, preferred));
  }, [sources, preferred]);

  const filtering = langs.some(l => isLanguageEnabled(l, enabled));

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
      {/* With none of the enabled languages here, every source shows (see
          filterByLanguages), so All is what's in effect, and a tap starts a
          new selection rather than adding to languages that aren't
          installed. */}
      {chip('all', 'All', !filtering, clearLanguages)}
      {langs.map(l =>
        chip(l, langLabel(l), isLanguageEnabled(l, enabled), () =>
          filtering ? toggleLanguage(l) : setLanguages([l]),
        ),
      )}
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
