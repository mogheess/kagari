import React, { useState } from 'react';
import { View, Text, Pressable, StyleSheet, ScrollView, ActivityIndicator, Linking } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useTheme, useThemePreference, type ThemePreference } from '../theme/ThemeProvider';
import { Icon, type IconName } from '../components/Icon';
import { useAppUpdate, checkForAppUpdate } from '../app/appUpdate';
import { useExtensionUpdates, checkExtensionUpdates } from '../sources/extensionUpdates';
import { getEngine } from '../engine';
import { APP_VERSION } from '../app/version';
import { getEngine } from '../engine';
import { pickAndImportMihonBackup } from '../library/mihonImport';
import type { RootStackParamList } from '../navigation/types';

type Nav = NativeStackNavigationProp<RootStackParamList>;
const TAB_BAR_SPACE = 110;

export function ProfileScreen() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<Nav>();
  const { preference, setPreference } = useThemePreference();
  const appUpdate = useAppUpdate();
  const extUpdates = useExtensionUpdates();

  const modes: { key: ThemePreference; label: string; icon: IconName }[] = [
    { key: 'system', label: 'Auto', icon: 'settings' },
    { key: 'light', label: 'Light', icon: 'sun' },
    { key: 'dark', label: 'Dark', icon: 'moon' },
  ];

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
        <View style={[styles.segment, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border }]}>
          {modes.map(m => {
            const active = m.key === preference;
            return (
              <Pressable
                key={m.key}
                onPress={() => setPreference(m.key)}
                style={[
                  styles.segmentItem,
                  active && { backgroundColor: theme.colors.accent },
                ]}
              >
                <Icon
                  name={m.icon}
                  size={16}
                  color={active ? theme.colors.onAccent : theme.colors.textMuted}
                />
                <Text
                  style={{
                    color: active ? theme.colors.onAccent : theme.colors.textMuted,
                    fontWeight: '600',
                    fontSize: 13,
                  }}
                >
                  {m.label}
                </Text>
              </Pressable>
            );
          })}
        </View>

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
        <Row icon="download" label="Downloads" onPress={() => navigation.navigate('Downloads')} />

        <Text style={[styles.sectionLabel, { color: theme.colors.textFaint, marginTop: 28 }]}>
          DATA
        </Text>
        <MihonImportRow />

        <Text style={[styles.sectionLabel, { color: theme.colors.textFaint, marginTop: 28 }]}>
          ABOUT
        </Text>
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
        <Text style={[theme.typography.body, { color: theme.colors.text }]}>Import from Mihon</Text>
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
