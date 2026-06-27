/**
 * Kagari \u2014 a custom manga reader with Tachiyomi/Mihon-compatible extensions.
 *
 * UI: React Native. Extension engine: native Kotlin (see android/ engine module).
 * There is no demo data \u2014 all content comes from installed extensions.
 */
import React, { useEffect } from 'react';
import { AppState, StatusBar } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { ThemeProvider, useTheme } from './src/theme/ThemeProvider';
import { HomeConfigProvider } from './src/home/HomeConfig';
import { RootNavigator } from './src/navigation/RootNavigator';
import { getEngine } from './src/engine';
import { checkForAppUpdate } from './src/app/appUpdate';
import { checkExtensionUpdates } from './src/sources/extensionUpdates';
import { checkLibraryUpdates } from './src/library/libraryUpdates';
import { initWhatsNew } from './src/app/whatsNew';
import { WhatsNewSheet } from './src/components/WhatsNewSheet';

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
    const run = () => {
      void checkForAppUpdate();
      void checkExtensionUpdates(getEngine());
      void checkLibraryUpdates(getEngine());
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
            <WhatsNewSheet />
          </HomeConfigProvider>
        </ThemeProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

export default App;
