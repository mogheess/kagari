/**
 * Kagari \u2014 a custom manga reader with Tachiyomi/Mihon-compatible extensions.
 *
 * UI: React Native. Extension engine: native Kotlin (see android/ engine module).
 * There is no demo data \u2014 all content comes from installed extensions.
 */
import React from 'react';
import { StatusBar } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { ThemeProvider, useTheme } from './src/theme/ThemeProvider';
import { HomeConfigProvider } from './src/home/HomeConfig';
import { RootNavigator } from './src/navigation/RootNavigator';

function ThemedStatusBar() {
  const theme = useTheme();
  return <StatusBar barStyle={theme.scheme === 'dark' ? 'light-content' : 'dark-content'} />;
}

function App() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <ThemeProvider>
          <HomeConfigProvider>
            <ThemedStatusBar />
            <RootNavigator />
          </HomeConfigProvider>
        </ThemeProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

export default App;
