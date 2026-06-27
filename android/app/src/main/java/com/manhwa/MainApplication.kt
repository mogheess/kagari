package com.manhwa

import android.app.Activity
import android.app.Application
import android.os.Bundle
import com.facebook.react.PackageList
import com.facebook.react.ReactApplication
import com.facebook.react.ReactHost
import com.facebook.react.ReactNativeApplicationEntryPoint.loadReactNative
import com.facebook.react.defaults.DefaultReactHost.getDefaultReactHost
import com.manhwa.engine.EngineInjektModule
import com.manhwa.engine.bridge.ManhwaEnginePackage
import eu.kanade.tachiyomi.network.interceptor.WebViewActivityHolder
import uy.kohesive.injekt.Injekt

class MainApplication : Application(), ReactApplication {

  override val reactHost: ReactHost by lazy {
    getDefaultReactHost(
      context = applicationContext,
      packageList =
        PackageList(this).packages.apply {
          // Manually register the extension engine bridge.
          add(ManhwaEnginePackage())
        },
    )
  }

  override fun onCreate() {
    super.onCreate()
    // Track the foreground Activity so the Cloudflare interceptor can attach its
    // solver WebView to a live window (a detached WebView can't run the managed
    // challenge JS).
    registerActivityLifecycleCallbacks(
      object : ActivityLifecycleCallbacks {
        override fun onActivityResumed(activity: Activity) {
          WebViewActivityHolder.set(activity)
        }

        override fun onActivityDestroyed(activity: Activity) {
          if (WebViewActivityHolder.get() === activity) {
            WebViewActivityHolder.set(null)
          }
        }

        override fun onActivityCreated(activity: Activity, savedInstanceState: Bundle?) {}

        override fun onActivityStarted(activity: Activity) {}

        override fun onActivityPaused(activity: Activity) {}

        override fun onActivityStopped(activity: Activity) {}

        override fun onActivitySaveInstanceState(activity: Activity, outState: Bundle) {}
      },
    )
    // Register the extension engine's DI graph before any source is instantiated
    // (extensions resolve NetworkHelper / Json / Application via Injekt).
    Injekt.importModule(EngineInjektModule(this))
    loadReactNative(this)
  }
}
