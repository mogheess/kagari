package com.manhwa.engine.bridge

import android.app.Activity
import android.content.Intent
import com.facebook.react.bridge.ActivityEventListener
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
 * which parses them). Image bytes stay native-side: `fetchImage` downloads via
 * the source's OkHttp client and returns a cached file URI for React Native.
 */
class ManhwaEngineModule(
    private val reactContext: ReactApplicationContext,
) : ReactContextBaseJavaModule(reactContext), ActivityEventListener {

    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)
    private val json = Json { encodeDefaults = true; ignoreUnknownKeys = true }
    private val facade by lazy { EngineFacade(reactContext) }
    private val repos by lazy { RepoManager(reactContext) }
    private val installer by lazy { ApkInstaller(reactContext) }

    /** Resolved by [onActivityResult] when the backup-file picker returns. */
    private var pickPromise: Promise? = null

    init {
        reactContext.addActivityEventListener(this)
    }

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

    @ReactMethod
    fun fetchImage(sourceId: String, pageJson: String, forceRefresh: Boolean, promise: Promise) =
        resolve(promise) {
            val page = json.decodeFromString<PageDto>(pageJson)
            json.encodeToString(facade.fetchImage(sourceId, page, forceRefresh))
        }

    // --- offline downloads ---

    @ReactMethod
    fun downloadPage(sourceId: String, chapterUrl: String, pageJson: String, promise: Promise) =
        resolve(promise) {
            val page = json.decodeFromString<PageDto>(pageJson)
            facade.downloadPage(sourceId, chapterUrl, page)
        }

    @ReactMethod
    fun fetchDownloadedImage(
        sourceId: String,
        chapterUrl: String,
        pageIndex: Int,
        promise: Promise,
    ) = resolve(promise) {
        json.encodeToString(facade.fetchDownloadedImage(sourceId, chapterUrl, pageIndex))
    }

    @ReactMethod
    fun deleteDownloadedChapter(sourceId: String, chapterUrl: String, promise: Promise) =
        resolve(promise) {
            facade.deleteDownloadedChapter(sourceId, chapterUrl)
            ""
        }

    // --- data import (Mihon/Tachiyomi backups) ---

    /** Opens the system file picker; resolves with a content:// URI or null if cancelled. */
    @ReactMethod
    fun pickMihonBackup(promise: Promise) {
        val activity = reactContext.currentActivity
        if (activity == null) {
            promise.reject("no_activity", "The app must be in the foreground to pick a file")
            return
        }
        if (pickPromise != null) {
            promise.reject("busy", "A file picker is already open")
            return
        }
        pickPromise = promise
        try {
            val intent = Intent(Intent.ACTION_OPEN_DOCUMENT).apply {
                addCategory(Intent.CATEGORY_OPENABLE)
                // .tachibk has no registered mime type, so accept anything.
                type = "*/*"
            }
            activity.startActivityForResult(intent, PICK_BACKUP_REQUEST)
        } catch (e: Exception) {
            pickPromise = null
            promise.reject("pick_failed", e.message ?: "Could not open the file picker", e)
        }
    }

    @ReactMethod
    fun importMihonBackup(uri: String, promise: Promise) = resolve(promise) {
        json.encodeToString(facade.importMihonBackup(uri))
    }

    override fun onActivityResult(activity: Activity, requestCode: Int, resultCode: Int, data: Intent?) {
        if (requestCode != PICK_BACKUP_REQUEST) return
        val promise = pickPromise ?: return
        pickPromise = null
        val uri = if (resultCode == Activity.RESULT_OK) data?.data else null
        promise.resolve(uri?.toString())
    }

    override fun onNewIntent(intent: Intent) {
        // No deep links to handle.
    }

    // --- save / share ---

    @ReactMethod
    fun saveImageToGallery(uri: String, promise: Promise) = resolve(promise) {
        facade.saveImageToGallery(uri)
    }

    @ReactMethod
    fun shareImage(uri: String, promise: Promise) = resolve(promise) {
        facade.shareImage(uri)
        ""
    }

    /** Runs [block] on the IO scope and bridges the result/error to the Promise. */
    private fun resolve(promise: Promise, block: suspend () -> String) {
        scope.launch {
            try {
                promise.resolve(block())
            } catch (e: EngineException) {
                android.util.Log.w(NAME, "engine error (${e.kind}): ${e.message}", e)
                promise.reject(e.kind, e.message, e)
            } catch (e: Throwable) {
                android.util.Log.e(NAME, "engine call failed: ${e.message}", e)
                promise.reject("unknown", e.message, e)
            }
        }
    }

    companion object {
        const val NAME = "ManhwaEngine"
        private const val PICK_BACKUP_REQUEST = 0xBAC0
    }
}
