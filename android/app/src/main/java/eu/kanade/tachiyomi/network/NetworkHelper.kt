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
import eu.kanade.tachiyomi.network.interceptor.UncaughtExceptionInterceptor
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
     * The system WebView's UA with its WebView markers removed, so it reads as
     * mobile Chrome and moves on with WebView updates. Cloudflare clearances are
     * solved in that same WebView.
     */
    val systemUserAgent: String by lazy {
        try {
            WebSettings.getDefaultUserAgent(context)
                .replace("; wv", "")
                .replace(Regex("""Version/[\d.]+ """), "")
        } catch (_: Throwable) {
            FALLBACK_USER_AGENT
        }
    }

    private val prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)

    /** Set in Profile → Advanced, for a site that blocks one browser version. */
    @Volatile
    var customUserAgent: String? = prefs.getString(KEY_USER_AGENT, null)
        private set

    fun defaultUserAgentProvider(): String = customUserAgent ?: systemUserAgent

    /** Null or blank goes back to [systemUserAgent]. Sources pick it up once rebuilt. */
    fun setUserAgent(userAgent: String?) {
        val value = userAgent?.trim()?.takeIf { it.isNotEmpty() }
        customUserAgent = value
        prefs.edit().apply {
            if (value == null) remove(KEY_USER_AGENT) else putString(KEY_USER_AGENT, value)
        }.apply()
    }

    /** Kept so clearing cookies can also reset what it learned per host. */
    val cloudflareInterceptor = CloudflareInterceptor(context, cookieJar, ::defaultUserAgentProvider)

    /**
     * Default client. The Cloudflare WebView solver is attached here (not only on
     * [cloudflareClient]) so any source hitting a challenge can recover, even if
     * it doesn't explicitly opt into the Cloudflare client. The interceptor is a
     * no-op for non-challenge responses.
     *
     * The interceptor set is part of the extension contract, not a detail:
     * keiyoushi's `KeiSource` base class checks this client, by simple class
     * name, for `UncaughtExceptionInterceptor`, `UserAgentInterceptor` and
     * `CloudflareInterceptor` and throws before its first request if any is
     * missing. Renaming or dropping one breaks every extension built on it.
     */
    val client: OkHttpClient = OkHttpClient.Builder()
        .cookieJar(cookieJar)
        .cache(Cache(cacheDir, cacheSize))
        .connectTimeout(30, TimeUnit.SECONDS)
        .readTimeout(30, TimeUnit.SECONDS)
        .callTimeout(2, TimeUnit.MINUTES)
        .addInterceptor(UncaughtExceptionInterceptor())
        .addInterceptor(UserAgentInterceptor(::defaultUserAgentProvider))
        .addInterceptor(cloudflareInterceptor)
        .build()

    /** Alias of [client]; the Cloudflare solver is already attached above. */
    val cloudflareClient: OkHttpClient
        get() = client

    companion object {
        private const val PREFS = "network"
        private const val KEY_USER_AGENT = "user_agent"
        private const val FALLBACK_USER_AGENT =
            "Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) " +
                "Chrome/120.0.0.0 Mobile Safari/537.36"
    }
}
