package com.manhwa.engine.repo

import android.content.Context
import com.manhwa.engine.dto.RepoDto

/**
 * Persists the set of configured extension repositories (Mihon-style index URLs).
 *
 * The repo *index* itself is fetched and parsed on the JS side (see
 * `repoClient.ts`) — this only stores which repos the user has added.
 */
class RepoManager(context: Context) {

    private val prefs = context.applicationContext
        .getSharedPreferences(PREFS, Context.MODE_PRIVATE)

    fun list(): List<RepoDto> =
        urls().map { RepoDto(url = it, name = nameFor(it)) }

    fun add(url: String) {
        val trimmed = url.trim()
        if (trimmed.isEmpty()) return
        prefs.edit().putStringSet(KEY, urls() + trimmed).apply()
    }

    fun remove(url: String) {
        prefs.edit().putStringSet(KEY, urls() - url.trim()).apply()
    }

    private fun urls(): Set<String> =
        prefs.getStringSet(KEY, emptySet())?.toSortedSet() ?: emptySet()

    private fun nameFor(url: String): String {
        val gh = Regex("github(?:usercontent)?\\.com/([^/]+)").find(url)
        if (gh != null) return gh.groupValues[1]
        return runCatching { java.net.URI(url).host ?: url }.getOrDefault(url)
    }

    companion object {
        private const val PREFS = "manhwa_repos"
        private const val KEY = "urls"
    }
}
