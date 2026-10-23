package com.manhwa.engine

import android.app.Application
import eu.kanade.tachiyomi.network.NetworkHelper
import kotlinx.serialization.ExperimentalSerializationApi
import kotlinx.serialization.json.Json
import kotlinx.serialization.protobuf.ProtoBuf
import uy.kohesive.injekt.api.InjektModule
import uy.kohesive.injekt.api.InjektRegistrar
import uy.kohesive.injekt.api.addSingleton
import uy.kohesive.injekt.api.addSingletonFactory

/**
 * Registers the singletons that extensions resolve through `Injekt.get<T>()` and
 * `injectLazy()`. Mirrors Tachiyomi/Mihon's `AppModule` so extension code that
 * grabs the host [Application], a [NetworkHelper], a [Json] or a [ProtoBuf]
 * instance resolves against our process. A missing one fails inside the
 * extension's own class initialiser, often on a coroutine it launched itself,
 * which takes the whole app down (MANGA Plus asks for [ProtoBuf] as soon as it
 * loads). Import this from [com.manhwa.MainApplication.onCreate].
 */
@OptIn(ExperimentalSerializationApi::class)
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
        // `ProtoBuf` as a value is its companion (`ProtoBuf.Default`); register it
        // under the class extensions ask for, or the lookup misses.
        addSingletonFactory<ProtoBuf> { ProtoBuf }
    }
}
