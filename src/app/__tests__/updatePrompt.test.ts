import { parseReleaseNotes } from '../../components/UpdateAvailableSheet';

jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(() => Promise.resolve(null)),
  setItem: jest.fn(() => Promise.resolve()),
  removeItem: jest.fn(() => Promise.resolve()),
}));

describe('parseReleaseNotes', () => {
  test('turns a GitHub release body into headings and bullets', () => {
    const body = [
      '## Kagari 0.6',
      '',
      'Some intro line.',
      '',
      '### Extensions',
      '- Reads the new catalogue format.',
      '- Support for the **newer** extension API.',
      '',
      '---',
      '',
      '**Install:** download the APK below.',
    ].join('\n');

    expect(parseReleaseNotes(body)).toEqual([
      { kind: 'heading', text: 'Kagari 0.6' },
      { kind: 'text', text: 'Some intro line.' },
      { kind: 'heading', text: 'Extensions' },
      { kind: 'bullet', text: 'Reads the new catalogue format.' },
      { kind: 'bullet', text: 'Support for the newer extension API.' },
      { kind: 'text', text: 'Install: download the APK below.' },
    ]);
  });

  test('unwraps links and inline code to their text', () => {
    const body = '- See [the docs](https://example.test) and `src/app/version.ts`';

    expect(parseReleaseNotes(body)).toEqual([
      { kind: 'bullet', text: 'See the docs and src/app/version.ts' },
    ]);
  });

  test('caps a long body so the dialog stays readable', () => {
    const body = Array.from({ length: 40 }, (_, i) => `- item ${i}`).join('\n');

    expect(parseReleaseNotes(body)).toHaveLength(14);
  });

  test('handles a missing or empty body', () => {
    expect(parseReleaseNotes(undefined)).toEqual([]);
    expect(parseReleaseNotes('   \n\n---\n')).toEqual([]);
  });
});
