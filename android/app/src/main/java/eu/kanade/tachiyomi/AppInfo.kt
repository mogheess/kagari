/*
 * Vendored Tachiyomi API. Must stay under `eu.kanade.tachiyomi` for extension
 * runtime compatibility. Signatures mirror keiyoushi/extensions-lib (Apache 2.0 —
 * see NOTICE). Extensions occasionally fold these into a User-Agent string.
 */
package eu.kanade.tachiyomi

object AppInfo {
    fun getVersionCode(): Int = 1
    fun getVersionName(): String = "1.0"
}
