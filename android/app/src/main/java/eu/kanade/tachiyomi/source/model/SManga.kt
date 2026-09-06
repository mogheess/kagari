/*
 * Vendored Tachiyomi source-api. Must stay under `eu.kanade.tachiyomi.source.*`
 * so extension APKs (compiled against this API as `compileOnly`) resolve these
 * classes from the host process. Signatures mirror keiyoushi/extensions-lib
 * (Apache 2.0 — see NOTICE).
 */
package eu.kanade.tachiyomi.source.model

import java.io.Serializable
import kotlinx.serialization.json.JsonObject

interface SManga : Serializable {
    var url: String
    var title: String
    var artist: String?
    var author: String?
    var description: String?
    var genre: String?
    var status: Int
    var thumbnail_url: String?
    var update_strategy: UpdateStrategy
    /**
     * Free-form state a source keeps alongside a manga (extensions-lib 1.6+),
     * e.g. an internal id it needs again when fetching details or chapters.
     * Opaque to the app: carried through the DTOs and handed back untouched.
     */
    var memo: JsonObject
    var initialized: Boolean

    companion object {
        const val UNKNOWN = 0
        const val ONGOING = 1
        const val COMPLETED = 2
        const val LICENSED = 3
        const val PUBLISHING_FINISHED = 4
        const val CANCELLED = 5
        const val ON_HIATUS = 6

        fun create(): SManga = SMangaImpl()
    }
}

class SMangaImpl : SManga {
    override lateinit var url: String
    override lateinit var title: String
    override var artist: String? = null
    override var author: String? = null
    override var description: String? = null
    override var genre: String? = null
    override var status: Int = 0
    override var thumbnail_url: String? = null
    override var update_strategy: UpdateStrategy = UpdateStrategy.ALWAYS_UPDATE
    override var memo: JsonObject = JsonObject(emptyMap())
    override var initialized: Boolean = false
}
