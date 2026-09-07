/*
 * Adapted from Mihon / Tachiyomi (https://github.com/mihonapp/mihon)
 * Licensed under the Apache License, Version 2.0. See NOTICE in repo root.
 *
 * Part of the vendored Tachiyomi source-api. Must stay under
 * `eu.kanade.tachiyomi.source.model` for extension runtime compatibility.
 */
package eu.kanade.tachiyomi.source.model

import java.io.Serializable
import kotlinx.serialization.json.JsonObject

interface SChapter : Serializable {
    var url: String
    var name: String
    var date_upload: Long
    var chapter_number: Float
    var scanlator: String?
    /** Source-private state (extensions-lib 1.6+); see [SManga.memo]. */
    var memo: JsonObject

    companion object {
        fun create(): SChapter = SChapterImpl()
    }
}

class SChapterImpl : SChapter {
    override lateinit var url: String
    override lateinit var name: String
    override var date_upload: Long = 0
    override var chapter_number: Float = -1f
    override var scanlator: String? = null
    override var memo: JsonObject = JsonObject(emptyMap())
}
