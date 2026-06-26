package com.manhwa.engine

import android.content.ContentValues
import android.content.Context
import android.content.Intent
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.BitmapRegionDecoder
import android.graphics.Rect
import android.net.Uri
import android.os.Build
import android.os.Environment
import android.provider.MediaStore
import android.util.Log
import androidx.annotation.RequiresApi
import androidx.core.content.FileProvider
import com.manhwa.engine.dto.ChapterDto
import com.manhwa.engine.dto.ExtensionDto
import com.manhwa.engine.dto.ImageFileDto
import com.manhwa.engine.dto.ImageTileDto
import com.manhwa.engine.dto.ImageRequestDto
import com.manhwa.engine.dto.MangaDto
import com.manhwa.engine.dto.MangasPageDto
import com.manhwa.engine.dto.PageDto
import com.manhwa.engine.dto.SourceDto
import com.manhwa.engine.backup.MihonBackupImporter
import com.manhwa.engine.backup.MihonImportResult
import com.manhwa.engine.loader.ExtensionLoader
import com.manhwa.engine.loader.LoadedExtension
import com.manhwa.engine.loader.SignatureTrust
import eu.kanade.tachiyomi.source.CatalogueSource
import eu.kanade.tachiyomi.source.Source
import eu.kanade.tachiyomi.source.model.FilterList
import eu.kanade.tachiyomi.source.model.Page
import eu.kanade.tachiyomi.source.model.SChapter
import eu.kanade.tachiyomi.source.model.SManga
import eu.kanade.tachiyomi.source.online.HttpSource
import java.io.File
import java.security.MessageDigest
import okhttp3.Protocol
import okhttp3.Request
import okhttp3.Response

/**
 * The single entry point the RN bridge talks to. Holds loaded sources and
 * exposes a suspend API that returns DTOs.
 *
 * Browse/detail/page calls currently go through the source's RxJava `fetch*`
 * Observable (bridged to suspend via `awaitSingle`). The vendored source-api
 * exposes only those deprecated Rx methods, not extension-lib 1.6's suspend
 * `getPopularManga`/`getPageList`/etc. Most keiyoushi `ParsedHttpSource`
 * extensions override the request/parse methods, so the Rx path works; sources
 * that override *only* the suspend methods will not. See AGENTS.md "Known gaps".
 */
class EngineFacade(context: Context) {

    private val appContext = context.applicationContext
    private val trust = SignatureTrust(appContext)
    private val loader = ExtensionLoader(appContext, trust)

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

    fun trustSignature(pkg: String, certSha256: String) {
        trust.trust(pkg, certSha256)
        reload()
    }

    suspend fun getPopular(sourceId: String, page: Int): MangasPageDto {
        val source = catalogue(sourceId)
        val result = source.fetchPopularManga(page).awaitSingle()
        return Mappers.mangasPageToDto(source.id, result)
    }

    suspend fun getLatest(sourceId: String, page: Int): MangasPageDto {
        val source = catalogue(sourceId)
        val result = source.fetchLatestUpdates(page).awaitSingle()
        return Mappers.mangasPageToDto(source.id, result)
    }

    suspend fun search(sourceId: String, query: String, page: Int): MangasPageDto {
        val source = catalogue(sourceId)
        val filters: FilterList = source.getFilterList()
        val result = source.fetchSearchManga(page, query, filters).awaitSingle()
        return Mappers.mangasPageToDto(source.id, result)
    }

    suspend fun getMangaDetails(sourceId: String, mangaUrl: String): MangaDto {
        val source = source(sourceId)
        val stub = SManga.create().apply { url = mangaUrl; title = "" }
        // `mangaDetailsParse` typically returns a partial SManga without `url`
        // (the app already knows it). Re-attach the known url so the mapper
        // doesn't hit an uninitialized lateinit.
        val result = source.fetchMangaDetails(stub).awaitSingle().apply { url = mangaUrl }
        return Mappers.mangaToDto(source.id, result)
    }

    suspend fun getChapters(sourceId: String, mangaUrl: String): List<ChapterDto> {
        val source = source(sourceId)
        val stub = SManga.create().apply { url = mangaUrl; title = "" }
        val result: List<SChapter> = source.fetchChapterList(stub).awaitSingle()
        return result.map { Mappers.chapterToDto(source.id, mangaUrl, it) }
    }

    suspend fun getPages(sourceId: String, chapterUrl: String): List<PageDto> {
        val source = source(sourceId)
        val stub = SChapter.create().apply { url = chapterUrl; name = "" }
        val result: List<Page> = source.fetchPageList(stub).awaitSingle()
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
            source.fetchImageUrl(model).awaitSingle()
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

    // --- offline downloads -------------------------------------------------
    // Downloaded pages live in filesDir (persistent, not evicted like the reader
    // cache). They're keyed by chapter + page index so the reader can find them
    // offline without re-resolving image URLs (which would need the network).

    private val downloadsRoot: File
        get() = File(appContext.filesDir, "downloads")

    private fun chapterDir(sourceId: String, chapterUrl: String): File =
        File(downloadsRoot, "$sourceId/${hashKey(chapterUrl)}")

    private fun hashKey(value: String): String =
        MessageDigest.getInstance("SHA-256")
            .digest(value.toByteArray())
            .joinToString("") { "%02x".format(it) }

    /** Downloads one page to persistent storage; returns its file:// uri. Idempotent. */
    suspend fun downloadPage(sourceId: String, chapterUrl: String, page: PageDto): String {
        val source = source(sourceId)
        if (source !is HttpSource) {
            throw EngineException("parse", "Source $sourceId does not support HTTP image fetching")
        }
        val dir = chapterDir(sourceId, chapterUrl).apply { mkdirs() }
        val existing = dir.listFiles()?.firstOrNull {
            it.name.startsWith("${page.index}.") && !it.name.endsWith(".tmp") && it.length() > 0L
        }
        if (existing != null && imageSize(existing) != null) {
            return Uri.fromFile(existing).toString()
        }

        val model = Page(page.index, page.url ?: "", page.imageUrl)
        val imageUrl = resolveNativeImageUrl(sourceId, source, page, model)
        model.imageUrl = imageUrl

        val temp = File(dir, "${page.index}.tmp")
        val contentType = try {
            source.fetchImage(model).awaitSingle().use { response -> writeImageResponse(response, temp) }
        } catch (error: Throwable) {
            temp.delete()
            directImageResponse(source, imageUrl).use { response -> writeImageResponse(response, temp) }
        }
        val finalFile = File(dir, "${page.index}.${extensionFor(imageUrl, contentType)}")
        finalFile.delete()
        if (!temp.renameTo(finalFile)) {
            temp.copyTo(finalFile, overwrite = true)
            temp.delete()
        }
        if (imageSize(finalFile) == null) {
            finalFile.delete()
            throw EngineException("network", "Downloaded image was incomplete; please retry")
        }
        return Uri.fromFile(finalFile).toString()
    }

    /** Reads a previously downloaded page (no network), tiling tall webtoon images. */
    fun fetchDownloadedImage(sourceId: String, chapterUrl: String, pageIndex: Int): ImageFileDto {
        val dir = chapterDir(sourceId, chapterUrl)
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

    /** Removes all downloaded pages for a chapter. */
    fun deleteDownloadedChapter(sourceId: String, chapterUrl: String) {
        chapterDir(sourceId, chapterUrl).deleteRecursively()
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
            source.fetchImageUrl(model).awaitSingle()
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
    }
}

class EngineException(val kind: String, message: String) : Exception(message)
