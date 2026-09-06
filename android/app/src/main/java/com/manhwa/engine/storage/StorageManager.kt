package com.manhwa.engine.storage

import android.content.Context
import android.content.Intent
import android.net.Uri
import android.provider.DocumentsContract
import androidx.documentfile.provider.DocumentFile
import com.manhwa.engine.dto.DownloadMetaDto
import com.manhwa.engine.dto.StorageLocationDto
import java.security.MessageDigest

/**
 * The user-chosen storage location, Mihon style: one folder picked through the
 * system document tree picker, with `downloads/` and `backups/` underneath.
 *
 * Nothing forces the pick. Without one, downloads stay in app-private storage
 * exactly as before, so an existing install keeps working and the user opts in
 * from Settings when they want browsable, uninstall-proof files.
 *
 * Everything under the tree is reached through [DocumentFile] (the Storage
 * Access Framework), the only way to write to a user-chosen folder on modern
 * Android without the all-files permission. SAF lookups are slow — every
 * `findFile` is a content-provider query — so directory listings are cached
 * per chapter and invalidated on every write or delete.
 */
class StorageManager(context: Context) {

    private val appContext = context.applicationContext
    private val prefs = appContext.getSharedPreferences(PREFS, Context.MODE_PRIVATE)

    /**
     * Where each downloaded chapter lives, keyed by (source, chapter url).
     * Stored rather than recomputed so a title rename on the source, or a
     * chapter renamed by the scanlator, does not orphan an existing download.
     */
    private val chapterDirs = appContext.getSharedPreferences(CHAPTER_DIRS, Context.MODE_PRIVATE)

    private val listings = HashMap<String, Map<String, DocumentFile>>()

    // --- location ----------------------------------------------------------

    fun treeUri(): Uri? = prefs.getString(KEY_TREE_URI, null)?.let(Uri::parse)

    /** Persists a tree picked with `ACTION_OPEN_DOCUMENT_TREE`, taking a durable grant. */
    fun setTreeUri(uri: Uri) {
        val flags = Intent.FLAG_GRANT_READ_URI_PERMISSION or Intent.FLAG_GRANT_WRITE_URI_PERMISSION
        try {
            appContext.contentResolver.takePersistableUriPermission(uri, flags)
        } catch (_: SecurityException) {
            // Some OEM pickers hand back a uri without a persistable grant. Keep
            // the choice anyway; describe() reports it unwritable if it is.
        }
        prefs.edit().putString(KEY_TREE_URI, uri.toString()).apply()
        synchronized(listings) { listings.clear() }
    }

    fun clearTreeUri() {
        treeUri()?.let { uri ->
            try {
                appContext.contentResolver.releasePersistableUriPermission(
                    uri,
                    Intent.FLAG_GRANT_READ_URI_PERMISSION or Intent.FLAG_GRANT_WRITE_URI_PERMISSION,
                )
            } catch (_: SecurityException) {
                // Nothing held; fine.
            }
        }
        prefs.edit().remove(KEY_TREE_URI).apply()
        synchronized(listings) { listings.clear() }
    }

    fun describe(): StorageLocationDto? {
        val uri = treeUri() ?: return null
        val base = baseDir()
        return StorageLocationDto(
            uri = uri.toString(),
            displayPath = displayPath(uri),
            writable = base != null,
        )
    }

    /** The picked folder, or null when none is set or it is no longer writable. */
    fun baseDir(): DocumentFile? {
        val uri = treeUri() ?: return null
        val dir = try {
            DocumentFile.fromTreeUri(appContext, uri)
        } catch (_: IllegalArgumentException) {
            null
        }
        return dir?.takeIf { it.isDirectory && it.canWrite() }
    }

    fun downloadsDir(create: Boolean): DocumentFile? {
        val base = baseDir() ?: return null
        val dir = child(base, DownloadNaming.DOWNLOADS_DIR, create, directory = true) ?: return null
        if (create && dir.findFile(DownloadNaming.NOMEDIA_FILE) == null) {
            // Keep thousands of manga pages out of the gallery. Mihon does the same.
            dir.createFile("application/octet-stream", DownloadNaming.NOMEDIA_FILE)
        }
        return dir
    }

    fun backupsDir(create: Boolean): DocumentFile? {
        val base = baseDir() ?: return null
        return child(base, DownloadNaming.BACKUPS_DIR, create, directory = true)
    }

    // --- chapters ----------------------------------------------------------

    /**
     * The folder for a chapter under the storage location, creating it (and its
     * parents) when [create] is set. Null when no location is configured.
     */
    fun chapterDir(
        sourceId: String,
        sourceName: String,
        sourceLang: String,
        chapterUrl: String,
        meta: DownloadMetaDto,
        create: Boolean,
    ): DocumentFile? {
        rememberedChapterDir(sourceId, chapterUrl)?.let { return it }
        val downloads = downloadsDir(create) ?: return null
        val sourceDir = child(downloads, DownloadNaming.sourceDirName(sourceName, sourceLang), create, true)
            ?: return null
        val mangaDir = child(sourceDir, DownloadNaming.mangaDirName(meta.mangaTitle), create, true)
            ?: return null
        val chapter = child(
            mangaDir,
            DownloadNaming.chapterDirName(meta.chapterName, meta.scanlator, chapterUrl),
            create,
            true,
        ) ?: return null
        if (create) rememberChapterDir(sourceId, chapterUrl, chapter.uri)
        return chapter
    }

    /** A chapter folder recorded by an earlier download, if it still exists. */
    fun rememberedChapterDir(sourceId: String, chapterUrl: String): DocumentFile? {
        val stored = chapterDirs.getString(chapterKey(sourceId, chapterUrl), null) ?: return null
        val dir = try {
            DocumentFile.fromTreeUri(appContext, Uri.parse(stored))
        } catch (_: IllegalArgumentException) {
            null
        }
        if (dir == null || !dir.isDirectory) {
            chapterDirs.edit().remove(chapterKey(sourceId, chapterUrl)).apply()
            return null
        }
        return dir
    }

    fun forgetChapterDir(sourceId: String, chapterUrl: String) {
        chapterDirs.edit().remove(chapterKey(sourceId, chapterUrl)).apply()
    }

    private fun rememberChapterDir(sourceId: String, chapterUrl: String, uri: Uri) {
        chapterDirs.edit().putString(chapterKey(sourceId, chapterUrl), uri.toString()).apply()
    }

    /** Page files in a chapter folder by index, from a cached listing. */
    fun pages(dir: DocumentFile): Map<Int, DocumentFile> {
        val key = dir.uri.toString()
        val listing = synchronized(listings) { listings[key] } ?: run {
            val fresh = HashMap<String, DocumentFile>()
            for (file in dir.listFiles()) {
                val name = file.name ?: continue
                if (file.isFile && file.length() > 0L) fresh[name] = file
            }
            synchronized(listings) { listings[key] = fresh }
            fresh
        }
        val byIndex = HashMap<Int, DocumentFile>()
        for ((name, file) in listing) {
            val index = DownloadNaming.pageIndexOf(name) ?: continue
            byIndex[index] = file
        }
        return byIndex
    }

    fun invalidate(dir: DocumentFile) {
        synchronized(listings) { listings.remove(dir.uri.toString()) }
    }

    // --- helpers -----------------------------------------------------------

    private fun child(parent: DocumentFile, name: String, create: Boolean, directory: Boolean): DocumentFile? {
        val existing = parent.findFile(name)
        if (existing != null) {
            return if (directory == existing.isDirectory) existing else null
        }
        if (!create) return null
        return if (directory) parent.createDirectory(name) else parent.createFile("application/octet-stream", name)
    }

    private fun chapterKey(sourceId: String, chapterUrl: String): String =
        MessageDigest.getInstance("SHA-256")
            .digest("$sourceId $chapterUrl".toByteArray())
            .joinToString("") { "%02x".format(it) }

    /**
     * `content://com.android.externalstorage.documents/tree/primary%3AKagari`
     * reads as "Internal storage/Kagari"; an SD card shows its volume id.
     * Other providers (cloud, Downloads) fall back to their last path segment.
     */
    private fun displayPath(uri: Uri): String {
        val docId = try {
            DocumentsContract.getTreeDocumentId(uri)
        } catch (_: IllegalArgumentException) {
            return uri.lastPathSegment ?: uri.toString()
        }
        if (uri.authority != "com.android.externalstorage.documents") {
            return docId.substringAfter(':', docId).ifEmpty { docId }
        }
        val volume = docId.substringBefore(':')
        val path = docId.substringAfter(':', "").trim('/')
        val volumeName = if (volume == "primary") "Internal storage" else "SD card ($volume)"
        return if (path.isEmpty()) volumeName else "$volumeName/$path"
    }

    private companion object {
        const val PREFS = "kagari_storage"
        const val CHAPTER_DIRS = "kagari_download_dirs"
        const val KEY_TREE_URI = "tree_uri"
    }
}
