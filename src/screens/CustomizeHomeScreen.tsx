import React, { useEffect, useState } from 'react';
import { View, Text, Pressable, StyleSheet, ScrollView, Switch } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { useTheme } from '../theme/ThemeProvider';
import { useHomeConfig, blockLabel, isBrowseBlock } from '../home/HomeConfig';
import { Icon } from '../components/Icon';
import { SourcePickerSheet } from '../components/SourcePickerSheet';
import { getEngine } from '../engine';
import { sortSourcesForPicker, pickDefaultSource } from '../utils/sourceSelect';
import { langLabel } from '../utils/lang';
import type { SourceDto } from '../engine/types';

const UNIVERSAL = '__universal__';

export function CustomizeHomeScreen() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const navigation = useNavigation();
  const {
    blocks,
    toggle,
    move,
    setSource,
    clearSource,
    clearAllSources,
    universalSourceId,
    universalSourceName,
    setUniversalSource,
  } = useHomeConfig();

  const [sources, setSources] = useState<SourceDto[]>([]);
  const [pickerFor, setPickerFor] = useState<string | null>(null);

  useEffect(() => {
    getEngine()
      .listSources()
      .then(s => setSources(sortSourcesForPicker(s)))
      .catch(() => setSources([]));
  }, []);

  const pickerBlock = blocks.find(b => b.id === pickerFor);
  const universalSource = sources.find(s => s.id === universalSourceId);
  // What "Auto" actually resolves to, so the universal default isn't a mystery.
  const autoDefault = sources.length ? pickDefaultSource(sources) : undefined;
  const hasOverrides = blocks.some(b => b.sourceId);

  return (
    <View style={{ flex: 1, backgroundColor: theme.colors.bg }}>
      <View style={[styles.header, { paddingTop: insets.top + 8, borderColor: theme.colors.border }]}>
        <Pressable hitSlop={10} onPress={() => navigation.goBack()} style={{ width: 60 }}>
          <Icon name="back" size={24} color={theme.colors.text} />
        </Pressable>
        <Text style={[theme.typography.heading, { color: theme.colors.text }]}>Customize Home</Text>
        <Pressable hitSlop={10} onPress={() => navigation.goBack()} style={{ width: 60, alignItems: 'flex-end' }}>
          <Text style={{ color: theme.colors.accent, fontWeight: '700', fontSize: 15 }}>Done</Text>
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={{ padding: theme.spacing.lg, paddingBottom: 40 }}>
        <Text style={{ color: theme.colors.textMuted, textAlign: 'center', marginBottom: 18, fontSize: 13 }}>
          Pick one source for the whole home screen, or override individual sections.
        </Text>

        <View style={[styles.block, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border }]}>
          <Text style={[theme.typography.bodyStrong, { color: theme.colors.text }]}>Universal source</Text>
          <Text style={{ color: theme.colors.textMuted, fontSize: 12.5, marginTop: 2 }}>
            Every section uses this unless it has its own override.
          </Text>
          <Pressable
            onPress={() => setPickerFor(UNIVERSAL)}
            style={({ pressed }) => [
              styles.sourceRow,
              { borderColor: theme.colors.border, opacity: pressed ? 0.7 : 1 },
            ]}
          >
            <Icon name="globe" size={15} color={theme.colors.accent} />
            <Text style={{ color: theme.colors.textMuted, fontSize: 13, flex: 1 }} numberOfLines={1}>
              {universalSource?.name ??
                universalSourceName ??
                (autoDefault ? `Auto \u00B7 ${autoDefault.name}` : 'Auto (smart default)')}
            </Text>
            {universalSource ? (
              <Text style={[styles.langTag, { color: theme.colors.textMuted, borderColor: theme.colors.border }]}>
                {langLabel(universalSource.lang)}
              </Text>
            ) : null}
            {universalSourceId ? (
              <Pressable hitSlop={8} onPress={() => setUniversalSource(undefined, undefined)}>
                <Icon name="close" size={16} color={theme.colors.textFaint} />
              </Pressable>
            ) : null}
            <Icon name="chevronRight" size={15} color={theme.colors.textFaint} />
          </Pressable>

          {hasOverrides ? (
            <Pressable
              onPress={clearAllSources}
              style={({ pressed }) => [styles.applyAll, { opacity: pressed ? 0.6 : 1 }]}
            >
              <Icon name="refresh" size={14} color={theme.colors.accent} />
              <Text style={{ color: theme.colors.accent, fontWeight: '700', fontSize: 12.5 }}>
                Apply to all sections
              </Text>
            </Pressable>
          ) : null}
        </View>

        <Text style={{ color: theme.colors.textFaint, marginBottom: 10, marginTop: 4, fontSize: 12 }}>
          SECTIONS
        </Text>

        {blocks.map((block, index) => {
          const browse = isBrowseBlock(block);
          const blockSource = sources.find(s => s.id === block.sourceId);
          return (
            <View
              key={block.id}
              style={[styles.block, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border }]}
            >
              <View style={styles.topRow}>
                <View style={styles.moveCol}>
                  <Pressable hitSlop={6} onPress={() => move(index, index - 1)} disabled={index === 0}>
                    <Icon name="chevronDown" size={16} color={index === 0 ? theme.colors.textFaint : theme.colors.textMuted} />
                  </Pressable>
                  <Icon name="drag" size={18} color={theme.colors.textFaint} />
                  <Pressable
                    hitSlop={6}
                    onPress={() => move(index, index + 1)}
                    disabled={index === blocks.length - 1}
                    style={{ transform: [{ rotate: '180deg' }] }}
                  >
                    <Icon
                      name="chevronDown"
                      size={16}
                      color={index === blocks.length - 1 ? theme.colors.textFaint : theme.colors.textMuted}
                    />
                  </Pressable>
                </View>

                <Text style={[theme.typography.bodyStrong, { color: theme.colors.text, flex: 1 }]}>
                  {blockLabel(block).split(' \u00B7 ')[0]}
                </Text>

                <Switch
                  value={block.enabled}
                  onValueChange={() => toggle(block.id)}
                  trackColor={{ true: theme.colors.accent, false: theme.colors.border }}
                  thumbColor="#fff"
                />
              </View>

              {browse ? (
                <Pressable
                  onPress={() => setPickerFor(block.id)}
                  style={({ pressed }) => [
                    styles.sourceRow,
                    { borderColor: theme.colors.border, opacity: pressed ? 0.7 : 1 },
                  ]}
                >
                  <Icon name="globe" size={15} color={theme.colors.accent} />
                  <Text style={{ color: theme.colors.textMuted, fontSize: 13, flex: 1 }} numberOfLines={1}>
                    {blockSource
                      ? blockSource.name
                      : universalSource
                        ? `Universal \u00B7 ${universalSource.name}`
                        : 'Auto (smart default)'}
                  </Text>
                  {blockSource ? (
                    <>
                      <Text style={[styles.langTag, { color: theme.colors.textMuted, borderColor: theme.colors.border }]}>
                        {langLabel(blockSource.lang)}
                      </Text>
                      <Pressable hitSlop={8} onPress={() => clearSource(block.id)}>
                        <Icon name="close" size={16} color={theme.colors.textFaint} />
                      </Pressable>
                    </>
                  ) : null}
                  <Icon name="chevronRight" size={15} color={theme.colors.textFaint} />
                </Pressable>
              ) : null}
            </View>
          );
        })}

        <Text style={{ color: theme.colors.textFaint, textAlign: 'center', marginTop: 8, fontSize: 12 }}>
          Sections pull from your installed extensions
        </Text>
      </ScrollView>

      <SourcePickerSheet
        visible={pickerFor != null}
        sources={sources}
        selectedId={(pickerFor === UNIVERSAL ? universalSourceId : pickerBlock?.sourceId) ?? ''}
        onSelect={id => {
          const s = sources.find(x => x.id === id);
          if (!s) return;
          if (pickerFor === UNIVERSAL) setUniversalSource(s.id, s.name);
          else if (pickerFor) setSource(pickerFor, s.id, s.name);
        }}
        onClose={() => setPickerFor(null)}
      />
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
  block: {
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    marginBottom: 12,
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  moveCol: {
    alignItems: 'center',
    gap: 1,
  },
  sourceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  applyAll: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    marginTop: 10,
  },
  langTag: {
    fontSize: 11,
    fontWeight: '700',
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 6,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
  },
});
