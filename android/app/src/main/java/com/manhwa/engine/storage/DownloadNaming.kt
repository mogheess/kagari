package com.manhwa.engine.storage

import java.nio.ByteBuffer
import java.nio.CharBuffer
import java.nio.charset.CodingErrorAction
import java.security.MessageDigest

/**
 * Folder names for downloads in a user-chosen storage location.
 *
 * These reproduce Mihon's `DownloadProvider` scheme byte for byte:
 *
 *     <root>/downloads/<Source name (LANG)>/<Manga title>/<[scanlator_]Chapter name_<md5(url)[:6]>>/001.jpg
 *
 * Matching Mihon is the point, not a coincidence: a user who picks the same
 * folder Mihon uses gets downloads either app can read, and files that a file
 * manager shows under recognisable names instead of hashes. Anything changed
 * here silently breaks that, so the rules (character set, 240-byte cap, hash
 * suffix, `Chapter` fallback) are copied from Mihon's DiskUtil/DownloadProvider
 * rather than reinvented.
 */
object DownloadNaming {

    /** Mihon's `DiskUtil.MAX_FILE_NAME_BYTES`. */
    private const val MAX_FILE_NAME_BYTES = 240

    const val DOWNLOADS_DIR = "downloads"
    const val BACKUPS_DIR = "backups"
    const val NOMEDIA_FILE = ".nomedia"

    /** Mihon: `HttpSource.toString()` is `"$name (${lang.uppercase()})"`. */
    fun sourceDirName(sourceName: String, lang: String): String =
        buildValidFilename("$sourceName (${lang.uppercase()})")

    fun mangaDirName(mangaTitle: String): String = buildValidFilename(mangaTitle)

    fun chapterDirName(chapterName: String, scanlator: String?, chapterUrl: String): String {
        var dirName = chapterName.ifBlank { "Chapter" }
        if (!scanlator.isNullOrBlank()) {
            dirName = scanlator + "_" + dirName
        }
        // Mihon: 7 bytes for the hash and underscore, 4 bytes for a possible .cbz.
        dirName = buildValidFilename(dirName, MAX_FILE_NAME_BYTES - 11)
        return dirName + "_" + md5(chapterUrl).take(6)
    }

    /** Mihon numbers pages from 1 with three digits: `001.jpg`. */
    fun pageFileName(pageIndex: Int, extension: String): String =
        String.format("%03d.%s", pageIndex + 1, extension)

    /** Inverse of [pageFileName]; null for anything that isn't a page file. */
    fun pageIndexOf(fileName: String): Int? {
        val stem = fileName.substringBefore('.', "")
        if (stem.isEmpty() || !stem.all { it.isDigit() }) return null
        if (fileName.endsWith(".tmp")) return null
        return stem.toInt() - 1
    }

    /** Mihon's `DiskUtil.buildValidFilename` with `disallowNonAscii = false`. */
    fun buildValidFilename(origName: String, maxBytes: Int = MAX_FILE_NAME_BYTES): String {
        val name = origName.trim('.', ' ')
        if (name.isEmpty()) return "(invalid)"
        val sb = StringBuilder(name.length)
        for (c in name) {
            sb.append(if (isValidFatFilenameChar(c)) c else '_')
        }
        return truncateToLength(sb.toString(), maxBytes)
    }

    private fun truncateToLength(s: String, maxBytes: Int): String {
        val charset = Charsets.UTF_8
        val bytes = s.toByteArray(charset)
        if (bytes.size <= maxBytes) return s
        val decoder = charset.newDecoder().onMalformedInput(CodingErrorAction.IGNORE)
        val bb = ByteBuffer.wrap(bytes, 0, maxBytes)
        val cb = CharBuffer.allocate(maxBytes)
        decoder.decode(bb, cb, true)
        decoder.flush(cb)
        return String(cb.array(), 0, cb.position())
    }

    private fun isValidFatFilenameChar(c: Char): Boolean {
        if (c <= 0x1f.toChar()) return false
        return when (c) {
            '"', '*', '/', ':', '<', '>', '?', '\\', '|', 0x7f.toChar() -> false
            else -> true
        }
    }

    private fun md5(value: String): String =
        MessageDigest.getInstance("MD5")
            .digest(value.toByteArray())
            .joinToString("") { "%02x".format(it) }
}
