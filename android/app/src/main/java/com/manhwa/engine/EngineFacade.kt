package com.manhwa.engine

import android.content.ContentValues
import android.content.Context
import android.content.Intent
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import androidx.documentfile.provider.DocumentFile
import android.graphics.BitmapRegionDecoder
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Paint
import android.graphics.Rect
import android.graphics.RectF
import android.graphics.Typeface
import android.net.Uri
import android.os.Build
import android.os.Environment
import android.provider.MediaStore
import android.util.Log
import androidx.annotation.RequiresApi
import androidx.core.content.FileProvider
import com.manhwa.engine.dto.ChapterDto
import com.manhwa.engine.dto.ExtensionDto
import com.manhwa.engine.dto.DownloadMetaDto
import com.manhwa.engine.dto.ImageFileDto
import com.manhwa.engine.dto.ImageTileDto
import com.manhwa.engine.dto.ImageRequestDto
import com.manhwa.engine.dto.MangaDto
import com.manhwa.engine.dto.MangasPageDto
import com.manhwa.engine.dto.PageDto
import com.manhwa.engine.dto.StorageLocationDto
import com.manhwa.engine.storage.DownloadNaming
import com.manhwa.engine.storage.StorageManager
import com.manhwa.engine.dto.SourceDto
import com.manhwa.engine.dto.TierListExportDto
import com.manhwa.engine.backup.ExportRequest
import com.manhwa.engine.backup.ExportResult
import com.manhwa.engine.backup.MihonBackupExporter
import com.manhwa.engine.backup.MihonBackupImporter
import com.manhwa.engine.backup.MihonImportResult
import com.manhwa.engine.loader.ExtensionLoader
import com.manhwa.engine.loader.LoadedExtension
import com.manhwa.engine.loader.SignatureTrust
import eu.kanade.tachiyomi.network.NetworkHelper
import eu.kanade.tachiyomi.source.CatalogueSource
import eu.kanade.tachiyomi.source.Source
import eu.kanade.tachiyomi.source.model.FilterList
import eu.kanade.tachiyomi.source.model.Page
import eu.kanade.tachiyomi.source.model.SChapter
import eu.kanade.tachiyomi.source.model.SManga
import eu.kanade.tachiyomi.source.online.HttpSource
import java.io.File
import java.security.MessageDigest
import java.util.concurrent.ConcurrentHashMap
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import okhttp3.Protocol
import okhttp3.Request
import okhttp3.Response
import uy.kohesive.injekt.injectLazy

/**
 * The single entry point the RN bridge talks to. Holds loaded sources and
 * exposes a suspend API that returns DTOs.
 *
 * Browse/detail/page calls go through extension-lib 1.6's suspend API. Lib 1.4
 * extensions don't implement it, but the vendored `HttpSource` bridges each
 * suspend call down to the deprecated RxJava `fetch*` method they do implement,
 * so both generations work from one call path.
 */
class EngineFacade(context: Context) {

    private val appContext = context.applicationContext
    private val trust = SignatureTrust(appContext)
    private val loader = ExtensionLoader(appContext, trust)
    private val network: NetworkHelper by injectLazy()

    private var extensions: List<LoadedExtension> = emptyList()
    private val sourcesById = HashMap<Long, Source>()

    @Synchronized
    fun reload() {
        extensions = loader.loadExtensions()
        sourcesById.clear()
        extensions.forEach { ext ->
            ext.sources.forEach { src -> sourcesById[src.id] = src }
        }
    }

    private fun ensureLoaded() {
        if (extensions.isEmpty()) reload()
    }

    fun listExtensions(): List<ExtensionDto> {
        ensureLoaded()
        return extensions.map { ext ->
            ExtensionDto(
                pkg = ext.pkg,
                name = ext.name,
                versionName = ext.versionName,
                versionCode = ext.versionCode,
                libVersion = ext.libVersion,
                lang = ext.lang,
                isNsfw = ext.isNsfw,
                trusted = ext.trusted,
                sources = ext.sources.map { Mappers.sourceToDto(it, ext.pkg, ext.isNsfw) },
            )
        }
    }

    fun listSources(): List<SourceDto> {
        ensureLoaded()
        return extensions.flatMap { ext ->
            ext.sources.map { Mappers.sourceToDto(it, ext.pkg, ext.isNsfw) }
        }
    }

    /** Decodes a Mihon/Tachiyomi `.tachibk` backup into an importable summary. */
    fun importMihonBackup(uriString: String): MihonImportResult {
        return MihonBackupImporter.parse(appContext, uriString)
    }

    /** Writes a Mihon-compatible `.tachibk` and returns a shareable URI. */
    fun exportMihonBackup(request: ExportRequest, fileName: String): ExportResult {
        val result = MihonBackupExporter.export(appContext, request, fileName)
        // With a storage location picked, keep a copy in <root>/backups like
        // Mihon does, so the backup outlives the app even if the share sheet is
        // dismissed.
        val backups = storage.backupsDir(create = true) ?: return result
        val copy = try {
            backups.findFile(fileName)?.delete()
            val doc = backups.createFile("application/octet-stream", fileName) ?: return result
            appContext.contentResolver.openOutputStream(doc.uri, "w")?.use { sink ->
                appContext.contentResolver.openInputStream(Uri.parse(result.uri))?.use { it.copyTo(sink) }
            }
            doc
        } catch (_: Exception) {
            return result
        }
        val where = storage.describe()?.displayPath ?: return result
        return result.copy(savedTo = "$where/${DownloadNaming.BACKUPS_DIR}/${copy.name ?: fileName}")
    }

    /** Hands an exported backup to the system share sheet. */
    fun shareBackup(uriString: String, fileName: String) {
        val send = Intent(Intent.ACTION_SEND).apply {
            type = "application/octet-stream"
            putExtra(Intent.EXTRA_STREAM, Uri.parse(uriString))
            putExtra(Intent.EXTRA_TITLE, fileName)
            addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
        }
        val chooser = Intent.createChooser(send, "Save backup").apply {
            addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_GRANT_READ_URI_PERMISSION)
        }
        appContext.startActivity(chooser)
    }

    fun trustSignature(pkg: String, certSha256: String) {
        trust.trust(pkg, certSha256)
        reload()
    }

    // Browse/read always goes through the extension-lib 1.6 suspend API. Lib 1.4
    // extensions don't implement it, but `HttpSource` bridges each call down to
    // the Observable `fetch*` method they do implement. Calling `fetch*`
    // directly would be wrong in the other direction: a 1.6 extension may
    // implement only the suspend entry point (Weeb Central, for one, ships no
    // `fetchPopularManga` at all).

    suspend fun getPopular(sourceId: String, page: Int): MangasPageDto {
        val source = catalogue(sourceId)
        val result = source.getPopularManga(page)
        return Mappers.mangasPageToDto(source.id, result)
    }

    suspend fun getLatest(sourceId: String, page: Int): MangasPageDto {
        val source = catalogue(sourceId)
        val result = source.getLatestUpdates(page)
        return Mappers.mangasPageToDto(source.id, result)
    }

    suspend fun search(sourceId: String, query: String, page: Int): MangasPageDto {
        val source = catalogue(sourceId)
        val filters: FilterList = source.getFilterList()
        val result = source.getSearchManga(page, query, filters)
        return Mappers.mangasPageToDto(source.id, result)
    }

    /**
     * One `getMangaUpdate` at a time per manga. The app asks for details and
     * chapters as two calls in parallel; keiyoushi's KeiSource base class
     * rejects overlapping updates for the same manga url with
     * "getMangaUpdate must not be called concurrently for same manga".
     */
    private val mangaUpdateLocks = ConcurrentHashMap<String, Mutex>()

    private suspend fun <T> withMangaLock(sourceId: String, mangaUrl: String, block: suspend () -> T): T {
        val lock = mangaUpdateLocks.getOrPut("$sourceId|$mangaUrl") { Mutex() }
        return lock.withLock { block() }
    }

    suspend fun getMangaDetails(sourceId: String, mangaUrl: String, memoJson: String? = null): MangaDto {
        val source = source(sourceId)
        val known = Mappers.memoFromJson(memoJson)
        val stub = SManga.create().apply { url = mangaUrl; title = ""; memo = known }
        // `mangaDetailsParse` typically returns a partial SManga without `url`
        // (the app already knows it). Re-attach the known url so the mapper
        // doesn't hit an uninitialized lateinit. Likewise keep the memo we were
        // given unless the source wrote a new one.
        val result = withMangaLock(sourceId, mangaUrl) {
            source.getMangaUpdate(stub, emptyList(), fetchDetails = true, fetchChapters = false)
        }
            .manga
            .apply {
                url = mangaUrl
                if (memo.isEmpty()) memo = known
            }
        return Mappers.mangaToDto(source.id, result)
    }

    /**
     * Absolute, browser-openable URL for a manga. Honors source overrides of
     * `getMangaUrl` (e.g. Madara), falling back to `baseUrl + path`.
     */
    fun getMangaWebUrl(sourceId: String, mangaUrl: String): String {
        val source = source(sourceId)
        if (source !is HttpSource) return mangaUrl
        val stub = SManga.create().apply { url = mangaUrl; title = "" }
        return try {
            source.getMangaUrl(stub)
        } catch (_: Throwable) {
            val base = source.baseUrl.trimEnd('/')
            val path = if (mangaUrl.startsWith("/")) mangaUrl else "/$mangaUrl"
            if (mangaUrl.startsWith("http")) mangaUrl else base + path
        }
    }

    /** UA shared with the Cloudflare WebView solver so cleared cookies stay valid. */
    fun userAgent(): String = network.defaultUserAgentProvider()

    suspend fun getChapters(sourceId: String, mangaUrl: String, memoJson: String? = null): List<ChapterDto> {
        val source = source(sourceId)
        val stub = SManga.create().apply { url = mangaUrl; title = ""; memo = Mappers.memoFromJson(memoJson) }
        val result: List<SChapter> = withMangaLock(sourceId, mangaUrl) {
            source.getMangaUpdate(stub, emptyList(), fetchDetails = false, fetchChapters = true)
        }.chapters
        return result.map { Mappers.chapterToDto(source.id, mangaUrl, it) }
    }

    suspend fun getPages(sourceId: String, chapterUrl: String, memoJson: String? = null): List<PageDto> {
        val source = source(sourceId)
        val stub = SChapter.create().apply { url = chapterUrl; name = ""; memo = Mappers.memoFromJson(memoJson) }
        val result: List<Page> = source.getPageList(stub)
        return result.map { Mappers.pageToDto(it) }
    }

    suspend fun resolveImage(sourceId: String, page: PageDto): ImageRequestDto {
        val source = source(sourceId)
        val headers = if (source is HttpSource) {
            source.headers.toMultimap().mapValues { it.value.firstOrNull() ?: "" }
        } else {
            emptyMap()
        }
        val url = page.imageUrl ?: if (source is HttpSource) {
            val model = Page(page.index, page.url ?: "", page.imageUrl)
            source.getImageUrl(model)
        } else {
            page.url ?: ""
        }
        return ImageRequestDto(url = url, headers = headers)
    }

    suspend fun fetchImage(
        sourceId: String,
        page: PageDto,
        forceRefresh: Boolean = false,
    ): ImageFileDto {
        val source = source(sourceId)
        if (source !is HttpSource) {
            throw EngineException("parse", "Source $sourceId does not support HTTP image fetching")
        }

        val model = Page(page.index, page.url ?: "", page.imageUrl)
        Log.i(
            READER_IMAGE_TAG,
            "fetchImage start source=$sourceId page=${page.index} " +
                "pageUrl=${shortUrl(page.url)} imageUrl=${shortUrl(page.imageUrl)}",
        )
        val imageUrl = resolveNativeImageUrl(sourceId, source, page, model)
        model.imageUrl = imageUrl

        val cacheDir = File(appContext.cacheDir, "reader_images/$sourceId").apply { mkdirs() }
        val key = cacheKey(page.index, page.url, imageUrl)
        File(cacheDir, "$key.img").delete()
        // A manual retry busts the cache: a truncated/partial earlier download can
        // write a non-empty but corrupt file that renders black, and would otherwise
        // be served forever. Drop every cached variant + tiles for this page.
        if (forceRefresh) {
            cacheDir.listFiles()?.forEach { f ->
                if (f.name.startsWith("$key.") || f.name == "${key}_tiles") {
                    f.deleteRecursively()
                }
            }
        }
        var finalFile = File(cacheDir, "$key.${extensionFor(imageUrl, null)}")
        var contentType: String? = null
        val cached = finalFile.exists() && finalFile.length() > 0L
        if (!finalFile.exists() || finalFile.length() == 0L) {
            val temp = File(cacheDir, "$key.tmp")
            contentType = try {
                source.fetchImage(model).awaitSingle().use { response ->
                    writeImageResponse(response, temp)
                }
            } catch (error: Throwable) {
                temp.delete()
                Log.w(
                    READER_IMAGE_TAG,
                    "source fetchImage failed; retrying direct HTTP/1.1 " +
                        "source=$sourceId page=${page.index} message=${error.message.orEmpty()} " +
                        "imageUrl=${shortUrl(imageUrl)}",
                    error,
                )
                directImageResponse(source, imageUrl).use { response ->
                    writeImageResponse(response, temp)
                }
            }
            val typedFile = File(cacheDir, "$key.${extensionFor(imageUrl, contentType)}")
            if (typedFile != finalFile) {
                finalFile.delete()
            }
            if (!temp.renameTo(typedFile)) {
                temp.copyTo(typedFile, overwrite = true)
                temp.delete()
            }
            finalFile = typedFile
            // Guard against caching a corrupt/incomplete download (a common cause of
            // "black pages"): if it can't be decoded, delete it and fail so the
            // retry loop re-downloads instead of permanently serving a bad file.
            if (imageSize(finalFile) == null) {
                finalFile.delete()
                throw EngineException("network", "Downloaded image was incomplete; please retry")
            }
        }
        val size = imageSize(finalFile)
        val tiles = if (size != null && size.second > MAX_TILE_HEIGHT) {
            imageTiles(finalFile, cacheDir, key, size.first, size.second)
        } else {
            emptyList()
        }
        Log.i(
            READER_IMAGE_TAG,
            "source=$sourceId page=${page.index} cached=$cached bytes=${finalFile.length()} " +
                "pixels=${size?.first}x${size?.second} contentType=${contentType ?: "unknown"} " +
                "tiles=${tiles.size} pageUrl=${shortUrl(page.url)} imageUrl=${shortUrl(imageUrl)} " +
                "file=${finalFile.name}",
        )
        return ImageFileDto(
            uri = Uri.fromFile(finalFile).toString(),
            sourceUrl = imageUrl,
            bytes = finalFile.length(),
            cached = cached,
            width = size?.first,
            height = size?.second,
            contentType = contentType,
            tiles = tiles,
        )
    }

    /**
     * Fetches a manga cover through the source's HTTP client — so the source's
     * headers (Referer/User-Agent) and the Cloudflare interceptor apply — and
     * caches it to disk. Returns a `file://` uri on success, or the original
     * `url` unchanged when it can't be fetched natively (no installed source,
     * a non-http url, or a network/decoding failure) so the caller can still try
     * loading it directly. This is what lets covers from Referer- or
     * Cloudflare-gated CDNs load, the same way reader pages do.
     */
    suspend fun fetchCover(sourceId: String, url: String): String {
        if (url.isBlank()) return url
        if (url.startsWith("file://") || url.startsWith("content://") || url.startsWith("data:")) {
            return url
        }
        if (!url.startsWith("http")) return url

        // Only sources we actually have loaded can supply the right client/headers.
        val source = sourceOrNull(sourceId) as? HttpSource ?: return url

        val cacheDir = File(appContext.cacheDir, "covers").apply { mkdirs() }
        val key = hashKey(url)
        val existing = cacheDir.listFiles()?.firstOrNull {
            it.name.startsWith("$key.") && !it.name.endsWith(".tmp") && it.length() > 0L
        }
        if (existing != null && imageSize(existing) != null) {
            return Uri.fromFile(existing).toString()
        }

        return try {
            val temp = File(cacheDir, "$key.tmp")
            val contentType = directImageResponse(source, url).use { response ->
                writeImageResponse(response, temp)
            }
            val finalFile = File(cacheDir, "$key.${extensionFor(url, contentType)}")
            finalFile.delete()
            if (!temp.renameTo(finalFile)) {
                temp.copyTo(finalFile, overwrite = true)
                temp.delete()
            }
            if (imageSize(finalFile) == null) {
                finalFile.delete()
                url
            } else {
                Uri.fromFile(finalFile).toString()
            }
        } catch (error: Throwable) {
            Log.w(READER_IMAGE_TAG, "cover fetch failed for ${shortUrl(url)}: ${error.message}")
            url
        }
    }

    // --- offline downloads -------------------------------------------------
    // Two homes. With no storage location picked, pages live in filesDir
    // (persistent, not evicted like the reader cache), keyed by chapter hash +
    // page index. With a location picked, new downloads go under it in Mihon's
    // folder layout (see DownloadNaming) so a file manager — or Mihon — can read
    // them. Reads check the picked location first and fall back to filesDir, so
    // picking a folder never hides what was downloaded before.

    internal val storage = StorageManager(appContext)

    private val downloadsRoot: File
        get() = File(appContext.filesDir, "downloads")

    private fun internalChapterDir(sourceId: String, chapterUrl: String): File =
        File(downloadsRoot, "$sourceId/${hashKey(chapterUrl)}")

    private fun hashKey(value: String): String =
        MessageDigest.getInstance("SHA-256")
            .digest(value.toByteArray())
            .joinToString("") { "%02x".format(it) }

    fun storageLocation(): StorageLocationDto? = storage.describe()

    fun setStorageLocation(uri: Uri): StorageLocationDto? {
        storage.setTreeUri(uri)
        return storage.describe()
    }

    fun clearStorageLocation() = storage.clearTreeUri()

    private fun externalChapterDir(
        sourceId: String,
        chapterUrl: String,
        meta: DownloadMetaDto?,
        create: Boolean,
    ): DocumentFile? {
        storage.rememberedChapterDir(sourceId, chapterUrl)?.let { return it }
        if (meta == null) return null
        val src = sourceOrNull(sourceId) ?: return null
        // Mihon names the folder after HttpSource.toString(): "<name> (<LANG>)".
        val lang = (src as? CatalogueSource)?.lang ?: ""
        return storage.chapterDir(sourceId, src.name, lang, chapterUrl, meta, create)
    }

    /**
     * Downloads one page to persistent storage; returns its uri (`file://` in
     * app storage, `content://` under a picked folder). Idempotent.
     */
    suspend fun downloadPage(
        sourceId: String,
        chapterUrl: String,
        page: PageDto,
        meta: DownloadMetaDto?,
    ): String {
        val source = source(sourceId)
        if (source !is HttpSource) {
            throw EngineException("parse", "Source $sourceId does not support HTTP image fetching")
        }
        val external = externalChapterDir(sourceId, chapterUrl, meta, create = true)
        if (external != null) {
            storage.pages(external)[page.index]?.let { existing ->
                if (imageSize(existing.uri) != null) return existing.uri.toString()
            }
        } else {
            val dir = internalChapterDir(sourceId, chapterUrl)
            val existing = dir.listFiles()?.firstOrNull {
                it.name.startsWith("${page.index}.") && !it.name.endsWith(".tmp") && it.length() > 0L
            }
            if (existing != null && imageSize(existing) != null) {
                return Uri.fromFile(existing).toString()
            }
        }

        val model = Page(page.index, page.url ?: "", page.imageUrl)
        val imageUrl = resolveNativeImageUrl(sourceId, source, page, model)
        model.imageUrl = imageUrl

        // Always fetch into a private temp file first: the image is verified
        // before it is committed, and SAF has no atomic rename to lean on.
        val scratch = if (external != null) File(appContext.cacheDir, "download_tmp").apply { mkdirs() }
                      else internalChapterDir(sourceId, chapterUrl).apply { mkdirs() }
        val temp = File(scratch, "${hashKey("$sourceId|$chapterUrl")}_${page.index}.tmp")
        val contentType = try {
            source.fetchImage(model).awaitSingle().use { response -> writeImageResponse(response, temp) }
        } catch (error: Throwable) {
            temp.delete()
            directImageResponse(source, imageUrl).use { response -> writeImageResponse(response, temp) }
        }
        if (imageSize(temp) == null) {
            temp.delete()
            throw EngineException("network", "Downloaded image was incomplete; please retry")
        }
        val extension = extensionFor(imageUrl, contentType)

        if (external != null) {
            val name = DownloadNaming.pageFileName(page.index, extension)
            external.findFile(name)?.delete()
            val doc = external.createFile(mimeFor(extension), name)
                ?: run {
                    temp.delete()
                    throw EngineException("storage", "Could not create $name in the storage location")
                }
            try {
                appContext.contentResolver.openOutputStream(doc.uri, "w")?.use { sink ->
                    temp.inputStream().use { it.copyTo(sink) }
                } ?: throw EngineException("storage", "Could not write $name to the storage location")
            } finally {
                temp.delete()
            }
            storage.invalidate(external)
            return doc.uri.toString()
        }

        val finalFile = File(scratch, "${page.index}.$extension")
        finalFile.delete()
        if (!temp.renameTo(finalFile)) {
            temp.copyTo(finalFile, overwrite = true)
            temp.delete()
        }
        return Uri.fromFile(finalFile).toString()
    }

    /** Reads a previously downloaded page (no network), tiling tall webtoon images. */
    fun fetchDownloadedImage(sourceId: String, chapterUrl: String, pageIndex: Int): ImageFileDto {
        val external = externalChapterDir(sourceId, chapterUrl, meta = null, create = false)
        val doc = external?.let { storage.pages(it)[pageIndex] }
        if (doc != null) {
            val size = imageSize(doc.uri)
                ?: throw EngineException("parse", "Downloaded page $pageIndex is unreadable")
            val tiles = if (size.second > MAX_TILE_HEIGHT) {
                // The region decoder wants a file path; stage a private copy.
                val tileCache = File(appContext.cacheDir, "reader_images/$sourceId").apply { mkdirs() }
                val key = hashKey("dl|$chapterUrl|$pageIndex")
                val staged = File(tileCache, "$key.src")
                if (!staged.exists() || staged.length() != doc.length()) {
                    appContext.contentResolver.openInputStream(doc.uri)?.use { input ->
                        staged.outputStream().use { input.copyTo(it) }
                    } ?: throw EngineException("not_found", "Page $pageIndex is not readable")
                }
                imageTiles(staged, tileCache, key, size.first, size.second)
            } else {
                emptyList()
            }
            return ImageFileDto(
                uri = doc.uri.toString(),
                sourceUrl = null,
                bytes = doc.length(),
                cached = true,
                width = size.first,
                height = size.second,
                contentType = null,
                tiles = tiles,
            )
        }

        val dir = internalChapterDir(sourceId, chapterUrl)
        val file = dir.listFiles()?.firstOrNull {
            it.name.startsWith("$pageIndex.") && !it.name.endsWith(".tmp") && it.length() > 0L
        } ?: throw EngineException("not_found", "Page $pageIndex is not downloaded")
        val size = imageSize(file)
            ?: throw EngineException("parse", "Downloaded page $pageIndex is unreadable")
        val tiles = if (size.second > MAX_TILE_HEIGHT) {
            val tileCache = File(appContext.cacheDir, "reader_images/$sourceId").apply { mkdirs() }
            imageTiles(file, tileCache, hashKey("dl|$chapterUrl|$pageIndex"), size.first, size.second)
        } else {
            emptyList()
        }
        return ImageFileDto(
            uri = Uri.fromFile(file).toString(),
            sourceUrl = null,
            bytes = file.length(),
            cached = true,
            width = size.first,
            height = size.second,
            contentType = null,
            tiles = tiles,
        )
    }

    /** Removes all downloaded pages for a chapter, wherever they live. */
    fun deleteDownloadedChapter(sourceId: String, chapterUrl: String) {
        externalChapterDir(sourceId, chapterUrl, meta = null, create = false)?.let { dir ->
            storage.invalidate(dir)
            dir.delete()
            storage.forgetChapterDir(sourceId, chapterUrl)
        }
        internalChapterDir(sourceId, chapterUrl).deleteRecursively()
    }

    /**
     * Moves a chapter downloaded into app storage to the picked folder, renaming
     * pages into Mihon's `001.jpg` scheme. Returns the number of pages moved
     * (0 when there was nothing in app storage, or no location is set).
     */
    fun migrateDownloadedChapter(sourceId: String, chapterUrl: String, meta: DownloadMetaDto): Int {
        val internal = internalChapterDir(sourceId, chapterUrl)
        val files = internal.listFiles()
            ?.filter { it.isFile && !it.name.endsWith(".tmp") && it.length() > 0L }
            ?.takeIf { it.isNotEmpty() }
            ?: return 0
        val external = externalChapterDir(sourceId, chapterUrl, meta, create = true) ?: return 0
        var moved = 0
        for (file in files) {
            val index = file.name.substringBefore('.').toIntOrNull() ?: continue
            val extension = file.name.substringAfter('.', "jpg")
            val name = DownloadNaming.pageFileName(index, extension)
            external.findFile(name)?.delete()
            val doc = external.createFile(mimeFor(extension), name) ?: continue
            appContext.contentResolver.openOutputStream(doc.uri, "w")?.use { sink ->
                file.inputStream().use { it.copyTo(sink) }
            } ?: continue
            moved += 1
        }
        storage.invalidate(external)
        if (moved == files.size) internal.deleteRecursively()
        return moved
    }

    private fun mimeFor(extension: String): String = when (extension.lowercase()) {
        "png" -> "image/png"
        "webp" -> "image/webp"
        "gif" -> "image/gif"
        else -> "image/jpeg"
    }

    private fun imageSize(uri: Uri): Pair<Int, Int>? {
        val options = BitmapFactory.Options().apply { inJustDecodeBounds = true }
        try {
            // With inJustDecodeBounds the decoder returns no bitmap by design;
            // only a missing stream is a failure. The bounds land in `options`.
            val stream = appContext.contentResolver.openInputStream(uri) ?: return null
            stream.use { BitmapFactory.decodeStream(it, null, options) }
        } catch (_: Exception) {
            return null
        }
        return if (options.outWidth > 0 && options.outHeight > 0) options.outWidth to options.outHeight else null
    }

    // --- save / share -----------------------------------------------------

    /**
     * Copies a locally cached/downloaded page (a `file://` uri) into the device
     * gallery under Pictures/Kagari. Returns the saved display name. Uses the
     * MediaStore so no storage permission is needed (Android 10+).
     */
    fun saveImageToGallery(fileUri: String): String {
        val source = localImageFile(fileUri)
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.Q) {
            throw EngineException("parse", "Saving to the gallery requires Android 10 or newer")
        }
        return saveToMediaStore(source)
    }

    @RequiresApi(Build.VERSION_CODES.Q)
    private fun saveToMediaStore(source: File): String {
        val mime = mimeFor(source)
        val displayName = "kagari_${System.currentTimeMillis()}.${imageExtension(source, mime)}"
        val resolver = appContext.contentResolver
        val values = ContentValues().apply {
            put(MediaStore.Images.Media.DISPLAY_NAME, displayName)
            put(MediaStore.Images.Media.MIME_TYPE, mime)
            put(MediaStore.Images.Media.RELATIVE_PATH, "${Environment.DIRECTORY_PICTURES}/Kagari")
            put(MediaStore.Images.Media.IS_PENDING, 1)
        }
        val collection = MediaStore.Images.Media.getContentUri(MediaStore.VOLUME_EXTERNAL_PRIMARY)
        val item = resolver.insert(collection, values)
            ?: throw EngineException("unknown", "Could not create a gallery entry")
        try {
            resolver.openOutputStream(item)?.use { out ->
                source.inputStream().use { input -> input.copyTo(out) }
            } ?: throw EngineException("unknown", "Could not open the gallery entry")
            values.clear()
            values.put(MediaStore.Images.Media.IS_PENDING, 0)
            resolver.update(item, values, null, null)
        } catch (e: Throwable) {
            resolver.delete(item, null, null)
            throw if (e is EngineException) e else EngineException("unknown", e.message ?: "Save failed")
        }
        return displayName
    }

    /** Opens the system share sheet for a locally cached/downloaded page. */
    fun shareImage(fileUri: String) {
        val source = localImageFile(fileUri)
        val shareDir = File(appContext.cacheDir, "shared").apply { mkdirs() }
        // Keep the staging dir tidy; only the page being shared needs to exist.
        shareDir.listFiles()?.forEach { it.delete() }
        val mime = mimeFor(source)
        val staged = File(shareDir, "kagari_page.${imageExtension(source, mime)}")
        source.copyTo(staged, overwrite = true)
        val contentUri = FileProvider.getUriForFile(
            appContext,
            "${appContext.packageName}.fileprovider",
            staged,
        )
        val send = Intent(Intent.ACTION_SEND).apply {
            type = mime
            putExtra(Intent.EXTRA_STREAM, contentUri)
            addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
        }
        val chooser = Intent.createChooser(send, "Share page").apply {
            addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
        }
        appContext.startActivity(chooser)
    }

    /** Renders a high-resolution tier-list board and returns a local file URI. */
    fun renderTierListImage(export: TierListExportDto): String {
        val landscape = export.orientation.lowercase() != "vertical"
        val width = if (landscape) 2400 else 1440
        val padding = if (landscape) 72 else 56
        val titleHeight = if (landscape) 150 else 136
        val labelWidth = if (landscape) 230 else 0
        val coverWidth = if (landscape) 118 else 128
        val coverHeight = if (landscape) 170 else 188
        val titleTextHeight = if (landscape) 48 else 50
        val itemGap = if (landscape) 22 else 18
        val rowGap = if (landscape) 22 else 24
        val rowPad = if (landscape) 24 else 22
        val contentWidth = width - padding * 2
        val gridWidth = contentWidth - labelWidth - if (landscape) rowPad else 0
        val itemSlot = coverWidth + itemGap
        val perLine = maxOf(1, (gridWidth + itemGap) / itemSlot)
        val rowHeights = export.rows.map { row ->
            val lines = maxOf(1, (row.items.size + perLine - 1) / perLine)
            if (landscape) {
                maxOf(240, rowPad * 2 + lines * (coverHeight + titleTextHeight + itemGap) - itemGap)
            } else {
                rowPad * 2 + 84 + lines * (coverHeight + titleTextHeight + itemGap) - itemGap
            }
        }
        val height = padding + titleHeight + rowHeights.sum() + rowGap * maxOf(0, export.rows.size - 1) + padding
        val pixelCount = width.toLong() * height.toLong()
        if (pixelCount > MAX_EXPORT_PIXELS) {
            throw EngineException(
                "too_large",
                "This tier list is too large to export as one image. Remove some titles or rows and try again.",
            )
        }
        val bitmap = Bitmap.createBitmap(width, height, Bitmap.Config.ARGB_8888)
        val canvas = Canvas(bitmap)
        val paint = Paint(Paint.ANTI_ALIAS_FLAG or Paint.FILTER_BITMAP_FLAG)
        canvas.drawColor(Color.rgb(22, 22, 24))

        paint.typeface = Typeface.create(Typeface.DEFAULT, Typeface.BOLD)
        paint.color = Color.rgb(244, 244, 246)
        paint.textSize = if (landscape) 54f else 46f
        canvas.drawText(export.title.ifBlank { "Kagari Tier List" }, padding.toFloat(), (padding + 58).toFloat(), paint)
        paint.typeface = Typeface.create(Typeface.DEFAULT, Typeface.NORMAL)
        paint.color = Color.rgb(154, 154, 163)
        paint.textSize = 25f
        canvas.drawText("Created with Kagari", padding.toFloat(), (padding + 98).toFloat(), paint)

        var y = padding + titleHeight
        export.rows.forEachIndexed { rowIndex, row ->
            val rowHeight = rowHeights[rowIndex]
            paint.color = Color.rgb(30, 30, 34)
            canvas.drawRoundRect(
                RectF(padding.toFloat(), y.toFloat(), (width - padding).toFloat(), (y + rowHeight).toFloat()),
                34f,
                34f,
                paint,
            )

            if (landscape) {
                drawTierLabel(canvas, paint, row.name, row.color, padding + rowPad, y + rowPad, labelWidth - rowPad, rowHeight - rowPad * 2)
                drawTierItems(canvas, paint, row.items, padding + labelWidth + rowPad, y + rowPad, gridWidth, perLine, coverWidth, coverHeight, itemGap)
            } else {
                drawTierLabel(canvas, paint, row.name, row.color, padding + rowPad, y + rowPad, contentWidth - rowPad * 2, 64)
                drawTierItems(canvas, paint, row.items, padding + rowPad, y + rowPad + 88, contentWidth - rowPad * 2, perLine, coverWidth, coverHeight, itemGap)
            }
            y += rowHeight + rowGap
        }

        val dir = File(appContext.cacheDir, "tier_exports").apply { mkdirs() }
        dir.listFiles()?.forEach { it.delete() }
        val file = File(dir, "kagari_tier_${System.currentTimeMillis()}.jpg")
        file.outputStream().use { out -> bitmap.compress(Bitmap.CompressFormat.JPEG, 96, out) }
        bitmap.recycle()
        return Uri.fromFile(file).toString()
    }

    private fun drawTierLabel(
        canvas: Canvas,
        paint: Paint,
        name: String,
        color: String,
        x: Int,
        y: Int,
        width: Int,
        height: Int,
    ) {
        paint.color = parseColor(color)
        canvas.drawRoundRect(RectF(x.toFloat(), y.toFloat(), (x + width).toFloat(), (y + height).toFloat()), 24f, 24f, paint)
        paint.typeface = Typeface.create(Typeface.DEFAULT, Typeface.BOLD)
        paint.color = Color.rgb(20, 20, 22)
        paint.textSize = if (height > 100) 40f else 34f
        val label = ellipsize(name, paint, width - 28)
        val baseline = y + height / 2f - (paint.descent() + paint.ascent()) / 2f
        canvas.drawText(label, x + 14f, baseline, paint)
    }

    private fun drawTierItems(
        canvas: Canvas,
        paint: Paint,
        items: List<com.manhwa.engine.dto.TierListExportItemDto>,
        x: Int,
        y: Int,
        width: Int,
        perLine: Int,
        coverWidth: Int,
        coverHeight: Int,
        gap: Int,
    ) {
        if (items.isEmpty()) {
            paint.typeface = Typeface.create(Typeface.DEFAULT, Typeface.NORMAL)
            paint.color = Color.rgb(110, 110, 119)
            paint.textSize = 28f
            canvas.drawText("No titles yet", x.toFloat(), (y + 58).toFloat(), paint)
            return
        }

        items.forEachIndexed { index, item ->
            val col = index % perLine
            val row = index / perLine
            val itemX = x + col * (coverWidth + gap)
            val itemY = y + row * (coverHeight + 50 + gap)
            drawCover(canvas, paint, item.coverUri, itemX, itemY, coverWidth, coverHeight)
            paint.typeface = Typeface.create(Typeface.DEFAULT, Typeface.BOLD)
            paint.color = Color.rgb(244, 244, 246)
            paint.textSize = 20f
            val title = ellipsize(item.title, paint, coverWidth)
            canvas.drawText(title, itemX.toFloat(), (itemY + coverHeight + 28).toFloat(), paint)
        }
    }

    private fun drawCover(canvas: Canvas, paint: Paint, uri: String?, x: Int, y: Int, width: Int, height: Int) {
        val file = uri?.let { Uri.parse(it).path }?.let { File(it) }
        val bitmap = file
            ?.takeIf { it.exists() && it.length() > 0L }
            ?.let { decodeSampledBitmap(it, width, height) }
        if (bitmap != null) {
            canvas.drawBitmap(bitmap, null, Rect(x, y, x + width, y + height), paint)
            bitmap.recycle()
        } else {
            paint.color = Color.rgb(38, 38, 43)
            canvas.drawRoundRect(RectF(x.toFloat(), y.toFloat(), (x + width).toFloat(), (y + height).toFloat()), 18f, 18f, paint)
        }
    }

    private fun decodeSampledBitmap(file: File, targetWidth: Int, targetHeight: Int): Bitmap? {
        val bounds = BitmapFactory.Options().apply { inJustDecodeBounds = true }
        BitmapFactory.decodeFile(file.absolutePath, bounds)
        if (bounds.outWidth <= 0 || bounds.outHeight <= 0) return null

        var sample = 1
        while (
            bounds.outWidth / (sample * 2) >= targetWidth &&
            bounds.outHeight / (sample * 2) >= targetHeight
        ) {
            sample *= 2
        }
        return BitmapFactory.decodeFile(
            file.absolutePath,
            BitmapFactory.Options().apply { inSampleSize = sample },
        )
    }

    private fun parseColor(color: String): Int {
        return try {
            Color.parseColor(color)
        } catch (_: Throwable) {
            Color.rgb(156, 163, 175)
        }
    }

    private fun ellipsize(text: String, paint: Paint, maxWidth: Int): String {
        if (paint.measureText(text) <= maxWidth) return text
        var out = text
        while (out.length > 1 && paint.measureText("$out…") > maxWidth) {
            out = out.dropLast(1)
        }
        return "$out…"
    }

    private fun localImageFile(fileUri: String): File {
        val path = Uri.parse(fileUri).path
            ?: throw EngineException("not_found", "Invalid image path")
        val file = File(path)
        if (!file.exists() || file.length() == 0L) {
            throw EngineException("not_found", "Image is not available yet")
        }
        return file
    }

    private fun mimeFor(file: File): String = when (file.extension.lowercase()) {
        "png" -> "image/png"
        "webp" -> "image/webp"
        "gif" -> "image/gif"
        else -> "image/jpeg"
    }

    private fun imageExtension(file: File, mime: String): String {
        val ext = file.extension.lowercase()
        if (ext.isNotBlank()) return ext
        return when {
            mime.contains("png") -> "png"
            mime.contains("webp") -> "webp"
            mime.contains("gif") -> "gif"
            else -> "jpg"
        }
    }

    private fun source(sourceId: String): Source {
        ensureLoaded()
        val id = sourceId.toLongOrNull() ?: throw EngineException("not_found", "Invalid source id")
        return sourcesById[id] ?: throw EngineException("not_found", "Source $sourceId not loaded")
    }

    /** Like [source] but returns null instead of throwing when not loaded. */
    private fun sourceOrNull(sourceId: String): Source? {
        ensureLoaded()
        val id = sourceId.toLongOrNull() ?: return null
        return sourcesById[id]
    }

    private fun catalogue(sourceId: String): CatalogueSource {
        return source(sourceId) as? CatalogueSource
            ?: throw EngineException("parse", "Source $sourceId is not a catalogue source")
    }

    private fun cacheKey(index: Int, pageUrl: String?, imageUrl: String): String {
        val raw = "$index|${pageUrl.orEmpty()}|$imageUrl"
        return MessageDigest.getInstance("SHA-256")
            .digest(raw.toByteArray())
            .joinToString("") { "%02x".format(it) }
    }

    private suspend fun resolveNativeImageUrl(
        sourceId: String,
        source: HttpSource,
        page: PageDto,
        model: Page,
    ): String {
        val existing = model.imageUrl
        if (!existing.isNullOrBlank()) return existing

        return try {
            source.getImageUrl(model)
        } catch (error: Throwable) {
            val directPageUrl = page.url?.takeIf { isLikelyImageUrl(it) }
            if (directPageUrl.isNullOrBlank()) {
                Log.w(
                    READER_IMAGE_TAG,
                    "image URL resolve failed without direct image fallback " +
                        "source=$sourceId page=${page.index} message=${error.message.orEmpty()} " +
                        "pageUrl=${shortUrl(page.url)}",
                    error,
                )
                throw error
            }
            Log.w(
                READER_IMAGE_TAG,
                "image URL resolve failed; using direct page URL " +
                    "source=$sourceId page=${page.index} message=${error.message.orEmpty()} " +
                    "pageUrl=${shortUrl(page.url)}",
                error,
            )
            directPageUrl
        }
    }

    private fun isLikelyImageUrl(url: String): Boolean {
        val cleanUrl = url.substringBefore('?').substringBefore('#').lowercase()
        return cleanUrl.endsWith(".jpg") ||
            cleanUrl.endsWith(".jpeg") ||
            cleanUrl.endsWith(".png") ||
            cleanUrl.endsWith(".webp") ||
            cleanUrl.endsWith(".gif")
    }

    private fun imageSize(file: File): Pair<Int, Int>? {
        val options = BitmapFactory.Options().apply { inJustDecodeBounds = true }
        BitmapFactory.decodeFile(file.absolutePath, options)
        return if (options.outWidth > 0 && options.outHeight > 0) {
            options.outWidth to options.outHeight
        } else {
            null
        }
    }

    private fun imageTiles(
        file: File,
        cacheDir: File,
        key: String,
        width: Int,
        height: Int,
    ): List<ImageTileDto> {
        val tileDir = File(cacheDir, "${key}_tiles").apply { mkdirs() }
        val expectedCount = (height + MAX_TILE_HEIGHT - 1) / MAX_TILE_HEIGHT
        val existing = (0 until expectedCount).map { index ->
            File(tileDir, "tile_$index.jpg")
        }
        if (existing.all { it.exists() && it.length() > 0L }) {
            return existing.mapIndexed { index, tile ->
                val size = imageSize(tile)
                ImageTileDto(
                    uri = Uri.fromFile(tile).toString(),
                    width = size?.first ?: width,
                    height = size?.second ?: MAX_TILE_HEIGHT,
                    index = index,
                )
            }
        }

        tileDir.listFiles()?.forEach { it.delete() }
        @Suppress("DEPRECATION")
        val decoder = BitmapRegionDecoder.newInstance(file.absolutePath, false) ?: return emptyList()
        return try {
            (0 until expectedCount).mapNotNull { index ->
                val top = index * MAX_TILE_HEIGHT
                val bottom = minOf(top + MAX_TILE_HEIGHT, height)
                val bitmap = decoder.decodeRegion(Rect(0, top, width, bottom), null) ?: return@mapNotNull null
                val tile = File(tileDir, "tile_$index.jpg")
                tile.outputStream().use { out ->
                    bitmap.compress(Bitmap.CompressFormat.JPEG, 100, out)
                }
                bitmap.recycle()
                ImageTileDto(
                    uri = Uri.fromFile(tile).toString(),
                    width = width,
                    height = bottom - top,
                    index = index,
                )
            }
        } finally {
            decoder.recycle()
        }
    }

    private fun directImageResponse(source: HttpSource, imageUrl: String): Response {
        val headers = source.headers.newBuilder().apply {
            set("Accept", "image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8")
            if (source.headers["Referer"].isNullOrBlank()) {
                set("Referer", source.baseUrl.trimEnd('/') + "/")
            }
        }.build()
        val request = Request.Builder()
            .url(imageUrl)
            .headers(headers)
            .get()
            .build()
        val client = source.client.newBuilder()
            .protocols(listOf(Protocol.HTTP_1_1))
            .build()
        val response = client.newCall(request).execute()
        if (!response.isSuccessful) {
            val code = response.code
            response.close()
            throw EngineException("network", "Image HTTP $code for ${shortUrl(imageUrl)}")
        }
        Log.i(
            READER_IMAGE_TAG,
            "direct HTTP/1.1 image fetch ok bytes=${response.body?.contentLength() ?: -1} " +
                "contentType=${response.header("Content-Type") ?: "unknown"} " +
                "imageUrl=${shortUrl(imageUrl)}",
        )
        return response
    }

    private fun writeImageResponse(response: Response, destination: File): String? {
        val body = response.body ?: throw EngineException("network", "Empty image response")
        destination.outputStream().use { sink -> body.byteStream().copyTo(sink) }
        return response.header("Content-Type")
    }

    private fun extensionFor(imageUrl: String, contentType: String?): String {
        val type = contentType?.substringBefore(';')?.trim()?.lowercase()
        if (type != null) {
            when {
                type.contains("png") -> return "png"
                type.contains("webp") -> return "webp"
                type.contains("jpeg") || type.contains("jpg") -> return "jpg"
            }
        }
        val cleanUrl = imageUrl.substringBefore('?').substringBefore('#').lowercase()
        return when {
            cleanUrl.endsWith(".png") -> "png"
            cleanUrl.endsWith(".webp") -> "webp"
            cleanUrl.endsWith(".jpeg") -> "jpg"
            cleanUrl.endsWith(".jpg") -> "jpg"
            else -> "jpg"
        }
    }

    private fun shortUrl(url: String?): String {
        if (url.isNullOrBlank()) return "none"
        return if (url.length <= 140) url else url.take(90) + "..." + url.takeLast(40)
    }

    companion object {
        private const val READER_IMAGE_TAG = "KagariReaderImage"
        private const val MAX_TILE_HEIGHT = 4096
        private const val MAX_EXPORT_PIXELS = 12_000_000L
    }
}

class EngineException(val kind: String, message: String) : Exception(message)
