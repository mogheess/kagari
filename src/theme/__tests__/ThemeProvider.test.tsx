jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(async () => null),
  setItem: jest.fn(async () => undefined),
}));

import React from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import TestRenderer, { act } from 'react-test-renderer';
import { ThemeProvider, useBackdrop } from '../ThemeProvider';

const APPEARANCE_KEY = '@kagari/appearance/v1';

/** The backdrop in use once stored settings (or none) have loaded. */
async function backdropAfterLoad(stored: Record<string, unknown> | null): Promise<string> {
  jest
    .mocked(AsyncStorage.getItem)
    .mockImplementation(async (key: string) =>
      key === APPEARANCE_KEY && stored ? JSON.stringify(stored) : null,
    );
  let seen = '';
  function Probe() {
    seen = useBackdrop()?.id ?? 'none';
    return null;
  }
  let renderer: TestRenderer.ReactTestRenderer | undefined;
  await act(async () => {
    renderer = TestRenderer.create(
      <ThemeProvider>
        <Probe />
      </ThemeProvider>,
    );
  });
  act(() => renderer?.unmount());
  return seen;
}

describe('default backdrop', () => {
  test('a fresh install shows the Ink artwork', async () => {
    expect(await backdropAfterLoad(null)).toBe('ink');
  });

  test('settings saved before backdrops existed pick up the default', async () => {
    const stored = { themeId: 'paper', amoled: false, density: 'compact', corners: 'soft' };
    expect(await backdropAfterLoad(stored)).toBe('ink');
  });

  test('an explicit None stays off', async () => {
    const stored = { themeId: 'ink', amoled: false, density: 'comfortable', corners: 'soft', backdrop: 'none' };
    expect(await backdropAfterLoad(stored)).toBe('none');
  });

  test('a picked backdrop is kept', async () => {
    const stored = { themeId: 'ink', amoled: false, density: 'comfortable', corners: 'soft', backdrop: 'sakura' };
    expect(await backdropAfterLoad(stored)).toBe('sakura');
  });
});
