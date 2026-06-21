import React from 'react';
import { View, Text, Pressable, StyleSheet, ScrollView } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useTheme, useThemePreference, type ThemePreference } from '../theme/ThemeProvider';
import { Icon, type IconName } from '../components/Icon';
import { useEngineMode } from '../engine/EngineModeProvider';
import type { EngineMode } from '../engine';
import type { RootStackParamList } from '../navigation/types';

type Nav = NativeStackNavigationProp<RootStackParamList>;
const TAB_BAR_SPACE = 110;

export function ProfileScreen() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<Nav>();
  const { preference, setPreference } = useThemePreference();
  const { mode: engineMode, nativeAvailable, setMode: setEngineMode } = useEngineMode();

  const modes: { key: ThemePreference; label: string; icon: IconName }[] = [
    { key: 'system', label: 'Auto', icon: 'settings' },
    { key: 'light', label: 'Light', icon: 'sun' },
    { key: 'dark', label: 'Dark', icon: 'moon' },
  ];

  const dataModes: { key: EngineMode; label: string; icon: IconName }[] = [
    { key: 'mock', label: 'Demo', icon: 'grid' },
    { key: 'native', label: 'Extensions', icon: 'book' },
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
          DATA SOURCE
        </Text>
        <View style={[styles.segment, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border }]}>
          {dataModes.map(m => {
            const active = m.key === engineMode;
            const disabled = m.key === 'native' && !nativeAvailable;
            return (
              <Pressable
                key={m.key}
                disabled={disabled}
                onPress={() => setEngineMode(m.key)}
                style={[styles.segmentItem, active && { backgroundColor: theme.colors.accent }]}
              >
                <Icon
                  name={m.icon}
                  size={16}
                  color={
                    disabled
                      ? theme.colors.textFaint
                      : active
                      ? theme.colors.onAccent
                      : theme.colors.textMuted
                  }
                />
                <Text
                  style={{
                    color: disabled
                      ? theme.colors.textFaint
                      : active
                      ? theme.colors.onAccent
                      : theme.colors.textMuted,
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
        <Text style={{ color: theme.colors.textFaint, fontSize: 12, marginTop: 8, lineHeight: 17 }}>
          {engineMode === 'mock'
            ? 'Showing demo data so you can explore the UI. Switch to Extensions to load installed sources.'
            : 'Loading from installed extensions. Install & trust an extension to see content.'}
        </Text>

        <Text style={[styles.sectionLabel, { color: theme.colors.textFaint, marginTop: 28 }]}>
          SOURCES
        </Text>
        <Row
          icon="settings"
          label="Extensions & Repos"
          hint={engineMode === 'native' ? 'Native engine' : 'Demo data'}
          onPress={() => navigation.navigate('Extensions')}
        />
        <Row icon="grid" label="Customize Home" onPress={() => navigation.navigate('CustomizeHome')} />
        <Row icon="download" label="Downloads" />
        <Row icon="bookmark" label="Categories" />
      </ScrollView>
    </View>
  );
}

function Row({
  icon,
  label,
  hint,
  onPress,
}: {
  icon: IconName;
  label: string;
  hint?: string;
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
      {hint ? <Text style={{ color: theme.colors.textFaint, fontSize: 12 }}>{hint}</Text> : null}
      <Icon name="chevronRight" size={18} color={theme.colors.textFaint} />
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
});
