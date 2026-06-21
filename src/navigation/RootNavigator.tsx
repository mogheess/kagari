import React from 'react';
import { NavigationContainer, DefaultTheme, DarkTheme } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { useTheme } from '../theme/ThemeProvider';
import { TabsScreen } from './TabsScreen';
import { MangaDetailScreen } from '../screens/MangaDetailScreen';
import { ReaderScreen } from '../screens/ReaderScreen';
import { CustomizeHomeScreen } from '../screens/CustomizeHomeScreen';
import { ExtensionsScreen } from '../screens/ExtensionsScreen';
import { CategoriesScreen } from '../screens/CategoriesScreen';
import { DownloadsScreen } from '../screens/DownloadsScreen';
import type { RootStackParamList } from './types';

const Stack = createNativeStackNavigator<RootStackParamList>();

export function RootNavigator() {
  const theme = useTheme();

  const navTheme = {
    ...(theme.scheme === 'dark' ? DarkTheme : DefaultTheme),
    colors: {
      ...(theme.scheme === 'dark' ? DarkTheme : DefaultTheme).colors,
      background: theme.colors.bg,
      card: theme.colors.bg,
      text: theme.colors.text,
      primary: theme.colors.accent,
      border: theme.colors.border,
    },
  };

  return (
    <NavigationContainer theme={navTheme}>
      <Stack.Navigator
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: theme.colors.bg },
          animation: 'slide_from_right',
        }}
      >
        <Stack.Screen name="Tabs" component={TabsScreen} />
        <Stack.Screen name="MangaDetail" component={MangaDetailScreen} />
        <Stack.Screen
          name="Reader"
          component={ReaderScreen}
          options={{ animation: 'fade' }}
        />
        <Stack.Screen name="CustomizeHome" component={CustomizeHomeScreen} />
        <Stack.Screen name="Extensions" component={ExtensionsScreen} />
        <Stack.Screen name="Categories" component={CategoriesScreen} />
        <Stack.Screen name="Downloads" component={DownloadsScreen} />
      </Stack.Navigator>
    </NavigationContainer>
  );
}
