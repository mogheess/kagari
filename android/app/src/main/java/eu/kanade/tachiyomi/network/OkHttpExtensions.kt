/*
 * Vendored Tachiyomi network API. Must stay under `eu.kanade.tachiyomi.network`
 * for extension runtime compatibility. The file name MUST be `OkHttpExtensions.kt`
 * so the generated facade class is `OkHttpExtensionsKt` (what extension bytecode
 * calls into). Signatures mirror keiyoushi/extensions-lib (Apache 2.0 — see NOTICE).
 */
package eu.kanade.tachiyomi.network

import android.util.Log

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

private const val TAG = "KagariNetwork"

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
                        Log.w(TAG, "Extension failed while handling ${call.request().url}", t)
                        try {
                            subscriber.onError(t.asReportable())
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

/**
 * RxJava 1 refuses to deliver "fatal" throwables — LinkageError among them — through
 * onError: `Exceptions.throwIfFatal` rethrows them from inside SafeSubscriber, so
 * the subscriber never hears anything and a coroutine awaiting it hangs forever
 * with no thread to show for it. A NoClassDefFoundError / NoSuchMethodError from
 * an extension compiled against a newer library than the app ships is exactly
 * that case. Wrap it so it travels as an ordinary error and surfaces as a
 * failure the UI can show, with the original cause attached.
 */
internal fun Throwable.asReportable(): Throwable =
    if (this is LinkageError || this is VirtualMachineError || this is ThreadDeath) {
        IllegalStateException("Extension is incompatible with this app build: $this", this)
    } else {
        this
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
                try {
                    continuation.resume(response)
                } catch (t: Throwable) {
                    // Resuming may inline downstream extension code on this OkHttp
                    // dispatcher thread. If that throws a linkage error (e.g.
                    // NoClassDefFoundError for a "provided" lib we don't ship), route
                    // it through the coroutine instead of crashing the process.
                    Log.w(TAG, "Extension failed while handling ${call.request().url}", t)
                    if (continuation.isActive) {
                        try {
                            continuation.resumeWithException(t.asReportable())
                        } catch (_: Throwable) {
                        }
                    }
                }
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
