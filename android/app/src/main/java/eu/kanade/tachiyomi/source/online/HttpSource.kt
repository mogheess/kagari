/*
 * Vendored Tachiyomi source-api. Must stay under
 * `eu.kanade.tachiyomi.source.online` for extension runtime compatibility.
 *
 * Signatures mirror keiyoushi/extensions-lib's `HttpSource` exactly (Apache 2.0 —
 * see NOTICE) so bundled bases (ParsedHttpSource, Madara, MangaThemesia, ...)
 * link against this class. The bodies are a faithful re-implementation of
 * Mihon's template-method flow.
 *
 * This is an abstract *class*, so every body here is inherited by extension
 * classes through ordinary JVM class dispatch — that is what makes the
 * extension-lib 1.6 suspend API work for extensions that don't implement it.
 * The `*Request`/`*Parse` helpers are `open` rather than `abstract` for the same
 * reason: a 1.6 extension may implement only the suspend entry points and never
 * define the older template methods.
 */
package eu.kanade.tachiyomi.source.online

import com.manhwa.engine.awaitSingle
import eu.kanade.tachiyomi.network.GET
import eu.kanade.tachiyomi.network.NetworkHelper
import eu.kanade.tachiyomi.network.asObservableSuccess
import eu.kanade.tachiyomi.network.awaitSuccess
import eu.kanade.tachiyomi.source.CatalogueSource
import eu.kanade.tachiyomi.source.model.FilterList
import eu.kanade.tachiyomi.source.model.MangasPage
import eu.kanade.tachiyomi.source.model.Page
import eu.kanade.tachiyomi.source.model.SChapter
import eu.kanade.tachiyomi.source.model.SManga
import eu.kanade.tachiyomi.source.model.SMangaUpdate
import okhttp3.Headers
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.Response
import rx.Observable
import uy.kohesive.injekt.injectLazy
import java.net.URI
import java.net.URISyntaxException
import java.security.MessageDigest

/**
 * A simple implementation for sources from a website.
 */
@Suppress("unused", "unused_parameter", "OVERRIDE_DEPRECATION", "DEPRECATION")
abstract class HttpSource : CatalogueSource {

    /** Network service, provided by the host's Injekt graph. */
    protected val network: NetworkHelper by injectLazy()

    /** Base url of the website without the trailing slash, like: http://mysite.com */
    abstract val baseUrl: String

    /**
     * Home page of the website, used as the "Open in WebView" target.
     * Defaults to [baseUrl].
     *
     * @since tachiyomix 1.6
     */
    open fun getHomeUrl(): String = baseUrl

    /** Version id used to generate the source id. */
    open val versionId: Int = 1

    /**
     * Id of the source, generated from the first 16 hex chars (64 bits) of the
     * MD5 of `name/lang/versionId`, with the sign bit cleared.
     */
    override val id: Long by lazy { generateId(name, lang, versionId) }

    /** Headers used for requests. */
    val headers: Headers by lazy { headersBuilder().build() }

    /** Default network client for doing requests. */
    open val client: OkHttpClient
        get() = network.client

    /** Headers builder for requests. Override for custom headers. */
    protected open fun headersBuilder(): Headers.Builder = Headers.Builder().apply {
        add("User-Agent", DEFAULT_USER_AGENT)
    }

    /** Visible name of the source. */
    override fun toString(): String = "$name (${lang.uppercase()})"

    // region extension-lib 1.6 suspend API
    //
    // Each default routes through the matching Observable method so that an
    // extension overriding only `fetch*` (lib 1.4) is still driven correctly,
    // and an extension overriding the suspend method (lib 1.6) wins by normal
    // virtual dispatch before any of this runs.

    override suspend fun getPopularManga(page: Int): MangasPage =
        fetchPopularManga(page).awaitSingle()

    override suspend fun getLatestUpdates(page: Int): MangasPage =
        fetchLatestUpdates(page).awaitSingle()

    override suspend fun getSearchManga(page: Int, query: String, filters: FilterList): MangasPage =
        fetchSearchManga(page, query, filters).awaitSingle()

    override suspend fun getMangaUpdate(
        manga: SManga,
        chapters: List<SChapter>,
        fetchDetails: Boolean,
        fetchChapters: Boolean,
    ): SMangaUpdate {
        val details = if (fetchDetails) fetchMangaDetails(manga).awaitSingle() else manga
        val updated = if (fetchChapters) fetchChapterList(manga).awaitSingle() else chapters
        return SMangaUpdate(details, updated)
    }

    override suspend fun getPageList(chapter: SChapter): List<Page> =
        fetchPageList(chapter).awaitSingle()

    /**
     * Resolves the image url of a page whose `imageUrl` is null.
     *
     * @since tachiyomix 1.6
     */
    open suspend fun getImageUrl(page: Page): String = fetchImageUrl(page).awaitSingle()

    // endregion
    // region Popular

    override fun fetchPopularManga(page: Int): Observable<MangasPage> {
        return client.newCall(popularMangaRequest(page))
            .asObservableSuccess()
            .map { popularMangaParse(it) }
    }

    protected open fun popularMangaRequest(page: Int): Request = notImplemented("popularMangaRequest")

    protected open fun popularMangaParse(response: Response): MangasPage =
        notImplemented("popularMangaParse")

    // endregion
    // region Search

    override fun fetchSearchManga(page: Int, query: String, filters: FilterList): Observable<MangasPage> {
        return client.newCall(searchMangaRequest(page, query, filters))
            .asObservableSuccess()
            .map { searchMangaParse(it) }
    }

    protected open fun searchMangaRequest(page: Int, query: String, filters: FilterList): Request =
        notImplemented("searchMangaRequest")

    protected open fun searchMangaParse(response: Response): MangasPage =
        notImplemented("searchMangaParse")

    // endregion
    // region Latest

    override fun fetchLatestUpdates(page: Int): Observable<MangasPage> {
        return client.newCall(latestUpdatesRequest(page))
            .asObservableSuccess()
            .map { latestUpdatesParse(it) }
    }

    protected open fun latestUpdatesRequest(page: Int): Request =
        notImplemented("latestUpdatesRequest")

    protected open fun latestUpdatesParse(response: Response): MangasPage =
        notImplemented("latestUpdatesParse")

    // endregion
    // region Manga details

    override fun fetchMangaDetails(manga: SManga): Observable<SManga> {
        return client.newCall(mangaDetailsRequest(manga))
            .asObservableSuccess()
            .map { mangaDetailsParse(it).apply { initialized = true } }
    }

    open fun mangaDetailsRequest(manga: SManga): Request = GET(baseUrl + manga.url, headers)

    protected open fun mangaDetailsParse(response: Response): SManga =
        notImplemented("mangaDetailsParse")

    // endregion
    // region Related mangas (Komikku-only; never invoked here)

    override val supportsRelatedMangas: Boolean get() = true

    override suspend fun fetchRelatedMangaList(manga: SManga): List<SManga> {
        return client.newCall(relatedMangaListRequest(manga))
            .awaitSuccess()
            .use { relatedMangaListParse(it) }
    }

    protected open fun relatedMangaListRequest(manga: SManga): Request = mangaDetailsRequest(manga)

    protected open fun relatedMangaListParse(response: Response): List<SManga> = emptyList()

    // endregion
    // region Chapters

    override fun fetchChapterList(manga: SManga): Observable<List<SChapter>> {
        return client.newCall(chapterListRequest(manga))
            .asObservableSuccess()
            .map { chapterListParse(it) }
    }

    open fun chapterListRequest(manga: SManga): Request = GET(baseUrl + manga.url, headers)

    protected open fun chapterListParse(response: Response): List<SChapter> =
        notImplemented("chapterListParse")

    // endregion
    // region Pages

    override fun fetchPageList(chapter: SChapter): Observable<List<Page>> {
        return client.newCall(pageListRequest(chapter))
            .asObservableSuccess()
            .map { pageListParse(it) }
    }

    open fun pageListRequest(chapter: SChapter): Request = GET(baseUrl + chapter.url, headers)

    protected open fun pageListParse(response: Response): List<Page> =
        notImplemented("pageListParse")

    // endregion
    // region Images

    open fun fetchImageUrl(page: Page): Observable<String> {
        return client.newCall(imageUrlRequest(page))
            .asObservableSuccess()
            .map { imageUrlParse(it) }
    }

    protected open fun imageUrlRequest(page: Page): Request = GET(page.url, headers)

    protected open fun imageUrlParse(response: Response): String = notImplemented("imageUrlParse")

    fun fetchImage(page: Page): Observable<Response> {
        return client.newCall(imageRequest(page)).asObservableSuccess()
    }

    protected open fun imageRequest(page: Page): Request = GET(page.imageUrl!!, headers)

    // endregion
    // region Url helpers

    fun SChapter.setUrlWithoutDomain(url: String) {
        this.url = getUrlWithoutDomain(url)
    }

    fun SManga.setUrlWithoutDomain(url: String) {
        this.url = getUrlWithoutDomain(url)
    }

    private fun getUrlWithoutDomain(orig: String): String {
        return try {
            val uri = URI(orig.replace(" ", "%20"))
            var out = uri.path
            if (uri.query != null) out += "?" + uri.query
            if (uri.fragment != null) out += "#" + uri.fragment
            out
        } catch (e: URISyntaxException) {
            orig
        }
    }

    open fun getMangaUrl(manga: SManga): String = mangaDetailsRequest(manga).url.toString()

    open fun getChapterUrl(chapter: SChapter): String = baseUrl + chapter.url

    open fun prepareNewChapter(chapter: SChapter, manga: SManga) {}

    override fun getFilterList(): FilterList = FilterList()

    // endregion

    private fun notImplemented(method: String): Nothing =
        throw UnsupportedOperationException("$name does not implement $method")

    companion object {
        const val DEFAULT_USER_AGENT =
            "Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) " +
                "Chrome/120.0.0.0 Mobile Safari/537.36"

        fun generateId(name: String, lang: String, versionId: Int): Long {
            val key = "${name.lowercase()}/$lang/$versionId"
            val bytes = MessageDigest.getInstance("MD5").digest(key.toByteArray())
            return (0..7).map { bytes[it].toLong() and 0xff shl (7 - it) * 8 }
                .reduce(Long::or) and Long.MAX_VALUE
        }
    }
}
