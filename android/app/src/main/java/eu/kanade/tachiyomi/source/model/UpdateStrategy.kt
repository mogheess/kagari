/*
 * Vendored Tachiyomi source-api. Must stay under
 * `eu.kanade.tachiyomi.source.model` for extension runtime compatibility.
 * Signatures mirror keiyoushi/extensions-lib (Apache 2.0 — see NOTICE).
 */
package eu.kanade.tachiyomi.source.model

@Suppress("unused")
enum class UpdateStrategy {
    ALWAYS_UPDATE,
    ONLY_FETCH_ONCE,
}
