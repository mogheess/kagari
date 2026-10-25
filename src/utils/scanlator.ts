import type { ChapterDto } from '../engine/types';

/**
 * A chapter's scan group as shown and compared. Some sources fill scanlator
 * with only whitespace or zero-width spaces; those count as no group.
 */
export function cleanScanlator(name: string | undefined): string {
  return (name ?? '').replace(/[​-‍﻿]/g, '').trim();
}

export function scanlatorOf(chapter: ChapterDto): string {
  return cleanScanlator(chapter.scanlator);
}
