package com.manhwa

import android.app.Activity
import android.app.Dialog
import android.view.View
import android.view.ViewGroup
import android.view.Window
import com.facebook.react.views.modal.ReactModalHostView
import java.util.WeakHashMap

/**
 * Makes Esc close a React Native `Modal` the way Back does.
 *
 * On current Android a `Dialog` cancels itself as soon as Esc goes down. RN's
 * modal only intercepts Esc on key-up, to ask JS through `onRequestClose`, so
 * the dialog disappeared natively while JS still had the `Modal` open. Its host
 * view then sat over the screen and swallowed every touch until a restart.
 *
 * Marking RN's dialogs non-cancelable stops the self-cancel; the key-up then
 * reaches RN's listener and JS closes the modal exactly as it does for Back
 * (which goes through RN's back callback, not `cancel()`, so it's unaffected).
 *
 * RN's Android code ships prebuilt, so dialogs are found as they appear: a shown
 * dialog takes window focus, and focus leaving the activity, or an open modal
 * for nested ones, is the cue to look for new ones.
 */
object ModalEscapeFix {

    private val hooked = WeakHashMap<Dialog, Boolean>()

    fun install(activity: Activity) {
        watch(activity.window)
    }

    private fun watch(window: Window) {
        val decor = window.decorView
        decor.viewTreeObserver.addOnWindowFocusChangeListener { hasFocus ->
            if (!hasFocus) decor.post { scan(decor) }
        }
    }

    private fun scan(view: View) {
        if (view is ReactModalHostView) {
            view.dialog?.let(::hook)
        }
        if (view is ViewGroup) {
            for (i in 0 until view.childCount) scan(view.getChildAt(i))
        }
    }

    private fun hook(dialog: Dialog) {
        if (hooked.put(dialog, true) == true) return
        dialog.setCancelable(false)
        dialog.window?.let(::watch)
    }
}
