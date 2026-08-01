/**
 * Appearance: look, cover colour, layout, pure black.
 *
 * Deliberately not a hue picker. The app's colour is meant to come from cover
 * artwork, so the choices here are the ones that don't fight that: the surface
 * quality (neutral vs warm), whether covers drive the accent, and layout
 * density — none of which can make anything unreadable.
 *
 * Each look's card is drawn from its own palette, so adding one in
 * `theme/themes.ts` shows up here correctly with no changes to this screen.
 */
import React from 'react';
import { View, Text, Pressable, StyleSheet, ScrollView } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { useTheme, useThemePreference, useAppearance, type ThemePreference } from '../theme/ThemeProvider';
import { Icon, type IconName } from '../components/Icon';
import { THEMES } from '../theme/themes';

export function AppearanceScreen() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const navigation = useNavigation();
  const { preference, setPreference } = useThemePreference();
  const { appearance, setAppearance } = useAppearance();

  const modes: { key: ThemePreference; label: string; icon: IconName }[] = [
    { key: 'system', label: 'Auto', icon: 'settings' },
    { key: 'light', label: 'Light', icon: 'sun' },
    { key: 'dark', label: 'Dark', icon: 'moon' },
  ];

  return (
    <View style={{ flex: 1, backgroundColor: theme.colors.bg }}>
      <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
        <Pressable hitSlop={10} onPress={() => navigation.goBack()}>
          <Icon name="back" size={24} color={theme.colors.text} />
        </Pressable>
        <Text style={[theme.typography.heading, { color: theme.colors.text, flex: 1 }]}>
          Appearance
        </Text>
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{
          paddingHorizontal: theme.spacing.lg,
          paddingBottom: insets.bottom + 40,
        }}
      >
        <Text style={[styles.sectionLabel, { color: theme.colors.textFaint }]}>MODE</Text>
        <View style={[styles.segmented, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border }]}>
          {modes.map(m => {
            const active = preference === m.key;
            return (
              <Pressable
                key={m.key}
                onPress={() => setPreference(m.key)}
                style={[
                  styles.segment,
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
                    fontWeight: '700',
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
          THEME
        </Text>
        <View style={styles.themeGrid}>
          {THEMES.map(preset => {
            const p = preset.palettes[theme.scheme];
            const active = preset.id === appearance.themeId;
            return (
              <Pressable
                key={preset.id}
                onPress={() => setAppearance({ themeId: preset.id })}
                style={[
                  styles.themeCard,
                  {
                    backgroundColor: p.surface,
                    borderColor: active ? theme.colors.accent : theme.colors.border,
                    borderWidth: active ? 2 : StyleSheet.hairlineWidth,
                  },
                ]}
              >
                {/* A miniature of the app: canvas, a card, and the accent. */}
                <View style={[styles.preview, { backgroundColor: p.bg }]}>
                  <View style={[styles.previewBar, { backgroundColor: p.accent }]} />
                  <View style={[styles.previewLine, { backgroundColor: p.textMuted }]} />
                  <View
                    style={[styles.previewLine, { backgroundColor: p.border, width: '55%' }]}
                  />
                </View>
                <View style={styles.themeMeta}>
                  <Text numberOfLines={1} style={[styles.themeName, { color: p.text }]}>
                    {preset.name}
                  </Text>
                  {active ? (
                    <Icon name="check" size={15} color={theme.colors.accent} />
                  ) : null}
                </View>
                <Text numberOfLines={2} style={{ color: p.textFaint, fontSize: 11.5 }}>
                  {preset.hint}
                </Text>
              </Pressable>
            );
          })}
        </View>

        <Text style={[styles.sectionLabel, { color: theme.colors.textFaint, marginTop: 28 }]}>
          COLOUR
        </Text>
        <Toggle
          icon="image"
          label="Colour from cover"
          hint="Tint a title's screens with a colour taken from its artwork"
          value={appearance.coverAccent}
          onToggle={() => setAppearance({ coverAccent: !appearance.coverAccent })}
        />

        <Text style={[styles.sectionLabel, { color: theme.colors.textFaint, marginTop: 28 }]}>
          LAYOUT
        </Text>
        <Choice
          label="Density"
          options={[
            { key: 'comfortable', label: 'Comfortable' },
            { key: 'compact', label: 'Compact' },
          ]}
          value={appearance.density}
          onSelect={key => setAppearance({ density: key as typeof appearance.density })}
        />
        <View style={{ height: 10 }} />
        <Choice
          label="Corners"
          options={[
            { key: 'soft', label: 'Soft' },
            { key: 'sharp', label: 'Sharp' },
          ]}
          value={appearance.corners}
          onSelect={key => setAppearance({ corners: key as typeof appearance.corners })}
        />

        <Text style={[styles.sectionLabel, { color: theme.colors.textFaint, marginTop: 28 }]}>
          DISPLAY
        </Text>
        <Toggle
          icon="moon"
          label="Pure black"
          hint={
            theme.scheme === 'dark'
              ? 'Saves power on OLED screens'
              : 'Only applies to the dark theme'
          }
          value={appearance.amoled}
          disabled={theme.scheme !== 'dark'}
          onToggle={() => setAppearance({ amoled: !appearance.amoled })}
        />
      </ScrollView>
    </View>
  );
}

function Toggle({
  icon,
  label,
  hint,
  value,
  disabled,
  onToggle,
}: {
  icon: IconName;
  label: string;
  hint: string;
  value: boolean;
  disabled?: boolean;
  onToggle: () => void;
}) {
  const theme = useTheme();
  return (
    <Pressable
      onPress={onToggle}
      disabled={disabled}
      style={({ pressed }) => [
        styles.row,
        {
          backgroundColor: pressed ? theme.colors.elevated : theme.colors.surface,
          borderColor: theme.colors.border,
          opacity: disabled ? 0.45 : 1,
        },
      ]}
    >
      <Icon name={icon} size={20} color={theme.colors.textMuted} />
      <View style={{ flex: 1 }}>
        <Text style={[theme.typography.body, { color: theme.colors.text }]}>{label}</Text>
        <Text style={{ color: theme.colors.textFaint, fontSize: 12, marginTop: 2 }}>{hint}</Text>
      </View>
      <View
        style={[
          styles.toggle,
          {
            backgroundColor: value ? theme.colors.accent : theme.colors.bg,
            borderColor: value ? theme.colors.accent : theme.colors.border,
          },
        ]}
      >
        <View
          style={[
            styles.toggleKnob,
            {
              backgroundColor: value ? theme.colors.onAccent : theme.colors.textFaint,
              alignSelf: value ? 'flex-end' : 'flex-start',
            },
          ]}
        />
      </View>
    </Pressable>
  );
}

function Choice({
  label,
  options,
  value,
  onSelect,
}: {
  label: string;
  options: { key: string; label: string }[];
  value: string;
  onSelect: (key: string) => void;
}) {
  const theme = useTheme();
  return (
    <View>
      <Text style={{ color: theme.colors.textMuted, fontSize: 12.5, marginBottom: 8 }}>
        {label}
      </Text>
      <View
        style={[
          styles.segmented,
          { backgroundColor: theme.colors.surface, borderColor: theme.colors.border },
        ]}
      >
        {options.map(opt => {
          const active = opt.key === value;
          return (
            <Pressable
              key={opt.key}
              onPress={() => onSelect(opt.key)}
              style={[styles.segment, active && { backgroundColor: theme.colors.accent }]}
            >
              <Text
                style={{
                  color: active ? theme.colors.onAccent : theme.colors.textMuted,
                  fontWeight: '700',
                  fontSize: 13,
                }}
              >
                {opt.label}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingHorizontal: 16,
    paddingBottom: 14,
  },
  sectionLabel: {
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1.2,
    marginBottom: 10,
  },
  segmented: {
    flexDirection: 'row',
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    padding: 4,
    gap: 4,
  },
  segment: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
    paddingVertical: 10,
    borderRadius: 10,
  },
  themeGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  themeCard: {
    width: '47%',
    borderRadius: 16,
    padding: 12,
    gap: 8,
  },
  preview: {
    height: 62,
    borderRadius: 10,
    padding: 9,
    gap: 6,
    justifyContent: 'center',
  },
  previewBar: {
    height: 8,
    width: '42%',
    borderRadius: 999,
  },
  previewLine: {
    height: 5,
    width: '78%',
    borderRadius: 999,
  },
  themeMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  themeName: {
    fontSize: 14,
    fontWeight: '700',
    flex: 1,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingHorizontal: 14,
    paddingVertical: 14,
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
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
});
