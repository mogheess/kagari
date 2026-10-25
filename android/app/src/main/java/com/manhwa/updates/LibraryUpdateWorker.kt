package com.manhwa.updates

import android.content.Context
import android.util.Log
import androidx.work.CoroutineWorker
import androidx.work.WorkerParameters
import com.manhwa.engine.EngineFacade
import com.manhwa.engine.dto.ChapterDto
import kotlinx.coroutines.async
import kotlinx.coroutines.awaitAll
import kotlinx.coroutines.coroutineScope
import kotlinx.coroutines.sync.Semaphore
import kotlinx.coroutines.sync.withPermit
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.Json

/**
 * Periodic new-chapters check that runs while the app is closed.
 *
 * It mirrors the in-app scan (`src/library/libraryUpdates.ts`) but only reads
 * that scan's state: the library and per-manga chapter snapshots come from
 * AsyncStorage, and what it finds goes into [BackgroundUpdates]' inbox, which the
 * app merges into the Updates feed and the snapshots when it next runs. Titles
 * the app hasn't baselined yet are left for it, so nothing old shows up as new.
 */
class LibraryUpdateWorker(context: Context, params: WorkerParameters) :
    CoroutineWorker(context, params) {

    @Serializable
    private data class Favorite(
        val sourceId: String,
        val url: String,
        val title: String,
        val thumbnailUrl: String? = null,
        val memo: String? = null,
    )

    private val json = Json { ignoreUnknownKeys = true }

    override suspend fun doWork(): Result {
        val context = applicationContext
        val storage = AsyncStorageReader(context)
        val favorites = storage.read(FAVORITES_KEY)
            ?.let { runCatching { json.decodeFromString<List<Favorite>>(it) }.getOrNull() }
            .orEmpty()
        if (favorites.isEmpty()) return Result.success()
        val snapshots = storage.read(SNAPSHOTS_KEY)
            ?.let { runCatching { json.decodeFromString<Map<String, List<String>>>(it) }.getOrNull() }
            .orEmpty()
        val hiddenGroups = storage.read(HIDDEN_SCANLATORS_KEY)
            ?.let { runCatching { json.decodeFromString<Map<String, List<String>>>(it) }.getOrNull() }
            .orEmpty()
        val inbox = BackgroundUpdates.readInbox(context)

        val facade = EngineFacade.get(context)
        val installed = runCatching { facade.listSources().map { it.id }.toSet() }.getOrDefault(emptySet())
        val gate = Semaphore(SCAN_CONCURRENCY)

        val results = coroutineScope {
            favorites
                .filter { it.sourceId in installed }
                .map { fav ->
                    async {
                        gate.withPermit { check(facade, fav, snapshots, hiddenGroups, inbox) }
                    }
                }
                .awaitAll()
                .filterNotNull()
        }

        val found = results.map { it.first }
        if (found.isNotEmpty()) {
            BackgroundUpdates.addToInbox(context, found, results.associate { it.second })
            BackgroundUpdates.notify(context, found)
        }
        Log.i(TAG, "Checked ${favorites.size} titles, ${found.size} with new chapters")
        return Result.success()
    }

    /** New chapters for one title, with the urls to remember, or null. */
    private suspend fun check(
        facade: EngineFacade,
        fav: Favorite,
        snapshots: Map<String, List<String>>,
        hiddenGroups: Map<String, List<String>>,
        inbox: BackgroundInbox,
    ): Pair<InboxUpdate, Pair<String, List<String>>>? {
        val key = "${fav.sourceId}\u0000${fav.url}"
        // Not baselined in the app yet: its whole backlog would look new.
        val previous = snapshots[key] ?: return null
        val chapters = try {
            facade.getChapters(fav.sourceId, fav.url, fav.memo)
        } catch (e: Throwable) {
            Log.w(TAG, "Skipping ${fav.title}: ${e.message}")
            return null
        }
        if (chapters.isEmpty()) return null
        val known = previous.toHashSet().apply { addAll(inbox.snapshots[key].orEmpty()) }
        // As on the title page: chapters from a group hidden on this title
        // don't count, unless hiding them would leave nothing.
        val hidden = hiddenGroups[key].orEmpty().toHashSet()
        val shown = if (hidden.isEmpty()) {
            chapters
        } else {
            chapters.filter { scanlatorOf(it) !in hidden }.ifEmpty { chapters }
        }
        val fresh = shown.filter { it.url !in known }
        if (fresh.isEmpty()) return null
        val newest = fresh.sortedWith(NEWEST_FIRST).first()
        val update = InboxUpdate(
            sourceId = fav.sourceId,
            mangaUrl = fav.url,
            title = fav.title,
            thumbnailUrl = fav.thumbnailUrl,
            newCount = fresh.size,
            latestChapterName = newest.name,
            latestChapterUrl = newest.url,
            foundAt = System.currentTimeMillis(),
        )
        return update to (key to fresh.map { it.url })
    }

    private companion object {
        const val TAG = "LibraryUpdateWorker"
        const val FAVORITES_KEY = "@kagari/favorites/v1"
        const val SNAPSHOTS_KEY = "@kagari/librarySnapshots/v1"
        /** `src/library/scanlatorFilters.ts`: hidden scan groups per title. */
        const val HIDDEN_SCANLATORS_KEY = "@kagari/hidden-scanlators/v1"
        private val ZERO_WIDTH = Regex("[\u200B-\u200D\uFEFF]")

        /** A chapter's group as the app compares it (`src/utils/scanlator.ts`). */
        fun scanlatorOf(chapter: ChapterDto): String =
            chapter.scanlator.orEmpty().replace(ZERO_WIDTH, "").trim()
        /** Same as the in-app scan: gentle on sources. */
        const val SCAN_CONCURRENCY = 3

        /** Newest first: by chapter number when both have one, else by upload date (as in the app). */
        val NEWEST_FIRST = Comparator<ChapterDto> { a, b ->
            if (a.chapterNumber >= 0 && b.chapterNumber >= 0 && a.chapterNumber != b.chapterNumber) {
                b.chapterNumber.compareTo(a.chapterNumber)
            } else {
                b.dateUpload.compareTo(a.dateUpload)
            }
        }
    }
}
