/**
 * Kagari \u2014 a custom manga reader with Tachiyomi/Mihon-compatible extensions.
 *
 * UI: React Native. Extension engine: native Kotlin (see android/ engine module).
 * There is no demo data \u2014 all content comes from installed extensions.
 */
import React, { useEffect } from 'react';
import { AppState, StatusBar, ToastAndroid } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { ThemeProvider, useTheme } from './src/theme/ThemeProvider';
import { HomeConfigProvider } from './src/home/HomeConfig';
import { RootNavigator } from './src/navigation/RootNavigator';
import { getEngine } from './src/engine';
import { checkForAppUpdate } from './src/app/appUpdate';
import { checkExtensionUpdates } from './src/sources/extensionUpdates';
import { checkLibraryUpdates, mergeBackgroundUpdates } from './src/library/libraryUpdates';
import { getBackgroundUpdateSettings, initBackgroundUpdates } from './src/library/backgroundUpdates';
import { favoritesHydrated, getFavorites, subscribeFavorites } from './src/library/favorites';
import { requestNotificationPermission } from './src/app/notificationPermission';
import { initWhatsNew } from './src/app/whatsNew';
import { adoptDownloadedTitles } from './src/library/downloadsLibrary';
import { WhatsNewSheet } from './src/components/WhatsNewSheet';
import { UpdateAvailableSheet } from './src/components/UpdateAvailableSheet';

function ThemedStatusBar() {
  const theme = useTheme();
  return <StatusBar barStyle={theme.scheme === 'dark' ? 'light-content' : 'dark-content'} />;
}

/**
 * Fires the (throttled, best-effort) app + extension update checks shortly after
 * launch and whenever the app returns to the foreground, so update indicators are
 * ready before the user opens Settings/Extensions.
 */
function UpdateBootstrap() {
  useEffect(() => {
    // One-time post-update release notes (runs once per launch).
    void initWhatsNew();
    // Keep the closed-app new-chapters check scheduled to the saved setting.
    initBackgroundUpdates();
    // Downloads now live with their titles in the library (once): bring in
    // titles that were only reachable from the old Downloads screen.
    adoptDownloadedTitles()
      .then(added => {
        if (added === 0) return;
        ToastAndroid.show(
          `Added ${added} downloaded ${added === 1 ? 'title' : 'titles'} to your library`,
          ToastAndroid.LONG,
        );
      })
      .catch(() => {});
    const run = () => {
      void checkForAppUpdate();
      void checkExtensionUpdates(getEngine());
      // Fold in what the closed-app check found before scanning again, so the
      // scan sees those chapters as known.
      mergeBackgroundUpdates(getEngine())
        .then(() => checkLibraryUpdates(getEngine()))
        .catch(() => {});
    };
    const t = setTimeout(run, 2500);
    // Re-check periodically during a long-running session too (both checks are
    // throttled internally, so this won't spam the network). Together with the
    // launch + foreground triggers this means updates surface on their own.
    const interval = setInterval(run, 60 * 60 * 1000);
    const sub = AppState.addEventListener('change', s => {
      if (s === 'active') run();
    });
    return () => {
      clearTimeout(t);
      clearInterval(interval);
      sub.remove();
    };
  }, []);

  // The first title added to the library is when new-chapter notifications
  // start to matter: ask then (once), not at launch.
  useEffect(() => {
    // Null until the library has loaded: loading an existing library isn't
    // "adding a first title".
    let hadAny: boolean | null = favoritesHydrated() ? getFavorites().length > 0 : null;
    return subscribeFavorites(() => {
      if (!favoritesHydrated()) return;
      const hasAny = getFavorites().length > 0;
      if (hadAny === false && hasAny && getBackgroundUpdateSettings().intervalHours > 0) {
        requestNotificationPermission({ unprompted: true }).catch(() => {});
      }
      hadAny = hasAny;
    });
  }, []);
  return null;
}

function App() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <ThemeProvider>
          <HomeConfigProvider>
            <ThemedStatusBar />
            <UpdateBootstrap />
            <RootNavigator />
            {/* Order matters only for readability — UpdateAvailableSheet keeps
                itself hidden while release notes are pending. */}
            <WhatsNewSheet />
            <UpdateAvailableSheet />
          </HomeConfigProvider>
        </ThemeProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

export default App;
