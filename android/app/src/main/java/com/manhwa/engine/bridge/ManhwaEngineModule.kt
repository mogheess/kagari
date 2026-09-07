package com.manhwa.engine.bridge

import android.app.Activity
import android.content.Intent
import android.view.WindowManager
import com.facebook.react.bridge.ActivityEventListener
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.manhwa.engine.EngineException
import com.manhwa.engine.EngineFacade
import com.manhwa.engine.backup.ExportRequest
import com.manhwa.engine.dto.DownloadMetaDto
import com.manhwa.engine.dto.PageDto
import com.manhwa.engine.dto.StorageLocationDto
import com.manhwa.engine.dto.TierListExportDto
import com.manhwa.engine.repo.ApkInstaller
import com.manhwa.engine.repo.RepoManager
import com.manhwa.engine.web.SourceWebViewActivity
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
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

    /** Resolved by [onActivityResult] when the storage-folder picker returns. */
    private var pickStoragePromise: Promise? = null

    init {
        reactContext.addActivityEventListener(this)
    }

    override fun getName(): String = NAME

    override fun invalidate() {
        reactContext.removeActivityEventListener(this)
        pickPromise = null
        pickStoragePromise = null
        clearKeepScreenOn()
        scope.cancel()
        super.invalidate()
    }

    // --- discovery / lifecycle ---

    @ReactMethod
    fun reload(promise: Promise) = resolve(promise) {
        facade.reload()
        ""
    }

    /**
     * Holds the screen awake while reading. The flag lives on the window, so it
     * must be set on the UI thread and cleared when the reader closes —
     * otherwise the screen stays on for the rest of the session.
     */
    @ReactMethod
    fun setKeepScreenOn(enabled: Boolean, promise: Promise) {
        val activity: Activity? = reactContext.currentActivity
        if (activity == null) {
            promise.resolve(null)
            return
        }
        activity.runOnUiThread {
            if (enabled) {
                activity.window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
            } else {
                activity.window.clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
            }
            promise.resolve(null)
        }
    }

    private fun clearKeepScreenOn() {
        val activity = reactContext.currentActivity ?: return
        activity.runOnUiThread {
            activity.window.clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
        }
    }

    @ReactMethod
    fun exportMihonBackup(requestJson: String, fileName: String, promise: Promise) = resolve(promise) {
        val request = json.decodeFromString(ExportRequest.serializer(), requestJson)
        json.encodeToString(facade.exportMihonBackup(request, fileName))
    }

    @ReactMethod
    fun shareBackup(uri: String, fileName: String, promise: Promise) = resolve(promise) {
        facade.shareBackup(uri, fileName)
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
    fun getMangaDetails(sourceId: String, mangaUrl: String, memoJson: String?, promise: Promise) = resolve(promise) {
        json.encodeToString(facade.getMangaDetails(sourceId, mangaUrl, memoJson))
    }

    @ReactMethod
    fun getMangaWebUrl(sourceId: String, mangaUrl: String, promise: Promise) = resolve(promise) {
        facade.getMangaWebUrl(sourceId, mangaUrl)
    }

    @ReactMethod
    fun getChapters(sourceId: String, mangaUrl: String, memoJson: String?, promise: Promise) = resolve(promise) {
        json.encodeToString(facade.getChapters(sourceId, mangaUrl, memoJson))
    }

    @ReactMethod
    fun getPages(sourceId: String, chapterUrl: String, memoJson: String?, promise: Promise) = resolve(promise) {
        json.encodeToString(facade.getPages(sourceId, chapterUrl, memoJson))
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

    /** Fetches a cover via the source's HTTP client; resolves to a local file uri. */
    @ReactMethod
    fun fetchCover(sourceId: String, url: String, promise: Promise) = resolve(promise) {
        facade.fetchCover(sourceId, url)
    }

    // --- offline downloads ---

    @ReactMethod
    fun downloadPage(
        sourceId: String,
        chapterUrl: String,
        pageJson: String,
        metaJson: String?,
        promise: Promise,
    ) = resolve(promise) {
        val page = json.decodeFromString<PageDto>(pageJson)
        val meta = metaJson?.takeIf { it.isNotBlank() }?.let { json.decodeFromString<DownloadMetaDto>(it) }
        facade.downloadPage(sourceId, chapterUrl, page, meta)
    }

    @ReactMethod
    fun migrateDownloadedChapter(sourceId: String, chapterUrl: String, metaJson: String, promise: Promise) =
        resolve(promise) {
            facade.migrateDownloadedChapter(sourceId, chapterUrl, json.decodeFromString<DownloadMetaDto>(metaJson))
                .toString()
        }

    // --- storage location (Mihon-style user-picked folder) ---

    @ReactMethod
    fun getStorageLocation(promise: Promise) = resolve(promise) {
        // Encodes as the JSON literal `null` when no folder is picked.
        json.encodeToString<StorageLocationDto?>(facade.storageLocation())
    }

    @ReactMethod
    fun clearStorageLocation(promise: Promise) = resolve(promise) {
        facade.clearStorageLocation()
        ""
    }

    /**
     * Opens the system folder picker. Resolves with the location (JSON), or
     * null if the user backed out. The grant is persisted so it survives
     * restarts; see StorageManager.
     */
    @ReactMethod
    fun pickStorageLocation(promise: Promise) {
        val activity = reactContext.currentActivity
        if (activity == null) {
            promise.reject("no_activity", "The app must be in the foreground to pick a folder")
            return
        }
        if (pickPromise != null || pickStoragePromise != null) {
            promise.reject("busy", "A picker is already open")
            return
        }
        pickStoragePromise = promise
        try {
            val intent = Intent(Intent.ACTION_OPEN_DOCUMENT_TREE).apply {
                addFlags(
                    Intent.FLAG_GRANT_READ_URI_PERMISSION or
                        Intent.FLAG_GRANT_WRITE_URI_PERMISSION or
                        Intent.FLAG_GRANT_PERSISTABLE_URI_PERMISSION,
                )
            }
            activity.startActivityForResult(intent, PICK_STORAGE_REQUEST)
        } catch (e: Exception) {
            // A few devices ship without a working document picker.
            pickStoragePromise = null
            promise.reject("pick_failed", e.message ?: "Could not open the folder picker", e)
        }
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
        when (requestCode) {
            PICK_BACKUP_REQUEST -> {
                val promise = pickPromise ?: return
                pickPromise = null
                val uri = if (resultCode == Activity.RESULT_OK) data?.data else null
                promise.resolve(uri?.toString())
            }
            PICK_STORAGE_REQUEST -> {
                val promise = pickStoragePromise ?: return
                pickStoragePromise = null
                val uri = if (resultCode == Activity.RESULT_OK) data?.data else null
                if (uri == null) {
                    promise.resolve(null)
                    return
                }
                scope.launch {
                    try {
                        val location = facade.setStorageLocation(uri)
                        promise.resolve(location?.let { json.encodeToString(it) })
                    } catch (e: Exception) {
                        promise.reject("storage", e.message ?: "Could not use that folder", e)
                    }
                }
            }
        }
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

    @ReactMethod
    fun renderTierListImage(exportJson: String, promise: Promise) = resolve(promise) {
        val export = json.decodeFromString<TierListExportDto>(exportJson)
        facade.renderTierListImage(export)
    }

    // --- in-app web view (manual Cloudflare clearance) ---

    @ReactMethod
    fun openInWebView(url: String, promise: Promise) {
        if (url.isBlank()) {
            promise.reject("bad_url", "No URL to open")
            return
        }
        try {
            val ua = runCatching { facade.userAgent() }.getOrNull()
            val activity = reactContext.currentActivity
            val ctx = activity ?: reactContext.applicationContext
            val intent = Intent(ctx, SourceWebViewActivity::class.java).apply {
                putExtra(SourceWebViewActivity.EXTRA_URL, url)
                if (ua != null) putExtra(SourceWebViewActivity.EXTRA_UA, ua)
                if (activity == null) addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            }
            ctx.startActivity(intent)
            promise.resolve(null)
        } catch (e: Throwable) {
            promise.reject("webview_failed", e.message ?: "Could not open the web view", e)
        }
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
        private const val PICK_STORAGE_REQUEST = 0xBAC1
    }
}
