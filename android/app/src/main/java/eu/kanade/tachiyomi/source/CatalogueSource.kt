/*
 * Vendored Tachiyomi source-api. Must stay under `eu.kanade.tachiyomi.source`
 * for extension runtime compatibility. Signatures mirror keiyoushi/extensions-lib
 * (Apache 2.0 — see NOTICE).
 */
package eu.kanade.tachiyomi.source

import eu.kanade.tachiyomi.source.model.FilterList
import eu.kanade.tachiyomi.source.model.MangasPage
import eu.kanade.tachiyomi.source.model.SManga
import rx.Observable

@Suppress("unused")
interface CatalogueSource : Source {

    /** An ISO 639-1 compliant language code (two letters in lower case). */
    val lang: String

    /** Whether the source has support for latest updates. */
    val supportsLatest: Boolean

    /** Returns an observable containing a page with a list of manga. */
    fun fetchPopularManga(page: Int): Observable<MangasPage>

    /** Returns an observable containing a page with a list of manga. */
    fun fetchSearchManga(page: Int, query: String, filters: FilterList): Observable<MangasPage>

    /** Returns an observable containing a page with a list of latest manga updates. */
    fun fetchLatestUpdates(page: Int): Observable<MangasPage>

    /** Returns the list of filters for the source. */
    fun getFilterList(): FilterList

    /**
     * Whether the source provides custom related mangas. Only supported on Komikku.
     */
    val supportsRelatedMangas: Boolean get() = false

    /** Only supported on Komikku. */
    val disableRelatedMangasBySearch: Boolean get() = false

    /** Only supported on Komikku. */
    val disableRelatedMangas: Boolean get() = false

    /** Only supported on Komikku. */
    suspend fun fetchRelatedMangaList(manga: SManga): List<SManga> =
        throw UnsupportedOperationException("Unsupported!")
}
