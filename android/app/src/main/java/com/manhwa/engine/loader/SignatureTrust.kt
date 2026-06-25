/*
 * Extension signature-trust logic adapted from Mihon/Tachiyomi
 * (https://github.com/mihonapp/mihon), licensed under the Apache License 2.0.
 * Modified for Kagari. See NOTICE for attribution and LICENSE for terms.
 */
package com.manhwa.engine.loader

import android.content.Context
import android.content.pm.PackageInfo
import android.content.pm.PackageManager
import android.os.Build
import java.security.MessageDigest

/**
 * Trust gate for extension APKs. Mirrors Mihon's approach: an extension's
 * signing certificate is hashed (SHA-256) and must be explicitly trusted by the
 * user before its code is loaded.
 *
 * IMPORTANT (security + legal): use YOUR OWN trust list. Do not hardcode or
 * impersonate Tachiyomi/Mihon's official signing certificate.
 */
class SignatureTrust(context: Context) {

    private val prefs =
        context.getSharedPreferences("extension_trust", Context.MODE_PRIVATE)

    fun isTrusted(pkg: String, signatureHash: String): Boolean {
        return prefs.getStringSet(KEY_TRUSTED, emptySet())
            ?.contains(entry(pkg, signatureHash)) == true
    }

    fun trust(pkg: String, signatureHash: String) {
        val current = prefs.getStringSet(KEY_TRUSTED, emptySet())?.toMutableSet() ?: mutableSetOf()
        current.add(entry(pkg, signatureHash))
        prefs.edit().putStringSet(KEY_TRUSTED, current).apply()
    }

    fun revoke(pkg: String) {
        val current = prefs.getStringSet(KEY_TRUSTED, emptySet())?.toMutableSet() ?: return
        current.removeAll { it.startsWith("$pkg:") }
        prefs.edit().putStringSet(KEY_TRUSTED, current).apply()
    }

    private fun entry(pkg: String, hash: String) = "$pkg:$hash"

    companion object {
        private const val KEY_TRUSTED = "trusted_signatures"

        /** SHA-256 of the APK's first signing certificate, hex-encoded. */
        @Suppress("DEPRECATION")
        fun signatureHash(pm: PackageManager, pkg: String): String? {
            return try {
                val signatures = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
                    val info = pm.getPackageInfo(pkg, PackageManager.GET_SIGNING_CERTIFICATES)
                    info.signingInfo?.apkContentsSigners
                } else {
                    val info: PackageInfo = pm.getPackageInfo(pkg, PackageManager.GET_SIGNATURES)
                    info.signatures
                }
                val cert = signatures?.firstOrNull()?.toByteArray() ?: return null
                MessageDigest.getInstance("SHA-256")
                    .digest(cert)
                    .joinToString("") { "%02x".format(it) }
            } catch (_: Exception) {
                null
            }
        }
    }
}
