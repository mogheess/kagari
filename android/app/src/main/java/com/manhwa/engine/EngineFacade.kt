package com.manhwa.engine

import android.content.Context
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.BitmapRegionDecoder
import android.graphics.Rect
import android.net.Uri
import android.util.Log
import com.manhwa.engine.dto.ChapterDto
import com.manhwa.engine.dto.ExtensionDto
import com.manhwa.engine.dto.ImageFileDto
import com.manhwa.engine.dto.ImageTileDto
import com.manhwa.engine.dto.ImageRequestDto
import com.manhwa.engine.dto.MangaDto
import com.manhwa.engine.dto.MangasPageDto
import com.manhwa.engine.dto.PageDto
import com.manhwa.engine.dto.SourceDto
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
 * exposes a suspend API that returns DTOs. Each call prefers the modern suspend
 * source method and falls back to the deprecated RxJava `fetch*` Observable.
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

    suspend fun fetchImage(sourceId: String, page: PageDto): ImageFileDto {
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
