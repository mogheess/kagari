/*
 * Holds a weak reference to the currently-resumed Activity so the Cloudflare
 * solver can attach its WebView to a live window.
 *
 * A Cloudflare managed/Turnstile challenge only completes when the WebView is
 * attached to the view hierarchy and rendered: a detached WebView has its JS
 * timers throttled, so the challenge's proof-of-work never finishes and the
 * cf_clearance cookie is never issued. Attaching a 1x1, transparent WebView is
 * enough to let the challenge run without being visible to the user.
 */
package eu.kanade.tachiyomi.network.interceptor

import android.app.Activity
import java.lang.ref.WeakReference

object WebViewActivityHolder {
    private var ref: WeakReference<Activity>? = null

    fun set(activity: Activity?) {
        ref = activity?.let { WeakReference(it) }
    }

    fun get(): Activity? = ref?.get()
}
