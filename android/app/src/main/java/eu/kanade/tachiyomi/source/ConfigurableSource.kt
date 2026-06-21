/*
 * Vendored Tachiyomi source-api. Must stay under `eu.kanade.tachiyomi.source`
 * for extension runtime compatibility. Signatures mirror keiyoushi/extensions-lib
 * (Apache 2.0 — see NOTICE).
 */
package eu.kanade.tachiyomi.source

import androidx.preference.PreferenceScreen

/** A source that exposes user-configurable preferences. */
@Suppress("unused")
interface ConfigurableSource {
    fun setupPreferenceScreen(screen: PreferenceScreen)
}
