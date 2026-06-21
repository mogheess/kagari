/**
 * In-memory reader preferences. Kept module-level so a choice persists across
 * chapters within a session (no native storage dependency yet).
 */
export type ReaderMode = 'webtoon' | 'vertical' | 'ltr' | 'rtl';

export interface ReaderModeOption {
  mode: ReaderMode;
  label: string;
  hint: string;
}

export const READER_MODES: ReaderModeOption[] = [
  { mode: 'webtoon', label: 'Webtoon', hint: 'Continuous long strip' },
  { mode: 'vertical', label: 'Vertical', hint: 'One page per swipe (up/down)' },
  { mode: 'ltr', label: 'Left to right', hint: 'Paged, western order' },
  { mode: 'rtl', label: 'Right to left', hint: 'Paged, manga order' },
];

let mode: ReaderMode = 'webtoon';

export function getReaderMode(): ReaderMode {
  return mode;
}

export function setReaderMode(next: ReaderMode): void {
  mode = next;
}

export function isPaged(m: ReaderMode): boolean {
  return m !== 'webtoon';
}

export function isHorizontal(m: ReaderMode): boolean {
  return m === 'ltr' || m === 'rtl';
}
