/*
 * Adapted from Mihon / Tachiyomi (https://github.com/mihonapp/mihon)
 * Licensed under the Apache License, Version 2.0. See NOTICE in repo root.
 *
 * Part of the vendored Tachiyomi source-api. Must stay under
 * `eu.kanade.tachiyomi.source` for extension runtime compatibility.
 */
package eu.kanade.tachiyomi.source

import eu.kanade.tachiyomi.source.model.FilterList
import eu.kanade.tachiyomi.source.model.MangasPage
import rx.Observable

interface CatalogueSource : Source {
    /** An ISO 639-1 compliant language code (two letters in lower case). */
    override val lang: String

    /** Whether the source supports the "latest updates" listing. */
    val supportsLatest: Boolean

    // --- Modern suspend API (preferred) ---

    suspend fun getPopularManga(page: Int): MangasPage = throw NotImplementedError()

    suspend fun getSearchManga(page: Int, query: String, filters: FilterList): MangasPage =
        throw NotImplementedError()

    suspend fun getLatestUpdates(page: Int): MangasPage = throw NotImplementedError()

    /** Returns the list of filters for the source. */
    fun getFilterList(): FilterList

    // --- Deprecated RxJava API ---

    @Deprecated("Use the suspend variant", ReplaceWith("getPopularManga(page)"))
    fun fetchPopularManga(page: Int): Observable<MangasPage> = throw NotImplementedError()

    @Deprecated("Use the suspend variant", ReplaceWith("getSearchManga(page, query, filters)"))
    fun fetchSearchManga(page: Int, query: String, filters: FilterList): Observable<MangasPage> =
        throw NotImplementedError()

    @Deprecated("Use the suspend variant", ReplaceWith("getLatestUpdates(page)"))
    fun fetchLatestUpdates(page: Int): Observable<MangasPage> = throw NotImplementedError()
}
