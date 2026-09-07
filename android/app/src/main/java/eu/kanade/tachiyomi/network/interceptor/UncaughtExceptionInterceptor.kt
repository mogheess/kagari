/*
 * Vendored from Mihon (Apache 2.0 — see NOTICE). Must keep this package and
 * class name: keiyoushi's `KeiSource` base class asserts, by simple class name,
 * that the app's default OkHttp client carries an `UncaughtExceptionInterceptor`
 * and refuses to build its client otherwise ("UncaughtExceptionInterceptor must
 * be present in default client"), which broke every extension built on it.
 */
package eu.kanade.tachiyomi.network.interceptor

import okhttp3.Interceptor
import okhttp3.Response
import java.io.IOException

/**
 * Catches any uncaught exceptions from later in the chain and rethrows as a
 * non-fatal IOException to avoid catastrophic failure.
 *
 * This should be the first interceptor in the client.
 */
class UncaughtExceptionInterceptor : Interceptor {

    override fun intercept(chain: Interceptor.Chain): Response {
        return try {
            chain.proceed(chain.request())
        } catch (e: Exception) {
            if (e is IOException) {
                throw e
            } else {
                throw IOException(e)
            }
        }
    }
}
