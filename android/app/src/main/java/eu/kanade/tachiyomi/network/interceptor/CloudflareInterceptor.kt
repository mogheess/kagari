/*
 * Vendored Tachiyomi network API. Mirrors Mihon's WebView-based
 * CloudflareInterceptor (Apache 2.0 — see NOTICE).
 *
 * When a request is rejected by a Cloudflare "I'm under attack" / managed
 * challenge (HTTP 403/503 served by `cloudflare`), this loads the URL in a
 * hidden WebView on the main thread, lets Cloudflare's JS solve the challenge,
 * and relies on the shared [AndroidCookieJar] (system CookieManager) so the
 * resulting `cf_clearance` cookie is picked up when the request is retried.
 *
 * The WebView User-Agent and OkHttp User-Agent MUST match, otherwise the
 * `cf_clearance` cookie is invalid — that's why the interceptor reuses the
 * request's User-Agent header for the WebView.
 */
package eu.kanade.tachiyomi.network.interceptor

import android.annotation.SuppressLint
import android.content.Context
import android.os.Handler
import android.os.Looper
import android.util.Log
import android.webkit.CookieManager
import android.webkit.WebView
import android.webkit.WebViewClient
import eu.kanade.tachiyomi.network.AndroidCookieJar
import okhttp3.HttpUrl.Companion.toHttpUrl
import okhttp3.Interceptor
import okhttp3.Request
import okhttp3.Response
import java.io.IOException
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit

class CloudflareInterceptor(
    private val context: Context,
    private val cookieManager: AndroidCookieJar,
    private val defaultUserAgentProvider: () -> String,
) : Interceptor {

    private val handler = Handler(Looper.getMainLooper())

    override fun intercept(chain: Interceptor.Chain): Response {
        val request = chain.request()
        val response = chain.proceed(request)

        if (!response.isChallenge()) {
            return response
        }

        Log.i(TAG, "Cloudflare challenge detected for ${request.url}")
        response.close()

        return try {
            resolveWithWebView(request)
            chain.proceed(request)
        } catch (e: CloudflareBypassException) {
            throw IOException("Failed to bypass Cloudflare for ${request.url.host}", e)
        }
    }

    private fun Response.isChallenge(): Boolean {
        return code in ERROR_CODES && header("Server") in SERVER_CHECK
    }

    @SuppressLint("SetJavaScriptEnabled")
    @Suppress("DEPRECATION")
    private fun resolveWithWebView(originalRequest: Request) {
        val latch = CountDownLatch(1)
        var webView: WebView? = null
        var challengeFound = false
        var cloudflareBypassed = false

        val origRequestUrl = originalRequest.url.toString()
        val headers = originalRequest.headers
            .toMultimap()
            .mapValues { it.value.joinToString(", ") }
            .toMutableMap()
        val userAgent = originalRequest.header("User-Agent") ?: defaultUserAgentProvider()
        headers["User-Agent"] = userAgent

        handler.post {
            val view = WebView(context)
            webView = view
            view.settings.apply {
                javaScriptEnabled = true
                domStorageEnabled = true
                databaseEnabled = true
                userAgentString = userAgent
            }
            CookieManager.getInstance().apply {
                setAcceptCookie(true)
                setAcceptThirdPartyCookies(view, true)
            }

            view.webViewClient = object : WebViewClient() {
                override fun onPageFinished(view: WebView, url: String) {
                    fun isCloudFlareBypassed(): Boolean =
                        cookieManager.get(origRequestUrl.toHttpUrl())
                            .firstOrNull { it.name == "cf_clearance" } != null

                    if (isCloudFlareBypassed()) {
                        cloudflareBypassed = true
                        latch.countDown()
                    }

                    if (url == origRequestUrl && !challengeFound) {
                        // First load returned the page directly — no challenge to solve.
                        latch.countDown()
                    } else {
                        challengeFound = true
                    }
                }
            }

            view.loadUrl(origRequestUrl, headers)
        }

        latch.await(TIMEOUT_SEC, TimeUnit.SECONDS)

        handler.post {
            webView?.run {
                stopLoading()
                destroy()
            }
            webView = null
        }

        if (!cloudflareBypassed) {
            throw CloudflareBypassException()
        }
    }

    private class CloudflareBypassException : Exception()

    companion object {
        private const val TAG = "CloudflareInterceptor"
        private const val TIMEOUT_SEC = 20L
        private val ERROR_CODES = listOf(403, 503)
        private val SERVER_CHECK = listOf("cloudflare-nginx", "cloudflare")
    }
}
