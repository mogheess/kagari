/**
 * Manhwa \u2014 a custom manga reader with Tachiyomi/Mihon-compatible extensions.
 *
 * UI: React Native. Extension engine: native Kotlin (see android/ engine module).
 */
import React from 'react';
import { StatusBar } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { ThemeProvider, useTheme } from './src/theme/ThemeProvider';
import { HomeConfigProvider } from './src/home/HomeConfig';
import { EngineModeProvider, useEngineMode } from './src/engine/EngineModeProvider';
import { RootNavigator } from './src/navigation/RootNavigator';

function ThemedStatusBar() {
  const theme = useTheme();
  return <StatusBar barStyle={theme.scheme === 'dark' ? 'light-content' : 'dark-content'} />;
}

function NavigatorWithEngineRemount() {
  // Remount the whole navigator when the engine mode changes so every screen
  // re-fetches from the newly selected engine.
  const { epoch } = useEngineMode();
  return <RootNavigator key={epoch} />;
}

function App() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <ThemeProvider>
          <EngineModeProvider>
            <HomeConfigProvider>
              <ThemedStatusBar />
              <NavigatorWithEngineRemount />
            </HomeConfigProvider>
          </EngineModeProvider>
        </ThemeProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

export default App;
