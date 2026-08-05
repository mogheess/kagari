/*
 * Vendored Tachiyomi source-api. Must stay under `eu.kanade.tachiyomi.source`
 * for extension runtime compatibility. Signatures mirror keiyoushi/extensions-lib
 * (Apache 2.0 — see NOTICE).
 *
 * Covers extension-lib 1.4 and 1.6. 1.6 moved the browse/read entry points from
 * RxJava `fetch*` to `suspend get*` and added [getMangaUpdate], which returns
 * details and chapters together. Both generations are declared here: 1.4
 * extensions override the `fetch*` methods, 1.6 extensions override the `get*`
 * ones, and [CatalogueSource] bridges whichever pair is missing. Every member
 * has a body so neither generation hits an AbstractMethodError.
 */
package eu.kanade.tachiyomi.source

import eu.kanade.tachiyomi.source.model.FilterList
import eu.kanade.tachiyomi.source.model.MangasPage
import eu.kanade.tachiyomi.source.model.Page
import eu.kanade.tachiyomi.source.model.SChapter
import eu.kanade.tachiyomi.source.model.SManga
import eu.kanade.tachiyomi.source.model.SMangaUpdate
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

    /** Whether the source has support for latest updates. */
    val supportsLatest: Boolean get() = false

    /** Returns the list of filters for the source. */
    fun getFilterList(): FilterList = FilterList()

    // region extension-lib 1.6 suspend API

    /** Gets a page with a list of popular manga. @since tachiyomix 1.6 */
    suspend fun getPopularManga(page: Int): MangasPage = unsupported("getPopularManga")

    /** Gets a page with a list of latest manga updates. @since tachiyomix 1.6 */
    suspend fun getLatestUpdates(page: Int): MangasPage = unsupported("getLatestUpdates")

    /** Gets a page of search results. @since tachiyomix 1.6 */
    suspend fun getSearchManga(page: Int, query: String, filters: FilterList): MangasPage =
        unsupported("getSearchManga")

    /**
     * Fetches updated details and/or chapters for a manga in one call.
     *
     * A value that wasn't requested may be returned unchanged.
     *
     * @since tachiyomix 1.6
     */
    suspend fun getMangaUpdate(
        manga: SManga,
        chapters: List<SChapter>,
        fetchDetails: Boolean,
        fetchChapters: Boolean,
    ): SMangaUpdate = unsupported("getMangaUpdate")

    /** Gets the pages of a chapter, in reading order. @since tachiyomix 1.6 */
    suspend fun getPageList(chapter: SChapter): List<Page> = unsupported("getPageList")

    // endregion
    // region extension-lib 1.4 Observable API (deprecated upstream, still widely implemented)

    @Deprecated("Use the combined suspend API instead", ReplaceWith("getMangaUpdate"))
    fun fetchMangaDetails(manga: SManga): Observable<SManga> = unsupported("fetchMangaDetails")

    @Deprecated("Use the combined suspend API instead", ReplaceWith("getMangaUpdate"))
    fun fetchChapterList(manga: SManga): Observable<List<SChapter>> =
        unsupported("fetchChapterList")

    @Deprecated("Use the suspend API instead", ReplaceWith("getPageList"))
    fun fetchPageList(chapter: SChapter): Observable<List<Page>> = unsupported("fetchPageList")

    // endregion

    private fun unsupported(method: String): Nothing =
        throw UnsupportedOperationException("$name does not implement $method")
}
