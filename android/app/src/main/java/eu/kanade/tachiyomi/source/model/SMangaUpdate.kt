/*
 * Vendored Tachiyomi source-api. Must stay under `eu.kanade.tachiyomi.source.model`
 * for extension runtime compatibility. Signatures mirror keiyoushi/extensions-lib
 * branch `1.6` (Apache 2.0 — see NOTICE).
 *
 * Added in extension-lib 1.6. Extensions built against 1.6 reference this class
 * without bundling it, so the host must supply it or they fail to load at all.
 */
package eu.kanade.tachiyomi.source.model

/** Combined result of [eu.kanade.tachiyomi.source.Source.getMangaUpdate]. */
@Suppress("unused")
class SMangaUpdate(val manga: SManga, val chapters: List<SChapter>)
