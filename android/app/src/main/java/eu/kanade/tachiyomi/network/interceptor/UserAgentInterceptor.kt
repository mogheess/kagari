/*
 * Vendored Tachiyomi network API. Mirrors Mihon's UserAgentInterceptor
 * (Apache 2.0 — see NOTICE).
 *
 * Injects a realistic browser User-Agent on any request that doesn't already
 * carry one. Without this, OkHttp sends `okhttp/<ver>` which many sources and
 * anti-bot WAFs reject outright.
 */
package eu.kanade.tachiyomi.network.interceptor

import okhttp3.Interceptor
import okhttp3.Response

class UserAgentInterceptor(
    private val defaultUserAgentProvider: () -> String,
) : Interceptor {

    override fun intercept(chain: Interceptor.Chain): Response {
        val originalRequest = chain.request()

        return if (originalRequest.header("User-Agent").isNullOrEmpty()) {
            val newRequest = originalRequest
                .newBuilder()
                .removeHeader("User-Agent")
                .addHeader("User-Agent", defaultUserAgentProvider().trim())
                .build()
            chain.proceed(newRequest)
        } else {
            chain.proceed(originalRequest)
        }
    }
}
