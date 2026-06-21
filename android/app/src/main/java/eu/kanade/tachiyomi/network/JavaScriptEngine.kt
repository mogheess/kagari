/*
 * Vendored Tachiyomi network API. Must stay under `eu.kanade.tachiyomi.network`
 * for extension runtime compatibility. Signatures mirror keiyoushi/extensions-lib
 * (Apache 2.0 — see NOTICE).
 *
 * Minimal placeholder: sources that actually evaluate JS (rare) will fail loudly.
 * The class must exist so extensions that merely reference it still link.
 */
package eu.kanade.tachiyomi.network

import android.content.Context

@Suppress("unused", "UNUSED_PARAMETER")
class JavaScriptEngine(context: Context) {
    suspend fun <T> evaluate(script: String): T =
        throw UnsupportedOperationException("JavaScriptEngine is not supported in this app")
}
