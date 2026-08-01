import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
  withTiming,
  runOnJS,
  cancelAnimation,
} from 'react-native-reanimated';
import { getEngine } from '../engine';
import { loadPages } from '../engine/pageCache';
import { recordProgress, recordRead } from '../library/history';
import { recordChapterProgress, setChaptersRead } from '../library/chapterProgress';
import {
  buildReaderItems,
  indexOfPage,
  insertChapter,
  neighboursOf,
  toReadingOrder,
  type LoadedChapter,
  type ReaderItem,
} from '../reader/chapterWindow';
import {
  getDownloadEntry,
  useDownloadsHydrated,
  enqueueDownload,
  type DownloadStatus,
} from '../library/downloads';
import { Icon, type IconName } from '../components/Icon';
import { PageSlider } from '../components/PageSlider';
import { useTheme } from '../theme/ThemeProvider';
import { useCoverAccent, useTitleTheme } from '../theme/coverAccent';
import {
  READER_MODES,
  useReaderMode,
  setReaderMode,
  isHorizontal,
  isPaged,
  useReaderToggles,
  setReaderToggle,
  type ReaderMode,
} from '../reader/readerSettings';
import type { RootStackParamList } from '../navigation/types';
import type { ChapterDto, ImageFileDto, ImageTileDto, MangaDto, PageDto } from '../engine/types';

function notify(message: string): void {
  ToastAndroid.show(message, ToastAndroid.SHORT);
}

// Zoom tuning: a sane max pinch scale and a fixed double-tap step.
const MAX_SCALE = 4;
const DOUBLE_TAP_SCALE = 2.5;

function clamp(value: number, min: number, max: number): number {
  'worklet';
  return value < min ? min : value > max ? max : value;
}

type Nav = NativeStackNavigationProp<RootStackParamList>;
type ReaderRoute = RouteProp<RootStackParamList, 'Reader'>;
const MAX_IMAGE_FETCHES = 1;
const IMAGE_FETCH_RETRIES = 3;
/** Bottom spacer under the webtoon strip so the last page clears the chrome. */
const STRIP_FOOTER_HEIGHT = 80;
/**
 * Height of the panel shown before the first and after the last page of a
 * chapter in strip mode. Tall enough that scrolling through it reads as
 * "continue", rather than something you cross by accident on a fling.
 */
const CHAPTER_TRANSITION_HEIGHT = 260;
const VIEWABILITY_CONFIG = { itemVisiblePercentThreshold: 50 };

let activeImageFetches = 0;
const imageFetchQueue: (() => void)[] = [];

export function ReaderScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<Nav>();
  const { params } = useRoute<ReaderRoute>();
  const { width, height } = useWindowDimensions();
  const engine = getEngine();
  const theme = useTitleTheme();
  const listRef = useRef<FlatList>(null);

  // Open immersive: the page fills the screen and a single tap reveals the
  // top/bottom chrome (tap again to hide).
  const [chrome, setChrome] = useState(false);
  // Per-series reading mode: a manhwa keeps Webtoon, a manga keeps its own
  // paged layout, and brand-new titles inherit the most recent pick.
  const mode = useReaderMode(params.sourceId, params.mangaUrl);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [zoomed, setZoomed] = useState(false);
  // True while two fingers are down: the list must stop scrolling immediately,
  // not only once the pinch ends and `zoomed` lands — otherwise the strip
  // drifts under the fingers for the whole first pinch.
  const [pinching, setPinching] = useState(false);
  // Controlled per-page reload counters so a long-press (or the error Retry
  // button) can force a fresh fetch of a specific page. Keyed by the item key,
  // which is chapter-scoped — page indices repeat across chapters.
  const [reloadTokens, setReloadTokens] = useState<Record<string, number>>({});
  const retryPage = useCallback(
    (key: string) => setReloadTokens(m => ({ ...m, [key]: (m[key] ?? 0) + 1 })),
    [],
  );
  /** Reloads whichever page is currently in view (long-press gesture). */
  const retryCurrentPage = useCallback(() => {
    if (currentRef.current) retryPage(currentRef.current);
  }, [retryPage]);

  const scale = useSharedValue(1);
  const savedScale = useSharedValue(1);
  const tx = useSharedValue(0);
  const ty = useSharedValue(0);
  const savedTx = useSharedValue(0);
  const savedTy = useSharedValue(0);
  // Captured on pinch start so the point under the fingers stays anchored while
  // the scale changes (origin-correct zoom).
  const originX = useSharedValue(0);
  const originY = useSharedValue(0);
  const baseX = useSharedValue(0);
  const baseY = useSharedValue(0);

  // Key of the furthest visible page. Read through a callback rather than
  // handed to the gesture directly: a ref captured inside a worklet gets frozen
  // by Reanimated, and writing to it afterwards warns on every scroll.
  const currentRef = useRef('');

  const resetZoom = useCallback(() => {
    scale.value = withTiming(1);
    savedScale.value = 1;
    tx.value = withTiming(0);
    ty.value = withTiming(0);
    savedTx.value = 0;
    savedTy.value = 0;
    setZoomed(false);
  }, [scale, savedScale, tx, ty, savedTx, savedTy]);

  const downloadsHydrated = useDownloadsHydrated();
  const toggles = useReaderToggles();

  // Keep the title's cover accent applied while reading, so the chrome matches
  // the series rather than snapping back to the app default.
  useCoverAccent(params.sourceId, params.mangaThumbnailUrl, true);

  // Hold the screen awake while reading. Always cleared on unmount, including
  // when the setting is turned off mid-chapter, so the flag can't leak into the
  // rest of the app.
  useEffect(() => {
    if (!toggles.keepScreenOn) return;
    void engine.setKeepScreenOn(true);
    return () => {
      void engine.setKeepScreenOn(false);
    };
  }, [toggles.keepScreenOn, engine]);

  // Reading order for the whole series, so the window knows what sits either
  // side of the chapter being read.
  const orderedChapters = useMemo(() => toReadingOrder(params.chapters ?? []), [params.chapters]);

  // The loaded window. Several chapters are kept resolved at once and flattened
  // into one list, so reading across a boundary is plain scrolling rather than
  // a screen change. See `reader/chapterWindow.ts`.
  const [loadedChapters, setLoadedChapters] = useState<LoadedChapter[]>([]);
  const [activeUrl, setActiveUrl] = useState(params.chapter.url);
  const [activePage, setActivePage] = useState(Math.max(0, params.initialPage ?? 0));
  const [loadError, setLoadError] = useState<string | null>(null);
  const inFlight = useRef(new Set<string>());

  /**
   * Resolves a chapter's pages and slots it into the window. Downloaded
   * chapters read from local storage; everything else goes to the source.
   */
  const ensureChapter = useCallback(
    async (chapter: ChapterDto | undefined) => {
      if (!chapter || !downloadsHydrated) return;
      const url = chapter.url;
      if (inFlight.current.has(url)) return;
      inFlight.current.add(url);
      try {
        const entry = getDownloadEntry(params.sourceId, url);
        const offlineCount = entry?.status === 'done' ? entry.pageCount : 0;
        const pages =
          offlineCount > 0
            ? Array.from({ length: offlineCount }, (_, i) => ({ index: i }))
            : await loadPages(params.sourceId, url);
        setLoadedChapters(prev =>
          insertChapter(prev, { chapter, pages, offline: offlineCount > 0 }, orderedChapters),
        );
      } catch (e) {
        // Only the chapter the reader was opened on is worth surfacing; a
        // failed preload of a neighbour just means its transition panel stays.
        if (url === params.chapter.url) {
          setLoadError(e instanceof Error ? e.message : 'Could not load this chapter');
        }
      } finally {
        inFlight.current.delete(url);
      }
    },
    [downloadsHydrated, engine, orderedChapters, params.sourceId, params.chapter.url],
  );

  // Open on the requested chapter, then keep its neighbours warm. Preloading is
  // what removes the transition panel at the boundary: by the time the last
  // page is on screen the next chapter is already part of the list.
  useEffect(() => {
    void ensureChapter(params.chapter);
  }, [ensureChapter, params.chapter]);

  useEffect(() => {
    if (loadedChapters.length === 0) return;
    const { prev, next } = neighboursOf(orderedChapters, activeUrl);
    void ensureChapter(next);
    void ensureChapter(prev);
  }, [activeUrl, loadedChapters.length, orderedChapters, ensureChapter]);

  const items = useMemo(
    () => buildReaderItems(loadedChapters, orderedChapters),
    [loadedChapters, orderedChapters],
  );

  const activeChapter = useMemo(
    () => loadedChapters.find(l => l.chapter.url === activeUrl)?.chapter ?? params.chapter,
    [loadedChapters, activeUrl, params.chapter],
  );
  const activeEntry = loadedChapters.find(l => l.chapter.url === activeUrl);
  const total = activeEntry?.pages.length ?? 0;
  const current = activePage;
  const loading = loadedChapters.length === 0 && !loadError;
  const error = loadError;
  const horizontal = isHorizontal(mode);
  const paged = isPaged(mode);
  const inverted = mode === 'rtl';

  const toggleChrome = useCallback(() => setChrome(c => !c), []);

  // Manual Cloudflare clearance: open the manga page in the in-app WebView (it
  // shares the engine's cookie jar) so the user can solve a challenge by hand.
  const onOpenInWebView = useCallback(async () => {
    try {
      const url = await engine.getMangaWebUrl(params.sourceId, params.mangaUrl);
      if (!url) {
        notify('No web address for this source');
        return;
      }
      await engine.openInWebView(url);
    } catch (e) {
      notify(e instanceof Error ? e.message : 'Could not open the page');
    }
  }, [engine, params.sourceId, params.mangaUrl]);

  // Resolve the current page to a local file:// uri (cache-backed, so this is
  // cheap once the page has rendered) for the save/share actions.
  const resolveCurrentUri = useCallback(async (): Promise<string | null> => {
    const page = activeEntry?.pages[current];
    if (!page) return null;
    try {
      const image = activeEntry?.offline
        ? await engine.fetchDownloadedImage(params.sourceId, activeUrl, page.index)
        : await engine.fetchImage(params.sourceId, page);
      return image.uri;
    } catch {
      return null;
    }
  }, [activeEntry, current, engine, params.sourceId, activeUrl]);

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
      title: params.mangaTitle ?? activeChapter.name,
      thumbnailUrl: params.mangaThumbnailUrl,
      genres: [],
      status: 'unknown',
      initialized: false,
    };
    enqueueDownload(manga, activeChapter);
    notify('Chapter queued for download');
  }, [params, activeChapter]);

  // Track the FURTHEST visible page, not the topmost: at the bottom of a
  // webtoon strip the previous page still occupies the top of the viewport, so
  // the topmost index would stop at N-1 and the chapter would never read out.
  //
  // The list spans several chapters, so this also decides which chapter is
  // "current" — that is the only thing a boundary changes now.
  const itemsRef = useRef<ReaderItem[]>([]);
  itemsRef.current = items;
  const activeRef = useRef({ url: activeUrl, page: activePage });
  activeRef.current = { url: activeUrl, page: activePage };

  const onViewable = useRef(({ viewableItems }: { viewableItems: ViewToken[] }) => {
    let furthest: ReaderItem | null = null;
    let furthestIndex = -1;
    for (const v of viewableItems) {
      if (v.index == null || v.index <= furthestIndex) continue;
      const item = itemsRef.current[v.index];
      if (item?.kind !== 'page') continue;
      furthest = item;
      furthestIndex = v.index;
    }
    if (!furthest) return;

    const prevUrl = activeRef.current.url;
    if (furthest.chapter.url !== prevUrl) {
      // Moving forward past a chapter means it was read to the end — the last
      // page may be taller than the viewport and never cross the visibility
      // threshold on its own.
      const order = itemsRef.current;
      const leavingForward =
        order.findIndex(i => i.kind === 'page' && i.chapter.url === prevUrl) <
        order.findIndex(i => i.kind === 'page' && i.chapter.url === furthest!.chapter.url);
      if (leavingForward) setChaptersRead(furthest.chapter.sourceId, [prevUrl], true);
      setActiveUrl(furthest.chapter.url);
    }
    setActivePage(furthest.pageIndex);
    currentRef.current = furthest.key;
  }).current;

  const { prev: prevChapter, next: nextChapter } = useMemo(
    () => neighboursOf(orderedChapters, activeUrl),
    [orderedChapters, activeUrl],
  );

  // Persist reading progress (furthest page) — debounced while reading, then
  // flushed on exit. Works for any source, library or not.
  const progressRef = useRef({ url: activeUrl, page: 0, total: 0 });
  useEffect(() => {
    if (total <= 0) return;
    progressRef.current = { url: activeUrl, page: current + 1, total };
    const t = setTimeout(() => {
      recordProgress(params.sourceId, params.mangaUrl, current + 1, total);
      recordChapterProgress(params.sourceId, activeUrl, current + 1, total);
    }, 600);
    return () => clearTimeout(t);
  }, [current, total, activeUrl, params.sourceId, params.mangaUrl]);

  useEffect(() => {
    return () => {
      const { url, page, total: t } = progressRef.current;
      if (t > 0) {
        recordProgress(params.sourceId, params.mangaUrl, page, t);
        recordChapterProgress(params.sourceId, url, page, t);
      }
    };
  }, [params.sourceId, params.mangaUrl]);

  /** Scrolls to a page of the active chapter (used by the slider). */
  const goToPage = useCallback(
    (index: number) => {
      const clamped = Math.max(0, Math.min(index, total - 1));
      setActivePage(clamped);
      const target = indexOfPage(items, activeUrl, clamped);
      if (target < 0) return;
      try {
        listRef.current?.scrollToIndex({ index: target, animated: false });
      } catch {
        // onScrollToIndexFailed handles the rare miss.
      }
    },
    [total, items, activeUrl],
  );

  // Live scrub: paged modes jump per page (snappy); the webtoon strip commits on
  // release to avoid thrashing the variable-height list mid-drag.
  const onSliderSeek = useCallback(
    (index: number) => {
      if (paged) goToPage(index);
    },
    [paged, goToPage],
  );
  const onSliderSeekEnd = useCallback((index: number) => goToPage(index), [goToPage]);

  /**
   * Jumps to another chapter without leaving the screen: load it if needed,
   * then scroll to it in the shared list. Used by the prev/next chrome buttons
   * and the transition panels.
   */
  const openChapter = useCallback(
    async (chapter?: ChapterDto, startAtEnd = false) => {
      if (!chapter) return;
      recordRead(
        {
          sourceId: params.sourceId,
          url: params.mangaUrl,
          title: params.mangaTitle ?? chapter.name,
          thumbnailUrl: params.mangaThumbnailUrl,
          genres: [],
          status: 'unknown',
          initialized: false,
        },
        chapter,
      );
      await ensureChapter(chapter);
      pendingJump.current = { url: chapter.url, atEnd: startAtEnd };
    },
    [ensureChapter, params.sourceId, params.mangaUrl, params.mangaTitle, params.mangaThumbnailUrl],
  );

  // A jump can only be performed once the target's pages are in `items`, which
  // is a render later than the load resolving.
  const pendingJump = useRef<{ url: string; atEnd: boolean } | null>(null);
  useEffect(() => {
    const jump = pendingJump.current;
    if (!jump) return;
    const entry = loadedChapters.find(l => l.chapter.url === jump.url);
    if (!entry || entry.pages.length === 0) return;
    pendingJump.current = null;
    const page = jump.atEnd ? entry.pages.length - 1 : 0;
    const target = indexOfPage(items, jump.url, page);
    if (target < 0) return;
    setActiveUrl(jump.url);
    setActivePage(page);
    requestAnimationFrame(() => {
      try {
        listRef.current?.scrollToIndex({ index: target, animated: false });
      } catch {
        // onScrollToIndexFailed recovers.
      }
    });
  }, [loadedChapters, items]);

  // Resume: position on the requested page once the opening chapter is in.
  const resumed = useRef(false);
  useEffect(() => {
    const wanted = params.startAtEnd ? -1 : params.initialPage ?? 0;
    if (resumed.current || items.length === 0) return;
    const entry = loadedChapters.find(l => l.chapter.url === params.chapter.url);
    if (!entry || entry.pages.length === 0) return;
    resumed.current = true;
    const page = wanted < 0 ? entry.pages.length - 1 : Math.min(wanted, entry.pages.length - 1);
    const target = indexOfPage(items, params.chapter.url, page);
    if (target <= 0) return;
    setActivePage(page);
    requestAnimationFrame(() => {
      try {
        listRef.current?.scrollToIndex({ index: target, animated: false });
      } catch {
        // onScrollToIndexFailed recovers.
      }
    });
  }, [items, loadedChapters, params.chapter.url, params.initialPage, params.startAtEnd]);

  const renderItem = useCallback(
    ({ item }: { item: ReaderItem }) =>
      item.kind === 'transition' ? (
        <ChapterTransition
          direction={item.direction}
          from={item.from}
          to={item.to}
          // In a paged viewer every cell must be one screen tall or
          // getItemLayout's uniform maths breaks.
          height={paged ? height : CHAPTER_TRANSITION_HEIGHT}
          onPress={() => void openChapter(item.to, item.direction === 'prev')}
        />
      ) : (
        <ReaderPage
          sourceId={params.sourceId}
          chapterUrl={item.chapter.url}
          downloaded={item.offline}
          page={item.page}
          width={width}
          screenHeight={height}
          layout={paged ? 'page' : 'strip'}
          reloadToken={reloadTokens[item.key] ?? 0}
          onRetry={() => retryPage(item.key)}
          onOpenWebView={onOpenInWebView}
        />
      ),
    [
      params.sourceId,
      openChapter,
      width,
      height,
      paged,
      reloadTokens,
      retryPage,
      onOpenInWebView,
    ],
  );

  // Reset zoom when switching reading modes (the list remounts via key).
  useEffect(() => {
    resetZoom();
  }, [mode, resetZoom]);

  const zoomStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: tx.value }, { translateY: ty.value }, { scale: scale.value }],
  }));

  // Pinch anchors on the focal point, pan/scale stay clamped to the content
  // bounds, and double-tap zooms toward the tapped point. The gesture is
  // memoised and the `zoomed` flag only flips when a gesture *ends*, so the
  // handlers never rebuild mid-pinch (the previous cause of the jank).
  const cx = width / 2;
  const cy = height / 2;
  const gesture = useMemo(() => {
    const pinch = Gesture.Pinch()
      .onTouchesDown(e => {
        if (e.numberOfTouches >= 2) {
          runOnJS(setPinching)(true);
        }
      })
      .onStart(e => {
        // A reset animation may still be in flight; anchor the pinch on the
        // live values so the scale doesn't jump at first movement.
        cancelAnimation(scale);
        cancelAnimation(tx);
        cancelAnimation(ty);
        savedScale.value = scale.value;
        savedTx.value = tx.value;
        savedTy.value = ty.value;
        originX.value = e.focalX;
        originY.value = e.focalY;
        baseX.value = (e.focalX - cx - savedTx.value) / savedScale.value;
        baseY.value = (e.focalY - cy - savedTy.value) / savedScale.value;
      })
      .onUpdate(e => {
        const s = clamp(savedScale.value * e.scale, 1, MAX_SCALE);
        const mx = ((s - 1) * width) / 2;
        const my = ((s - 1) * height) / 2;
        scale.value = s;
        tx.value = clamp(originX.value - cx - baseX.value * s, -mx, mx);
        ty.value = clamp(originY.value - cy - baseY.value * s, -my, my);
      })
      .onEnd(() => {
        if (scale.value <= 1.01) {
          scale.value = withTiming(1);
          tx.value = withTiming(0);
          ty.value = withTiming(0);
          savedScale.value = 1;
          savedTx.value = 0;
          savedTy.value = 0;
          runOnJS(setZoomed)(false);
        } else {
          savedScale.value = scale.value;
          savedTx.value = tx.value;
          savedTy.value = ty.value;
          runOnJS(setZoomed)(true);
        }
      })
      .onFinalize(() => {
        runOnJS(setPinching)(false);
      });

    const pan = Gesture.Pan()
      .enabled(zoomed)
      .onUpdate(e => {
        const mx = ((scale.value - 1) * width) / 2;
        const my = ((scale.value - 1) * height) / 2;
        tx.value = clamp(savedTx.value + e.translationX, -mx, mx);
        ty.value = clamp(savedTy.value + e.translationY, -my, my);
      })
      .onEnd(() => {
        savedTx.value = tx.value;
        savedTy.value = ty.value;
      });

    const doubleTap = Gesture.Tap()
      .numberOfTaps(2)
      .maxDuration(260)
      .onEnd(e => {
        if (scale.value > 1.01) {
          scale.value = withTiming(1);
          tx.value = withTiming(0);
          ty.value = withTiming(0);
          savedScale.value = 1;
          savedTx.value = 0;
          savedTy.value = 0;
          runOnJS(setZoomed)(false);
        } else {
          const s = DOUBLE_TAP_SCALE;
          const mx = ((s - 1) * width) / 2;
          const my = ((s - 1) * height) / 2;
          const nx = clamp((e.x - cx) * (1 - s), -mx, mx);
          const ny = clamp((e.y - cy) * (1 - s), -my, my);
          scale.value = withTiming(s);
          tx.value = withTiming(nx);
          ty.value = withTiming(ny);
          savedScale.value = s;
          savedTx.value = nx;
          savedTy.value = ny;
          runOnJS(setZoomed)(true);
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
        runOnJS(retryCurrentPage)();
      });

    // Pinch + pan run together; the tap family stays in its own Exclusive so the
    // single/double-tap disambiguation survives.
    return Gesture.Race(
      Gesture.Simultaneous(pinch, pan),
      Gesture.Exclusive(doubleTap, singleTap, longPress),
    );
  }, [
    zoomed, cx, cy, width, height, toggleChrome, retryCurrentPage,
    scale, savedScale, tx, ty, savedTx, savedTy, originX, originY, baseX, baseY,
  ]);

  return (
    <View style={{ flex: 1, backgroundColor: '#000' }}>
      <StatusBar hidden={!chrome} animated />

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator color="#fff" />
        </View>
      ) : error || total === 0 ? (
        <View style={styles.center}>
          <Icon name="globe" size={28} color="rgba(255,255,255,0.5)" />
          <Text style={styles.errorText}>
            {error ? "Couldn't load this chapter" : 'No pages found'}
          </Text>
          <Text style={styles.errorSub}>
            {error
              ? 'The source may be blocked (e.g. Cloudflare) or temporarily down.'
              : 'This chapter appears to be empty.'}
          </Text>
          {error ? (
            <>
              <Pressable
                onPress={onOpenInWebView}
                style={({ pressed }) => [styles.retryBtn, { opacity: pressed ? 0.8 : 1 }]}
              >
                <Icon name="globe" size={15} color="#000" />
                <Text style={styles.retryBtnText}>Open in WebView</Text>
              </Pressable>
              <Text style={[styles.errorSub, { marginTop: 12, paddingHorizontal: 24 }]}>
                Clear the check, then come back and retry. Still blocked? Go back and use
                {' '}Source &rarr; Migrate to another source.
              </Text>
            </>
          ) : null}
          <Pressable hitSlop={8} onPress={() => navigation.goBack()} style={{ marginTop: 14 }}>
            <Text style={styles.errorSub}>Go back</Text>
          </Pressable>
        </View>
      ) : (
        <GestureDetector gesture={gesture}>
          {/* While actively pinching, rasterize the layer so each frame is a
              pure GPU matrix op instead of a full redraw of every visible
              page; drops back off on release so the zoomed page stays sharp. */}
          <Animated.View
            style={[styles.zoomLayer, zoomStyle]}
            renderToHardwareTextureAndroid={pinching}
          >
            <FlatList
              ref={listRef}
              key={mode}
              data={items}
              keyExtractor={i => i.key}
              renderItem={renderItem}
              horizontal={horizontal}
              inverted={inverted}
              pagingEnabled={paged}
              scrollEnabled={!zoomed && !pinching}
              // Detach far-off-screen pages and keep the render window small,
              // or every scrolled-past full-res page stays mounted and drawn
              // and long chapters get progressively laggier.
              removeClippedSubviews
              windowSize={7}
              maxToRenderPerBatch={3}
              initialNumToRender={3}
              showsVerticalScrollIndicator={false}
              showsHorizontalScrollIndicator={false}
              onViewableItemsChanged={onViewable}
              viewabilityConfig={VIEWABILITY_CONFIG}
              scrollEventThrottle={16}
              // Loading an earlier chapter prepends items; without this the
              // content under the reader's finger would jump down by its height.
              maintainVisibleContentPosition={
                paged ? undefined : { minIndexForVisible: 1 }
              }
              getItemLayout={
                paged
                  ? (_, index) => {
                      const size = horizontal ? width : height;
                      return { length: size, offset: size * index, index };
                    }
                  : undefined
              }
              onScrollToIndexFailed={info => {
                // Webtoon has no getItemLayout, so a far jump can miss: approximate
                // by average height, then settle on the exact index once measured.
                const list = listRef.current;
                if (!list) return;
                list.scrollToOffset({
                  offset: info.averageItemLength * info.index,
                  animated: false,
                });
                setTimeout(() => {
                  try {
                    list.scrollToIndex({ index: info.index, animated: false });
                  } catch {
                    // Give up quietly; the user can keep scrolling manually.
                  }
                }, 80);
              }}
              ListFooterComponent={
                paged ? null : <View style={{ height: STRIP_FOOTER_HEIGHT }} />
              }
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
            {activeChapter.name}
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
          <PageSlider
            page={current}
            total={total}
            accent={theme.colors.accent}
            inverted={inverted}
            onSeek={onSliderSeek}
            onSeekEnd={onSliderSeekEnd}
            onPrevChapter={() => void openChapter(prevChapter, true)}
            onNextChapter={() => void openChapter(nextChapter)}
            hasPrev={!!prevChapter}
            hasNext={!!nextChapter}
          />
          <View style={styles.bottomRow}>
            <Pressable hitSlop={10} onPress={() => setSettingsOpen(true)} style={styles.modePill}>
              <Icon name={horizontal ? 'columns' : 'list'} size={16} color="#fff" />
              <Text style={styles.modePillText}>{labelFor(mode)}</Text>
            </Pressable>
          </View>
        </View>
      ) : null}

      <ReaderSettingsSheet
        visible={settingsOpen}
        mode={mode}
        keepScreenOn={toggles.keepScreenOn}
        onToggleKeepScreenOn={() => setReaderToggle('keepScreenOn', !toggles.keepScreenOn)}
        onSelect={m => {
          setReaderMode(m, params.sourceId, params.mangaUrl);
          setSettingsOpen(false);
        }}
        onClose={() => setSettingsOpen(false)}
      />

      <ReaderMenuSheet
        visible={menuOpen}
        downloadStatus={getDownloadEntry(params.sourceId, activeUrl)?.status}
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

/**
 * Panel shown above the first page and below the last page of a chapter in
 * strip mode. Scrolling to the far end of it and releasing moves to that
 * chapter (see `onScrollEndDrag`); tapping does the same for anyone who'd
 * rather not scroll.
 */
function ChapterTransition({
  direction,
  from,
  to,
  height,
  onPress,
}: {
  direction: 'prev' | 'next';
  from: ChapterDto;
  to?: ChapterDto;
  height: number;
  onPress: () => void;
}) {
  const next = direction === 'next';
  // No neighbour means the end of the series in that direction.
  if (!to) {
    return (
      <View style={[styles.transition, { height }]}>
        <Text style={styles.transitionLabel}>
          {next ? 'Last chapter' : 'First chapter'}
        </Text>
        <Text numberOfLines={2} style={styles.transitionHint}>
          {from.name}
        </Text>
      </View>
    );
  }
  return (
    <Pressable onPress={onPress} style={[styles.transition, { height }]}>
      <Icon name={next ? 'chevronDown' : 'chevronRight'} size={22} color="#6d6d6d" />
      <Text style={styles.transitionLabel}>
        {next ? 'Next chapter' : 'Previous chapter'}
      </Text>
      <Text numberOfLines={2} style={styles.transitionName}>
        {to.name}
      </Text>
      <Text style={styles.transitionHint}>Loading\u2026</Text>
    </Pressable>
  );
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
  onOpenWebView,
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
  onOpenWebView: () => void;
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
          <ReaderImageError message={loadError} onRetry={onRetry} onOpenWebView={onOpenWebView} />
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
        <ReaderImageError message={loadError} onRetry={onRetry} onOpenWebView={onOpenWebView} />
      ) : (
        <ActivityIndicator color="#fff" />
      )}
    </View>
  );
}

function ReaderImageError({
  message,
  onRetry,
  onOpenWebView,
}: {
  message: string;
  onRetry: () => void;
  onOpenWebView: () => void;
}) {
  // Cloudflare blocks need a manual clearance, not a plain retry.
  const cloudflare = /cloudflare/i.test(message);
  return (
    <View style={styles.imageError}>
      <Icon name="refresh" size={24} color="rgba(255,255,255,0.55)" />
      <Text style={styles.imageErrorTitle}>Image failed to load</Text>
      <Text style={styles.imageErrorText}>{message}</Text>
      <View style={styles.imageErrorActions}>
        <Pressable
          onPress={onRetry}
          hitSlop={8}
          style={({ pressed }) => [styles.retryBtn, { opacity: pressed ? 0.8 : 1 }]}
        >
          <Icon name="refresh" size={15} color="#000" />
          <Text style={styles.retryBtnText}>Retry</Text>
        </Pressable>
        {cloudflare ? (
          <Pressable
            onPress={onOpenWebView}
            hitSlop={8}
            style={({ pressed }) => [styles.webBtn, { opacity: pressed ? 0.8 : 1 }]}
          >
            <Icon name="globe" size={15} color="#fff" />
            <Text style={styles.webBtnText}>Open in WebView</Text>
          </Pressable>
        ) : null}
      </View>
      {cloudflare ? (
        <Text style={styles.imageErrorHint}>
          Clear the check in the WebView, then Retry. If it stays blocked, go back and migrate
          this title to another source.
        </Text>
      ) : null}
    </View>
  );
}

function sortTiles(image: ImageFileDto): ImageTileDto[] {
  return [...(image.tiles ?? [])].sort((a, b) => a.index - b.index);
}

function ReaderSettingsSheet({
  visible,
  mode,
  keepScreenOn,
  onToggleKeepScreenOn,
  onSelect,
  onClose,
}: {
  visible: boolean;
  mode: ReaderMode;
  keepScreenOn: boolean;
  onToggleKeepScreenOn: () => void;
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

        <Text
          style={[
            theme.typography.heading,
            { color: theme.colors.text, marginTop: 18, marginBottom: 6 },
          ]}
        >
          Behaviour
        </Text>
        <Pressable
          onPress={onToggleKeepScreenOn}
          style={({ pressed }) => [
            styles.modeRow,
            { backgroundColor: pressed ? theme.colors.surface : 'transparent' },
          ]}
        >
          <View style={{ flex: 1 }}>
            <Text style={[theme.typography.bodyStrong, { color: theme.colors.text }]}>
              Keep screen on
            </Text>
            <Text style={{ color: theme.colors.textMuted, fontSize: 12.5, marginTop: 2 }}>
              Stop the display sleeping while the reader is open
            </Text>
          </View>
          <View
            style={[
              styles.toggle,
              {
                backgroundColor: keepScreenOn ? theme.colors.accent : theme.colors.surface,
                borderColor: keepScreenOn ? theme.colors.accent : theme.colors.border,
              },
            ]}
          >
            <View
              style={[
                styles.toggleKnob,
                {
                  backgroundColor: keepScreenOn ? theme.colors.onAccent : theme.colors.textFaint,
                  alignSelf: keepScreenOn ? 'flex-end' : 'flex-start',
                },
              ]}
            />
          </View>
        </Pressable>
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
  toggle: {
    width: 44,
    height: 26,
    borderRadius: 999,
    borderWidth: StyleSheet.hairlineWidth,
    padding: 3,
    justifyContent: 'center',
  },
  toggleKnob: {
    width: 20,
    height: 20,
    borderRadius: 10,
  },
  transition: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingHorizontal: 32,
    backgroundColor: '#000',
  },
  transitionLabel: {
    color: '#8a8a8a',
    fontSize: 11.5,
    fontWeight: '800',
    letterSpacing: 1.1,
    textTransform: 'uppercase',
  },
  transitionName: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '700',
    textAlign: 'center',
  },
  transitionHint: {
    color: '#6d6d6d',
    fontSize: 12,
    marginTop: 2,
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
  imageErrorActions: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    marginTop: 16,
    flexWrap: 'wrap',
  },
  imageErrorHint: {
    color: 'rgba(255,255,255,0.45)',
    fontSize: 11.5,
    lineHeight: 16,
    marginTop: 14,
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
  webBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    marginTop: 16,
    paddingHorizontal: 18,
    height: 40,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.4)',
  },
  webBtnText: {
    color: '#fff',
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
  bottomRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 14,
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
