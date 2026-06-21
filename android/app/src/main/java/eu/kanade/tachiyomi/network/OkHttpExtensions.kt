/*
 * Vendored Tachiyomi network API. Must stay under `eu.kanade.tachiyomi.network`
 * for extension runtime compatibility. The file name MUST be `OkHttpExtensions.kt`
 * so the generated facade class is `OkHttpExtensionsKt` (what extension bytecode
 * calls into). Signatures mirror keiyoushi/extensions-lib (Apache 2.0 — see NOTICE).
 */
package eu.kanade.tachiyomi.network

import kotlinx.coroutines.suspendCancellableCoroutine
import okhttp3.Call
import okhttp3.Callback
import okhttp3.Response
import rx.Observable
import rx.Subscriber
import rx.subscriptions.Subscriptions
import java.io.IOException
import kotlin.coroutines.resume
import kotlin.coroutines.resumeWithException

/** Standardized HTTP error used across extensions. */
class HttpException(val code: Int) : IllegalStateException("HTTP error $code")

fun Call.asObservable(): Observable<Response> {
    return Observable.unsafeCreate { subscriber: Subscriber<in Response> ->
        // A Call can only be executed once, so clone it for each subscription.
        val call = clone()
        call.enqueue(object : Callback {
            override fun onResponse(call: Call, response: Response) {
                if (!subscriber.isUnsubscribed) {
                    try {
                        subscriber.onNext(response)
                        subscriber.onCompleted()
                    } catch (t: Throwable) {
                        // A downstream parser (extension code) threw on this
                        // OkHttp dispatcher thread — including LinkageError /
                        // NoClassDefFoundError for a "provided" lib we don't
                        // ship. Route it through onError so the engine reports a
                        // clean failure instead of crashing the whole process.
                        try {
                            subscriber.onError(t)
                        } catch (_: Throwable) {
                        }
                    }
                }
            }

            override fun onFailure(call: Call, e: IOException) {
                if (!subscriber.isUnsubscribed) {
                    subscriber.onError(e)
                }
            }
        })
        subscriber.add(Subscriptions.create { call.cancel() })
    }
}

fun Call.asObservableSuccess(): Observable<Response> {
    return asObservable().doOnNext { response ->
        if (!response.isSuccessful) {
            response.close()
            throw HttpException(response.code)
        }
    }
}

suspend fun Call.await(): Response {
    return suspendCancellableCoroutine { continuation ->
        enqueue(object : Callback {
            override fun onResponse(call: Call, response: Response) {
                continuation.resume(response)
            }

            override fun onFailure(call: Call, e: IOException) {
                if (continuation.isCancelled) return
                continuation.resumeWithException(e)
            }
        })
        continuation.invokeOnCancellation {
            try {
                cancel()
            } catch (_: Throwable) {
            }
        }
    }
}

suspend fun Call.awaitSuccess(): Response {
    val response = await()
    if (!response.isSuccessful) {
        response.close()
        throw HttpException(response.code)
    }
    return response
}
