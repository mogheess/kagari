/*
 * Adapted from Mihon / Tachiyomi (https://github.com/mihonapp/mihon)
 * Licensed under the Apache License, Version 2.0. See NOTICE in repo root.
 *
 * Part of the vendored Tachiyomi source-api. Must stay under
 * `eu.kanade.tachiyomi.source.online` for extension runtime compatibility.
 *
 * NOTE: This is a trimmed skeleton of HttpSource sufficient for loading and
 * driving extensions through the modern suspend API. A production port should
 * mirror Mihon's full HttpSource (request builders, page/image fetchers,
 * headers, rate limiting) from:
 *   source-api/src/commonMain/kotlin/eu/kanade/tachiyomi/source/online/HttpSource.kt
 */
package eu.kanade.tachiyomi.source.online

import eu.kanade.tachiyomi.source.CatalogueSource
import eu.kanade.tachiyomi.source.model.Page
import okhttp3.Headers
import okhttp3.OkHttpClient

abstract class HttpSource : CatalogueSource {

    /** Base url of the website without the trailing slash, e.g. https://example.org */
    abstract val baseUrl: String

    /** Version id used to generate the source id. */
    open val versionId: Int = 1

    /** Default HTTP client used by the source. Provided by the host runtime. */
    open val client: OkHttpClient
        get() = network.client

    /** Network helper injected by the host (see engine.NetworkHelper). */
    open val network: NetworkHelperHolder = NetworkHelperHolder.default

    /** Headers used for requests. */
    open val headers: Headers by lazy { headersBuilder().build() }

    protected open fun headersBuilder(): Headers.Builder = Headers.Builder().apply {
        add("User-Agent", DEFAULT_USER_AGENT)
    }

    /**
     * Stable source id derived from name, lang and version. Mirrors Tachiyomi's
     * algorithm closely enough for identity to be consistent.
     */
    override val id: Long by lazy { generateId(name, lang, versionId) }

    /** Resolve the absolute image url for a page (override when lazy-resolved). */
    open suspend fun getImageUrl(page: Page): String = page.imageUrl ?: page.url

    companion object {
        const val DEFAULT_USER_AGENT =
            "Mozilla/5.0 (Linux; Android 13) AppleWebKit/537.36 (KHTML, like Gecko) " +
                "Chrome/120.0 Mobile Safari/537.36"

        fun generateId(name: String, lang: String, versionId: Int): Long {
            val key = "${name.lowercase()}/$lang/$versionId"
            val bytes = java.security.MessageDigest.getInstance("MD5").digest(key.toByteArray())
            return (0..7).fold(0L) { acc, i -> acc or ((bytes[i].toLong() and 0xff) shl (8 * (7 - i))) } and
                Long.MAX_VALUE
        }
    }
}

/**
 * Minimal holder so the vendored HttpSource can obtain an OkHttpClient from the
 * host without pulling in Injekt. A production port may instead provide the
 * Injekt `NetworkHelper` extensions expect.
 */
class NetworkHelperHolder(val client: OkHttpClient) {
    companion object {
        var default: NetworkHelperHolder = NetworkHelperHolder(OkHttpClient())
    }
}
