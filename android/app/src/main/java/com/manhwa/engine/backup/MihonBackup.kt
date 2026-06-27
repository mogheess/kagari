@file:OptIn(ExperimentalSerializationApi::class)

package com.manhwa.engine.backup

import android.content.Context
import android.net.Uri
import com.manhwa.engine.EngineException
import kotlinx.serialization.ExperimentalSerializationApi
import kotlinx.serialization.Serializable
import kotlinx.serialization.protobuf.ProtoBuf
import kotlinx.serialization.protobuf.ProtoNumber
import java.util.zip.GZIPInputStream

/**
 * Minimal Mihon/Tachiyomi backup reader.
 *
 * A `.tachibk` backup is a gzipped Protobuf message. We vendor only the fields
 * we actually import, with the exact `@ProtoNumber`s from Mihon's backup models
 * (Apache-2.0); the Protobuf wire format lets the decoder skip everything else.
 *
 * We deliberately import library titles (favorites), their categories, per-chapter
 * read state, and last-read history — not trackers, downloads, or app settings.
 */

@Serializable
private class MBackup(
    @ProtoNumber(1) val backupManga: List<MBackupManga> = emptyList(),
    @ProtoNumber(2) val backupCategories: List<MBackupCategory> = emptyList(),
)

@Serializable
private class MBackupManga(
    @ProtoNumber(1) val source: Long = 0,
    @ProtoNumber(2) val url: String = "",
    @ProtoNumber(3) val title: String = "",
    @ProtoNumber(5) val author: String? = null,
    @ProtoNumber(9) val thumbnailUrl: String? = null,
    @ProtoNumber(13) val dateAdded: Long = 0,
    @ProtoNumber(16) val chapters: List<MBackupChapter> = emptyList(),
    // Category membership is stored as a list of category *order* values.
    @ProtoNumber(17) val categories: List<Long> = emptyList(),
    @ProtoNumber(100) val favorite: Boolean = true,
    @ProtoNumber(104) val history: List<MBackupHistory> = emptyList(),
)

@Serializable
private class MBackupChapter(
    @ProtoNumber(1) val url: String = "",
    @ProtoNumber(2) val name: String = "",
    @ProtoNumber(4) val read: Boolean = false,
    @ProtoNumber(6) val lastPageRead: Long = 0,
)

@Serializable
private class MBackupHistory(
    @ProtoNumber(1) val url: String = "",
    @ProtoNumber(2) val lastRead: Long = 0,
)

@Serializable
private class MBackupCategory(
    @ProtoNumber(1) val name: String = "",
    @ProtoNumber(2) val order: Long = 0,
)

// --- Result DTOs handed to JS (serialized as JSON by the bridge) -------------

@Serializable
data class MihonImportResult(
    val categories: List<String>,
    val manga: List<MihonImportManga>,
)

@Serializable
data class MihonImportManga(
    val sourceId: String,
    val url: String,
    val title: String,
    val thumbnailUrl: String? = null,
    val author: String? = null,
    val dateAdded: Long = 0,
    val categories: List<String> = emptyList(),
    val chapters: List<MihonImportChapter> = emptyList(),
    val lastChapter: MihonImportRef? = null,
)

@Serializable
data class MihonImportChapter(
    val url: String,
    val name: String,
    val read: Boolean,
    val lastPageRead: Long,
)

@Serializable
data class MihonImportRef(
    val url: String,
    val name: String,
    val readAt: Long,
)

object MihonBackupImporter {

    fun parse(context: Context, uriString: String): MihonImportResult {
        val uri = Uri.parse(uriString)
        val raw = (context.contentResolver.openInputStream(uri)
            ?: throw EngineException("not_found", "Could not open the selected file"))
            .use { it.readBytes() }

        // Backups are gzipped, but accept a raw proto too (be lenient).
        val bytes = if (raw.size >= 2 && raw[0] == 0x1f.toByte() && raw[1] == 0x8b.toByte()) {
            GZIPInputStream(raw.inputStream()).use { it.readBytes() }
        } else {
            raw
        }

        val backup = try {
            ProtoBuf.decodeFromByteArray(MBackup.serializer(), bytes)
        } catch (e: Throwable) {
            throw EngineException("parse", "This doesn't look like a Mihon/Tachiyomi backup (.tachibk)")
        }

        val orderToName = backup.backupCategories.associate { it.order to it.name }
        val categoryNames = backup.backupCategories
            .sortedBy { it.order }
            .map { it.name }
            .filter { it.isNotBlank() }

        val manga = backup.backupManga
            .filter { it.favorite && it.url.isNotEmpty() }
            .map { m ->
                val chapterNameByUrl = m.chapters.associate { it.url to it.name }
                val readState = m.chapters
                    .filter { it.read || it.lastPageRead > 0 }
                    .map { MihonImportChapter(it.url, it.name, it.read, it.lastPageRead) }
                val last = m.history.maxByOrNull { it.lastRead }?.takeIf { it.lastRead > 0 }
                MihonImportManga(
                    sourceId = m.source.toString(),
                    url = m.url,
                    title = m.title,
                    thumbnailUrl = m.thumbnailUrl,
                    author = m.author,
                    dateAdded = m.dateAdded,
                    categories = m.categories.mapNotNull { orderToName[it] }.filter { it.isNotBlank() },
                    chapters = readState,
                    lastChapter = last?.let {
                        MihonImportRef(it.url, chapterNameByUrl[it.url] ?: "", it.lastRead)
                    },
                )
            }

        return MihonImportResult(categoryNames, manga)
    }
}
