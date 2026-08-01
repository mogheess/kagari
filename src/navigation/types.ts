import type { MangaDto, ChapterDto } from '../engine/types';

export type TabKey = 'home' | 'library' | 'discover' | 'updates' | 'profile';

export type RootStackParamList = {
  Tabs: undefined;
  MangaDetail: { sourceId: string; mangaUrl: string; preview?: MangaDto };
  Reader: {
    sourceId: string;
    mangaUrl: string;
    /** Manga title/cover for actions like queuing a download from the reader. */
    mangaTitle?: string;
    mangaThumbnailUrl?: string;
    chapter: ChapterDto;
    chapters: ChapterDto[];
    /** 0-based page to open at (resume). Honored in paged modes. */
    initialPage?: number;
    /**
     * Open on the last page instead of the first. Set when the reader walks
     * backwards into the previous chapter, so the user lands where they'd have
     * been had they read straight through.
     */
    startAtEnd?: boolean;
  };
  Changelog: undefined;
  CustomizeHome: undefined;
  Extensions: undefined;
  Categories: undefined;
  Downloads: undefined;
  TierLists: undefined;
};
