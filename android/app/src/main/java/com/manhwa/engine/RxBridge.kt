package com.manhwa.engine

import kotlinx.coroutines.suspendCancellableCoroutine
import rx.Observable
import rx.Subscription
import kotlin.coroutines.resume
import kotlin.coroutines.resumeWithException

/**
 * Awaits the first emitted item of an RxJava 1 [Observable] from a coroutine.
 *
 * Lets [EngineFacade] call the deprecated `fetch*` Observable methods that older
 * Tachiyomi/Mihon extensions still implement, without depending on a separate
 * (and version-fragile) coroutines-rx interop artifact.
 */
suspend fun <T> Observable<T>.awaitSingle(): T = suspendCancellableCoroutine { cont ->
    var value: T? = null
    var hasValue = false

    val subscription: Subscription = this
        .first()
        .subscribe(
            { item ->
                value = item
                hasValue = true
            },
            { error -> cont.resumeWithException(error) },
            {
                if (hasValue) {
                    @Suppress("UNCHECKED_CAST")
                    cont.resume(value as T)
                } else {
                    cont.resumeWithException(NoSuchElementException("Observable emitted no items"))
                }
            },
        )

    cont.invokeOnCancellation { subscription.unsubscribe() }
}
