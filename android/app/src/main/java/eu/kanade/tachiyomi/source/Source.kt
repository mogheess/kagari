/*
 * Adapted from Mihon / Tachiyomi (https://github.com/mihonapp/mihon)
 * Licensed under the Apache License, Version 2.0. See NOTICE in repo root.
 *
 * Part of the vendored Tachiyomi source-api. Must stay under
 * `eu.kanade.tachiyomi.source` for extension runtime compatibility.
 */
package eu.kanade.tachiyomi.source

import eu.kanade.tachiyomi.source.model.Page
import eu.kanade.tachiyomi.source.model.SChapter
import eu.kanade.tachiyomi.source.model.SManga
import rx.Observable

/**
 * A basic interface for creating a source. It could be an online source, a
 * local source, etc.
 */
interface Source {
    /** Id of the source. Stable across installs (typically derived from name+lang). */
    val id: Long

    /** Name of the source. */
    val name: String

    val lang: String
        get() = ""

    // --- Modern suspend API (preferred) ---

    suspend fun getMangaDetails(manga: SManga): SManga = throw NotImplementedError()

    suspend fun getChapterList(manga: SManga): List<SChapter> = throw NotImplementedError()

    suspend fun getPageList(chapter: SChapter): List<Page> = throw NotImplementedError()

    // --- Deprecated RxJava API (older extensions still implement these) ---

    @Deprecated("Use the suspend variant", ReplaceWith("getMangaDetails(manga)"))
    fun fetchMangaDetails(manga: SManga): Observable<SManga> = throw NotImplementedError()

    @Deprecated("Use the suspend variant", ReplaceWith("getChapterList(manga)"))
    fun fetchChapterList(manga: SManga): Observable<List<SChapter>> = throw NotImplementedError()

    @Deprecated("Use the suspend variant", ReplaceWith("getPageList(chapter)"))
    fun fetchPageList(chapter: SChapter): Observable<List<Page>> = throw NotImplementedError()
}
