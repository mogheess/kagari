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
 * signing certificate is hashed (SHA-256), and its code is only loaded when
 * that key belongs to one of the user's repos or the user trusted it.
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

    // --- repo signing keys ---
    //
    // A repo's index names the key its extensions are signed with. An APK
    // signed by a key one of the user's repos vouches for is trusted without
    // asking; anything else needs an explicit trust. Keys are stored per repo
    // url and only replaced when that repo was fetched, so a repo that's
    // briefly unreachable doesn't un-trust its extensions.

    /** Signing-key fingerprints by repo url. */
    fun repoKeys(): Map<String, String> =
        prefs.getStringSet(KEY_REPO_KEYS, emptySet())
            .orEmpty()
            .mapNotNull { line ->
                val i = line.indexOf(REPO_KEY_SEPARATOR)
                if (i <= 0) null else line.substring(0, i) to line.substring(i + 1)
            }
            .toMap()

    fun isRepoKey(hash: String): Boolean {
        val wanted = normalizeKey(hash)
        return repoKeys().values.any { it == wanted }
    }

    /**
     * Records the keys from repos that were just fetched ([fetched], url to
     * fingerprint) and forgets keys of repos no longer [configured].
     * Returns whether the set of trusted keys changed.
     */
    fun updateRepoKeys(fetched: Map<String, String>, configured: Collection<String>): Boolean {
        val before = repoKeys()
        val after = before.filterKeys { it in configured }.toMutableMap()
        fetched.forEach { (url, key) ->
            val normalized = normalizeKey(key)
            if (url in configured && normalized.isNotEmpty()) after[url] = normalized
        }
        if (after == before) return false
        prefs.edit()
            .putStringSet(KEY_REPO_KEYS, after.map { (url, key) -> "$url$REPO_KEY_SEPARATOR$key" }.toSet())
            .apply()
        return after.values.toSet() != before.values.toSet()
    }

    companion object {
        private const val KEY_TRUSTED = "trusted_signatures"
        private const val KEY_REPO_KEYS = "repo_signing_keys"
        private const val REPO_KEY_SEPARATOR = '\u0001'

        /** Lower-case hex without separators, as [signatureHash] produces. */
        fun normalizeKey(key: String): String =
            key.lowercase().filter { it in '0'..'9' || it in 'a'..'f' }

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
