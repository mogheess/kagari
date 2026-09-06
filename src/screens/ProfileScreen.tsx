import React, { useState } from 'react';
import { View, Text, Pressable, StyleSheet, ScrollView, ActivityIndicator, Linking, Alert } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useTheme, useAppearance } from '../theme/ThemeProvider';
import { Icon, type IconName } from '../components/Icon';
import { useAppUpdate, checkForAppUpdate } from '../app/appUpdate';
import { useExtensionUpdates, checkExtensionUpdates } from '../sources/extensionUpdates';
import { getEngine } from '../engine';
import { APP_VERSION } from '../app/version';
import { DISCORD_INVITE_URL, hasCommunityLinks } from '../app/community';
import { themeById } from '../theme/themes';
import { pickAndImportMihonBackup } from '../library/mihonImport';
import { exportMihonBackup } from '../library/mihonExport';
import {
  useStorageLocation,
  pickStorageLocation,
  clearStorageLocation,
  describeStorageLocation,
} from '../library/storageLocation';
import { countMigratableDownloads, migrateDownloadsToStorage } from '../library/downloads';
import type { RootStackParamList } from '../navigation/types';

type Nav = NativeStackNavigationProp<RootStackParamList>;
const TAB_BAR_SPACE = 110;

export function ProfileScreen() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<Nav>();
  const { appearance } = useAppearance();
  const appUpdate = useAppUpdate();
  const extUpdates = useExtensionUpdates();


  return (
    <View style={{ flex: 1, backgroundColor: theme.colors.bg }}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{
          paddingTop: insets.top + 8,
          paddingBottom: TAB_BAR_SPACE,
          paddingHorizontal: theme.spacing.lg,
        }}
      >
        <Text style={[theme.typography.title, { color: theme.colors.text, marginBottom: 20 }]}>
          Profile
        </Text>

        <Text style={[styles.sectionLabel, { color: theme.colors.textFaint }]}>APPEARANCE</Text>
        <Row
          icon="sun"
          label="Theme"
          hint={themeById(appearance.themeId).name}
          onPress={() => navigation.navigate('Appearance')}
        />

        <Text style={[styles.sectionLabel, { color: theme.colors.textFaint, marginTop: 28 }]}>
          SOURCES
        </Text>
        <Row
          icon="settings"
          label="Extensions & Repos"
          hint={extUpdates.length > 0 ? undefined : 'Manage'}
          badge={extUpdates.length}
          onPress={() => navigation.navigate('Extensions')}
        />
        <Row icon="grid" label="Customize Home" onPress={() => navigation.navigate('CustomizeHome')} />
        <Row icon="bookmark" label="Categories" onPress={() => navigation.navigate('Categories')} />
        <Row icon="columns" label="Tier Lists" onPress={() => navigation.navigate('TierLists')} />
        <Row icon="download" label="Downloads" onPress={() => navigation.navigate('Downloads')} />

        <Text style={[styles.sectionLabel, { color: theme.colors.textFaint, marginTop: 28 }]}>
          DATA
        </Text>
        <StorageLocationRow />
        <MihonImportRow />
        <BackupExportRow />

        {/* Only rendered once an invite is configured in `app/community.ts`, so
            an unset link never ships as a dead row. */}
        {hasCommunityLinks() ? (
          <>
            <Text style={[styles.sectionLabel, { color: theme.colors.textFaint, marginTop: 28 }]}>
              COMMUNITY
            </Text>
            {DISCORD_INVITE_URL ? (
              <Row
                icon="globe"
                label="Discord"
                hint="Join the server"
                onPress={() => Linking.openURL(DISCORD_INVITE_URL)}
              />
            ) : null}
          </>
        ) : null}

        <Text style={[styles.sectionLabel, { color: theme.colors.textFaint, marginTop: 28 }]}>
          ABOUT
        </Text>
        <Row
          icon="book"
          label="What's new"
          hint={`v${APP_VERSION}`}
          onPress={() => navigation.navigate('Changelog')}
        />
        {appUpdate.available && appUpdate.latest ? (
          <View style={[styles.updateCard, { backgroundColor: theme.colors.surface, borderColor: theme.colors.accent }]}>
            <View style={[styles.updateIcon, { backgroundColor: theme.colors.elevated }]}>
              <Icon name="download" size={20} color={theme.colors.accent} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[theme.typography.bodyStrong, { color: theme.colors.text }]}>
                Update available
              </Text>
              <Text style={{ color: theme.colors.textMuted, fontSize: 12.5, marginTop: 2 }}>
                Kagari v{appUpdate.latest.version} is ready to download
              </Text>
            </View>
            <Pressable
              onPress={() => appUpdate.latest && Linking.openURL(appUpdate.latest.url)}
              style={[styles.updateBtn, { backgroundColor: theme.colors.accent }]}
            >
              <Text style={{ color: theme.colors.onAccent, fontWeight: '700', fontSize: 12.5 }}>
                Download
              </Text>
            </Pressable>
          </View>
        ) : null}
        <Pressable
          onPress={() => {
            void checkForAppUpdate({ force: true });
            void checkExtensionUpdates(getEngine(), { force: true });
          }}
          style={({ pressed }) => [
            styles.row,
            {
              backgroundColor: pressed ? theme.colors.elevated : theme.colors.surface,
              borderColor: theme.colors.border,
            },
          ]}
        >
          <Icon name="refresh" size={20} color={theme.colors.textMuted} />
          <View style={{ flex: 1 }}>
            <Text style={[theme.typography.body, { color: theme.colors.text }]}>
              Version {APP_VERSION}
            </Text>
            <Text style={{ color: theme.colors.textFaint, fontSize: 12, marginTop: 2 }}>
              {appUpdate.checking
                ? 'Checking for updates…'
                : appUpdate.available && appUpdate.latest
                  ? `v${appUpdate.latest.version} available`
                  : appUpdate.error
                    ? "Couldn't check, tap to retry"
                    : appUpdate.checkedAt
                      ? "You're on the latest version"
                      : 'Tap to check for updates'}
            </Text>
          </View>
          {appUpdate.checking ? (
            <ActivityIndicator size="small" color={theme.colors.textMuted} />
          ) : (
            <Text style={{ color: theme.colors.accent, fontWeight: '700', fontSize: 12.5 }}>Check</Text>
          )}
        </Pressable>
      </ScrollView>
    </View>
  );
}

function Row({
  icon,
  label,
  hint,
  badge,
  onPress,
}: {
  icon: IconName;
  label: string;
  hint?: string;
  badge?: number;
  onPress?: () => void;
}) {
  const theme = useTheme();
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.row,
        theme.elevation.card,
        {
          backgroundColor: pressed ? theme.colors.elevated : theme.colors.surface,
          borderColor: theme.colors.border,
        },
      ]}
    >
      <Icon name={icon} size={20} color={theme.colors.textMuted} />
      <Text style={[theme.typography.body, { color: theme.colors.text, flex: 1 }]}>{label}</Text>
      {badge && badge > 0 ? (
        <View style={[styles.badge, { backgroundColor: theme.colors.accent }]}>
          <Text style={{ color: theme.colors.onAccent, fontSize: 11, fontWeight: '800' }}>
            {badge} update{badge === 1 ? '' : 's'}
          </Text>
        </View>
      ) : hint ? (
        <Text style={{ color: theme.colors.textFaint, fontSize: 12 }}>{hint}</Text>
      ) : null}
      <Icon name="chevronRight" size={18} color={theme.colors.textFaint} />
    </Pressable>
  );
}

/**
 * Writes a Mihon-compatible `.tachibk` and opens the share sheet so the user
 * picks where it lands. Compatible on purpose: the backup restores into Mihon
 * as well as Kagari.
 */
function BackupExportRow() {
  const theme = useTheme();
  const [state, setState] = useState<ImportState>({ status: 'idle' });
  const working = state.status === 'working';

  const run = async () => {
    if (working) return;
    setState({ status: 'working' });
    try {
      const result = await exportMihonBackup();
      const incomplete = result.mangaMissingChapters;
      const summary = incomplete
        ? `${result.mangaCount} title${result.mangaCount === 1 ? '' : 's'} exported; ${incomplete} missing chapter progress`
        : `${result.mangaCount} title${result.mangaCount === 1 ? '' : 's'} exported`;
      setState({
        status: 'done',
        message: result.savedTo ? `${summary} · copy in ${result.savedTo}` : summary,
      });
    } catch (e) {
      setState({ status: 'error', message: e instanceof Error ? e.message : 'Export failed' });
    }
  };

  return (
    <Pressable
      onPress={run}
      disabled={working}
      style={({ pressed }) => [
        styles.row,
        theme.elevation.card,
        {
          backgroundColor: pressed ? theme.colors.elevated : theme.colors.surface,
          borderColor: theme.colors.border,
        },
      ]}
    >
      <Icon name="share" size={20} color={theme.colors.textMuted} />
      <View style={{ flex: 1 }}>
        <Text style={[theme.typography.body, { color: theme.colors.text }]}>Export backup</Text>
        <Text style={{ color: theme.colors.textFaint, fontSize: 12, marginTop: 2 }}>
          {state.status === 'done'
            ? state.message
            : state.status === 'error'
              ? state.message
              : 'Save a .tachibk that Mihon can also restore'}
        </Text>
      </View>
      {working ? (
        <ActivityIndicator size="small" color={theme.colors.textMuted} />
      ) : (
        <Text style={{ color: theme.colors.accent, fontWeight: '700', fontSize: 12.5 }}>Export</Text>
      )}
    </Pressable>
  );
}

type MigrationState = { status: 'idle' } | { status: 'moving'; done: number; total: number };

/**
 * Where downloads and backups go. Mihon's model: one folder the user picks with
 * the system picker, `downloads/` and `backups/` underneath, in Mihon's own
 * layout so either app can read it. Optional — app storage stays the default.
 */
function StorageLocationRow() {
  const theme = useTheme();
  const location = useStorageLocation();
  const [migration, setMigration] = useState<MigrationState>({ status: 'idle' });
  const [error, setError] = useState<string | null>(null);
  const busy = migration.status === 'moving';

  const offerMigration = () => {
    const count = countMigratableDownloads();
    if (count === 0) return;
    // The count is every finished download; ones already in a picked folder are
    // skipped by the move itself, so phrase it as an upper bound.
    Alert.alert(
      'Move existing downloads?',
      `Move up to ${count} downloaded chapter${count === 1 ? '' : 's'} from app storage into the new folder? Chapters already there are skipped, and everything stays readable either way.`,
      [
        { text: 'Not now', style: 'cancel' },
        {
          text: 'Move',
          onPress: async () => {
            setMigration({ status: 'moving', done: 0, total: count });
            const result = await migrateDownloadsToStorage((done, total) =>
              setMigration({ status: 'moving', done, total }),
            );
            setMigration({ status: 'idle' });
            if (result.failed > 0) {
              setError(`${result.failed} chapter${result.failed === 1 ? '' : 's'} could not be moved and stayed in app storage`);
            }
          },
        },
      ],
    );
  };

  const choose = async () => {
    setError(null);
    try {
      const picked = await pickStorageLocation();
      if (picked) offerMigration();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not open the folder picker');
    }
  };

  const onPress = () => {
    if (busy) return;
    if (!location) {
      void choose();
      return;
    }
    Alert.alert('Storage location', location.displayPath, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Use app storage', onPress: () => void clearStorageLocation() },
      { text: 'Choose folder', onPress: () => void choose() },
    ]);
  };

  const subtitle = error
    ? error
    : migration.status === 'moving'
      ? `Moving ${migration.done} of ${migration.total}…`
      : describeStorageLocation(location);

  return (
    <Pressable
      onPress={onPress}
      disabled={busy}
      style={({ pressed }) => [
        styles.row,
        theme.elevation.card,
        {
          backgroundColor: pressed ? theme.colors.elevated : theme.colors.surface,
          borderColor: error || (location && !location.writable) ? theme.colors.danger : theme.colors.border,
        },
      ]}
    >
      <Icon name="folder" size={20} color={theme.colors.textMuted} />
      <View style={{ flex: 1 }}>
        <Text style={[theme.typography.body, { color: theme.colors.text }]}>Storage location</Text>
        <Text
          numberOfLines={2}
          style={{ color: error ? theme.colors.danger : theme.colors.textFaint, fontSize: 12, marginTop: 2 }}
        >
          {subtitle}
        </Text>
      </View>
      {busy ? (
        <ActivityIndicator size="small" color={theme.colors.textMuted} />
      ) : (
        <Text style={{ color: theme.colors.accent, fontWeight: '700', fontSize: 12.5 }}>
          {location ? 'Change' : 'Choose'}
        </Text>
      )}
    </Pressable>
  );
}

type ImportState =
  | { status: 'idle' }
  | { status: 'working' }
  | { status: 'done'; message: string }
  | { status: 'error'; message: string };

/**
 * Imports a Mihon/Tachiyomi `.tachibk` backup: library, categories, read state
 * and history are merged into the local stores (never destructive).
 */
function MihonImportRow() {
  const theme = useTheme();
  const [state, setState] = useState<ImportState>({ status: 'idle' });
  const working = state.status === 'working';

  const run = async () => {
    if (working) return;
    setState({ status: 'working' });
    try {
      const summary = await pickAndImportMihonBackup(getEngine());
      if (!summary) {
        setState({ status: 'idle' });
        return;
      }
      const parts = [`${summary.mangaAdded} added`];
      if (summary.mangaInBackup > summary.mangaAdded) {
        parts.push(`${summary.mangaInBackup - summary.mangaAdded} already in library`);
      }
      if (summary.categories > 0) parts.push(`${summary.categories} categories`);
      setState({ status: 'done', message: parts.join(' · ') });
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Import failed';
      setState({ status: 'error', message });
    }
  };

  const subtitle =
    state.status === 'working'
      ? 'Reading backup…'
      : state.status === 'done'
        ? state.message
        : state.status === 'error'
          ? state.message
          : 'Restore a .tachibk library backup';

  return (
    <Pressable
      onPress={run}
      disabled={working}
      style={({ pressed }) => [
        styles.row,
        {
          backgroundColor: pressed ? theme.colors.elevated : theme.colors.surface,
          borderColor: state.status === 'error' ? theme.colors.danger : theme.colors.border,
        },
      ]}
    >
      <Icon name="download" size={20} color={theme.colors.textMuted} />
      <View style={{ flex: 1 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <Text style={[theme.typography.body, { color: theme.colors.text }]}>Import from Mihon</Text>
          <Text style={{ color: theme.colors.textFaint, fontSize: 11, fontWeight: '600' }}>(beta)</Text>
        </View>
        <Text
          numberOfLines={2}
          style={{
            color: state.status === 'error' ? theme.colors.danger : theme.colors.textFaint,
            fontSize: 12,
            marginTop: 2,
          }}
        >
          {subtitle}
        </Text>
      </View>
      {working ? (
        <ActivityIndicator size="small" color={theme.colors.textMuted} />
      ) : (
        <Text style={{ color: theme.colors.accent, fontWeight: '700', fontSize: 12.5 }}>
          {state.status === 'done' ? 'Again' : 'Import'}
        </Text>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  sectionLabel: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1.4,
    marginBottom: 10,
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
    flexDirection: 'row',
    gap: 6,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    borderRadius: 10,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingHorizontal: 16,
    paddingVertical: 15,
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    marginBottom: 10,
  },
  badge: {
    paddingHorizontal: 9,
    paddingVertical: 3,
    borderRadius: 999,
  },
  updateCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 14,
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    marginBottom: 10,
  },
  updateIcon: {
    width: 40,
    height: 40,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  updateBtn: {
    paddingHorizontal: 16,
    height: 36,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
