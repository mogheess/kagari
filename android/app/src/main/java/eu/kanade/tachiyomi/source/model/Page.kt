/*
 * Vendored Tachiyomi source-api. Must stay under
 * `eu.kanade.tachiyomi.source.model` for extension runtime compatibility.
 * Signatures mirror keiyoushi/extensions-lib (Apache 2.0 — see NOTICE).
 *
 * NOTE: the constructor parameter list (index, url, imageUrl, uri) must match
 * the extensions-lib stub exactly so Kotlin's synthetic default constructor
 * (`Page$default`) has the same descriptor the extension bytecode calls.
 */
package eu.kanade.tachiyomi.source.model

import android.net.Uri

@Suppress("unused")
class Page(
    val index: Int,
    val url: String = "",
    var imageUrl: String? = null,
    var uri: Uri? = null,
) {
    val number: Int
        get() = index + 1
}
