/**
 * Launch prompt for a newer release, showing that release's own notes.
 *
 * Sits behind the "What's new" sheet: right after updating, the user should
 * read what they just got, not be asked to update again by a stale check.
 */
import React from 'react';
import { Modal, View, Text, Pressable, ScrollView, StyleSheet, Linking } from 'react-native';
import { useTheme } from '../theme/ThemeProvider';
import { useUpdatePrompt, dismissUpdatePrompt } from '../app/updatePrompt';
import { useWhatsNew } from '../app/whatsNew';

/** How many parsed lines of the release body to show before it's just noise. */
const MAX_LINES = 14;

interface Line {
  kind: 'heading' | 'bullet' | 'text';
  text: string;
}

/**
 * Renders a GitHub release body as plain lines.
 *
 * The body is Markdown, and pulling in a renderer for a dialog that shows a
 * handful of bullets isn't worth it — headings, list items and inline emphasis
 * cover essentially every release note we publish.
 */
export function parseReleaseNotes(body?: string): Line[] {
  if (!body) return [];
  const out: Line[] = [];

  for (const raw of body.split(/\r?\n/)) {
    let line = raw.trim();
    if (!line || /^([-*_]\s*){3,}$/.test(line)) continue; // blank or horizontal rule

    const heading = line.match(/^#{1,6}\s+(.*)$/);
    const bullet = line.match(/^[-*+]\s+(.*)$/);
    line = (heading?.[1] ?? bullet?.[1] ?? line)
      .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1') // links -> text
      .replace(/`([^`]+)`/g, '$1')
      .replace(/\*\*([^*]+)\*\*/g, '$1')
      .replace(/(^|\s)[*_]([^*_]+)[*_]/g, '$1$2')
      .trim();
    if (!line) continue;

    out.push({ kind: heading ? 'heading' : bullet ? 'bullet' : 'text', text: line });
    if (out.length >= MAX_LINES) break;
  }

  return out;
}

export function UpdateAvailableSheet() {
  const theme = useTheme();
  const latest = useUpdatePrompt();
  const whatsNew = useWhatsNew();

  // Never stack the two dialogs.
  const visible = !!latest && !(whatsNew && whatsNew.length > 0);
  const lines = parseReleaseNotes(latest?.notes);

  const close = () => latest && dismissUpdatePrompt(latest.version);
  const download = () => {
    if (!latest) return;
    dismissUpdatePrompt(latest.version);
    void Linking.openURL(latest.url);
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      statusBarTranslucent
      onRequestClose={close}
    >
      <View style={styles.backdrop}>
        <View
          style={[
            styles.card,
            { backgroundColor: theme.colors.elevated, borderColor: theme.colors.border },
          ]}
        >
          <Text style={[styles.eyebrow, { color: theme.colors.accent }]}>UPDATE AVAILABLE</Text>
          <Text style={[theme.typography.heading, { color: theme.colors.text, marginTop: 4 }]}>
            Kagari v{latest?.version}
          </Text>

          {lines.length > 0 ? (
            <ScrollView style={styles.scroll} showsVerticalScrollIndicator={false}>
              {lines.map((line, i) =>
                line.kind === 'heading' ? (
                  <Text
                    key={i}
                    style={[styles.heading, { color: theme.colors.text, marginTop: i === 0 ? 16 : 16 }]}
                  >
                    {line.text}
                  </Text>
                ) : line.kind === 'bullet' ? (
                  <View key={i} style={[styles.bullet, { marginTop: i === 0 ? 16 : 0 }]}>
                    <View style={[styles.dot, { backgroundColor: theme.colors.accent }]} />
                    <Text style={[styles.bulletText, { color: theme.colors.textMuted }]}>
                      {line.text}
                    </Text>
                  </View>
                ) : (
                  <Text
                    key={i}
                    style={[styles.bulletText, { color: theme.colors.textMuted, marginTop: 12 }]}
                  >
                    {line.text}
                  </Text>
                ),
              )}
            </ScrollView>
          ) : (
            <Text style={[styles.bulletText, { color: theme.colors.textMuted, marginTop: 14 }]}>
              A newer version of Kagari is ready to download.
            </Text>
          )}

          <Pressable
            onPress={download}
            style={({ pressed }) => [
              styles.btn,
              { backgroundColor: theme.colors.accent, opacity: pressed ? 0.85 : 1 },
            ]}
          >
            <Text style={{ color: theme.colors.onAccent, fontWeight: '800', fontSize: 15 }}>
              Download
            </Text>
          </Pressable>
          <Pressable onPress={close} style={styles.laterBtn}>
            <Text style={{ color: theme.colors.textMuted, fontWeight: '700', fontSize: 13.5 }}>
              Later
            </Text>
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
    maxHeight: 320,
  },
  heading: {
    fontSize: 13,
    fontWeight: '800',
    marginBottom: 10,
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
  laterBtn: {
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 4,
  },
});
