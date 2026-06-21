import React from 'react';
import { View, Text, Pressable, StyleSheet, ScrollView, Switch } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { useTheme } from '../theme/ThemeProvider';
import { useHomeConfig, blockLabel } from '../home/HomeConfig';
import { Icon } from '../components/Icon';

export function CustomizeHomeScreen() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const navigation = useNavigation();
  const { blocks, toggle, move, remove } = useHomeConfig();

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
          Reorder and toggle sections on your home screen.
        </Text>

        {blocks.map((block, index) => (
          <View
            key={block.id}
            style={[styles.block, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border }]}
          >
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
              {blockLabel(block)}
            </Text>

            <Switch
              value={block.enabled}
              onValueChange={() => toggle(block.id)}
              trackColor={{ true: theme.colors.accent, false: theme.colors.border }}
              thumbColor="#fff"
            />
            <Pressable hitSlop={8} onPress={() => remove(block.id)} style={{ marginLeft: 10 }}>
              <Icon name="minus" size={20} color={theme.colors.textFaint} />
            </Pressable>
          </View>
        ))}

        <Pressable
          style={[styles.addBlock, { borderColor: theme.colors.accent }]}
          onPress={() => {}}
        >
          <Icon name="plus" size={18} color={theme.colors.accent} />
          <Text style={{ color: theme.colors.accent, fontWeight: '700' }}>Add Block</Text>
        </Pressable>

        <Text style={{ color: theme.colors.textFaint, textAlign: 'center', marginTop: 18, fontSize: 12 }}>
          Sections pull from your installed extensions
        </Text>
      </ScrollView>
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
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 14,
    paddingHorizontal: 12,
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    marginBottom: 12,
  },
  moveCol: {
    alignItems: 'center',
    gap: 1,
  },
  addBlock: {
    flexDirection: 'row',
    gap: 8,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 16,
    borderRadius: 14,
    borderWidth: 1.5,
    borderStyle: 'dashed',
    marginTop: 6,
  },
});
