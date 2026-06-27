/*
 * Vendored Tachiyomi network API. Inspired by Mihon's WebView-based
 * CloudflareInterceptor (Apache 2.0 — see NOTICE), extended to also handle
 * fingerprint-gated image CDNs that issue no solvable cookie.
 *
 * When a request is rejected by a Cloudflare challenge (HTTP 403/503 from
 * `cloudflare`, or a `cf-mitigated: challenge` header) we recover in two ways,
 * using a WebView attached to the live Activity window (a detached WebView has
 * its JS timers throttled and never completes the challenge):
 *
 *  1. Cookie solve — load the host root (an HTML document) so Cloudflare serves
 *     the managed/Turnstile challenge, let it run, and poll the shared
 *     [AndroidCookieJar] for the host-scoped `cf_clearance` cookie. Once set,
 *     the OkHttp retry (and every later request to that host) carries it.
 *
 *  2. WebView byte-fetch — some image CDNs (e.g. s2.<site>) gate on the client's
 *     TLS/HTTP fingerprint rather than a cookie: the real WebView is served the
 *     image directly while OkHttp is permanently 403'd, and no `cf_clearance` is
 *     ever issued. For those we load the asset in the WebView (which passes) and
 *     read its bytes via a same-origin JS `fetch`, returning them as a synthetic
 *     OkHttp response so the rest of the app is none the wiser.
 *
 * The WebView User-Agent MUST match the OkHttp User-Agent or a cf_clearance
 * cookie is rejected, so we reuse the request's User-Agent for the WebView.
 */
package eu.kanade.tachiyomi.network.interceptor

import android.annotation.SuppressLint
import android.content.Context
import android.os.Handler
import android.os.Looper
import android.util.Base64
import android.util.Log
import android.view.ViewGroup
import android.webkit.CookieManager
import android.webkit.JavascriptInterface
import android.webkit.WebView
import android.webkit.WebViewClient
import eu.kanade.tachiyomi.network.AndroidCookieJar
import okhttp3.HttpUrl
import okhttp3.Interceptor
import okhttp3.MediaType.Companion.toMediaTypeOrNull
import okhttp3.Protocol
import okhttp3.Request
import okhttp3.Response
import okhttp3.ResponseBody.Companion.toResponseBody
import java.io.IOException
import java.util.Collections
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit

class CloudflareInterceptor(
    private val context: Context,
    private val cookieManager: AndroidCookieJar,
    private val defaultUserAgentProvider: () -> String,
) : Interceptor {

    private val handler = Handler(Looper.getMainLooper())

    /** Serializes WebView work and remembers what we've learned per host. */
    private val solveLock = Any()
    private var lastSolvedHost: String? = null
    private var lastSolvedAt = 0L

    /** Hosts known to gate on fingerprint (no cookie possible) → byte-fetch. */
    private val byteFetchHosts = Collections.synchronizedSet(mutableSetOf<String>())

    override fun intercept(chain: Interceptor.Chain): Response {
        val request = chain.request()
        val response = chain.proceed(request)

        if (!response.isChallenge()) {
            return response
        }

        Log.i(TAG, "Cloudflare challenge detected for ${request.url}")
        response.close()

        synchronized(solveLock) {
            val host = request.url.host

            // A concurrent/earlier solve may have already cleared this host.
            if (hasClearance(request.url)) {
                val retry = chain.proceed(request)
                if (!retry.isChallenge()) return retry
                retry.close()
            }

            // Host previously found to be fingerprint-gated: skip the (useless)
            // cookie solve and fetch the bytes through the browser engine.
            if (host in byteFetchHosts) {
                return byteFetchResponse(request) ?: throw cloudflareError(request)
            }

            // Try to obtain a cf_clearance cookie for the whole host.
            val now = System.currentTimeMillis()
            val recentlyTried = host == lastSolvedHost && now - lastSolvedAt < RECENT_SOLVE_MS
            if (!recentlyTried) {
                lastSolvedHost = host
                lastSolvedAt = now
                if (solveClearance(request)) {
                    val retry = chain.proceed(request)
                    if (!retry.isChallenge()) return retry
                    retry.close()
                    // Cookie obtained but the host still blocks OkHttp → fingerprint.
                }
            }

            // Fall back to fetching the resource through the WebView.
            val fetched = byteFetchResponse(request)
            if (fetched != null) {
                byteFetchHosts.add(host)
                return fetched
            }
            throw cloudflareError(request)
        }
    }

    private fun cloudflareError(request: Request): IOException =
        IOException("Failed to bypass Cloudflare for ${request.url.host}")

    private fun hasClearance(url: HttpUrl): Boolean =
        cookieManager.get(url).any { it.name == "cf_clearance" }

    private fun Response.isChallenge(): Boolean {
        val fromCloudflare = header("Server") in SERVER_CHECK
        val managedChallenge = header("cf-mitigated").equals("challenge", ignoreCase = true)
        return code in ERROR_CODES && (fromCloudflare || managedChallenge)
    }

    /**
     * Loads the host root so Cloudflare serves a solvable managed challenge and,
     * once solved, issues a host-scoped cf_clearance. Bails fast if the root is
     * not actually a challenge page (e.g. a bare 403 from an image-only CDN).
     */
    @SuppressLint("SetJavaScriptEnabled")
    private fun solveClearance(request: Request): Boolean {
        // latch.countDown() happens-before await() returns, so plain vars written
        // on the main thread are visible here afterward.
        val latch = CountDownLatch(1)
        var webView: WebView? = null
        var solved = false
        var bailed = false

        val rootUrl = request.url.newBuilder()
            .encodedPath("/")
            .query(null)
            .fragment(null)
            .build()
            .toString()
        val cookieUrl = request.url
        val userAgent = request.header("User-Agent") ?: defaultUserAgentProvider()
        // Drop any stale clearance so we detect the *appearance* of a fresh one.
        cookieManager.remove(request.url, COOKIE_NAMES, 0)
        Log.i(TAG, "Solving Cloudflare clearance via $rootUrl")

        fun isBypassed(): Boolean = cookieManager.get(cookieUrl).any { it.name == "cf_clearance" }

        val poller = object : Runnable {
            override fun run() {
                when {
                    isBypassed() -> {
                        solved = true
                        latch.countDown()
                    }
                    !bailed -> handler.postDelayed(this, POLL_MS)
                }
            }
        }

        handler.post {
            val view = newWebView(userAgent)
            webView = view
            view.webViewClient = object : WebViewClient() {
                override fun onPageFinished(view: WebView, url: String) {
                    if (isBypassed()) {
                        solved = true
                        latch.countDown()
                        return
                    }
                    // If this isn't a Cloudflare challenge page, no cookie will
                    // ever appear here — stop waiting and let the caller fall back.
                    view.evaluateJavascript(CHALLENGE_PROBE_JS) { result ->
                        if (result != "true" && !isBypassed()) {
                            bailed = true
                            latch.countDown()
                        }
                    }
                }
            }
            view.loadUrl(rootUrl, mapOf("User-Agent" to userAgent))
            handler.postDelayed(poller, POLL_MS)
        }

        latch.await(TIMEOUT_SEC, TimeUnit.SECONDS)
        destroyOnMain(webView) { handler.removeCallbacks(poller) }

        if (solved) {
            CookieManager.getInstance().flush()
            Log.i(TAG, "Cloudflare clearance obtained for ${request.url.host}")
        }
        return solved
    }

    /**
     * Loads the exact asset in the WebView (which passes Cloudflare's fingerprint
     * gate) and reads its bytes with a same-origin JS fetch, returning them as a
     * synthetic OkHttp response. Only used as a fallback for GET requests.
     */
    @SuppressLint("SetJavaScriptEnabled")
    private fun byteFetchResponse(request: Request): Response? {
        if (request.method != "GET") return null

        // The JS interface callback runs on a binder thread; its latch.countDown()
        // happens-before await() returns here, making the write visible.
        val latch = CountDownLatch(1)
        var webView: WebView? = null
        var dataUrl: String? = null

        val url = request.url.toString()
        val userAgent = request.header("User-Agent") ?: defaultUserAgentProvider()
        val referer = request.header("Referer")
        Log.d(TAG, "Fetching via WebView $url")

        handler.post {
            val view = newWebView(userAgent)
            webView = view
            view.addJavascriptInterface(
                object {
                    @JavascriptInterface
                    fun onData(data: String) {
                        dataUrl = data
                        latch.countDown()
                    }

                    @JavascriptInterface
                    fun onError(message: String) {
                        Log.w(TAG, "WebView fetch failed: $message")
                        latch.countDown()
                    }
                },
                "ImgFetch",
            )
            view.webViewClient = object : WebViewClient() {
                override fun onPageFinished(view: WebView, url: String) {
                    view.evaluateJavascript(BYTE_FETCH_JS, null)
                }
            }
            val headers = mutableMapOf("User-Agent" to userAgent)
            if (!referer.isNullOrBlank()) headers["Referer"] = referer
            view.loadUrl(url, headers)
        }

        latch.await(TIMEOUT_SEC, TimeUnit.SECONDS)
        destroyOnMain(webView)

        val data = dataUrl ?: return null
        val comma = data.indexOf(',')
        if (comma <= 0) return null
        val meta = data.substring(0, comma)
        val bytes = try {
            Base64.decode(data.substring(comma + 1), Base64.DEFAULT)
        } catch (e: IllegalArgumentException) {
            Log.w(TAG, "Bad base64 from WebView fetch", e)
            return null
        }
        if (bytes.isEmpty()) return null

        val mime = meta.substringAfter("data:", "").substringBefore(";").ifBlank { "image/jpeg" }
        Log.d(TAG, "WebView fetch ok bytes=${bytes.size} type=$mime for ${request.url}")
        return Response.Builder()
            .request(request)
            .protocol(Protocol.HTTP_1_1)
            .code(200)
            .message("OK")
            .header("Content-Type", mime)
            .body(bytes.toResponseBody(mime.toMediaTypeOrNull()))
            .build()
    }

    @SuppressLint("SetJavaScriptEnabled")
    private fun newWebView(userAgent: String): WebView {
        // Prefer the live Activity as context and attach to its window so the
        // challenge JS actually runs; fall back to app context when backgrounded.
        val activity = WebViewActivityHolder.get()
        val view = WebView(activity ?: context)
        @Suppress("DEPRECATION")
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
        (activity?.window?.decorView as? ViewGroup)?.let { decor ->
            view.layoutParams = ViewGroup.LayoutParams(1, 1)
            view.alpha = 0f
            decor.addView(view)
        }
        return view
    }

    private fun destroyOnMain(view: WebView?, also: () -> Unit = {}) {
        handler.post {
            also()
            view?.let {
                (it.parent as? ViewGroup)?.removeView(it)
                it.stopLoading()
                it.removeJavascriptInterface("ImgFetch")
                it.destroy()
            }
        }
    }

    companion object {
        private const val TAG = "CloudflareInterceptor"
        private const val TIMEOUT_SEC = 20L
        private const val POLL_MS = 400L
        private const val RECENT_SOLVE_MS = 15_000L
        private val ERROR_CODES = listOf(403, 503)
        private val SERVER_CHECK = listOf("cloudflare-nginx", "cloudflare")
        private val COOKIE_NAMES = listOf("cf_clearance")

        /** True when the loaded document looks like a Cloudflare challenge page. */
        private const val CHALLENGE_PROBE_JS =
            "(function(){try{return /just a moment|attention required|cf-chl|" +
                "challenge-platform|__cf_chl|turnstile/i.test(" +
                "document.documentElement.outerHTML)||!!window._cf_chl_opt}" +
                "catch(e){return false}})()"

        /** Reads the current document's bytes (same-origin) as a data URL. */
        private const val BYTE_FETCH_JS =
            "fetch(location.href).then(function(r){return r.blob()})" +
                ".then(function(b){var f=new FileReader();" +
                "f.onload=function(){ImgFetch.onData(f.result)};" +
                "f.onerror=function(){ImgFetch.onError('read')};" +
                "f.readAsDataURL(b)}).catch(function(e){ImgFetch.onError(''+e)})"
    }
}
