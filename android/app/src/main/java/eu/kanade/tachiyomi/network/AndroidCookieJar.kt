/*
 * Vendored Tachiyomi network API. Must stay under `eu.kanade.tachiyomi.network`
 * for extension runtime compatibility. Mirrors Mihon's AndroidCookieJar
 * (Apache 2.0 — see NOTICE).
 *
 * Backs OkHttp's cookie store with the system WebView CookieManager so cookies
 * obtained during a Cloudflare WebView challenge (e.g. cf_clearance) are visible
 * to subsequent OkHttp requests, and vice-versa.
 */
package eu.kanade.tachiyomi.network

import android.webkit.CookieManager
import okhttp3.Cookie
import okhttp3.CookieJar
import okhttp3.HttpUrl

class AndroidCookieJar : CookieJar {

    private val manager = CookieManager.getInstance()

    override fun saveFromResponse(url: HttpUrl, cookies: List<Cookie>) {
        val urlString = url.toString()
        cookies.forEach { manager.setCookie(urlString, it.toString()) }
    }

    override fun loadForRequest(url: HttpUrl): List<Cookie> = get(url)

    fun get(url: HttpUrl): List<Cookie> {
        val cookies = manager.getCookie(url.toString())
        return if (!cookies.isNullOrEmpty()) {
            cookies.split("; ").mapNotNull { Cookie.parse(url, it) }
        } else {
            emptyList()
        }
    }

    fun remove(url: HttpUrl, cookieNames: List<String>? = null, maxAge: Int = -1): Int {
        val urlString = url.toString()
        val cookies = manager.getCookie(urlString) ?: return 0

        fun List<String>.filterNames(): List<String> =
            if (cookieNames != null) filter { it in cookieNames } else this

        return cookies.split(";")
            .map { it.substringBefore('=').trim() }
            .filterNames()
            .onEach { manager.setCookie(urlString, "$it=;Max-Age=$maxAge") }
            .count()
    }

    fun removeAll() {
        manager.removeAllCookies(null)
        manager.flush()
    }
}
