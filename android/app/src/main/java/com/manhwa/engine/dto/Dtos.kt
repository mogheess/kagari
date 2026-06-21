package com.manhwa.engine.dto

import kotlinx.serialization.Serializable

/**
 * JSON-serializable DTOs mirroring `src/engine/types.ts`. The bridge returns
 * these encoded as JSON strings so the contract stays simple and stable.
 *
 * `sourceId` is a String because Tachiyomi source ids are 64-bit and JS numbers
 * cannot represent them precisely.
 */

@Serializable
data class SourceDto(
    val id: String,
    val name: String,
    val lang: String,
    val supportsLatest: Boolean,
    val isNsfw: Boolean,
    val extensionPkg: String,
    val iconUrl: String? = null,
)

@Serializable
data class ExtensionDto(
    val pkg: String,
    val name: String,
    val versionName: String,
    val versionCode: Int,
    val libVersion: String,
    val lang: String,
    val isNsfw: Boolean,
    val trusted: Boolean,
    val sources: List<SourceDto>,
    val iconUrl: String? = null,
)

@Serializable
data class MangaDto(
    val sourceId: String,
    val url: String,
    val title: String,
    val thumbnailUrl: String? = null,
    val author: String? = null,
    val artist: String? = null,
    val description: String? = null,
    val genres: List<String> = emptyList(),
    val status: String = "unknown",
    val initialized: Boolean = false,
)

@Serializable
data class MangasPageDto(
    val manga: List<MangaDto>,
    val hasNextPage: Boolean,
)

@Serializable
data class ChapterDto(
    val sourceId: String,
    val mangaUrl: String,
    val url: String,
    val name: String,
    val chapterNumber: Float = -1f,
    val scanlator: String? = null,
    val dateUpload: Long = 0,
)

@Serializable
data class PageDto(
    val index: Int,
    val imageUrl: String? = null,
    val url: String? = null,
)

@Serializable
data class ImageRequestDto(
    val url: String,
    val headers: Map<String, String>,
)

@Serializable
data class ImageFileDto(
    val uri: String,
    val sourceUrl: String? = null,
    val bytes: Long = 0,
    val cached: Boolean = false,
    val width: Int? = null,
    val height: Int? = null,
    val contentType: String? = null,
    val tiles: List<ImageTileDto> = emptyList(),
)

@Serializable
data class ImageTileDto(
    val uri: String,
    val width: Int,
    val height: Int,
    val index: Int,
)

@Serializable
data class RepoDto(
    val url: String,
    val name: String,
)
