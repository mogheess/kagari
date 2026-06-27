import React, { useMemo, useRef, useState } from 'react';
import { LayoutChangeEvent, Pressable, StyleSheet, Text, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { Icon } from './Icon';

interface PageSliderProps {
  /** 0-based current page. */
  page: number;
  /** Total page count. */
  total: number;
  /** Theme accent used for the fill + thumb. */
  accent: string;
  /** Right-to-left reading: mirrors the fill/thumb direction. */
  inverted?: boolean;
  /** Fired continuously while scrubbing (deduped per page). */
  onSeek: (index: number) => void;
  /** Fired once when the touch is released (final commit). */
  onSeekEnd?: (index: number) => void;
  onPrevChapter?: () => void;
  onNextChapter?: () => void;
  hasPrev?: boolean;
  hasNext?: boolean;
}

const THUMB = 16;
const TRACK_H = 5;

function clamp(value: number, min: number, max: number): number {
  return value < min ? min : value > max ? max : value;
}

/**
 * Mihon-style reader page slider in the app's theme: a draggable thumb over a
 * filled track, flanked by the current/total page numbers and previous/next
 * chapter controls. Dragging (or tapping) the track scrubs to any page.
 */
export function PageSlider({
  page,
  total,
  accent,
  inverted,
  onSeek,
  onSeekEnd,
  onPrevChapter,
  onNextChapter,
  hasPrev,
  hasNext,
}: PageSliderProps) {
  const [trackW, setTrackW] = useState(0);
  const [dragPage, setDragPage] = useState<number | null>(null);
  const lastSeek = useRef(-1);

  const maxIndex = Math.max(0, total - 1);
  const shown = dragPage ?? page;
  const frac = maxIndex > 0 ? clamp(shown / maxIndex, 0, 1) : 0;
  const visualFrac = inverted ? 1 - frac : frac;

  const pageFromX = (x: number): number => {
    if (trackW <= 0 || maxIndex <= 0) return 0;
    let f = clamp(x / trackW, 0, 1);
    if (inverted) f = 1 - f;
    return Math.round(f * maxIndex);
  };

  const gesture = useMemo(() => {
    const seekTo = (x: number) => {
      const p = pageFromX(x);
      if (p !== lastSeek.current) {
        lastSeek.current = p;
        setDragPage(p);
        onSeek(p);
      }
    };
    const pan = Gesture.Pan()
      .runOnJS(true)
      .minDistance(0)
      .onBegin(e => seekTo(e.x))
      .onUpdate(e => seekTo(e.x))
      .onFinalize(() => {
        const p = lastSeek.current;
        if (p >= 0) onSeekEnd?.(p);
        lastSeek.current = -1;
        setDragPage(null);
      });
    const tap = Gesture.Tap()
      .runOnJS(true)
      .onEnd(e => {
        const p = pageFromX(e.x);
        onSeek(p);
        onSeekEnd?.(p);
      });
    return Gesture.Race(pan, tap);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trackW, maxIndex, inverted, onSeek, onSeekEnd]);

  const onTrackLayout = (e: LayoutChangeEvent) => setTrackW(e.nativeEvent.layout.width);
  const thumbLeft = clamp(visualFrac * trackW - THUMB / 2, 0, Math.max(0, trackW - THUMB));
  const filledW = frac * trackW;

  return (
    <View style={styles.row}>
      <Pressable
        hitSlop={8}
        disabled={!hasPrev}
        onPress={onPrevChapter}
        style={[styles.chapterBtn, !hasPrev && styles.disabled]}
      >
        <Icon name="skipBack" size={22} color="#fff" />
      </Pressable>

      <Text style={styles.label}>{total > 0 ? shown + 1 : 0}</Text>

      <GestureDetector gesture={gesture}>
        <View style={styles.touch} onLayout={onTrackLayout}>
          <View style={styles.track}>
            <View
              style={[
                styles.fill,
                { backgroundColor: accent, width: filledW },
                inverted ? styles.fillRight : styles.fillLeft,
              ]}
            />
          </View>
          <View
            style={[styles.thumb, { left: thumbLeft, backgroundColor: accent }]}
            pointerEvents="none"
          />
        </View>
      </GestureDetector>

      <Text style={styles.label}>{total}</Text>

      <Pressable
        hitSlop={8}
        disabled={!hasNext}
        onPress={onNextChapter}
        style={[styles.chapterBtn, !hasNext && styles.disabled]}
      >
        <Icon name="skipForward" size={22} color="#fff" />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  chapterBtn: {
    paddingVertical: 6,
    paddingHorizontal: 2,
  },
  disabled: {
    opacity: 0.3,
  },
  label: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '600',
    minWidth: 26,
    textAlign: 'center',
    fontVariant: ['tabular-nums'],
  },
  touch: {
    flex: 1,
    height: 28,
    justifyContent: 'center',
  },
  track: {
    height: TRACK_H,
    borderRadius: TRACK_H / 2,
    backgroundColor: 'rgba(255,255,255,0.22)',
    overflow: 'hidden',
  },
  fill: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    borderRadius: TRACK_H / 2,
  },
  fillLeft: {
    left: 0,
  },
  fillRight: {
    right: 0,
  },
  thumb: {
    position: 'absolute',
    top: '50%',
    width: THUMB,
    height: THUMB,
    borderRadius: THUMB / 2,
    marginTop: -THUMB / 2,
    borderWidth: 2,
    borderColor: 'rgba(0,0,0,0.35)',
  },
});
