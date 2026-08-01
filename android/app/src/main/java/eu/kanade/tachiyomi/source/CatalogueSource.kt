/*
 * Vendored Tachiyomi source-api. Must stay under `eu.kanade.tachiyomi.source`
 * for extension runtime compatibility. Signatures mirror keiyoushi/extensions-lib
 * (Apache 2.0 — see NOTICE).
 *
 * Declares both extension-lib generations. The suspend `get*` members carry
 * bodies that bridge to the 1.4 Observable `fetch*` members, so a source that
 * only implements the older API still answers the newer calls. [HttpSource]
 * overrides them; these defaults only matter for a source that implements
 * `CatalogueSource` directly.
 */
package eu.kanade.tachiyomi.source

import com.manhwa.engine.awaitSingle
import eu.kanade.tachiyomi.source.model.FilterList
import eu.kanade.tachiyomi.source.model.MangasPage
import eu.kanade.tachiyomi.source.model.Page
import eu.kanade.tachiyomi.source.model.SChapter
import eu.kanade.tachiyomi.source.model.SManga
import eu.kanade.tachiyomi.source.model.SMangaUpdate
import rx.Observable

@Suppress("unused")
interface CatalogueSource : Source {

    /** An ISO 639-1 compliant language code (two letters in lower case). */
    val lang: String

    // region extension-lib 1.6 suspend API

    override suspend fun getPopularManga(page: Int): MangasPage =
        @Suppress("DEPRECATION") fetchPopularManga(page).awaitSingle()

    override suspend fun getLatestUpdates(page: Int): MangasPage =
        @Suppress("DEPRECATION") fetchLatestUpdates(page).awaitSingle()

    override suspend fun getSearchManga(page: Int, query: String, filters: FilterList): MangasPage =
        @Suppress("DEPRECATION") fetchSearchManga(page, query, filters).awaitSingle()

    override suspend fun getMangaUpdate(
        manga: SManga,
        chapters: List<SChapter>,
        fetchDetails: Boolean,
        fetchChapters: Boolean,
    ): SMangaUpdate {
        @Suppress("DEPRECATION")
        val details = if (fetchDetails) fetchMangaDetails(manga).awaitSingle() else manga
        @Suppress("DEPRECATION")
        val updated = if (fetchChapters) fetchChapterList(manga).awaitSingle() else chapters
        return SMangaUpdate(details, updated)
    }

    override suspend fun getPageList(chapter: SChapter): List<Page> =
        @Suppress("DEPRECATION") fetchPageList(chapter).awaitSingle()

    // endregion
    // region extension-lib 1.4 Observable API

    @Deprecated("Use the suspend API instead", ReplaceWith("getPopularManga"))
    fun fetchPopularManga(page: Int): Observable<MangasPage> =
        throw UnsupportedOperationException("$name does not implement fetchPopularManga")

    @Deprecated("Use the suspend API instead", ReplaceWith("getSearchManga"))
    fun fetchSearchManga(page: Int, query: String, filters: FilterList): Observable<MangasPage> =
        throw UnsupportedOperationException("$name does not implement fetchSearchManga")

    @Deprecated("Use the suspend API instead", ReplaceWith("getLatestUpdates"))
    fun fetchLatestUpdates(page: Int): Observable<MangasPage> =
        throw UnsupportedOperationException("$name does not implement fetchLatestUpdates")

    // endregion
    // region Related mangas (Komikku-only; never invoked here)

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

    // endregion
}
