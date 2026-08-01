/**
 * Browsable release notes.
 *
 * The "What's new" sheet shows a version's notes once, right after an update.
 * This screen is the place to go back and read them at any time, including
 * releases the user skipped over.
 */
import React from 'react';
import { View, Text, Pressable, StyleSheet, ScrollView, Linking } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { useTheme } from '../theme/ThemeProvider';
import { Icon } from '../components/Icon';
import { CHANGELOG } from '../app/changelog';
import { APP_VERSION, RELEASES_PAGE_URL, compareVersions } from '../app/version';

function formatDate(iso?: string): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' });
}

export function ChangelogScreen() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const navigation = useNavigation();

  return (
    <View style={{ flex: 1, backgroundColor: theme.colors.bg }}>
      <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
        <Pressable hitSlop={10} onPress={() => navigation.goBack()}>
          <Icon name="back" size={24} color={theme.colors.text} />
        </Pressable>
        <Text style={[theme.typography.heading, { color: theme.colors.text, flex: 1 }]}>
          What's new
        </Text>
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{
          paddingHorizontal: theme.spacing.lg,
          paddingBottom: insets.bottom + 40,
        }}
      >
        {CHANGELOG.map(entry => {
          const installed = compareVersions(entry.version, APP_VERSION) === 0;
          const date = formatDate(entry.date);
          return (
            <View
              key={entry.version}
              style={[
                styles.card,
                { backgroundColor: theme.colors.surface, borderColor: theme.colors.border },
              ]}
            >
              <View style={styles.cardHeader}>
                <Text style={[theme.typography.heading, { color: theme.colors.text }]}>
                  Version {entry.version}
                </Text>
                {installed ? (
                  <View style={[styles.pill, { backgroundColor: theme.colors.accent }]}>
                    <Text
                      style={{ color: theme.colors.onAccent, fontSize: 11, fontWeight: '800' }}
                    >
                      Installed
                    </Text>
                  </View>
                ) : null}
              </View>
              {date ? (
                <Text style={{ color: theme.colors.textFaint, fontSize: 12, marginTop: 2 }}>
                  {date}
                </Text>
              ) : null}

              <View style={{ marginTop: 12, gap: 10 }}>
                {entry.highlights.map((line, i) => (
                  <View key={i} style={styles.bullet}>
                    <View style={[styles.dot, { backgroundColor: theme.colors.accent }]} />
                    <Text style={[theme.typography.body, { color: theme.colors.textMuted, flex: 1 }]}>
                      {line}
                    </Text>
                  </View>
                ))}
              </View>
            </View>
          );
        })}

        <Pressable
          onPress={() => Linking.openURL(RELEASES_PAGE_URL)}
          style={({ pressed }) => [
            styles.releasesLink,
            { backgroundColor: pressed ? theme.colors.surface : 'transparent' },
          ]}
        >
          <Icon name="globe" size={18} color={theme.colors.textMuted} />
          <Text style={{ color: theme.colors.textMuted, fontSize: 13, fontWeight: '600' }}>
            All releases on GitHub
          </Text>
        </Pressable>
      </ScrollView>
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
  card: {
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    padding: 16,
    marginBottom: 14,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  pill: {
    paddingHorizontal: 9,
    paddingVertical: 3,
    borderRadius: 999,
  },
  bullet: {
    flexDirection: 'row',
    gap: 10,
  },
  dot: {
    width: 5,
    height: 5,
    borderRadius: 3,
    marginTop: 8,
  },
  releasesLink: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
    borderRadius: 12,
    marginTop: 4,
  },
});
