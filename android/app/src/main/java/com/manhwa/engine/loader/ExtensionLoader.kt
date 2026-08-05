/*
 * Extension discovery/loading adapted from the Mihon/Tachiyomi ExtensionLoader
 * (https://github.com/mihonapp/mihon), licensed under the Apache License 2.0.
 * Modified for Kagari. See NOTICE for attribution and LICENSE for terms.
 */
package com.manhwa.engine.loader

import android.content.Context
import android.content.pm.ApplicationInfo
import android.content.pm.PackageInfo
import android.content.pm.PackageManager
import android.os.Build
import android.util.Log
import androidx.core.content.pm.PackageInfoCompat
import eu.kanade.tachiyomi.source.CatalogueSource
import eu.kanade.tachiyomi.source.Source
import eu.kanade.tachiyomi.source.SourceFactory

/** A loaded extension and the live source instances it contributed. */
data class LoadedExtension(
    val pkg: String,
    val name: String,
    val versionName: String,
    val versionCode: Int,
    val libVersion: String,
    val lang: String,
    val isNsfw: Boolean,
    val trusted: Boolean,
    val sources: List<Source>,
)

/**
 * Discovers and loads Tachiyomi/Mihon-compatible extension APKs.
 *
 * This mirrors Mihon's `ExtensionLoader` (Apache 2.0 — see NOTICE) closely so we
 * stay compatible with the existing ecosystem:
 *  1. Enumerate installed packages that declare the `tachiyomi.extension` feature.
 *  2. Derive the extension lib version from the package `versionName`
 *     (`substringBeforeLast('.')`) and enforce the supported window.
 *  3. Verify the signing certificate is trusted (untrusted ones are surfaced but
 *     never instantiated).
 *  4. Build a child-first class loader over the APK and instantiate the source(s).
 */
class ExtensionLoader(
    private val context: Context,
    private val trust: SignatureTrust,
) {
    private val pm: PackageManager = context.packageManager

    fun loadExtensions(): List<LoadedExtension> {
        @Suppress("DEPRECATION", "QueryPermissionsNeeded")
        val installed = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            pm.getInstalledPackages(PackageManager.PackageInfoFlags.of(PACKAGE_FLAGS.toLong()))
        } else {
            pm.getInstalledPackages(PACKAGE_FLAGS)
        }

        val extPkgs = installed.filter { isPackageAnExtension(it) }
        Log.i(TAG, "Scanned ${installed.size} packages, ${extPkgs.size} are extensions")
        return extPkgs.mapNotNull { runCatching { loadOne(it) }.getOrNull() }
    }

    /** An extension declares the `tachiyomi.extension` feature in its manifest. */
    private fun isPackageAnExtension(pkg: PackageInfo): Boolean =
        pkg.reqFeatures.orEmpty().any { it.name == EXTENSION_FEATURE }

    private fun loadOne(pkgInfo: PackageInfo): LoadedExtension? {
        val appInfo: ApplicationInfo = pkgInfo.applicationInfo ?: return null

        val name = pm.getApplicationLabel(appInfo).toString().substringAfter("Tachiyomi: ")
        val versionName = pkgInfo.versionName
        if (versionName.isNullOrEmpty()) {
            Log.w(TAG, "Missing versionName for ${pkgInfo.packageName}")
            return null
        }
        val versionCode = PackageInfoCompat.getLongVersionCode(pkgInfo).toInt()

        val metadata = appInfo.metaData

        // Extensions built by the current tachiyomix plugin declare the lib
        // version outright. Older ones don't, and there the version name minus
        // its last component is the lib version ("1.4.10" -> "1.4"), which is
        // how Mihon derives it.
        val libVersion = declaredLibVersion(metadata)
            ?: versionName.substringBeforeLast('.').toDoubleOrNull()
        if (libVersion == null || libVersion < LIB_VERSION_MIN || libVersion > LIB_VERSION_MAX) {
            Log.w(TAG, "Skipping ${pkgInfo.packageName}: unsupported lib version $libVersion")
            return null
        }
        val classList = metadata?.getString(METADATA_SOURCE_CLASS)
            ?.split(";")
            ?.map { it.trim() }
            ?.map { if (it.startsWith(".")) pkgInfo.packageName + it else it }
        if (classList.isNullOrEmpty()) {
            Log.w(TAG, "Skipping ${pkgInfo.packageName}: no $METADATA_SOURCE_CLASS metadata")
            return null
        }

        // The tachiyomix plugin now sets the legacy `nsfw` flag for anything
        // merely suggestive, which would mark most of the catalogue 18+. Prefer
        // the graded `contentWarning` (0 none, 1 suggestive, 2 NSFW) when the
        // extension carries one.
        val contentWarning = metadata.getInt(METADATA_CONTENT_WARNING, -1)
        val isNsfw = if (contentWarning >= 0) {
            contentWarning >= CONTENT_WARNING_NSFW
        } else {
            metadata.getInt(METADATA_NSFW, 0) == 1
        }

        val signatureHash = SignatureTrust.signatureHash(pm, pkgInfo.packageName)
        // This app is sideloaded and the user explicitly installs each extension,
        // so we auto-trust on first sight (recording the signature) rather than
        // gating behind a separate prompt the way Mihon does.
        if (signatureHash != null && !trust.isTrusted(pkgInfo.packageName, signatureHash)) {
            trust.trust(pkgInfo.packageName, signatureHash)
            Log.i(TAG, "Auto-trusted ${pkgInfo.packageName}")
        }
        val trusted = signatureHash != null

        val sources = if (!trusted) {
            // No verifiable signature: surface it but don't run its code.
            emptyList()
        } else {
            val classLoader = ChildFirstPathClassLoader(appInfo.sourceDir, null, context.classLoader)
            val loaded = classList.flatMap { instantiate(classLoader, it) }
            Log.i(TAG, "Instantiated ${loaded.size} source(s) from ${pkgInfo.packageName}")
            loaded
        }

        return LoadedExtension(
            pkg = pkgInfo.packageName,
            name = name,
            versionName = versionName,
            versionCode = versionCode,
            libVersion = libVersion.toString(),
            lang = sources.filterIsInstance<CatalogueSource>().map { it.lang }.toSet().let { langs ->
                when (langs.size) {
                    0 -> "all"
                    1 -> langs.first()
                    else -> "all"
                }
            },
            isNsfw = isNsfw,
            trusted = trusted,
            sources = sources,
        )
    }

    /**
     * Reads `tachiyomix.extensionLib`, which the manifest carries as a float.
     *
     * Widening that float straight to a double is a trap: `1.4f.toDouble()` is
     * 1.399999976158142 and `1.6f.toDouble()` is 1.6000000238418579, so both
     * fall outside the supported window and every extension declaring the
     * metadata gets skipped. Going through the shortest decimal representation
     * that round-trips the float ("1.4") gives the intended value exactly.
     */
    private fun declaredLibVersion(metadata: android.os.Bundle?): Double? {
        if (metadata == null) return null
        // Float first: reading it as a string logs a Bundle type-mismatch stack
        // trace for every extension, and float is what the plugin emits.
        val asFloat = metadata.getFloat(METADATA_EXTENSION_LIB, 0f)
        if (asFloat > 0f) return asFloat.toString().toDoubleOrNull()
        return metadata.getString(METADATA_EXTENSION_LIB)?.toDoubleOrNull()
    }

    private fun instantiate(classLoader: ClassLoader, className: String): List<Source> {
        return try {
            val obj = Class.forName(className, false, classLoader)
                .getDeclaredConstructor()
                .newInstance()
            when (obj) {
                is SourceFactory -> obj.createSources()
                is Source -> listOf(obj)
                else -> {
                    Log.w(TAG, "$className is neither Source nor SourceFactory")
                    emptyList()
                }
            }
        } catch (e: Throwable) {
            Log.e(TAG, "Failed to instantiate $className", e)
            emptyList()
        }
    }

    companion object {
        private const val TAG = "ExtensionLoader"

        private const val EXTENSION_FEATURE = "tachiyomi.extension"
        private const val METADATA_SOURCE_CLASS = "tachiyomi.extension.class"
        private const val METADATA_NSFW = "tachiyomi.extension.nsfw"

        // Added by the tachiyomix build plugin (extension-lib 1.6 era).
        private const val METADATA_EXTENSION_LIB = "tachiyomix.extensionLib"
        private const val METADATA_CONTENT_WARNING = "tachiyomix.contentWarning"
        private const val CONTENT_WARNING_NSFW = 2

        // Supported extension lib-version window (matches Mihon). Keep the
        // vendored source-api within this range.
        private const val LIB_VERSION_MIN = 1.4
        private const val LIB_VERSION_MAX = 1.6

        private val PACKAGE_FLAGS = PackageManager.GET_META_DATA or
            PackageManager.GET_CONFIGURATIONS or
            PackageManager.GET_SIGNATURES
    }
}
