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

/**
 * The codes a language tag answers to, most specific first:
 * `zh-Hant-TW` → `zh-hant-tw`, `zh-hant`, `zh-tw`, `zh`. A source coded with
 * the phone's own script or region (`zh-hant`, `pt-br`) then ranks ahead of
 * the language's other variants.
 */
export function languageKeys(tag: string): string[] {
  const [base, ...rest] = tag.toLowerCase().split(/[-_]/).filter(Boolean);
  if (!base) return [];
  const full = [base, ...rest].join('-');
  return [...new Set([full, ...rest.map(sub => `${base}-${sub}`), base])];
}

/** Language codes in preference order: specific ones, then their base. */
export function preferredLanguages(device: readonly string[], enabled: readonly string[]): string[] {
  return [...new Set([...device.flatMap(languageKeys), 'en', ...enabled.flatMap(languageKeys)])];
}

/** Position in `preferred` (the exact code, else its base), or after all of them. */
export function languageRank(code: string, preferred: readonly string[]): number {
  const exact = preferred.indexOf(code.toLowerCase());
  if (exact >= 0) return exact;
  const base = preferred.indexOf(baseLanguage(code));
  return base < 0 ? preferred.length : base;
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
