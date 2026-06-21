package com.manhwa.engine

import android.app.Application
import eu.kanade.tachiyomi.network.NetworkHelper
import kotlinx.serialization.json.Json
import uy.kohesive.injekt.api.InjektModule
import uy.kohesive.injekt.api.InjektRegistrar
import uy.kohesive.injekt.api.addSingleton
import uy.kohesive.injekt.api.addSingletonFactory

/**
 * Registers the singletons that extensions resolve through `Injekt.get<T>()` and
 * `injectLazy()`. Mirrors Tachiyomi/Mihon's `AppModule` so extension code that
 * grabs the host [Application], a [NetworkHelper], or a [Json] instance resolves
 * against our process. Import this from [com.manhwa.MainApplication.onCreate].
 */
class EngineInjektModule(private val app: Application) : InjektModule {
    override fun InjektRegistrar.registerInjectables() {
        addSingleton(app)
        addSingletonFactory { NetworkHelper(app) }
        addSingletonFactory {
            Json {
                ignoreUnknownKeys = true
                explicitNulls = false
            }
        }
    }
}
