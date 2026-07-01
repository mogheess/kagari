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
  };
  CustomizeHome: undefined;
  Extensions: undefined;
  Categories: undefined;
  Downloads: undefined;
  TierLists: undefined;
};
