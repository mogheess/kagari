import React, { useCallback, useState } from 'react';
import { View, Text, ScrollView, Pressable, StyleSheet, RefreshControl } from 'react-native';
import { BlurView } from '@react-native-community/blur';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useTheme } from '../theme/ThemeProvider';
import { useHomeConfig } from '../home/HomeConfig';
import { useTabNav } from '../navigation/TabNav';
import { HomeBlockView } from '../components/HomeBlockView';
import { Icon } from '../components/Icon';
import { useAsync } from '../hooks/useAsync';
import { getEngine } from '../engine';
import { useAppUpdate } from '../app/appUpdate';
import { useExtensionUpdates } from '../sources/extensionUpdates';
import type { RootStackParamList } from '../navigation/types';
import type { MangaDto, SourceDto } from '../engine/types';

type Nav = NativeStackNavigationProp<RootStackParamList>;

const TAB_BAR_SPACE = 110;

export function HomeScreen() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<Nav>();
  const { blocks } = useHomeConfig();
  const { navigateTab } = useTabNav();
  const engine = getEngine();

  const openManga = (m: MangaDto) =>
    navigation.navigate('MangaDetail', { sourceId: m.sourceId, mangaUrl: m.url, preview: m });

  const enabled = blocks.filter(b => b.enabled);
  const { data: sources, loading, reload } = useAsync<SourceDto[]>(() => engine.listSources(), []);
  const hasSources = (sources?.length ?? 0) > 0;

  const appUpdate = useAppUpdate();
  const extUpdates = useExtensionUpdates();
  const hasUpdates = appUpdate.available || extUpdates.length > 0;

  // Measured so the scroll content starts exactly beneath the floating header.
  const [headerHeight, setHeaderHeight] = useState(insets.top + 80);

  const [refreshing, setRefreshing] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const onRefresh = useCallback(() => {
    setRefreshing(true);
    setRefreshKey(k => k + 1);
    reload();
    // Rails reload independently; give them a beat, then release the spinner.
    setTimeout(() => setRefreshing(false), 900);
  }, [reload]);

  return (
    <View style={{ flex: 1, backgroundColor: theme.colors.bg }}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{
          paddingTop: headerHeight + theme.spacing.md,
          paddingBottom: TAB_BAR_SPACE,
        }}
        scrollIndicatorInsets={{ top: headerHeight }}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={theme.colors.accent}
            colors={[theme.colors.accent]}
            progressViewOffset={headerHeight + 8}
          />
        }
      >
        {!loading && !hasSources ? (
          <HomeEmptyState onBrowse={() => navigation.navigate('Extensions')} />
        ) : (
          enabled.map(block => (
            <HomeBlockView
              key={block.id}
              block={block}
              sources={sources ?? []}
              onOpenManga={openManga}
              refreshKey={refreshKey}
            />
          ))
        )}
      </ScrollView>

      {/* Floating frosted header — always-on glass blur, full width, square,
          no edge outline. */}
      <View
        style={styles.headerOverlay}
        onLayout={e => setHeaderHeight(e.nativeEvent.layout.height)}
      >
        <BlurView
          style={StyleSheet.absoluteFill}
          blurType={theme.scheme === 'dark' ? 'dark' : 'light'}
          blurAmount={20}
          reducedTransparencyFallbackColor={theme.colors.bg}
        />
        <View style={[StyleSheet.absoluteFill, { backgroundColor: theme.colors.glass }]} />
        <View
          style={[
            styles.headerContent,
            { paddingTop: insets.top + 10, paddingHorizontal: theme.spacing.lg },
          ]}
        >
          <View>
            <Text style={[styles.greeting, { color: theme.colors.textMuted }]}>Good evening</Text>
            <Text style={[theme.typography.title, { color: theme.colors.text }]}>Home</Text>
          </View>
          <View style={styles.actions}>
            <Pressable
              hitSlop={8}
              onPress={() => navigation.navigate('CustomizeHome')}
              style={[styles.iconBtn, { borderColor: theme.colors.border }]}
            >
              <Icon name="grid" size={19} color={theme.colors.text} />
            </Pressable>
            <Pressable
              hitSlop={8}
              onPress={() => navigateTab('profile')}
              style={[styles.iconBtn, { borderColor: theme.colors.border }]}
            >
              <Icon name="settings" size={19} color={theme.colors.text} />
              {hasUpdates ? (
                <View
                  style={[styles.updateDot, { backgroundColor: theme.colors.accent, borderColor: theme.colors.bg }]}
                />
              ) : null}
            </Pressable>
          </View>
        </View>
      </View>
    </View>
  );
}

function HomeEmptyState({ onBrowse }: { onBrowse: () => void }) {
  const theme = useTheme();
  return (
    <View style={{ paddingHorizontal: theme.spacing.lg, paddingTop: 32 }}>
      <View style={[styles.emptyCard, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border }]}>
        <View style={[styles.emptyIcon, { backgroundColor: theme.colors.elevated }]}>
          <Icon name="book" size={26} color={theme.colors.accent} />
        </View>
        <Text style={[theme.typography.heading, { color: theme.colors.text, marginTop: 16 }]}>
          Your library is empty
        </Text>
        <Text
          style={{
            color: theme.colors.textMuted,
            fontSize: 13.5,
            lineHeight: 20,
            textAlign: 'center',
            marginTop: 6,
          }}
        >
          Add an extension and pick a source, then the manga you read and follow will show up here.
        </Text>
        <Pressable onPress={onBrowse} style={[styles.emptyPrimary, { backgroundColor: theme.colors.accent }]}>
          <Icon name="plus" size={16} color={theme.colors.onAccent} />
          <Text style={{ color: theme.colors.onAccent, fontWeight: '700' }}>Browse extensions</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  headerOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    overflow: 'hidden',
  },
  headerContent: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    paddingBottom: 14,
  },
  greeting: {
    fontSize: 13,
    marginBottom: 2,
  },
  actions: {
    flexDirection: 'row',
    gap: 10,
  },
  iconBtn: {
    width: 38,
    height: 38,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: StyleSheet.hairlineWidth,
  },
  updateDot: {
    position: 'absolute',
    top: 7,
    right: 7,
    width: 9,
    height: 9,
    borderRadius: 999,
    borderWidth: 1.5,
  },
  emptyCard: {
    borderRadius: 22,
    borderWidth: StyleSheet.hairlineWidth,
    paddingVertical: 30,
    paddingHorizontal: 24,
    alignItems: 'center',
  },
  emptyIcon: {
    width: 60,
    height: 60,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyPrimary: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 20,
    height: 46,
    borderRadius: 14,
    marginTop: 22,
  },
});
