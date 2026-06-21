import React, { useCallback, useRef, useState } from 'react';
import {
  View,
  Text,
  Image,
  FlatList,
  Pressable,
  StyleSheet,
  useWindowDimensions,
  StatusBar,
  ViewToken,
} from 'react-native';
import { BlurView } from '@react-native-community/blur';
import LinearGradient from 'react-native-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { useAnimatedStyle, withTiming } from 'react-native-reanimated';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useAsync } from '../hooks/useAsync';
import { getEngine } from '../engine';
import { Icon } from '../components/Icon';
import type { RootStackParamList } from '../navigation/types';
import type { PageDto } from '../engine/types';

type Nav = NativeStackNavigationProp<RootStackParamList>;
type ReaderRoute = RouteProp<RootStackParamList, 'Reader'>;

export function ReaderScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<Nav>();
  const { params } = useRoute<ReaderRoute>();
  const { width } = useWindowDimensions();
  const engine = getEngine();

  const [chrome, setChrome] = useState(true);
  const [current, setCurrent] = useState(0);

  const { data: pages } = useAsync<PageDto[]>(
    () => engine.getPages(params.sourceId, params.chapter.url),
    [params.chapter.url],
  );

  const total = pages?.length ?? 0;

  const onViewable = useRef(({ viewableItems }: { viewableItems: ViewToken[] }) => {
    const first = viewableItems[0];
    if (first?.index != null) setCurrent(first.index);
  }).current;

  const chromeStyle = useAnimatedStyle(() => ({ opacity: withTiming(chrome ? 1 : 0, { duration: 180 }) }));

  const renderPage = useCallback(
    ({ item }: { item: PageDto }) => <ReaderPage page={item} width={width} />,
    [width],
  );

  return (
    <View style={{ flex: 1, backgroundColor: '#000' }}>
      <StatusBar hidden={!chrome} />

      <Pressable style={StyleSheet.absoluteFill} onPress={() => setChrome(c => !c)}>
        <FlatList
          data={pages ?? []}
          keyExtractor={p => String(p.index)}
          renderItem={renderPage}
          showsVerticalScrollIndicator={false}
          onViewableItemsChanged={onViewable}
          viewabilityConfig={{ itemVisiblePercentThreshold: 50 }}
          ListFooterComponent={<View style={{ height: 80 }} />}
        />
      </Pressable>

      {/* Top glass bar */}
      <Animated.View style={[styles.topBar, chromeStyle]} pointerEvents={chrome ? 'auto' : 'none'}>
        <BlurView style={StyleSheet.absoluteFill} blurType="dark" blurAmount={18} />
        <LinearGradient colors={['rgba(0,0,0,0.5)', 'transparent']} style={StyleSheet.absoluteFill} />
        <View style={[styles.topRow, { paddingTop: insets.top + 6 }]}>
          <Pressable hitSlop={10} onPress={() => navigation.goBack()}>
            <Icon name="back" size={24} color="#fff" />
          </Pressable>
          <Text numberOfLines={1} style={styles.chapterTitle}>
            {params.chapter.name}
          </Text>
          <Pressable hitSlop={10}>
            <Icon name="settings" size={22} color="#fff" />
          </Pressable>
        </View>
      </Animated.View>

      {/* Bottom glass bar */}
      <Animated.View
        style={[styles.bottomBar, { paddingBottom: insets.bottom + 10 }, chromeStyle]}
        pointerEvents={chrome ? 'auto' : 'none'}
      >
        <BlurView style={StyleSheet.absoluteFill} blurType="dark" blurAmount={18} />
        <View style={styles.progressTrack}>
          <LinearGradient
            colors={['#0FA68C', '#2FD3B6']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={[
              styles.progressFill,
              { width: total ? `${((current + 1) / total) * 100}%` : '0%' },
            ]}
          />
          <View
            style={[
              styles.handle,
              { left: total ? `${((current + 1) / total) * 100}%` : '0%' },
            ]}
          />
        </View>
        <View style={styles.bottomRow}>
          <Icon name="back" size={20} color="#fff" />
          <Text style={styles.counter}>
            {total ? current + 1 : 0} / {total}
          </Text>
          <Icon name="columns" size={20} color="#fff" />
          <Icon name="sun" size={20} color="#fff" />
        </View>
      </Animated.View>
    </View>
  );
}

function ReaderPage({ page, width }: { page: PageDto; width: number }) {
  // Mock pages are 800x1200 (ratio 1.5). Real pages would carry dimensions.
  const [ratio, setRatio] = useState(1.5);
  const uri = page.imageUrl ?? page.url;
  if (!uri) return null;
  return (
    <Image
      source={{ uri }}
      style={{ width, height: width * ratio, backgroundColor: '#0a0a0a' }}
      resizeMode="contain"
      onLoad={e => {
        const { width: w, height: h } = e.nativeEvent.source;
        if (w && h) setRatio(h / w);
      }}
    />
  );
}

const styles = StyleSheet.create({
  topBar: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    overflow: 'hidden',
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingBottom: 12,
    gap: 12,
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
    overflow: 'hidden',
    paddingTop: 14,
    paddingHorizontal: 18,
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
  },
  handle: {
    position: 'absolute',
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: '#fff',
    marginLeft: -7,
  },
  bottomRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 16,
  },
  counter: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
});
