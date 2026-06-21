/*
 * Adapted from Mihon / Tachiyomi (https://github.com/mihonapp/mihon)
 * Licensed under the Apache License, Version 2.0. See NOTICE in repo root.
 *
 * Part of the vendored Tachiyomi source-api. Must stay under
 * `eu.kanade.tachiyomi.source` for extension runtime compatibility.
 */
package eu.kanade.tachiyomi.source

/**
 * A factory for creating sources at runtime. An extension whose
 * `tachiyomi.extension.factory` metadata is `true` exposes a class implementing
 * this interface (or lists factory classes), allowing a single APK to provide
 * many sources.
 */
interface SourceFactory {
    fun createSources(): List<Source>
}
