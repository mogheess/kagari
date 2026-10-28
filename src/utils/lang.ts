/** Maps Tachiyomi source language codes to short, readable labels. */
const LABELS: Record<string, string> = {
  all: 'Multi',
  other: 'Other',
  en: 'EN',
  es: 'ES',
  'es-419': 'LATAM',
  pt: 'PT',
  'pt-br': 'PT-BR',
  fr: 'FR',
  de: 'DE',
  it: 'IT',
  ru: 'RU',
  ja: 'JA',
  ko: 'KO',
  zh: 'ZH',
  'zh-hans': 'ZH-CN',
  'zh-hant': 'ZH-TW',
  id: 'ID',
  vi: 'VI',
  th: 'TH',
  ar: 'AR',
  tr: 'TR',
  pl: 'PL',
};

export function langLabel(code: string): string {
  if (!code) return '??';
  return LABELS[code.toLowerCase()] ?? code.toUpperCase();
}

// Ordering for language lists; `sources/languageOrder.ts` explains it and
// supplies the phone's languages.

/** Base language of a source or locale code: `pt-BR` → `pt`, `zh_Hant` → `zh`. */
export function baseLanguage(code: string): string {
  return code.toLowerCase().split(/[-_]/)[0];
}

/** Base languages in preference order. */
export function preferredLanguages(device: readonly string[], enabled: readonly string[]): string[] {
  return [...new Set([...device.map(baseLanguage), 'en', ...enabled.map(baseLanguage)].filter(Boolean))];
}

/** Position in `preferred`, or after all of them. */
export function languageRank(code: string, preferred: readonly string[]): number {
  const i = preferred.indexOf(baseLanguage(code));
  return i < 0 ? preferred.length : i;
}

/**
 * Sorts source language codes: preferred ones in their order (a plain code
 * before its variants), then the rest by label.
 */
export function compareLanguages(a: string, b: string, preferred: readonly string[]): number {
  const rank = languageRank(a, preferred) - languageRank(b, preferred);
  if (rank !== 0) return rank;
  if (languageRank(a, preferred) < preferred.length) {
    const variant = Number(a.includes('-')) - Number(b.includes('-'));
    if (variant !== 0) return variant;
  }
  return langLabel(a).localeCompare(langLabel(b));
}
