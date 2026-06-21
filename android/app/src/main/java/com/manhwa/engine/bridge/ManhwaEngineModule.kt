package com.manhwa.engine.bridge

import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.manhwa.engine.EngineException
import com.manhwa.engine.EngineFacade
import com.manhwa.engine.dto.PageDto
import com.manhwa.engine.repo.ApkInstaller
import com.manhwa.engine.repo.RepoManager
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.launch
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json

/**
 * React Native bridge for the extension engine. Exposes the EngineFacade to JS.
 *
 * Browse/detail/list results are returned as JSON strings (see `nativeEngine.ts`
 * which parses them). Image BYTES are never sent across the bridge \u2014 only the
 * URL + headers via `resolveImage`, so the reader can stream through the source's
 * HTTP client natively.
 */
class ManhwaEngineModule(
    private val reactContext: ReactApplicationContext,
) : ReactContextBaseJavaModule(reactContext) {

    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)
    private val json = Json { encodeDefaults = true; ignoreUnknownKeys = true }
    private val facade by lazy { EngineFacade(reactContext) }
    private val repos by lazy { RepoManager(reactContext) }
    private val installer by lazy { ApkInstaller(reactContext) }

    override fun getName(): String = NAME

    // --- discovery / lifecycle ---

    @ReactMethod
    fun reload(promise: Promise) = resolve(promise) {
        facade.reload()
        ""
    }

    @ReactMethod
    fun listExtensions(promise: Promise) = resolve(promise) {
        json.encodeToString(facade.listExtensions())
    }

    @ReactMethod
    fun listSources(promise: Promise) = resolve(promise) {
        json.encodeToString(facade.listSources())
    }

    @ReactMethod
    fun listRepos(promise: Promise) = resolve(promise) {
        json.encodeToString(repos.list())
    }

    @ReactMethod
    fun addRepo(url: String, promise: Promise) = resolve(promise) {
        repos.add(url)
        ""
    }

    @ReactMethod
    fun removeRepo(url: String, promise: Promise) = resolve(promise) {
        repos.remove(url)
        ""
    }

    @ReactMethod
    fun installExtension(apkUrl: String, pkg: String, promise: Promise) = resolve(promise) {
        installer.install(apkUrl)
        ""
    }

    @ReactMethod
    fun uninstallExtension(pkg: String, promise: Promise) = resolve(promise) {
        installer.uninstall(pkg)
        ""
    }

    @ReactMethod
    fun installApk(uri: String, promise: Promise) = resolve(promise) {
        // Direct APK URL install (document-picker path can pass a file:// URL here).
        installer.install(uri)
        ""
    }

    @ReactMethod
    fun trustSignature(pkg: String, certSha256: String, promise: Promise) = resolve(promise) {
        facade.trustSignature(pkg, certSha256)
        ""
    }

    // --- browsing ---

    @ReactMethod
    fun getPopular(sourceId: String, page: Int, promise: Promise) = resolve(promise) {
        json.encodeToString(facade.getPopular(sourceId, page))
    }

    @ReactMethod
    fun getLatest(sourceId: String, page: Int, promise: Promise) = resolve(promise) {
        json.encodeToString(facade.getLatest(sourceId, page))
    }

    @ReactMethod
    fun search(sourceId: String, query: String, page: Int, filtersJson: String, promise: Promise) =
        resolve(promise) {
            json.encodeToString(facade.search(sourceId, query, page))
        }

    @ReactMethod
    fun getFilters(sourceId: String, promise: Promise) = resolve(promise) {
        // TODO: serialize the source's FilterList into the FilterDto schema.
        "[]"
    }

    // --- detail / reading ---

    @ReactMethod
    fun getMangaDetails(sourceId: String, mangaUrl: String, promise: Promise) = resolve(promise) {
        json.encodeToString(facade.getMangaDetails(sourceId, mangaUrl))
    }

    @ReactMethod
    fun getChapters(sourceId: String, mangaUrl: String, promise: Promise) = resolve(promise) {
        json.encodeToString(facade.getChapters(sourceId, mangaUrl))
    }

    @ReactMethod
    fun getPages(sourceId: String, chapterUrl: String, promise: Promise) = resolve(promise) {
        json.encodeToString(facade.getPages(sourceId, chapterUrl))
    }

    @ReactMethod
    fun resolveImage(sourceId: String, pageJson: String, promise: Promise) = resolve(promise) {
        val page = json.decodeFromString<PageDto>(pageJson)
        json.encodeToString(facade.resolveImage(sourceId, page))
    }

    /** Runs [block] on the IO scope and bridges the result/error to the Promise. */
    private fun resolve(promise: Promise, block: suspend () -> String) {
        scope.launch {
            try {
                promise.resolve(block())
            } catch (e: EngineException) {
                promise.reject(e.kind, e.message, e)
            } catch (e: Throwable) {
                promise.reject("unknown", e.message, e)
            }
        }
    }

    companion object {
        const val NAME = "ManhwaEngine"
    }
}
