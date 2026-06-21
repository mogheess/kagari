/*
 * Vendored Tachiyomi source-api. Must stay under
 * `eu.kanade.tachiyomi.source.model` for extension runtime compatibility.
 * Signatures mirror keiyoushi/extensions-lib (Apache 2.0 — see NOTICE).
 */
package eu.kanade.tachiyomi.source.model

data class MangasPage(val mangas: List<SManga>, val hasNextPage: Boolean)
