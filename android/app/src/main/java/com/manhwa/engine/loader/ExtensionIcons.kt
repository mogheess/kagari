package com.manhwa.engine.loader

import android.content.Context
import android.graphics.Bitmap
import android.graphics.Canvas
import android.net.Uri
import java.io.File

/**
 * Installed extensions' launcher icons as local PNG files, so the UI can show
 * them with no network (the repo's icon URL is only known for extensions that
 * are still in a repo). Rendered once per package version and reused.
 */
class ExtensionIcons(context: Context) {

    private val appContext = context.applicationContext
    private val dir = File(appContext.cacheDir, "ext_icons")

    /** `file://` uri of [pkg]'s icon, or null when it can't be rendered. */
    fun uriFor(pkg: String, versionCode: Int): String? {
        val file = File(dir, "${pkg}_$versionCode.png")
        if (file.isFile && file.length() > 0L) return Uri.fromFile(file).toString()
        return try {
            val drawable = appContext.packageManager.getApplicationIcon(pkg)
            val size = ICON_PX
            val bitmap = Bitmap.createBitmap(size, size, Bitmap.Config.ARGB_8888)
            drawable.setBounds(0, 0, size, size)
            drawable.draw(Canvas(bitmap))
            dir.mkdirs()
            // Drop icons of older versions of the same package.
            dir.listFiles()?.filter { it.name.startsWith("${pkg}_") && it != file }?.forEach { it.delete() }
            file.outputStream().use { bitmap.compress(Bitmap.CompressFormat.PNG, 100, it) }
            bitmap.recycle()
            Uri.fromFile(file).toString()
        } catch (_: Exception) {
            null
        }
    }

    private companion object {
        /** Big enough for the 44dp tiles on xxxhdpi. */
        const val ICON_PX = 192
    }
}
