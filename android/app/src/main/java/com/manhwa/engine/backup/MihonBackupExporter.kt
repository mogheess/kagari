package com.manhwa.engine.backup

import android.content.Context
import android.net.Uri
import androidx.core.content.FileProvider
import com.manhwa.engine.EngineException
import kotlinx.serialization.Serializable
import kotlinx.serialization.protobuf.ProtoBuf
import java.io.File
import java.io.FileOutputStream
import java.util.zip.GZIPOutputStream

/**
 * Writes a Mihon/Tachiyomi-compatible `.tachibk` backup.
 *
 * The same protobuf schema the importer reads (see `MihonBackup.kt`), written
 * back out — so a Kagari backup restores into Mihon and vice versa. Being
 * compatible rather than inventing a format is the point: it means a user's
 * library is never trapped in this app.
 *
 * What Mihon stores that Kagari has no equivalent for (tracker links, per-source
 * preferences, download state) is simply absent from the output. Mihon treats
 * those fields as optional, so a restore just leaves them unset.
 */

/** Payload handed over from JS — the shape the UI can assemble from its stores. */
@Serializable
data class ExportRequest(
    val categories: List<String> = emptyList(),
    val manga: List<ExportManga> = emptyList(),
)

@Serializable
data class ExportManga(
    val sourceId: String = "",
    val url: String = "",
    val title: String = "",
    val author: String? = null,
    val thumbnailUrl: String? = null,
    val dateAdded: Long = 0,
    val categories: List<String> = emptyList(),
    val chapters: List<ExportChapter> = emptyList(),
    val lastReadChapterUrl: String? = null,
    val lastReadAt: Long = 0,
)

@Serializable
data class ExportChapter(
    val url: String = "",
    val name: String = "",
    val read: Boolean = false,
    val lastPageRead: Long = 0,
)

@Serializable
data class ExportResult(
    val uri: String,
    val fileName: String,
    val bytes: Long,
    val mangaCount: Int,
    /** Display path of the copy kept in the storage location, when one is set. */
    val savedTo: String? = null,
)

object MihonBackupExporter {

    /**
     * Builds the backup and writes it to app cache, returning a shareable
     * content:// URI. Writing to cache and handing back a URI keeps this off
     * the storage-permission path — the caller sends it straight to the system
     * share sheet, where the user picks the real destination.
     */
    fun export(context: Context, request: ExportRequest, fileName: String): ExportResult {
        if (request.manga.isEmpty() && request.categories.isEmpty()) {
            throw EngineException("parse", "There's nothing in your library to back up yet")
        }

        // Mihon addresses categories by order, not name.
        val categories = request.categories.mapIndexed { index, name ->
            MBackupCategory(name = name, order = index.toLong())
        }
        val orderByName = categories.associate { it.name to it.order }

        val manga = request.manga.map { m ->
            MBackupManga(
                // Source ids are 64-bit and arrive as strings to survive JS.
                source = m.sourceId.toLongOrNull() ?: 0L,
                url = m.url,
                title = m.title,
                author = m.author,
                thumbnailUrl = m.thumbnailUrl,
                dateAdded = m.dateAdded,
                chapters = m.chapters.map {
                    MBackupChapter(
                        url = it.url,
                        name = it.name,
                        read = it.read,
                        lastPageRead = it.lastPageRead,
                    )
                },
                categories = m.categories.mapNotNull { orderByName[it] },
                favorite = true,
                history = m.lastReadChapterUrl
                    ?.takeIf { it.isNotEmpty() && m.lastReadAt > 0 }
                    ?.let { listOf(MBackupHistory(url = it, lastRead = m.lastReadAt)) }
                    ?: emptyList(),
            )
        }

        val bytes = ProtoBuf.encodeToByteArray(
            MBackup.serializer(),
            MBackup(backupManga = manga, backupCategories = categories),
        )

        val dir = File(context.cacheDir, "backups").apply { mkdirs() }
        // One file per export name; a repeat overwrites rather than piling up.
        val file = File(dir, fileName)
        try {
            FileOutputStream(file).use { out ->
                GZIPOutputStream(out).use { it.write(bytes) }
            }
        } catch (e: Throwable) {
            throw EngineException("unknown", "Could not write the backup: ${e.message.orEmpty()}")
        }

        val uri: Uri = FileProvider.getUriForFile(
            context,
            "${context.packageName}.fileprovider",
            file,
        )
        return ExportResult(
            uri = uri.toString(),
            fileName = fileName,
            bytes = file.length(),
            mangaCount = manga.size,
        )
    }
}
