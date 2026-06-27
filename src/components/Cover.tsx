import React, { useState } from 'react';
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  StyleProp,
  ViewStyle,
} from 'react-native';
import { useTheme } from '../theme/ThemeProvider';
import { RemoteImage } from './RemoteImage';
import { Icon } from './Icon';
import type { MangaDto } from '../engine/types';

interface CoverProps {
  manga: MangaDto;
  width: number;
  /** Optional chapter subtitle, e.g. "Ch. 178". */
  subtitle?: string;
  /** 0..1 reading progress; renders a thin accent bar when provided. */
  progress?: number;
  /** Unread count badge. */
  badge?: number;
  /** Marks the cover as already saved in the library (corner check + dim). */
  inLibrary?: boolean;
  onPress?: () => void;
  style?: StyleProp<ViewStyle>;
}

const RATIO = 1.46; // standard manga cover aspect (h / w)

/** A single cover card: artwork, optional title/subtitle, progress, badge. */
export function Cover({ manga, width, subtitle, progress, badge, inLibrary, onPress, style }: CoverProps) {
  const theme = useTheme();
  const [loaded, setLoaded] = useState(false);
  const height = Math.round(width * RATIO);

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [{ width, opacity: pressed ? 0.85 : 1 }, style]}
    >
      <View
        style={[
          styles.art,
          {
            width,
            height,
            borderRadius: theme.radius.md,
            backgroundColor: theme.colors.skeleton,
            borderColor: theme.colors.border,
          },
        ]}
      >
        {manga.thumbnailUrl ? (
          <RemoteImage
            uri={manga.thumbnailUrl}
            sourceId={manga.sourceId}
            style={[styles.image, { borderRadius: theme.radius.md }]}
            onLoadEnd={() => setLoaded(true)}
            resizeMode="cover"
          />
        ) : null}

        {inLibrary ? (
          <>
            <View style={[styles.inLibScrim, { borderRadius: theme.radius.md }]} />
            <View style={[styles.inLibBadge, { backgroundColor: theme.colors.accent }]}>
              <Icon name="check" size={12} color={theme.colors.onAccent} strokeWidth={2.6} />
            </View>
          </>
        ) : null}

        {badge != null && badge > 0 ? (
          <View style={[styles.badge, { backgroundColor: theme.colors.accent }]}>
            <Text style={[styles.badgeText, { color: theme.colors.onAccent }]}>{badge}</Text>
          </View>
        ) : null}

        {progress != null ? (
          <View style={styles.progressTrack}>
            <View
              style={[
                styles.progressFill,
                {
                  width: `${Math.round(Math.min(Math.max(progress, 0), 1) * 100)}%`,
                  backgroundColor: theme.colors.accent,
                },
              ]}
            />
          </View>
        ) : null}
        {!loaded ? null : null}
      </View>

      <Text
        numberOfLines={1}
        style={[styles.title, theme.typography.caption, { color: theme.colors.text }]}
      >
        {manga.title}
      </Text>
      {subtitle ? (
        <Text
          numberOfLines={1}
          style={[styles.subtitle, { color: theme.colors.textFaint }]}
        >
          {subtitle}
        </Text>
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  art: {
    overflow: 'hidden',
    borderWidth: StyleSheet.hairlineWidth,
  },
  image: {
    width: '100%',
    height: '100%',
  },
  title: {
    marginTop: 6,
    fontWeight: '600',
  },
  subtitle: {
    marginTop: 1,
    fontSize: 11,
  },
  badge: {
    position: 'absolute',
    top: 6,
    right: 6,
    minWidth: 20,
    height: 20,
    paddingHorizontal: 5,
    borderRadius: 6,
    alignItems: 'center',
    justifyContent: 'center',
  },
  inLibScrim: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.38)',
  },
  inLibBadge: {
    position: 'absolute',
    top: 6,
    left: 6,
    width: 22,
    height: 22,
    borderRadius: 7,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeText: {
    fontSize: 11,
    fontWeight: '700',
  },
  progressTrack: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: 3,
    backgroundColor: 'rgba(0,0,0,0.25)',
  },
  progressFill: {
    height: 3,
  },
});
