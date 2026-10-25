package com.manhwa.testing

import android.app.Activity

/**
 * A live window for instrumented tests that does not start React Native.
 * MainActivity does, and in a debug build without Metro it fails to load the
 * JS bundle and kills the process mid-run. Debug builds only.
 */
class BlankActivity : Activity()
