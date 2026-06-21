/*
 * Vendored Tachiyomi source-api. Must stay under
 * `eu.kanade.tachiyomi.source.model` for extension runtime compatibility.
 * Signatures mirror keiyoushi/extensions-lib (Apache 2.0 — see NOTICE).
 */
package eu.kanade.tachiyomi.source.model

@Suppress("unused")
data class FilterList(val list: List<Filter<*>>) : List<Filter<*>> by list {
    constructor(vararg fs: Filter<*>) : this(if (fs.isNotEmpty()) fs.asList() else emptyList())
}
