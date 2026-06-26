import React from 'react';
import { Modal, View, Text, Pressable, ScrollView, StyleSheet } from 'react-native';
import { useTheme } from '../theme/ThemeProvider';
import { useWhatsNew, dismissWhatsNew } from '../app/whatsNew';

/**
 * One-time release-notes sheet. Driven by the whatsNew store, it appears once
 * after the app updates and dismisses to the current version.
 */
export function WhatsNewSheet() {
  const theme = useTheme();
  const entries = useWhatsNew();
  const visible = !!entries && entries.length > 0;
  const headline = entries?.[0]?.version;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      statusBarTranslucent
      onRequestClose={dismissWhatsNew}
    >
      <View style={styles.backdrop}>
        <View style={[styles.card, { backgroundColor: theme.colors.elevated, borderColor: theme.colors.border }]}>
          <Text style={[styles.eyebrow, { color: theme.colors.accent }]}>WHAT'S NEW</Text>
          <Text style={[theme.typography.heading, { color: theme.colors.text, marginTop: 4 }]}>
            {headline ? `Kagari v${headline}` : 'Kagari'}
          </Text>

          <ScrollView style={styles.scroll} showsVerticalScrollIndicator={false}>
            {entries?.map((e, idx) => (
              <View key={e.version} style={{ marginTop: idx === 0 ? 16 : 18 }}>
                {entries.length > 1 ? (
                  <Text style={[styles.verLabel, { color: theme.colors.textFaint }]}>v{e.version}</Text>
                ) : null}
                {e.highlights.map((h, i) => (
                  <View key={i} style={styles.bullet}>
                    <View style={[styles.dot, { backgroundColor: theme.colors.accent }]} />
                    <Text style={[styles.bulletText, { color: theme.colors.textMuted }]}>{h}</Text>
                  </View>
                ))}
              </View>
            ))}
          </ScrollView>

          <Pressable
            onPress={dismissWhatsNew}
            style={({ pressed }) => [
              styles.btn,
              { backgroundColor: theme.colors.accent, opacity: pressed ? 0.85 : 1 },
            ]}
          >
            <Text style={{ color: theme.colors.onAccent, fontWeight: '800', fontSize: 15 }}>Got it</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.55)',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 28,
  },
  card: {
    width: '100%',
    maxWidth: 420,
    borderRadius: 22,
    borderWidth: StyleSheet.hairlineWidth,
    padding: 22,
  },
  eyebrow: {
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1.4,
  },
  scroll: {
    maxHeight: 360,
  },
  verLabel: {
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1.2,
    marginBottom: 8,
  },
  bullet: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 11,
    marginBottom: 12,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    marginTop: 7,
  },
  bulletText: {
    flex: 1,
    fontSize: 14,
    lineHeight: 20,
  },
  btn: {
    height: 48,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 20,
  },
});
