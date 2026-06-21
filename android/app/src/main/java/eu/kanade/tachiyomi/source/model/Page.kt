/*
 * Adapted from Mihon / Tachiyomi (https://github.com/mihonapp/mihon)
 * Licensed under the Apache License, Version 2.0. See NOTICE in repo root.
 *
 * Part of the vendored Tachiyomi source-api. Must stay under
 * `eu.kanade.tachiyomi.source.model` for extension runtime compatibility.
 */
package eu.kanade.tachiyomi.source.model

open class Page(
    val index: Int,
    val url: String = "",
    var imageUrl: String? = null,
) {
    val number: Int
        get() = index + 1
}

data class MangasPage(
    val mangas: List<SManga>,
    val hasNextPage: Boolean,
)
