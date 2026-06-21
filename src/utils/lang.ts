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
