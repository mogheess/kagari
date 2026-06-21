/*
 * Vendored Tachiyomi network API. Must stay under `eu.kanade.tachiyomi.network`
 * for extension runtime compatibility. The file name MUST be `Requests.kt` so the
 * generated facade class is `RequestsKt` (what extension bytecode calls into).
 * Signatures mirror keiyoushi/extensions-lib (Apache 2.0 — see NOTICE).
 */
package eu.kanade.tachiyomi.network

import okhttp3.CacheControl
import okhttp3.FormBody
import okhttp3.Headers
import okhttp3.HttpUrl
import okhttp3.Request
import okhttp3.RequestBody
import java.util.concurrent.TimeUnit

private val DEFAULT_CACHE_CONTROL: CacheControl = CacheControl.Builder().maxAge(10, TimeUnit.MINUTES).build()
private val DEFAULT_HEADERS: Headers = Headers.Builder().build()
private val DEFAULT_BODY: RequestBody = FormBody.Builder().build()

fun GET(
    url: String,
    headers: Headers = DEFAULT_HEADERS,
    cache: CacheControl = DEFAULT_CACHE_CONTROL,
): Request = Request.Builder()
    .url(url)
    .headers(headers)
    .cacheControl(cache)
    .build()

/**
 * @since extensions-lib 1.4
 */
fun GET(
    url: HttpUrl,
    headers: Headers = DEFAULT_HEADERS,
    cache: CacheControl = DEFAULT_CACHE_CONTROL,
): Request = Request.Builder()
    .url(url)
    .headers(headers)
    .cacheControl(cache)
    .build()

fun POST(
    url: String,
    headers: Headers = DEFAULT_HEADERS,
    body: RequestBody = DEFAULT_BODY,
    cache: CacheControl = DEFAULT_CACHE_CONTROL,
): Request = Request.Builder()
    .url(url)
    .post(body)
    .headers(headers)
    .cacheControl(cache)
    .build()
