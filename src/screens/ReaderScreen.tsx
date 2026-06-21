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
  ViewToken,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useAsync } from '../hooks/useAsync';
import { getEngine } from '../engine';
import { Icon } from '../components/Icon';
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
import type { ImageFileDto, ImageTileDto, PageDto } from '../engine/types';

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

  const { data: pages, loading, error } = useAsync<PageDto[]>(
    () => engine.getPages(params.sourceId, params.chapter.url),
    [params.chapter.url],
  );

  const total = pages?.length ?? 0;
  const horizontal = isHorizontal(mode);
  const paged = isPaged(mode);
  const inverted = mode === 'rtl';

  const toggleChrome = useCallback(() => setChrome(c => !c), []);

  const onViewable = useRef(({ viewableItems }: { viewableItems: ViewToken[] }) => {
    const first = viewableItems[0];
    if (first?.index != null) setCurrent(first.index);
  }).current;

  const renderPage = useCallback(
    ({ item }: { item: PageDto }) => (
      <ReaderPage
        sourceId={params.sourceId}
        page={item}
        width={width}
        screenHeight={height}
        layout={paged ? 'page' : 'strip'}
        onPress={toggleChrome}
      />
    ),
    [params.sourceId, width, height, paged, toggleChrome],
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
        <FlatList
          key={mode}
          data={pages ?? []}
          keyExtractor={p => String(p.index)}
          renderItem={renderPage}
          horizontal={horizontal}
          inverted={inverted}
          pagingEnabled={paged}
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
      )}

      {/* Top bar */}
      {chrome ? (
        <View style={[styles.topBar, { paddingTop: insets.top + 6 }]}>
          <Pressable hitSlop={10} onPress={() => navigation.goBack()}>
            <Icon name="back" size={24} color="#fff" />
          </Pressable>
          <Text numberOfLines={1} style={styles.chapterTitle}>
            {params.chapter.name}
          </Text>
          <Pressable hitSlop={10} onPress={() => setSettingsOpen(true)}>
            <Icon name="settings" size={22} color="#fff" />
          </Pressable>
        </View>
      ) : null}

      {/* Bottom bar */}
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
    </View>
  );
}

function labelFor(mode: ReaderMode): string {
  return READER_MODES.find(m => m.mode === mode)?.label ?? mode;
}

function logReaderImage(message: string, details: Record<string, unknown>): void {
  if (!__DEV__) return;
  console.log(`[reader:image] ${message}`, details);
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

function enqueueNativeImageFetch(sourceId: string, page: PageDto): Promise<ImageFileDto> {
  return new Promise((resolve, reject) => {
    const run = () => {
      fetchNativeImageWithRetry(sourceId, page)
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
): Promise<ImageFileDto> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= IMAGE_FETCH_RETRIES; attempt += 1) {
    try {
      return await getEngine().fetchImage(sourceId, page);
    } catch (error) {
      lastError = error;
      logReaderImage('native fetch attempt failed', {
        page: page.index,
        attempt,
        message: error instanceof Error ? error.message : String(error),
        pageUrl: page.url,
        imageUrl: page.imageUrl,
      });
      if (attempt < IMAGE_FETCH_RETRIES) {
        await wait(250 * attempt);
      }
    }
  }
  throw lastError;
}

function ReaderPage({
  sourceId,
  page,
  width,
  screenHeight,
  layout,
  onPress,
}: {
  sourceId: string;
  page: PageDto;
  width: number;
  screenHeight: number;
  layout: 'strip' | 'page';
  onPress: () => void;
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

    enqueueNativeImageFetch(sourceId, page)
      .then(image => {
        const sortedTiles = sortTiles(image);
        logReaderImage('native fetch', {
          page: page.index,
          cached: image.cached,
          bytes: image.bytes,
          nativeWidth: image.width,
          nativeHeight: image.height,
          contentType: image.contentType,
          tiles: sortedTiles.length,
          sourceUrl: image.sourceUrl,
          uri: image.uri,
        });
        if (!cancelled) {
          setUri(image.uri);
          setTiles(sortedTiles);
        }
      })
      .catch(error => {
        const message = error instanceof Error ? error.message : String(error);
        logReaderImage('native fetch failed', {
          page: page.index,
          message,
        });
        if (!cancelled) setLoadError(message);
      });

    return () => {
      cancelled = true;
    };
  }, [page, sourceId]);

  const tileHeight = tiles.length > 0 ? scaledTilesHeight(tiles, width) : 0;

  if (layout === 'page') {
    return (
      <Pressable
        onPress={onPress}
        style={{ width, height: screenHeight, justifyContent: 'center', backgroundColor: '#000' }}
      >
        {uri ? (
          <Image
            source={{ uri }}
            style={{ width, height: screenHeight }}
            resizeMode="contain"
            resizeMethod="scale"
            onLoad={e => {
              const { width: w, height: h } = e.nativeEvent.source;
              logReaderImage('rendered page image', {
                page: page.index,
                layout,
                decodedWidth: w,
                decodedHeight: h,
                viewWidth: width,
                viewHeight: screenHeight,
                uri,
              });
            }}
          />
        ) : loadError ? (
          <ReaderImageError message={loadError} />
        ) : (
          <ActivityIndicator color="#fff" />
        )}
      </Pressable>
    );
  }

  if (tiles.length > 0) {
    return (
      <Pressable
        onPress={onPress}
        style={{ width, backgroundColor: '#0a0a0a' }}
      >
        {tiles.map(tile => {
          const height = Math.max(1, Math.round((width * tile.height) / tile.width));
          return (
            <Image
              key={`${page.index}:${tile.index}`}
              source={{ uri: tile.uri }}
              style={{ width, height }}
              resizeMode="stretch"
              resizeMethod="scale"
              onLoad={e => {
                const { width: w, height: h } = e.nativeEvent.source;
                logReaderImage('rendered tile image', {
                  page: page.index,
                  tile: tile.index,
                  decodedWidth: w,
                  decodedHeight: h,
                  viewWidth: width,
                  viewHeight: height,
                  tileUri: tile.uri,
                  fullUri: uri,
                  totalViewHeight: tileHeight,
                });
              }}
            />
          );
        })}
      </Pressable>
    );
  }

  return (
    <Pressable
      onPress={onPress}
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
            logReaderImage('rendered strip image', {
              page: page.index,
              layout,
              decodedWidth: w,
              decodedHeight: h,
              viewWidth: width,
              viewHeight: width * ratio,
              uri,
            });
            if (w && h) setRatio(h / w);
          }}
        />
      ) : loadError ? (
        <ReaderImageError message={loadError} />
      ) : (
        <ActivityIndicator color="#fff" />
      )}
    </Pressable>
  );
}

function ReaderImageError({ message }: { message: string }) {
  return (
    <View style={styles.imageError}>
      <Text style={styles.imageErrorTitle}>Image failed to load</Text>
      <Text style={styles.imageErrorText}>{message}</Text>
    </View>
  );
}

function sortTiles(image: ImageFileDto): ImageTileDto[] {
  return [...(image.tiles ?? [])].sort((a, b) => a.index - b.index);
}

function scaledTilesHeight(tiles: ImageTileDto[], width: number): number {
  return tiles.reduce((sum, tile) => sum + Math.max(1, Math.round((width * tile.height) / tile.width)), 0);
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

const styles = StyleSheet.create({
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
