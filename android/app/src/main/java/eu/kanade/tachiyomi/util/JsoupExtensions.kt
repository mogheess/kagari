/*
 * Vendored Tachiyomi util API. Must stay under `eu.kanade.tachiyomi.util` and the
 * file name MUST be `JsoupExtensions.kt` so the generated facade class is
 * `JsoupExtensionsKt` (what extension bytecode calls into). Signatures mirror
 * keiyoushi/extensions-lib (Apache 2.0 — see NOTICE).
 */
package eu.kanade.tachiyomi.util

import okhttp3.Response
import org.jsoup.Jsoup
import org.jsoup.nodes.Document

/**
 * Returns a Jsoup document for this response.
 * @param html the body of the response. Use only if the body was read before calling this method.
 */
fun Response.asJsoup(html: String? = null): Document {
    return Jsoup.parse(html ?: body!!.string(), request.url.toString())
}
