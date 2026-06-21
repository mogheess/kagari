/*
 * Vendored Tachiyomi network API. Must stay under `eu.kanade.tachiyomi.network`
 * for extension runtime compatibility. Signatures mirror keiyoushi/extensions-lib
 * (Apache 2.0 — see NOTICE).
 *
 * Extensions resolve `Injekt.get<NetworkHelper>()` to this class at runtime, so it
 * MUST keep the `NetworkHelper(context)` constructor and the `client` property.
 * `cloudflareClient` / `cookieJar` / `defaultUserAgentProvider()` are supersets
 * provided for extensions compiled against richer extensions-lib variants.
 */
package eu.kanade.tachiyomi.network

import android.content.Context
import android.webkit.WebSettings
import eu.kanade.tachiyomi.network.interceptor.CloudflareInterceptor
import eu.kanade.tachiyomi.network.interceptor.UserAgentInterceptor
import okhttp3.Cache
import okhttp3.OkHttpClient
import java.io.File
import java.util.concurrent.TimeUnit

class NetworkHelper(context: Context) {

    private val cacheDir = File(context.cacheDir, "network_cache")
    private val cacheSize = 5L * 1024 * 1024 // 5 MiB

    val cookieJar = AndroidCookieJar()

    /**
     * Realistic mobile Chrome UA. Falls back to the system WebView UA when
     * available so the UA matches the WebView used for Cloudflare clearance.
     */
    private val defaultUserAgent: String by lazy {
        try {
            WebSettings.getDefaultUserAgent(context)
                .replace("; wv", "")
                .replace(Regex("""Version/[\d.]+ """), "")
        } catch (_: Throwable) {
            FALLBACK_USER_AGENT
        }
    }

    fun defaultUserAgentProvider(): String = defaultUserAgent

    /**
     * Default client. The Cloudflare WebView solver is attached here (not only on
     * [cloudflareClient]) so any source hitting a challenge can recover, even if
     * it doesn't explicitly opt into the Cloudflare client. The interceptor is a
     * no-op for non-challenge responses.
     */
    val client: OkHttpClient = OkHttpClient.Builder()
        .cookieJar(cookieJar)
        .cache(Cache(cacheDir, cacheSize))
        .connectTimeout(30, TimeUnit.SECONDS)
        .readTimeout(30, TimeUnit.SECONDS)
        .callTimeout(2, TimeUnit.MINUTES)
        .addInterceptor(UserAgentInterceptor(::defaultUserAgentProvider))
        .addInterceptor(CloudflareInterceptor(context, cookieJar, ::defaultUserAgentProvider))
        .build()

    /** Alias of [client]; the Cloudflare solver is already attached above. */
    val cloudflareClient: OkHttpClient
        get() = client

    companion object {
        private const val FALLBACK_USER_AGENT =
            "Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) " +
                "Chrome/120.0.0.0 Mobile Safari/537.36"
    }
}
