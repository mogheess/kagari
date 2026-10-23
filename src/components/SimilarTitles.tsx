import React from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { CoverRail } from './CoverRail';
import { Icon } from './Icon';
import { useTheme } from '../theme/ThemeProvider';
import { useSimilarTitles } from '../library/similar';
import { setSimilarExpanded, useSimilarExpanded } from '../library/similarPrefs';
import type { MangaDto } from '../engine/types';

interface SimilarTitlesProps {
  manga: MangaDto | undefined;
  /** The chapter list has loaded; only then does the section appear. */
  enabled: boolean;
  onOpen: (manga: MangaDto) => void;
}

/**
 * "Similar titles" on the title page, as a section that opens and closes. It
 * only asks the source once opened, and says what happened when there's
 * nothing to show: none found, not offered by the source, or a failure that
 * can be retried.
 */
export function SimilarTitles({ manga, enabled, onOpen }: SimilarTitlesProps) {
  const theme = useTheme();
  const expanded = useSimilarExpanded();
  const { status, items, retry } = useSimilarTitles(manga, enabled && expanded);
  if (!enabled || !manga) return null;

  let hint: string | null = null;
  if (status === 'ok') hint = items.length > 0 ? String(items.length) : 'None found';

  let body: React.ReactNode = null;
  if (status === 'idle' || status === 'loading') {
    body = <CoverRail data={[]} loading coverWidth={96} onPressItem={onOpen} />;
  } else if (status === 'ok' && items.length > 0) {
    body = <CoverRail data={items} loading={false} coverWidth={96} onPressItem={onOpen} />;
  } else if (status === 'failed') {
    body = (
      <View style={[styles.message, { paddingHorizontal: theme.spacing.lg }]}>
        <Text style={[styles.messageText, { color: theme.colors.textMuted }]}>
          Couldn't reach the source for similar titles.
        </Text>
        <Pressable
          onPress={retry}
          hitSlop={8}
          style={[styles.retry, { borderColor: theme.colors.border, backgroundColor: theme.colors.surface }]}
        >
          <Icon name="refresh" size={14} color={theme.colors.text} />
          <Text style={[styles.retryLabel, { color: theme.colors.text }]}>Retry</Text>
        </Pressable>
      </View>
    );
  } else {
    body = (
      <View style={[styles.message, { paddingHorizontal: theme.spacing.lg }]}>
        <Text style={[styles.messageText, { color: theme.colors.textMuted }]}>
          {status === 'unsupported'
            ? "This source doesn't suggest similar titles."
            : 'Nothing similar on this source.'}
        </Text>
      </View>
    );
  }

  return (
    <View style={[styles.section, { marginTop: theme.spacing.md }]}>
      <Pressable
        onPress={() => setSimilarExpanded(!expanded)}
        accessibilityRole="button"
        accessibilityState={{ expanded }}
        style={({ pressed }) => [
          styles.header,
          { paddingHorizontal: theme.spacing.lg, opacity: pressed ? 0.7 : 1 },
        ]}
      >
        <Text style={[theme.typography.heading, styles.title, { color: theme.colors.text }]}>
          Similar titles
        </Text>
        {status === 'loading' ? (
          <ActivityIndicator size="small" color={theme.colors.textMuted} />
        ) : hint ? (
          <Text style={[styles.hint, { color: theme.colors.textFaint }]}>{hint}</Text>
        ) : null}
        <View style={expanded ? styles.chevronOpen : undefined}>
          <Icon name="chevronDown" size={18} color={theme.colors.textMuted} />
        </View>
      </Pressable>
      {expanded ? <View style={{ marginTop: theme.spacing.md }}>{body}</View> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  section: {
    marginBottom: 4,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    minHeight: 32,
  },
  title: {
    flex: 1,
  },
  hint: {
    fontSize: 13,
    fontWeight: '600',
  },
  chevronOpen: {
    transform: [{ rotate: '180deg' }],
  },
  message: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    minHeight: 40,
  },
  messageText: {
    flex: 1,
    fontSize: 13.5,
    lineHeight: 19,
  },
  retry: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 999,
    borderWidth: StyleSheet.hairlineWidth,
  },
  retryLabel: {
    fontSize: 13,
    fontWeight: '700',
  },
});
