import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  Pressable,
  StyleSheet,
  FlatList,
  ActivityIndicator,
  Alert,
  AppState,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { useTheme } from '../theme/ThemeProvider';
import { getEngine } from '../engine';
import { Icon } from '../components/Icon';
import type { AvailableExtensionDto, ExtensionDto, RepoDto } from '../engine/types';

const KEIYOUSHI = 'https://raw.githubusercontent.com/keiyoushi/extensions/repo/index.min.json';

type Tab = 'browse' | 'installed';

export function ExtensionsScreen() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const navigation = useNavigation();
  const engine = getEngine();

  const [tab, setTab] = useState<Tab>('browse');
  const [repos, setRepos] = useState<RepoDto[]>([]);
  const [available, setAvailable] = useState<AvailableExtensionDto[]>([]);
  const [installedExts, setInstalledExts] = useState<ExtensionDto[]>([]);
  const [loadingAvail, setLoadingAvail] = useState(false);
  const [repoError, setRepoError] = useState<string | null>(null);

  const [repoInput, setRepoInput] = useState(KEIYOUSHI);
  const [query, setQuery] = useState('');
  const [debounced, setDebounced] = useState('');
  const [lang, setLang] = useState(''); // '' = all languages
  const [busyPkg, setBusyPkg] = useState<string | null>(null);

  useEffect(() => {
    const t = setTimeout(() => setDebounced(query.trim().toLowerCase()), 250);
    return () => clearTimeout(t);
  }, [query]);

  const refreshInstalled = useCallback(async () => {
    setInstalledExts(await engine.listExtensions());
  }, [engine]);

  const refreshAvailable = useCallback(async () => {
    setLoadingAvail(true);
    setRepoError(null);
    try {
      const list = await engine.getAvailableExtensions();
      setAvailable(list);
    } catch (e) {
      setRepoError(e instanceof Error ? e.message : 'Failed to load repo');
    } finally {
      setLoadingAvail(false);
    }
  }, [engine]);

  const refreshRepos = useCallback(async () => {
    setRepos(await engine.listRepos());
  }, [engine]);

  const reloadAndRefresh = useCallback(async () => {
    await engine.reload();
    await Promise.all([refreshRepos(), refreshInstalled(), refreshAvailable()]);
  }, [engine, refreshRepos, refreshInstalled, refreshAvailable]);

  useEffect(() => {
    refreshRepos();
    refreshInstalled();
    refreshAvailable();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // The Android system installer is a separate activity; when the user returns,
  // re-scan so a freshly installed/removed extension shows up here.
  useEffect(() => {
    const sub = AppState.addEventListener('change', state => {
      if (state === 'active') void reloadAndRefresh();
    });
    return () => sub.remove();
  }, [reloadAndRefresh]);

  const onAddRepo = async () => {
    const url = repoInput.trim();
    if (!url) return;
    await engine.addRepo(url);
    await refreshRepos();
    await refreshAvailable();
  };

  const onRemoveRepo = async (url: string) => {
    await engine.removeRepo(url);
    await refreshRepos();
    await refreshAvailable();
  };

  const onInstall = async (ext: AvailableExtensionDto) => {
    setBusyPkg(ext.pkg);
    try {
      await engine.installExtension(ext);
      await refreshInstalled();
      await refreshAvailable();
    } catch (e) {
      Alert.alert('Install failed', e instanceof Error ? e.message : 'Unknown error');
    } finally {
      setBusyPkg(null);
    }
  };

  const onUninstall = async (pkg: string) => {
    setBusyPkg(pkg);
    try {
      await engine.uninstallExtension(pkg);
      await refreshInstalled();
      await refreshAvailable();
    } finally {
      setBusyPkg(null);
    }
  };

  const installedPkgs = useMemo(
    () => new Set(installedExts.map(e => e.pkg)),
    [installedExts],
  );

  // Drives FlatList row re-renders when install state or in-flight pkg changes.
  const listExtra = useMemo(() => ({ installedPkgs, busyPkg }), [installedPkgs, busyPkg]);

  // Language chips, most common first.
  const languages = useMemo(() => {
    const counts = new Map<string, number>();
    for (const e of available) counts.set(e.lang, (counts.get(e.lang) ?? 0) + 1);
    return Array.from(counts.entries())
      .sort((a, b) => b[1] - a[1])
      .map(([code]) => code);
  }, [available]);

  const filtered = useMemo(() => {
    return available.filter(e => {
      if (lang && e.lang !== lang) return false;
      if (!debounced) return true;
      if (e.name.toLowerCase().includes(debounced)) return true;
      return e.sources.some(s => s.name.toLowerCase().includes(debounced));
    });
  }, [available, lang, debounced]);

  const renderHeader = () => (
    <View>
      <View style={[styles.segment, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border }]}>
        {(['browse', 'installed'] as Tab[]).map(t => {
          const active = t === tab;
          return (
            <Pressable
              key={t}
              onPress={() => setTab(t)}
              style={[styles.segmentItem, active && { backgroundColor: theme.colors.accent }]}
            >
              <Text
                style={{
                  color: active ? theme.colors.onAccent : theme.colors.textMuted,
                  fontWeight: '700',
                  fontSize: 13.5,
                }}
              >
                {t === 'browse' ? 'Browse' : `Installed${installedPkgs.size ? ` (${installedPkgs.size})` : ''}`}
              </Text>
            </Pressable>
          );
        })}
      </View>

      {/* Repos */}
      <Text style={[styles.sectionLabel, { color: theme.colors.textFaint, marginTop: 22 }]}>
        REPOSITORIES
      </Text>
      <View
        style={[styles.repoInput, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border }]}
      >
        <Icon name="globe" size={17} color={theme.colors.textMuted} />
        <TextInput
          value={repoInput}
          onChangeText={setRepoInput}
          placeholder="Paste repo index URL"
          placeholderTextColor={theme.colors.textFaint}
          autoCapitalize="none"
          autoCorrect={false}
          style={[styles.repoInputText, { color: theme.colors.text }]}
        />
        <Pressable onPress={onAddRepo} style={[styles.addBtn, { backgroundColor: theme.colors.accent }]}>
          <Text style={{ color: theme.colors.onAccent, fontWeight: '700', fontSize: 13 }}>Add</Text>
        </Pressable>
      </View>

      {repos.length === 0 ? (
        <Pressable
          onPress={() => {
            setRepoInput(KEIYOUSHI);
            engine.addRepo(KEIYOUSHI).then(refreshRepos).then(refreshAvailable);
          }}
          style={[styles.suggestChip, { borderColor: theme.colors.border }]}
        >
          <Icon name="plus" size={14} color={theme.colors.accent} />
          <Text style={{ color: theme.colors.textMuted, fontSize: 12.5, fontWeight: '600' }}>
            Add keiyoushi (community repo)
          </Text>
        </Pressable>
      ) : (
        repos.map(r => (
          <View
            key={r.url}
            style={[styles.repoRow, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border }]}
          >
            <View style={{ flex: 1 }}>
              <Text style={[theme.typography.bodyStrong, { color: theme.colors.text }]}>{r.name}</Text>
              <Text numberOfLines={1} style={{ color: theme.colors.textFaint, fontSize: 11, marginTop: 2 }}>
                {r.url}
              </Text>
            </View>
            <Pressable hitSlop={10} onPress={() => onRemoveRepo(r.url)}>
              <Icon name="trash" size={18} color={theme.colors.textMuted} />
            </Pressable>
          </View>
        ))
      )}

      {tab === 'browse' && (
        <>
          <View
            style={[styles.searchBar, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border }]}
          >
            <Icon name="search" size={17} color={theme.colors.textMuted} />
            <TextInput
              value={query}
              onChangeText={setQuery}
              placeholder="Search extensions"
              placeholderTextColor={theme.colors.textFaint}
              autoCapitalize="none"
              style={[styles.repoInputText, { color: theme.colors.text }]}
            />
            {query ? (
              <Pressable hitSlop={10} onPress={() => setQuery('')}>
                <Icon name="close" size={16} color={theme.colors.textMuted} />
              </Pressable>
            ) : null}
          </View>

          {languages.length > 0 && (
            <FlatList
              horizontal
              showsHorizontalScrollIndicator={false}
              data={['', ...languages]}
              keyExtractor={c => (c === '' ? '__all__' : c)}
              contentContainerStyle={{ gap: 8, paddingVertical: 14 }}
              renderItem={({ item }) => {
                const active = item === lang;
                const label = item === '' ? 'All' : item === 'all' ? 'Multi' : item.toUpperCase();
                return (
                  <Pressable
                    onPress={() => setLang(item)}
                    style={[
                      styles.langChip,
                      {
                        backgroundColor: active ? theme.colors.accent : theme.colors.surface,
                        borderColor: active ? theme.colors.accent : theme.colors.border,
                      },
                    ]}
                  >
                    <Text
                      style={{
                        color: active ? theme.colors.onAccent : theme.colors.textMuted,
                        fontWeight: '600',
                        fontSize: 12.5,
                      }}
                    >
                      {label}
                    </Text>
                  </Pressable>
                );
              }}
            />
          )}

          {repoError ? (
            <View style={[styles.notice, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border }]}>
              <Text style={{ color: theme.colors.textMuted, fontSize: 12.5 }}>{repoError}</Text>
            </View>
          ) : null}

          {loadingAvail ? (
            <View style={{ paddingVertical: 40, alignItems: 'center' }}>
              <ActivityIndicator color={theme.colors.accent} />
              <Text style={{ color: theme.colors.textFaint, fontSize: 12.5, marginTop: 10 }}>
                Loading extensions…
              </Text>
            </View>
          ) : available.length > 0 ? (
            <Text style={[styles.sectionLabel, { color: theme.colors.textFaint, marginBottom: 6 }]}>
              {`${filtered.length} EXTENSIONS`}
            </Text>
          ) : repos.length > 0 ? (
            <Text style={{ color: theme.colors.textFaint, fontSize: 13, paddingVertical: 20 }}>
              No extensions found in this repo.
            </Text>
          ) : null}
        </>
      )}
    </View>
  );

  const renderBrowseRow = (ext: AvailableExtensionDto) => {
    const installed = installedPkgs.has(ext.pkg);
    const busy = busyPkg === ext.pkg;
    return (
      <View
        style={[styles.extRow, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border }]}
      >
        <View style={[styles.extIcon, { backgroundColor: theme.colors.elevated }]}>
          <Text style={{ color: theme.colors.textMuted, fontWeight: '800', fontSize: 15 }}>
            {ext.name.charAt(0).toUpperCase()}
          </Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text numberOfLines={1} style={[theme.typography.bodyStrong, { color: theme.colors.text }]}>
            {ext.name}
          </Text>
          <Text style={{ color: theme.colors.textFaint, fontSize: 11.5, marginTop: 2 }}>
            {`${ext.lang === 'all' ? 'Multi' : ext.lang.toUpperCase()} \u00B7 v${ext.versionName}${
              ext.isNsfw ? '  \u00B7  18+' : ''
            }`}
          </Text>
        </View>
        <Pressable
          disabled={busy}
          onPress={() => (installed ? onUninstall(ext.pkg) : onInstall(ext))}
          style={[
            styles.installBtn,
            installed
              ? { backgroundColor: theme.colors.elevated, borderColor: theme.colors.border, borderWidth: StyleSheet.hairlineWidth }
              : { backgroundColor: theme.colors.accent },
          ]}
        >
          {busy ? (
            <ActivityIndicator size="small" color={installed ? theme.colors.textMuted : theme.colors.onAccent} />
          ) : (
            <Text
              style={{
                color: installed ? theme.colors.textMuted : theme.colors.onAccent,
                fontWeight: '700',
                fontSize: 12.5,
              }}
            >
              {installed ? 'Remove' : 'Install'}
            </Text>
          )}
        </Pressable>
      </View>
    );
  };

  const renderInstalledRow = (ext: ExtensionDto) => {
    const busy = busyPkg === ext.pkg;
    return (
      <View
        style={[styles.extRow, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border }]}
      >
        <View style={[styles.extIcon, { backgroundColor: theme.colors.elevated }]}>
          <Icon name="book" size={18} color={theme.colors.textMuted} />
        </View>
        <View style={{ flex: 1 }}>
          <Text numberOfLines={1} style={[theme.typography.bodyStrong, { color: theme.colors.text }]}>
            {ext.name}
          </Text>
          <Text style={{ color: theme.colors.textFaint, fontSize: 11.5, marginTop: 2 }}>
            {`v${ext.versionName} \u00B7 ${ext.lang.toUpperCase()}${ext.trusted ? '' : '  \u00B7  untrusted'}`}
          </Text>
        </View>
        <Pressable disabled={busy} hitSlop={8} onPress={() => onUninstall(ext.pkg)}>
          {busy ? (
            <ActivityIndicator size="small" color={theme.colors.textMuted} />
          ) : (
            <Icon name="trash" size={18} color={theme.colors.textMuted} />
          )}
        </Pressable>
      </View>
    );
  };

  return (
    <View style={{ flex: 1, backgroundColor: theme.colors.bg }}>
      <View style={[styles.header, { paddingTop: insets.top + 8, borderColor: theme.colors.border }]}>
        <Pressable hitSlop={10} onPress={() => navigation.goBack()}>
          <Icon name="back" size={24} color={theme.colors.text} />
        </Pressable>
        <Text style={[theme.typography.heading, { color: theme.colors.text }]}>Extensions</Text>
        <View style={{ width: 24 }} />
      </View>

      {tab === 'browse' ? (
        <FlatList
          data={filtered}
          keyExtractor={e => e.pkg}
          extraData={listExtra}
          ListHeaderComponent={renderHeader()}
          renderItem={({ item }) => renderBrowseRow(item)}
          contentContainerStyle={{ padding: 16, paddingBottom: 48 }}
          keyboardShouldPersistTaps="handled"
          initialNumToRender={12}
          windowSize={9}
          removeClippedSubviews
        />
      ) : (
        <FlatList
          data={installedExts}
          keyExtractor={e => e.pkg}
          ListHeaderComponent={renderHeader()}
          renderItem={({ item }) => renderInstalledRow(item)}
          contentContainerStyle={{ padding: 16, paddingBottom: 48 }}
          ListEmptyComponent={
            <Text style={{ color: theme.colors.textFaint, fontSize: 13, paddingVertical: 24 }}>
              No extensions installed yet. Switch to Browse to add some.
            </Text>
          }
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingBottom: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  segment: {
    flexDirection: 'row',
    padding: 4,
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    gap: 4,
  },
  segmentItem: {
    flex: 1,
    height: 38,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sectionLabel: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1.4,
    marginBottom: 12,
  },
  repoInput: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingLeft: 14,
    paddingRight: 6,
    height: 48,
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
  },
  repoInputText: {
    flex: 1,
    fontSize: 14,
    padding: 0,
  },
  addBtn: {
    paddingHorizontal: 16,
    height: 36,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  suggestChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    alignSelf: 'flex-start',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 999,
    borderWidth: StyleSheet.hairlineWidth,
    marginTop: 12,
  },
  repoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 14,
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    marginTop: 12,
  },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 18,
    paddingHorizontal: 14,
    height: 46,
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
  },
  langChip: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 999,
    borderWidth: StyleSheet.hairlineWidth,
  },
  notice: {
    padding: 14,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    marginBottom: 14,
  },
  extRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 12,
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    marginBottom: 10,
  },
  extIcon: {
    width: 40,
    height: 40,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  installBtn: {
    minWidth: 78,
    height: 34,
    paddingHorizontal: 14,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
