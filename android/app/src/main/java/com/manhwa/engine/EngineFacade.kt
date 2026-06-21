package com.manhwa.engine

import android.content.Context
import com.manhwa.engine.dto.ChapterDto
import com.manhwa.engine.dto.ExtensionDto
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

    private fun source(sourceId: String): Source {
        ensureLoaded()
        val id = sourceId.toLongOrNull() ?: throw EngineException("not_found", "Invalid source id")
        return sourcesById[id] ?: throw EngineException("not_found", "Source $sourceId not loaded")
    }

    private fun catalogue(sourceId: String): CatalogueSource {
        return source(sourceId) as? CatalogueSource
            ?: throw EngineException("parse", "Source $sourceId is not a catalogue source")
    }
}

class EngineException(val kind: String, message: String) : Exception(message)
