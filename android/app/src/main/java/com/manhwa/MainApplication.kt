package com.manhwa

import android.app.Application
import com.facebook.react.PackageList
import com.facebook.react.ReactApplication
import com.facebook.react.ReactHost
import com.facebook.react.ReactNativeApplicationEntryPoint.loadReactNative
import com.facebook.react.defaults.DefaultReactHost.getDefaultReactHost
import com.manhwa.engine.EngineInjektModule
import com.manhwa.engine.bridge.ManhwaEnginePackage
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
    // Register the extension engine's DI graph before any source is instantiated
    // (extensions resolve NetworkHelper / Json / Application via Injekt).
    Injekt.importModule(EngineInjektModule(this))
    loadReactNative(this)
  }
}
