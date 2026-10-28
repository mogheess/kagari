/**
 * Profile → Advanced: the resets people reach for when a source is stuck
 * behind Cloudflare, and help for phones that stop background work.
 *
 * Clearing cookies gets a site out of a bad cookie (a flagged `__cf_bm`, a
 * broken sign-in) that the solver itself can't see past; clearing WebView data
 * also drops the cache and site storage a challenge page can leave behind.
 */
import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Linking,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  ToastAndroid,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { useTheme } from '../theme/ThemeProvider';
import { Icon, type IconName } from '../components/Icon';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { getEngine } from '../engine';
import type { UserAgentInfo, WebViewInfo } from '../engine/types';

const DONT_KILL_MY_APP_URL = 'https://dontkillmyapp.com';

/** Printable ASCII: a header value can't carry anything else. */
const USER_AGENT_PATTERN = /^[\x20-\x7E]{1,512}$/;

type Reset = 'cookies' | 'webview';

const RESETS: Record<Reset, { title: string; message: string; done: string }> = {
  cookies: {
    title: 'Clear cookies?',
    message:
      'Sites you signed in to will sign you out, and sources behind Cloudflare check again on their next load.',
    done: 'Cookies cleared',
  },
  webview: {
    title: 'Clear WebView data?',
    message:
      "Clears cookies plus the built-in browser's cache and site storage. Sites you signed in to will sign you out.",
    done: 'WebView data cleared',
  },
};

export function AdvancedScreen() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const navigation = useNavigation();
  const [confirm, setConfirm] = useState<Reset | null>(null);
  const [busy, setBusy] = useState<Reset | null>(null);
  const [webView, setWebView] = useState<WebViewInfo | null>(null);

  // On focus, so coming back from updating it in the store shows the new version.
  useFocusEffect(
    useCallback(() => {
      getEngine()
        .getWebViewInfo()
        .then(setWebView)
        .catch(() => setWebView(null));
    }, []),
  );

  const runReset = useCallback(async (reset: Reset) => {
    setConfirm(null);
    setBusy(reset);
    try {
      const engine = getEngine();
      await (reset === 'cookies' ? engine.clearCookies() : engine.clearWebViewData());
      ToastAndroid.show(RESETS[reset].done, ToastAndroid.SHORT);
    } catch (e) {
      ToastAndroid.show(e instanceof Error ? e.message : "Couldn't clear it", ToastAndroid.LONG);
    } finally {
      setBusy(null);
    }
  }, []);

  const openWebViewStore = () => {
    const pkg = webView?.packageName;
    if (!pkg) return;
    Linking.openURL(`market://details?id=${pkg}`).catch(() =>
      Linking.openURL(`https://play.google.com/store/apps/details?id=${pkg}`),
    );
  };

  return (
    <View style={[styles.fill, { backgroundColor: theme.colors.bg }]}>
      <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
        <Pressable hitSlop={10} onPress={() => navigation.goBack()}>
          <Icon name="back" size={24} color={theme.colors.text} />
        </Pressable>
        <Text style={[theme.typography.heading, styles.fill, { color: theme.colors.text }]}>
          Advanced
        </Text>
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{
          paddingHorizontal: theme.spacing.lg,
          paddingBottom: insets.bottom + 40,
        }}
      >
        <Text style={[styles.sectionLabel, { color: theme.colors.textFaint }]}>NETWORKING</Text>
        <ActionRow
          icon="trash"
          label="Clear cookies"
          description="For a source stuck on a Cloudflare check or a broken sign-in."
          busy={busy === 'cookies'}
          // One reset at a time: both clear the cookies.
          onPress={busy ? undefined : () => setConfirm('cookies')}
        />
        <ActionRow
          icon="trash"
          label="Clear WebView data"
          description="Also clears the built-in browser's cache and site storage. Try it if clearing cookies didn't help."
          busy={busy === 'webview'}
          onPress={busy ? undefined : () => setConfirm('webview')}
        />
        <ActionRow
          icon="globe"
          label="Android System WebView"
          description={
            webView?.version
              ? webView.outdated
                ? `Version ${webView.version} is too old to pass Cloudflare checks. Update it.`
                : `Version ${webView.version}. Cloudflare checks run in it.`
              : 'Cloudflare checks run in it.'
          }
          warn={webView?.outdated}
          action={webView?.packageName ? 'Update' : undefined}
          onPress={webView?.packageName ? openWebViewStore : undefined}
        />
        <UserAgentRow />

        <Text style={[styles.sectionLabel, styles.laterSection, { color: theme.colors.textFaint }]}>
          BACKGROUND
        </Text>
        <ActionRow
          icon="updates"
          label="Don't kill my app"
          description="Some phones stop apps in the background, which stops new-chapter checks. This site shows how to allow it on yours."
          action="Open"
          onPress={() => Linking.openURL(DONT_KILL_MY_APP_URL)}
        />
      </ScrollView>

      <ConfirmDialog
        visible={confirm !== null}
        title={confirm ? RESETS[confirm].title : ''}
        message={confirm ? RESETS[confirm].message : undefined}
        confirmLabel="Clear"
        destructive
        onConfirm={() => confirm && runReset(confirm)}
        onCancel={() => setConfirm(null)}
      />
    </View>
  );
}

/**
 * The User-Agent every request goes out with: the WebView's unless set here.
 * Mostly for a site that blocks one browser version.
 */
function UserAgentRow() {
  const theme = useTheme();
  const [info, setInfo] = useState<UserAgentInfo | null>(null);
  // The text being edited, or null while not editing.
  const [draft, setDraft] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    getEngine()
      .getUserAgent()
      .then(setInfo)
      .catch(() => setInfo(null));
  }, []);

  const save = useCallback(async (value: string | null) => {
    setSaving(true);
    try {
      const next = await getEngine().setUserAgent(value);
      setInfo(next);
      setDraft(null);
      ToastAndroid.show(
        next.custom ? 'User agent saved' : "Using your WebView's user agent",
        ToastAndroid.SHORT,
      );
    } catch (e) {
      ToastAndroid.show(e instanceof Error ? e.message : "Couldn't save it", ToastAndroid.LONG);
    } finally {
      setSaving(false);
    }
  }, []);

  // An older native build can't report or change it.
  if (!info) return null;

  const trimmed = draft?.trim() ?? '';
  const invalid = draft !== null && trimmed !== '' && !USER_AGENT_PATTERN.test(trimmed);
  // Blank, or the WebView's own, means following the WebView.
  const target = trimmed === '' || trimmed === info.system ? null : trimmed;
  const unchanged = target === (info.custom ? info.current : null);

  return (
    <View
      style={[
        styles.row,
        styles.column,
        theme.elevation.card,
        { backgroundColor: theme.colors.surface, borderColor: theme.colors.border },
      ]}
    >
      <View style={styles.rowTop}>
        <Icon name="edit" size={20} color={theme.colors.textMuted} />
        <View style={styles.fill}>
          <Text style={[theme.typography.body, { color: theme.colors.text }]}>User agent</Text>
          <Text style={[styles.description, { color: theme.colors.textFaint }]}>
            {info.custom
              ? "Set by you. Sources that don't set their own send it."
              : "Your WebView's. Sources that don't set their own send it. Change it only if a site blocks this browser version."}
          </Text>
        </View>
        {draft === null ? (
          <Pressable hitSlop={8} onPress={() => setDraft(info.current)}>
            <Text style={[styles.action, { color: theme.colors.accent }]}>Edit</Text>
          </Pressable>
        ) : null}
      </View>

      {draft === null ? (
        <Text
          numberOfLines={3}
          style={[styles.userAgent, { color: theme.colors.textMuted }]}
        >
          {info.current}
        </Text>
      ) : (
        <>
          <TextInput
            value={draft}
            onChangeText={setDraft}
            multiline
            autoFocus
            autoCapitalize="none"
            autoCorrect={false}
            editable={!saving}
            style={[
              styles.userAgent,
              styles.input,
              { color: theme.colors.text, borderColor: invalid ? theme.colors.danger : theme.colors.border },
            ]}
          />
          {invalid ? (
            <Text style={[styles.description, { color: theme.colors.danger }]}>
              Plain ASCII text only, up to 512 characters.
            </Text>
          ) : null}
          <View style={styles.buttons}>
            <Pressable hitSlop={6} disabled={saving} onPress={() => setDraft(null)}>
              <Text style={[styles.action, { color: theme.colors.textMuted }]}>Cancel</Text>
            </Pressable>
            {info.custom ? (
              <Pressable hitSlop={6} disabled={saving} onPress={() => save(null)}>
                <Text style={[styles.action, { color: theme.colors.textMuted }]}>Use WebView's</Text>
              </Pressable>
            ) : null}
            {saving ? (
              <ActivityIndicator size="small" color={theme.colors.textMuted} />
            ) : (
              <Pressable
                hitSlop={6}
                disabled={invalid || unchanged}
                onPress={() => save(target)}
              >
                <Text
                  style={[
                    styles.action,
                    { color: invalid || unchanged ? theme.colors.textFaint : theme.colors.accent },
                  ]}
                >
                  Save
                </Text>
              </Pressable>
            )}
          </View>
        </>
      )}
    </View>
  );
}

function ActionRow({
  icon,
  label,
  description,
  action,
  busy,
  warn,
  onPress,
}: {
  icon: IconName;
  label: string;
  description: string;
  /** Text on the right; a chevron when absent and the row is pressable. */
  action?: string;
  busy?: boolean;
  warn?: boolean;
  onPress?: () => void;
}) {
  const theme = useTheme();
  return (
    <Pressable
      onPress={onPress}
      disabled={!onPress || busy}
      accessibilityRole={onPress ? 'button' : undefined}
      style={({ pressed }) => [
        styles.row,
        theme.elevation.card,
        {
          backgroundColor: pressed ? theme.colors.elevated : theme.colors.surface,
          borderColor: warn ? theme.colors.accent : theme.colors.border,
        },
      ]}
    >
      <Icon name={icon} size={20} color={warn ? theme.colors.accent : theme.colors.textMuted} />
      <View style={styles.fill}>
        <Text style={[theme.typography.body, { color: theme.colors.text }]}>{label}</Text>
        <Text style={[styles.description, { color: theme.colors.textFaint }]}>{description}</Text>
      </View>
      {busy ? (
        <ActivityIndicator size="small" color={theme.colors.textMuted} />
      ) : action ? (
        <Text style={[styles.action, { color: theme.colors.accent }]}>{action}</Text>
      ) : onPress ? (
        <Icon name="chevronRight" size={18} color={theme.colors.textFaint} />
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  fill: {
    flex: 1,
  },
  laterSection: {
    marginTop: 28,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingHorizontal: 16,
    paddingBottom: 14,
  },
  sectionLabel: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1.4,
    marginBottom: 10,
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
  description: {
    fontSize: 12,
    lineHeight: 17,
    marginTop: 2,
  },
  column: {
    flexDirection: 'column',
    alignItems: 'stretch',
    gap: 10,
  },
  rowTop: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  userAgent: {
    fontSize: 12,
    lineHeight: 17,
    fontFamily: 'monospace',
  },
  input: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 8,
    minHeight: 72,
    textAlignVertical: 'top',
  },
  buttons: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    alignItems: 'center',
    gap: 22,
  },
  action: {
    fontWeight: '700',
    fontSize: 12.5,
  },
});
