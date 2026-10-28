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

    /**
     * Expires every cookie visible to [url] whose name matches, on any path
     * that covers it and for the host or a parent domain. A cookie is only
     * replaced by one with the same domain and path, and sites (Cloudflare
     * among them) set theirs on `/`, often for the parent domain, so an expired
     * copy written for the request's own path, as [remove] does, can leave them
     * in place. Returns how many names matched.
     */
    fun removeMatching(url: HttpUrl, matches: (String) -> Boolean): Int {
        val names = get(url).map { it.name }.filter(matches).distinct()
        if (names.isEmpty()) return 0
        val urlString = url.toString()
        val domains = listOf(null) + parentDomains(url.host)
        val paths = coveringPaths(url)
        for (name in names) {
            manager.setCookie(urlString, "$name=; Max-Age=0")
            for (domain in domains) {
                for (path in paths) {
                    val scope = if (domain == null) "Path=$path" else "Path=$path; Domain=$domain"
                    manager.setCookie(urlString, "$name=; Max-Age=0; $scope")
                }
            }
        }
        manager.flush()
        return names.size
    }

    /** `/a/b/c` → `/`, `/a`, `/a/b`, `/a/b/c`: every path a cookie for it can be on. */
    private fun coveringPaths(url: HttpUrl): List<String> {
        val segments = url.pathSegments.filter { it.isNotEmpty() }
        return listOf("/") + segments.indices.map { "/" + segments.take(it + 1).joinToString("/") }
    }

    fun removeAll() {
        manager.removeAllCookies(null)
        manager.flush()
    }

    /**
     * `a.b.example.com` → itself, `b.example.com`, `example.com`. Only these can
     * have set a domain cookie the host sees; a public suffix in the list is
     * refused by the cookie store, which is harmless. None for an IP address.
     */
    private fun parentDomains(host: String): List<String> {
        if (host.none { it.isLetter() } || ':' in host) return emptyList()
        val labels = host.split('.')
        return (0 until labels.size - 1).map { labels.drop(it).joinToString(".") }
    }
}
