import React from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { useTheme } from '../theme/ThemeProvider';

interface SectionHeaderProps {
  title: string;
  /** Small muted suffix, e.g. source name "MangaDex". */
  source?: string;
  onSeeAll?: () => void;
}

export function SectionHeader({ title, source, onSeeAll }: SectionHeaderProps) {
  const theme = useTheme();
  return (
    <View style={styles.row}>
      <Text style={[theme.typography.heading, { color: theme.colors.text }]}>
        {title}
        {source ? (
          <Text style={{ color: theme.colors.textFaint, fontWeight: '400', fontSize: 13 }}>
            {'  ('}
            {source.toLowerCase()}
            {')'}
          </Text>
        ) : null}
      </Text>
      {onSeeAll ? (
        <Pressable onPress={onSeeAll} hitSlop={8}>
          <Text style={[styles.seeAll, { color: theme.colors.textMuted }]}>See all</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  seeAll: {
    fontSize: 13,
    fontWeight: '500',
  },
});
