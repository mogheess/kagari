package com.manhwa.engine.repo

import android.content.Context
import android.content.Intent
import android.net.Uri
import androidx.core.content.FileProvider
import com.manhwa.engine.EngineException
import okhttp3.OkHttpClient
import okhttp3.Request
import java.io.File
import java.util.concurrent.TimeUnit

/**
 * Downloads an extension APK from a repo and hands it to the Android package
 * installer. The user confirms the system install dialog; afterwards the engine
 * re-enumerates installed packages to pick the new extension up.
 */
class ApkInstaller(context: Context) {

    private val appContext = context.applicationContext
    private val client = OkHttpClient.Builder()
        .connectTimeout(30, TimeUnit.SECONDS)
        .readTimeout(60, TimeUnit.SECONDS)
        .build()

    /** Downloads [apkUrl] then launches the install intent. */
    fun install(apkUrl: String) {
        val file = download(apkUrl)
        launchInstall(file)
    }

    fun uninstall(pkg: String) {
        val intent = Intent(Intent.ACTION_DELETE, Uri.parse("package:$pkg"))
            .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        appContext.startActivity(intent)
    }

    private fun download(apkUrl: String): File {
        val dir = File(appContext.cacheDir, "extensions").apply { mkdirs() }
        val name = apkUrl.substringAfterLast('/').ifBlank { "extension.apk" }
        val out = File(dir, name)

        val request = Request.Builder().url(apkUrl).build()
        client.newCall(request).execute().use { res ->
            if (!res.isSuccessful) {
                throw EngineException("network", "Download failed (${res.code})")
            }
            val body = res.body ?: throw EngineException("network", "Empty download body")
            out.outputStream().use { sink -> body.byteStream().copyTo(sink) }
        }
        return out
    }

    private fun launchInstall(file: File) {
        val uri = FileProvider.getUriForFile(
            appContext,
            "${appContext.packageName}.fileprovider",
            file,
        )
        val intent = Intent(Intent.ACTION_VIEW).apply {
            setDataAndType(uri, "application/vnd.android.package-archive")
            addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
            addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        }
        appContext.startActivity(intent)
    }
}
