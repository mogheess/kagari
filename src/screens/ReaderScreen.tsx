import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  Image,
  FlatList,
  Pressable,
  Modal,
  StyleSheet,
  ActivityIndicator,
  useWindowDimensions,
  StatusBar,
  ToastAndroid,
  ViewToken,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  useAnimatedReaction,
  withTiming,
  runOnJS,
} from 'react-native-reanimated';
import { useAsync } from '../hooks/useAsync';
import { getEngine } from '../engine';
import { recordProgress } from '../library/history';
import { recordChapterProgress } from '../library/chapterProgress';
import { useDownloadEntry, enqueueDownload, type DownloadStatus } from '../library/downloads';
import { Icon, type IconName } from '../components/Icon';
import { useTheme } from '../theme/ThemeProvider';
import {
  READER_MODES,
  getReaderMode,
  setReaderMode,
  isHorizontal,
  isPaged,
  type ReaderMode,
} from '../reader/readerSettings';
import type { RootStackParamList } from '../navigation/types';
import type { ImageFileDto, ImageTileDto, MangaDto, PageDto } from '../engine/types';

function notify(message: string): void {
  ToastAndroid.show(message, ToastAndroid.SHORT);
}

type Nav = NativeStackNavigationProp<RootStackParamList>;
type ReaderRoute = RouteProp<RootStackParamList, 'Reader'>;
const MAX_IMAGE_FETCHES = 1;
const IMAGE_FETCH_RETRIES = 3;

let activeImageFetches = 0;
const imageFetchQueue: (() => void)[] = [];

export function ReaderScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<Nav>();
  const { params } = useRoute<ReaderRoute>();
  const { width, height } = useWindowDimensions();
  const engine = getEngine();

  const [chrome, setChrome] = useState(true);
  const [current, setCurrent] = useState(0);
  const [mode, setMode] = useState<ReaderMode>(getReaderMode());
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [zoomed, setZoomed] = useState(false);
  // Controlled per-page reload counters so a long-press (or the error Retry
  // button) can force a fresh fetch of a specific page.
  const [reloadTokens, setReloadTokens] = useState<Record<number, number>>({});
  const retryPage = useCallback(
    (index: number) => setReloadTokens(m => ({ ...m, [index]: (m[index] ?? 0) + 1 })),
    [],
  );

  const scale = useSharedValue(1);
  const savedScale = useSharedValue(1);
  const tx = useSharedValue(0);
  const ty = useSharedValue(0);
  const savedTx = useSharedValue(0);
  const savedTy = useSharedValue(0);

  const resetZoom = useCallback(() => {
    scale.value = withTiming(1);
    savedScale.value = 1;
    tx.value = withTiming(0);
    ty.value = withTiming(0);
    savedTx.value = 0;
    savedTy.value = 0;
  }, [scale, savedScale, tx, ty, savedTx, savedTy]);

  // Keep `zoomed` (drives scroll-lock) in sync with the live scale.
  useAnimatedReaction(
    () => scale.value > 1.01,
    (z, prev) => {
      if (z !== prev) runOnJS(setZoomed)(z);
    },
  );

  // If this chapter is downloaded, read its pages from local storage (offline)
  // instead of resolving page URLs over the network.
  const downloadEntry = useDownloadEntry(params.sourceId, params.chapter.url);
  const offlinePageCount = downloadEntry?.status === 'done' ? downloadEntry.pageCount : 0;
  const offline = offlinePageCount > 0;

  const { data: pages, loading, error } = useAsync<PageDto[]>(
    () =>
      offline
        ? Promise.resolve(Array.from({ length: offlinePageCount }, (_, i) => ({ index: i })))
        : engine.getPages(params.sourceId, params.chapter.url),
    [params.chapter.url, offline, offlinePageCount],
  );

  const total = pages?.length ?? 0;
  const horizontal = isHorizontal(mode);
  const paged = isPaged(mode);
  const inverted = mode === 'rtl';

  const toggleChrome = useCallback(() => setChrome(c => !c), []);

  // Resolve the current page to a local file:// uri (cache-backed, so this is
  // cheap once the page has rendered) for the save/share actions.
  const resolveCurrentUri = useCallback(async (): Promise<string | null> => {
    const page = pages?.[current];
    if (!page) return null;
    try {
      const image = offline
        ? await engine.fetchDownloadedImage(params.sourceId, params.chapter.url, page.index)
        : await engine.fetchImage(params.sourceId, page);
      return image.uri;
    } catch {
      return null;
    }
  }, [pages, current, offline, engine, params.sourceId, params.chapter.url]);

  const onSavePage = useCallback(async () => {
    setMenuOpen(false);
    const uri = await resolveCurrentUri();
    if (!uri) {
      notify('This page has not loaded yet');
      return;
    }
    try {
      await engine.saveImageToGallery(uri);
      notify('Saved to gallery');
    } catch (e) {
      notify(e instanceof Error ? e.message : 'Could not save the page');
    }
  }, [resolveCurrentUri, engine]);

  const onSharePage = useCallback(async () => {
    setMenuOpen(false);
    const uri = await resolveCurrentUri();
    if (!uri) {
      notify('This page has not loaded yet');
      return;
    }
    try {
      await engine.shareImage(uri);
    } catch (e) {
      notify(e instanceof Error ? e.message : 'Could not share the page');
    }
  }, [resolveCurrentUri, engine]);

  const onDownloadChapter = useCallback(() => {
    setMenuOpen(false);
    const manga: MangaDto = {
      sourceId: params.sourceId,
      url: params.mangaUrl,
      title: params.mangaTitle ?? params.chapter.name,
      thumbnailUrl: params.mangaThumbnailUrl,
      genres: [],
      status: 'unknown',
      initialized: false,
    };
    enqueueDownload(manga, params.chapter);
    notify('Chapter queued for download');
  }, [params]);

  const onViewable = useRef(({ viewableItems }: { viewableItems: ViewToken[] }) => {
    const first = viewableItems[0];
    if (first?.index != null) setCurrent(first.index);
  }).current;

  // Persist reading progress (furthest page) like Mihon — debounced while
  // reading, then flushed on exit. Works for any source, library or not.
  const progressRef = useRef({ page: 0, total: 0 });
  useEffect(() => {
    if (total <= 0) return;
    progressRef.current = { page: current + 1, total };
    const t = setTimeout(() => {
      recordProgress(params.sourceId, params.mangaUrl, current + 1, total);
      recordChapterProgress(params.sourceId, params.chapter.url, current + 1, total);
    }, 600);
    return () => clearTimeout(t);
  }, [current, total, params.sourceId, params.mangaUrl, params.chapter.url]);

  useEffect(() => {
    return () => {
      const { page, total: t } = progressRef.current;
      if (t > 0) {
        recordProgress(params.sourceId, params.mangaUrl, page, t);
        recordChapterProgress(params.sourceId, params.chapter.url, page, t);
      }
    };
  }, [params.sourceId, params.mangaUrl, params.chapter.url]);

  const renderPage = useCallback(
    ({ item }: { item: PageDto }) => (
      <ReaderPage
        sourceId={params.sourceId}
        chapterUrl={params.chapter.url}
        downloaded={offline}
        page={item}
        width={width}
        screenHeight={height}
        layout={paged ? 'page' : 'strip'}
        reloadToken={reloadTokens[item.index] ?? 0}
        onRetry={() => retryPage(item.index)}
      />
    ),
    [params.sourceId, params.chapter.url, offline, width, height, paged, reloadTokens, retryPage],
  );

  // Reset zoom when switching reading modes (the list remounts via key).
  useEffect(() => {
    resetZoom();
  }, [mode, resetZoom]);

  const zoomStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: tx.value }, { translateY: ty.value }, { scale: scale.value }],
  }));

  const pinch = Gesture.Pinch()
    .onUpdate(e => {
      scale.value = Math.min(Math.max(savedScale.value * e.scale, 1), 4);
    })
    .onEnd(() => {
      savedScale.value = scale.value;
      if (scale.value <= 1.01) {
        scale.value = withTiming(1);
        tx.value = withTiming(0);
        ty.value = withTiming(0);
        savedScale.value = 1;
        savedTx.value = 0;
        savedTy.value = 0;
      }
    });

  const pan = Gesture.Pan()
    .enabled(zoomed)
    .onUpdate(e => {
      tx.value = savedTx.value + e.translationX;
      ty.value = savedTy.value + e.translationY;
    })
    .onEnd(() => {
      savedTx.value = tx.value;
      savedTy.value = ty.value;
    });

  const doubleTap = Gesture.Tap()
    .numberOfTaps(2)
    .maxDuration(260)
    .onEnd(() => {
      if (scale.value > 1.01) {
        scale.value = withTiming(1);
        tx.value = withTiming(0);
        ty.value = withTiming(0);
        savedScale.value = 1;
        savedTx.value = 0;
        savedTy.value = 0;
      } else {
        scale.value = withTiming(2);
        savedScale.value = 2;
      }
    });

  const singleTap = Gesture.Tap()
    .maxDuration(260)
    .onEnd(() => {
      runOnJS(toggleChrome)();
    });

  const longPress = Gesture.LongPress()
    .minDuration(500)
    .onStart(() => {
      runOnJS(retryPage)(current);
    });

  // Pinch and pan zoom together; the tap family stays in its own Exclusive so
  // the single/double-tap disambiguation survives. Wrapping everything in one
  // Simultaneous (the previous shape) made single + double tap fire together,
  // which swallowed the double-tap-to-zoom.
  const gesture = Gesture.Race(
    Gesture.Simultaneous(pinch, pan),
    Gesture.Exclusive(doubleTap, singleTap, longPress),
  );

  return (
    <View style={{ flex: 1, backgroundColor: '#000' }}>
      <StatusBar hidden={!chrome} animated />

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator color="#fff" />
        </View>
      ) : error || total === 0 ? (
        <Pressable style={styles.center} onPress={() => navigation.goBack()}>
          <Icon name="globe" size={28} color="rgba(255,255,255,0.5)" />
          <Text style={styles.errorText}>
            {error ? "Couldn't load this chapter" : 'No pages found'}
          </Text>
          <Text style={styles.errorSub}>
            {error
              ? 'The source may be blocked or temporarily down. Tap to go back.'
              : 'This chapter appears to be empty. Tap to go back.'}
          </Text>
        </Pressable>
      ) : (
        <GestureDetector gesture={gesture}>
          <Animated.View style={[styles.zoomLayer, zoomStyle]}>
            <FlatList
              key={mode}
              data={pages ?? []}
              keyExtractor={p => String(p.index)}
              renderItem={renderPage}
              horizontal={horizontal}
              inverted={inverted}
              pagingEnabled={paged}
              scrollEnabled={!zoomed}
              removeClippedSubviews={false}
              showsVerticalScrollIndicator={false}
              showsHorizontalScrollIndicator={false}
              onViewableItemsChanged={onViewable}
              viewabilityConfig={{ itemVisiblePercentThreshold: 50 }}
              getItemLayout={
                paged
                  ? (_, index) => {
                      const size = horizontal ? width : height;
                      return { length: size, offset: size * index, index };
                    }
                  : undefined
              }
              initialScrollIndex={paged && current > 0 ? current : undefined}
              ListFooterComponent={paged ? null : <View style={{ height: 80 }} />}
            />
          </Animated.View>
        </GestureDetector>
      )}

      {chrome ? (
        <View style={[styles.topBar, { paddingTop: insets.top + 6 }]}>
          <Pressable hitSlop={10} onPress={() => navigation.goBack()}>
            <Icon name="back" size={24} color="#fff" />
          </Pressable>
          <Text numberOfLines={1} style={styles.chapterTitle}>
            {params.chapter.name}
          </Text>
          <View style={styles.topActions}>
            <Pressable hitSlop={10} onPress={() => setMenuOpen(true)}>
              <Icon name="more" size={22} color="#fff" />
            </Pressable>
            <Pressable hitSlop={10} onPress={() => setSettingsOpen(true)}>
              <Icon name="settings" size={22} color="#fff" />
            </Pressable>
          </View>
        </View>
      ) : null}

      {chrome && total > 0 ? (
        <View style={[styles.bottomBar, { paddingBottom: insets.bottom + 12 }]}>
          <View style={styles.progressTrack}>
            <View
              style={[styles.progressFill, { width: `${((current + 1) / total) * 100}%` }]}
            />
          </View>
          <View style={styles.bottomRow}>
            <Pressable hitSlop={10} onPress={() => setSettingsOpen(true)} style={styles.modePill}>
              <Icon name={horizontal ? 'columns' : 'list'} size={16} color="#fff" />
              <Text style={styles.modePillText}>{labelFor(mode)}</Text>
            </Pressable>
            <Text style={styles.counter}>
              {current + 1} / {total}
            </Text>
          </View>
        </View>
      ) : null}

      <ReaderSettingsSheet
        visible={settingsOpen}
        mode={mode}
        onSelect={m => {
          setReaderMode(m);
          setMode(m);
          setSettingsOpen(false);
        }}
        onClose={() => setSettingsOpen(false)}
      />

      <ReaderMenuSheet
        visible={menuOpen}
        downloadStatus={downloadEntry?.status}
        onSave={onSavePage}
        onShare={onSharePage}
        onDownload={onDownloadChapter}
        onClose={() => setMenuOpen(false)}
      />
    </View>
  );
}

function labelFor(mode: ReaderMode): string {
  return READER_MODES.find(m => m.mode === mode)?.label ?? mode;
}

function wait(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function drainImageFetchQueue(): void {
  while (activeImageFetches < MAX_IMAGE_FETCHES && imageFetchQueue.length > 0) {
    const next = imageFetchQueue.shift();
    if (!next) return;
    activeImageFetches += 1;
    next();
  }
}

function enqueueNativeImageFetch(
  sourceId: string,
  page: PageDto,
  forceRefresh = false,
): Promise<ImageFileDto> {
  return new Promise((resolve, reject) => {
    const run = () => {
      fetchNativeImageWithRetry(sourceId, page, forceRefresh)
        .then(resolve)
        .catch(reject)
        .finally(() => {
          activeImageFetches = Math.max(0, activeImageFetches - 1);
          drainImageFetchQueue();
        });
    };
    imageFetchQueue.push(run);
    drainImageFetchQueue();
  });
}

async function fetchNativeImageWithRetry(
  sourceId: string,
  page: PageDto,
  forceRefresh: boolean,
): Promise<ImageFileDto> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= IMAGE_FETCH_RETRIES; attempt += 1) {
    try {
      // Force a fresh download on the user's manual retry, and on any later
      // auto-retry attempt, so a corrupt cached file can't keep coming back.
      return await getEngine().fetchImage(sourceId, page, forceRefresh || attempt > 1);
    } catch (error) {
      lastError = error;
      if (attempt < IMAGE_FETCH_RETRIES) {
        await wait(250 * attempt);
      }
    }
  }
  throw lastError;
}

function ReaderPage({
  sourceId,
  chapterUrl,
  downloaded,
  page,
  width,
  screenHeight,
  layout,
  reloadToken,
  onRetry,
}: {
  sourceId: string;
  chapterUrl: string;
  downloaded: boolean;
  page: PageDto;
  width: number;
  screenHeight: number;
  layout: 'strip' | 'page';
  reloadToken: number;
  onRetry: () => void;
}) {
  const [ratio, setRatio] = useState(1.5);
  const [uri, setUri] = useState<string | null>(null);
  const [tiles, setTiles] = useState<ImageTileDto[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setUri(null);
    setTiles([]);
    setLoadError(null);
    setRatio(1.5);

    const request = downloaded
      ? getEngine().fetchDownloadedImage(sourceId, chapterUrl, page.index)
      : enqueueNativeImageFetch(sourceId, page, reloadToken > 0);
    request
      .then(image => {
        if (!cancelled) {
          setUri(image.uri);
          setTiles(sortTiles(image));
        }
      })
      .catch(error => {
        if (!cancelled) setLoadError(error instanceof Error ? error.message : String(error));
      });

    return () => {
      cancelled = true;
    };
  }, [page, sourceId, chapterUrl, downloaded, reloadToken]);

  if (layout === 'page') {
    return (
      <View
        style={{ width, height: screenHeight, justifyContent: 'center', backgroundColor: '#000' }}
      >
        {uri ? (
          <Image
            source={{ uri }}
            style={{ width, height: screenHeight }}
            resizeMode="contain"
            resizeMethod="scale"
          />
        ) : loadError ? (
          <ReaderImageError message={loadError} onRetry={onRetry} />
        ) : (
          <ActivityIndicator color="#fff" />
        )}
      </View>
    );
  }

  if (tiles.length > 0) {
    return (
      <View style={{ width, backgroundColor: '#0a0a0a' }}>
        {tiles.map(tile => {
          const height = Math.max(1, Math.round((width * tile.height) / tile.width));
          return (
            <Image
              key={`${page.index}:${tile.index}`}
              source={{ uri: tile.uri }}
              style={{ width, height }}
              resizeMode="stretch"
              resizeMethod="scale"
            />
          );
        })}
      </View>
    );
  }

  return (
    <View
      style={{ width, height: width * ratio, backgroundColor: '#0a0a0a', justifyContent: 'center' }}
    >
      {uri ? (
        <Image
          source={{ uri }}
          style={{ width, height: width * ratio }}
          resizeMode="contain"
          resizeMethod="scale"
          onLoad={e => {
            const { width: w, height: h } = e.nativeEvent.source;
            if (w && h) setRatio(h / w);
          }}
        />
      ) : loadError ? (
        <ReaderImageError message={loadError} onRetry={onRetry} />
      ) : (
        <ActivityIndicator color="#fff" />
      )}
    </View>
  );
}

function ReaderImageError({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <View style={styles.imageError}>
      <Icon name="refresh" size={24} color="rgba(255,255,255,0.55)" />
      <Text style={styles.imageErrorTitle}>Image failed to load</Text>
      <Text style={styles.imageErrorText}>{message}</Text>
      <Pressable
        onPress={onRetry}
        hitSlop={8}
        style={({ pressed }) => [styles.retryBtn, { opacity: pressed ? 0.8 : 1 }]}
      >
        <Icon name="refresh" size={15} color="#000" />
        <Text style={styles.retryBtnText}>Retry</Text>
      </Pressable>
    </View>
  );
}

function sortTiles(image: ImageFileDto): ImageTileDto[] {
  return [...(image.tiles ?? [])].sort((a, b) => a.index - b.index);
}

function ReaderSettingsSheet({
  visible,
  mode,
  onSelect,
  onClose,
}: {
  visible: boolean;
  mode: ReaderMode;
  onSelect: (m: ReaderMode) => void;
  onClose: () => void;
}) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.sheetBackdrop} onPress={onClose} />
      <View
        style={[
          styles.sheet,
          { backgroundColor: theme.colors.bg, paddingBottom: insets.bottom + 10, borderColor: theme.colors.border },
        ]}
      >
        <View style={styles.grabber} />
        <Text style={[theme.typography.heading, { color: theme.colors.text, marginBottom: 6 }]}>
          Reading mode
        </Text>
        {READER_MODES.map(opt => {
          const active = opt.mode === mode;
          return (
            <Pressable
              key={opt.mode}
              onPress={() => onSelect(opt.mode)}
              style={({ pressed }) => [
                styles.modeRow,
                { backgroundColor: pressed ? theme.colors.surface : 'transparent' },
              ]}
            >
              <View style={{ flex: 1 }}>
                <Text style={[theme.typography.bodyStrong, { color: theme.colors.text }]}>
                  {opt.label}
                </Text>
                <Text style={{ color: theme.colors.textMuted, fontSize: 12.5, marginTop: 2 }}>
                  {opt.hint}
                </Text>
              </View>
              {active ? <Icon name="check" size={20} color={theme.colors.accent} /> : null}
            </Pressable>
          );
        })}
      </View>
    </Modal>
  );
}

function ReaderMenuSheet({
  visible,
  downloadStatus,
  onSave,
  onShare,
  onDownload,
  onClose,
}: {
  visible: boolean;
  downloadStatus?: DownloadStatus;
  onSave: () => void;
  onShare: () => void;
  onDownload: () => void;
  onClose: () => void;
}) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();

  const downloading = downloadStatus === 'downloading' || downloadStatus === 'queued';
  const downloadLabel =
    downloadStatus === 'done'
      ? 'Chapter downloaded'
      : downloading
        ? 'Downloading chapter\u2026'
        : 'Download chapter';
  const downloadHint =
    downloadStatus === 'done'
      ? 'Saved for offline reading'
      : downloadStatus === 'error'
        ? 'Last attempt failed, tap to retry'
        : 'Save every page for offline reading';

  const items: {
    key: string;
    icon: IconName;
    label: string;
    hint: string;
    onPress: () => void;
    disabled?: boolean;
  }[] = [
    {
      key: 'save',
      icon: 'image',
      label: 'Save page to gallery',
      hint: 'Save the current page as an image',
      onPress: onSave,
    },
    {
      key: 'share',
      icon: 'share',
      label: 'Share page',
      hint: 'Send the current page to another app',
      onPress: onShare,
    },
    {
      key: 'download',
      icon: 'download',
      label: downloadLabel,
      hint: downloadHint,
      onPress: onDownload,
      disabled: downloadStatus === 'done' || downloading,
    },
  ];

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.sheetBackdrop} onPress={onClose} />
      <View
        style={[
          styles.sheet,
          { backgroundColor: theme.colors.bg, paddingBottom: insets.bottom + 10, borderColor: theme.colors.border },
        ]}
      >
        <View style={styles.grabber} />
        <Text style={[theme.typography.heading, { color: theme.colors.text, marginBottom: 6 }]}>
          Page options
        </Text>
        {items.map(item => (
          <Pressable
            key={item.key}
            onPress={item.onPress}
            disabled={item.disabled}
            style={({ pressed }) => [
              styles.modeRow,
              {
                backgroundColor: pressed ? theme.colors.surface : 'transparent',
                opacity: item.disabled ? 0.45 : 1,
              },
            ]}
          >
            <Icon name={item.icon} size={20} color={theme.colors.text} />
            <View style={{ flex: 1 }}>
              <Text style={[theme.typography.bodyStrong, { color: theme.colors.text }]}>
                {item.label}
              </Text>
              <Text style={{ color: theme.colors.textMuted, fontSize: 12.5, marginTop: 2 }}>
                {item.hint}
              </Text>
            </View>
          </Pressable>
        ))}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  zoomLayer: {
    flex: 1,
    overflow: 'hidden',
  },
  center: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 40,
  },
  errorText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
    marginTop: 14,
  },
  errorSub: {
    color: 'rgba(255,255,255,0.6)',
    fontSize: 13,
    textAlign: 'center',
    marginTop: 6,
  },
  imageError: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 28,
  },
  imageErrorTitle: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '700',
    textAlign: 'center',
  },
  imageErrorText: {
    color: 'rgba(255,255,255,0.62)',
    fontSize: 12,
    lineHeight: 17,
    marginTop: 8,
    textAlign: 'center',
  },
  retryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    marginTop: 16,
    paddingHorizontal: 18,
    height: 40,
    borderRadius: 12,
    backgroundColor: '#fff',
  },
  retryBtnText: {
    color: '#000',
    fontSize: 14,
    fontWeight: '700',
  },
  topBar: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingBottom: 12,
    gap: 12,
    backgroundColor: 'rgba(8,8,10,0.92)',
  },
  chapterTitle: {
    flex: 1,
    textAlign: 'center',
    color: '#fff',
    fontSize: 15,
    fontWeight: '600',
  },
  topActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 18,
  },
  bottomBar: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    paddingTop: 14,
    paddingHorizontal: 18,
    backgroundColor: 'rgba(8,8,10,0.92)',
  },
  progressTrack: {
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(255,255,255,0.18)',
    justifyContent: 'center',
  },
  progressFill: {
    height: 4,
    borderRadius: 2,
    backgroundColor: '#2FD3B6',
  },
  bottomRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 16,
  },
  modePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 6,
  },
  modePillText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '600',
  },
  counter: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  sheetBackdrop: {
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
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 18,
    paddingTop: 4,
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
  modeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 14,
    paddingHorizontal: 8,
    borderRadius: 10,
  },
});
