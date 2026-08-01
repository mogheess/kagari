package com.manhwa.engine

import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.Color
import java.io.File

/**
 * Picks an accent colour out of a cover image.
 *
 * Manga covers are mostly ink and paper — huge areas of near-black line work and
 * near-white background — so the naive "average pixel" or "most common colour"
 * both return grey. Instead: throw away pixels that carry no colour information,
 * bucket what's left by hue, and take the strongest bucket. That finds the one
 * saturated thing on the cover, which is what a person would point at.
 *
 * The result is then normalised to a fixed saturation/lightness band so it works
 * as UI accent regardless of whether the source pixel was a pastel or neon.
 */
object CoverColor {

    /** Longest edge to decode to; enough to sample, cheap to load. */
    private const val SAMPLE_EDGE = 96
    private const val HUE_BUCKETS = 24

    /** Below this saturation a pixel is ink, paper or shadow — no hue to read. */
    private const val MIN_SATURATION = 0.28f
    /** Extremes carry a hue value but no perceptible colour. */
    private const val MIN_VALUE = 0.18f
    private const val MAX_VALUE = 0.96f

    /** Band the result is normalised into so every accent reads similarly. */
    private const val ACCENT_SATURATION = 0.62f
    private const val ACCENT_LIGHTNESS_DARK = 0.62f
    private const val ACCENT_LIGHTNESS_LIGHT = 0.42f

    /**
     * @param forDark whether the accent will sit on a dark canvas, which decides
     *   how light the returned colour should be.
     * @return `#rrggbb`, or null when the cover has no usable colour (a
     *   greyscale cover is common enough to be worth falling back on).
     */
    fun extract(fileUri: String, forDark: Boolean): String? {
        val bitmap = decodeSampled(fileUri) ?: return null
        try {
            val width = bitmap.width
            val height = bitmap.height
            if (width == 0 || height == 0) return null

            val pixels = IntArray(width * height)
            bitmap.getPixels(pixels, 0, width, 0, 0, width, height)

            val weight = FloatArray(HUE_BUCKETS)
            val sumSin = FloatArray(HUE_BUCKETS)
            val sumCos = FloatArray(HUE_BUCKETS)
            val hsv = FloatArray(3)

            for (pixel in pixels) {
                if (Color.alpha(pixel) < 128) continue
                Color.colorToHSV(pixel, hsv)
                val (h, s, v) = Triple(hsv[0], hsv[1], hsv[2])
                if (s < MIN_SATURATION || v < MIN_VALUE || v > MAX_VALUE) continue

                val bucket = ((h / 360f) * HUE_BUCKETS).toInt().coerceIn(0, HUE_BUCKETS - 1)
                // Weight by saturation so a small vivid area beats a large washed one.
                val w = s * s
                weight[bucket] += w
                // Hue is circular; average it as a vector so 359° and 1° don't
                // cancel into cyan.
                val radians = Math.toRadians(h.toDouble())
                sumSin[bucket] += (Math.sin(radians) * w).toFloat()
                sumCos[bucket] += (Math.cos(radians) * w).toFloat()
            }

            var best = -1
            var bestWeight = 0f
            for (i in 0 until HUE_BUCKETS) {
                if (weight[i] > bestWeight) {
                    bestWeight = weight[i]
                    best = i
                }
            }
            // A cover that is genuinely monochrome shouldn't be forced to have a hue.
            if (best < 0 || bestWeight <= 0f) return null

            var hue = Math.toDegrees(
                Math.atan2(sumSin[best].toDouble(), sumCos[best].toDouble()),
            ).toFloat()
            if (hue < 0) hue += 360f

            val lightness = if (forDark) ACCENT_LIGHTNESS_DARK else ACCENT_LIGHTNESS_LIGHT
            return hslToHex(hue, ACCENT_SATURATION, lightness)
        } finally {
            bitmap.recycle()
        }
    }

    private fun decodeSampled(fileUri: String): Bitmap? {
        val path = fileUri.removePrefix("file://")
        val file = File(path)
        if (!file.exists()) return null

        val bounds = BitmapFactory.Options().apply { inJustDecodeBounds = true }
        BitmapFactory.decodeFile(path, bounds)
        val longest = maxOf(bounds.outWidth, bounds.outHeight)
        if (longest <= 0) return null

        var sample = 1
        while (longest / (sample * 2) >= SAMPLE_EDGE) sample *= 2

        return runCatching {
            BitmapFactory.decodeFile(
                path,
                BitmapFactory.Options().apply {
                    inSampleSize = sample
                    inPreferredConfig = Bitmap.Config.ARGB_8888
                },
            )
        }.getOrNull()
    }

    private fun hslToHex(h: Float, s: Float, l: Float): String {
        val c = (1 - Math.abs(2 * l - 1)) * s
        val x = c * (1 - Math.abs((h / 60f) % 2 - 1))
        val m = l - c / 2
        val (r, g, b) = when {
            h < 60 -> Triple(c, x, 0f)
            h < 120 -> Triple(x, c, 0f)
            h < 180 -> Triple(0f, c, x)
            h < 240 -> Triple(0f, x, c)
            h < 300 -> Triple(x, 0f, c)
            else -> Triple(c, 0f, x)
        }
        fun channel(v: Float) = ((v + m) * 255).toInt().coerceIn(0, 255)
        return String.format("#%02x%02x%02x", channel(r), channel(g), channel(b))
    }
}
