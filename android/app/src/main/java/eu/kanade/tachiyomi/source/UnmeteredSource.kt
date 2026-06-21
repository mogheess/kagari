/*
 * Vendored Tachiyomi source-api. Must stay under `eu.kanade.tachiyomi.source`
 * for extension runtime compatibility. Signatures mirror keiyoushi/extensions-lib
 * (Apache 2.0 — see NOTICE).
 */
package eu.kanade.tachiyomi.source

/**
 * A source that explicitly doesn't require traffic considerations.
 * This typically applies for self-hosted sources.
 */
@Suppress("unused")
interface UnmeteredSource
