/*
 * Vendored Tachiyomi source-api. Must stay under `eu.kanade.tachiyomi.source`
 * for extension runtime compatibility. Signatures mirror keiyoushi/extensions-lib
 * (Apache 2.0 — see NOTICE).
 */
package eu.kanade.tachiyomi.source

import eu.kanade.tachiyomi.source.model.Page
import eu.kanade.tachiyomi.source.model.SChapter
import eu.kanade.tachiyomi.source.model.SManga
import rx.Observable

/**
 * A basic interface for creating a source. It could be an online source, a local source, etc.
 */
@Suppress("unused")
interface Source {

    /** Id for the source. Must be unique. */
    val id: Long

    /** Name of the source. */
    val name: String

    /** Returns an observable with the updated details for a manga. */
    fun fetchMangaDetails(manga: SManga): Observable<SManga>

    /** Returns an observable with all the available chapters for a manga. */
    fun fetchChapterList(manga: SManga): Observable<List<SChapter>>

    /** Returns an observable with the list of pages a chapter has. */
    fun fetchPageList(chapter: SChapter): Observable<List<Page>>
}
