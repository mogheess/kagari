package com.manhwa.updates

import android.Manifest
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import androidx.core.content.ContextCompat
import androidx.work.Constraints
import androidx.work.ExistingPeriodicWorkPolicy
import androidx.work.NetworkType
import androidx.work.PeriodicWorkRequestBuilder
import androidx.work.WorkManager
import com.manhwa.MainActivity
import com.manhwa.R
import kotlinx.serialization.Serializable
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json
import java.util.concurrent.TimeUnit

/** A new-chapters entry, in the shape of the JS feed's `LibraryUpdate`. */
@Serializable
data class InboxUpdate(
    val sourceId: String,
    val mangaUrl: String,
    val title: String,
    val thumbnailUrl: String? = null,
    val newCount: Int,
    val latestChapterName: String,
    val latestChapterUrl: String,
    val foundAt: Long,
    val kind: String = "new",
)

/**
 * What background checks found since the app last looked: feed entries, plus
 * the chapter urls behind them per manga (`sourceId\u0000mangaUrl`), which
 * also stop the next background run reporting the same chapters again.
 */
@Serializable
data class BackgroundInbox(
    val updates: List<InboxUpdate> = emptyList(),
    val snapshots: Map<String, List<String>> = emptyMap(),
)

/**
 * Scheduling, the inbox the JS side drains, and the notification for the
 * periodic new-chapters check ([LibraryUpdateWorker]).
 */
object BackgroundUpdates {

    private const val WORK_NAME = "library-updates"
    private const val PREFS = "background_updates"
    private const val KEY_INBOX = "inbox"
    private const val CHANNEL_ID = "library_updates"
    private const val NOTIFICATION_ID = 0x5EED

    /** Opens the Updates tab; the JS side listens for it. */
    const val UPDATES_URL = "kagari://updates"

    private val json = Json { ignoreUnknownKeys = true; encodeDefaults = true }
    private val lock = Any()

    /** [intervalHours] 0 turns the check off. */
    fun schedule(context: Context, intervalHours: Int, wifiOnly: Boolean, chargingOnly: Boolean) {
        val work = WorkManager.getInstance(context)
        if (intervalHours <= 0) {
            work.cancelUniqueWork(WORK_NAME)
            return
        }
        val constraints = Constraints.Builder()
            .setRequiredNetworkType(if (wifiOnly) NetworkType.UNMETERED else NetworkType.CONNECTED)
            .setRequiresCharging(chargingOnly)
            .setRequiresBatteryNotLow(true)
            .build()
        val request = PeriodicWorkRequestBuilder<LibraryUpdateWorker>(intervalHours.toLong(), TimeUnit.HOURS)
            .setConstraints(constraints)
            // Don't fire the moment it's scheduled; the app just checked in-app.
            .setInitialDelay(intervalHours.toLong(), TimeUnit.HOURS)
            .build()
        work.enqueueUniquePeriodicWork(WORK_NAME, ExistingPeriodicWorkPolicy.UPDATE, request)
    }

    fun readInbox(context: Context): BackgroundInbox = synchronized(lock) {
        val raw = prefs(context).getString(KEY_INBOX, null) ?: return BackgroundInbox()
        runCatching { json.decodeFromString<BackgroundInbox>(raw) }.getOrDefault(BackgroundInbox())
    }

    /** Adds what a run found to the inbox. */
    fun addToInbox(context: Context, found: List<InboxUpdate>, snapshots: Map<String, List<String>>) =
        synchronized(lock) {
            val current = readInbox(context)
            val mergedSnaps = current.snapshots.toMutableMap()
            snapshots.forEach { (key, urls) -> mergedSnaps[key] = (mergedSnaps[key].orEmpty() + urls).distinct() }
            val next = BackgroundInbox(updates = current.updates + found, snapshots = mergedSnaps)
            prefs(context).edit().putString(KEY_INBOX, json.encodeToString(next)).apply()
        }

    /** Returns the inbox as JSON and empties it; the JS feed now owns those entries. */
    fun takeInbox(context: Context): String = synchronized(lock) {
        val inbox = readInbox(context)
        prefs(context).edit().remove(KEY_INBOX).apply()
        NotificationManagerCompat.from(context).cancel(NOTIFICATION_ID)
        json.encodeToString(inbox)
    }

    fun notify(context: Context, found: List<InboxUpdate>) {
        if (found.isEmpty()) return
        if (Build.VERSION.SDK_INT >= 33 &&
            ContextCompat.checkSelfPermission(context, Manifest.permission.POST_NOTIFICATIONS) !=
            PackageManager.PERMISSION_GRANTED
        ) {
            return
        }
        ensureChannel(context)
        val chapters = found.sumOf { it.newCount }
        val titles = found.map { it.title }.distinct()
        val title = if (chapters == 1) "1 new chapter" else "$chapters new chapters"
        val text = titles.joinToString(", ")
        val style = NotificationCompat.InboxStyle().setBigContentTitle(title)
        found.take(6).forEach { u ->
            style.addLine(if (u.newCount > 1) "${u.title} · ${u.newCount} new" else "${u.title} · ${u.latestChapterName}")
        }
        if (found.size > 6) style.setSummaryText("+${found.size - 6} more")

        val open = Intent(context, MainActivity::class.java).apply {
            action = Intent.ACTION_VIEW
            data = Uri.parse(UPDATES_URL)
            flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_SINGLE_TOP
        }
        val pending = PendingIntent.getActivity(
            context,
            0,
            open,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
        )
        val notification = NotificationCompat.Builder(context, CHANNEL_ID)
            .setSmallIcon(R.drawable.ic_notification)
            .setContentTitle(title)
            .setContentText(text)
            .setStyle(style)
            .setContentIntent(pending)
            .setAutoCancel(true)
            .setPriority(NotificationCompat.PRIORITY_DEFAULT)
            .build()
        runCatching { NotificationManagerCompat.from(context).notify(NOTIFICATION_ID, notification) }
    }

    private fun ensureChannel(context: Context) {
        if (Build.VERSION.SDK_INT < 26) return
        val manager = context.getSystemService(NotificationManager::class.java) ?: return
        if (manager.getNotificationChannel(CHANNEL_ID) != null) return
        manager.createNotificationChannel(
            NotificationChannel(CHANNEL_ID, "New chapters", NotificationManager.IMPORTANCE_DEFAULT).apply {
                description = "New chapters for titles in your library"
            },
        )
    }

    private fun prefs(context: Context) = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
}
