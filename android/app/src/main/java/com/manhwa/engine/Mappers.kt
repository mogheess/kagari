package com.manhwa.engine

import com.manhwa.engine.dto.ChapterDto
import com.manhwa.engine.dto.MangaDto
import com.manhwa.engine.dto.MangasPageDto
import com.manhwa.engine.dto.PageDto
import com.manhwa.engine.dto.SourceDto
import eu.kanade.tachiyomi.source.CatalogueSource
import eu.kanade.tachiyomi.source.Source
import eu.kanade.tachiyomi.source.model.MangasPage
import eu.kanade.tachiyomi.source.model.Page
import eu.kanade.tachiyomi.source.model.SChapter
import eu.kanade.tachiyomi.source.model.SManga

/** Maps Tachiyomi source-api model objects into our JSON DTOs. */
object Mappers {

    fun sourceToDto(source: Source, extensionPkg: String, isNsfw: Boolean): SourceDto {
        val catalogue = source as? CatalogueSource
        return SourceDto(
            id = source.id.toString(),
            name = source.name,
            lang = catalogue?.lang ?: "",
            supportsLatest = catalogue?.supportsLatest ?: false,
            isNsfw = isNsfw,
            extensionPkg = extensionPkg,
        )
    }

    fun mangaToDto(sourceId: Long, manga: SManga): MangaDto = MangaDto(
        sourceId = sourceId.toString(),
        url = safe { manga.url } ?: "",
        title = safe { manga.title } ?: "",
        thumbnailUrl = manga.thumbnail_url,
        author = manga.author,
        artist = manga.artist,
        description = manga.description,
        genres = manga.genre?.split(",")?.map { it.trim() }?.filter { it.isNotEmpty() }
            ?: emptyList(),
        status = statusToString(manga.status),
        initialized = manga.initialized,
    )

    fun mangasPageToDto(sourceId: Long, page: MangasPage): MangasPageDto = MangasPageDto(
        manga = page.mangas.map { mangaToDto(sourceId, it) },
        hasNextPage = page.hasNextPage,
    )

    fun chapterToDto(sourceId: Long, mangaUrl: String, chapter: SChapter): ChapterDto = ChapterDto(
        sourceId = sourceId.toString(),
        mangaUrl = mangaUrl,
        url = safe { chapter.url } ?: "",
        name = safe { chapter.name } ?: "",
        chapterNumber = chapter.chapter_number,
        scanlator = chapter.scanlator,
        dateUpload = chapter.date_upload,
    )

    fun pageToDto(page: Page): PageDto = PageDto(
        index = page.index,
        imageUrl = page.imageUrl,
        url = page.url.ifEmpty { null },
    )

    /** Reads a possibly-uninitialized lateinit field without crashing the call. */
    private inline fun <T> safe(block: () -> T): T? = try {
        block()
    } catch (_: UninitializedPropertyAccessException) {
        null
    }

    private fun statusToString(status: Int): String = when (status) {
        SManga.ONGOING -> "ongoing"
        SManga.COMPLETED -> "completed"
        SManga.LICENSED -> "licensed"
        SManga.PUBLISHING_FINISHED -> "publishing_finished"
        SManga.CANCELLED -> "cancelled"
        SManga.ON_HIATUS -> "on_hiatus"
        else -> "unknown"
    }
}
