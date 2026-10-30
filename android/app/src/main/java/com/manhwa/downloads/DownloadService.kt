package com.manhwa.downloads

import android.app.ForegroundServiceStartNotAllowedException
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.net.Uri
import android.os.Build
import android.os.IBinder
import android.util.Log
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import androidx.core.app.ServiceCompat
import androidx.core.content.ContextCompat
import com.manhwa.MainActivity
import com.manhwa.R
import com.manhwa.engine.dto.DownloadActivityDto

/**
 * Keeps Kagari alive while chapters download, with a notification saying what.
 *
 * The download queue runs in the app (`src/library/downloads.ts`), so Android
 * killing a backgrounded Kagari to free memory stopped every download until it
 * was opened again. A foreground service raises the process above that. The JS
 * queue reports what it's doing after each change ([update]); nothing to report
 * (empty or paused) stops the service. Pause on the notification goes back to
 * the queue as an event ([pauseListener]), so pausing works the same as in the
 * app.
 */
class DownloadService : Service() {

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        if (intent?.action == ACTION_PAUSE) {
            pauseListener?.invoke()
            // Tapped on a notification left from before a crash: nothing runs here.
            if (!running) stopSelf()
            return START_NOT_STICKY
        }
        // Same lock as update(), which runs on the bridge's thread: an update
        // between reading the queue and setting running would be lost.
        synchronized(Companion) {
            val activity = current
            val content = activity ?: shown
            if (content == null) {
                stopSelf()
                return START_NOT_STICKY
            }
            // Started with startForegroundService, it has to reach the foreground
            // even when the queue emptied in the meantime: stopping first crashes
            // the app.
            ServiceCompat.startForeground(
                this,
                NOTIFICATION_ID,
                notification(this, content),
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) ServiceInfo.FOREGROUND_SERVICE_TYPE_DATA_SYNC else 0,
            )
            if (activity == null) {
                ServiceCompat.stopForeground(this, ServiceCompat.STOP_FOREGROUND_REMOVE)
                stopSelf()
            } else {
                running = true
            }
        }
        // Not sticky: restarted without the app, there'd be no queue to run.
        return START_NOT_STICKY
    }

    /** Android 15 caps data-sync services at six hours a day. */
    override fun onTimeout(startId: Int, fgsType: Int) {
        stopSelf()
    }

    override fun onDestroy() {
        running = false
        cancelNotification(this)
        super.onDestroy()
    }

    companion object {
        private const val TAG = "DownloadService"
        private const val CHANNEL_ID = "downloads"
        private const val NOTIFICATION_ID = 0x0D0A
        private const val ACTION_PAUSE = "app.kagari.downloads.PAUSE"
        private const val QUEUE_URL = "kagari://downloads"

        @Volatile private var current: DownloadActivityDto? = null
        // The last thing shown, for a start that finds the queue already empty.
        @Volatile private var shown: DownloadActivityDto? = null
        @Volatile private var running = false

        /** Called when Pause is tapped on the notification; the bridge forwards it to JS. */
        @Volatile var pauseListener: (() -> Unit)? = null

        /**
         * What the queue is doing, or null when it has nothing to do. Calls must
         * arrive in the order the queue sent them: a progress update landing
         * after the null would put the notification back with nothing running.
         */
        @Synchronized
        fun update(context: Context, activity: DownloadActivityDto?) {
            current = activity
            if (activity != null) shown = activity
            val intent = Intent(context, DownloadService::class.java)
            if (activity == null) {
                if (running) {
                    // Cleared here, not only in onDestroy: work queued again
                    // before the service is gone has to start a new one.
                    running = false
                    context.stopService(intent)
                }
                // Progress updates re-post it as a plain notification, which
                // Android doesn't take down with the service. It's ongoing, so
                // left behind it couldn't be swiped away either.
                cancelNotification(context)
                return
            }
            if (running) {
                // Already in the foreground: the notification is all that changes.
                try {
                    NotificationManagerCompat.from(context).notify(NOTIFICATION_ID, notification(context, activity))
                } catch (e: SecurityException) {
                    // Notifications not allowed; the service still holds the process.
                }
                return
            }
            try {
                ContextCompat.startForegroundService(context, intent)
            } catch (e: Exception) {
                // Android 12+ refuses to start one from the background. The queue
                // carries on while the app is alive; it's only less protected.
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S && e is ForegroundServiceStartNotAllowedException) {
                    Log.w(TAG, "Not allowed to start from the background")
                } else {
                    Log.w(TAG, "Couldn't start: ${e.message}")
                }
            }
        }

        private fun notification(context: Context, activity: DownloadActivityDto) =
            NotificationCompat.Builder(context, ensureChannel(context))
                .setSmallIcon(R.drawable.ic_notification)
                .setContentTitle(activity.title)
                .setContentText(
                    if (activity.pageCount > 0) {
                        "${activity.chapterName} · ${activity.downloaded}/${activity.pageCount}"
                    } else {
                        activity.chapterName
                    },
                )
                .setSubText(if (activity.remaining > 1) "${activity.remaining} chapters left" else null)
                .setProgress(activity.pageCount, activity.downloaded, activity.pageCount <= 0)
                .setContentIntent(openQueue(context))
                .addAction(0, "Pause", pause(context))
                .setOngoing(true)
                .setOnlyAlertOnce(true)
                .setSilent(true)
                .setCategory(NotificationCompat.CATEGORY_PROGRESS)
                .setPriority(NotificationCompat.PRIORITY_LOW)
                .setForegroundServiceBehavior(NotificationCompat.FOREGROUND_SERVICE_IMMEDIATE)
                .build()

        private fun cancelNotification(context: Context) {
            NotificationManagerCompat.from(context).cancel(NOTIFICATION_ID)
        }

        private fun openQueue(context: Context): PendingIntent {
            val open = Intent(context, MainActivity::class.java).apply {
                action = Intent.ACTION_VIEW
                data = Uri.parse(QUEUE_URL)
                flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_SINGLE_TOP
            }
            return PendingIntent.getActivity(
                context,
                0,
                open,
                PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
            )
        }

        private fun pause(context: Context): PendingIntent =
            PendingIntent.getService(
                context,
                1,
                Intent(context, DownloadService::class.java).setAction(ACTION_PAUSE),
                PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
            )

        private fun ensureChannel(context: Context): String {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                val manager = context.getSystemService(NotificationManager::class.java)
                if (manager.getNotificationChannel(CHANNEL_ID) == null) {
                    manager.createNotificationChannel(
                        NotificationChannel(CHANNEL_ID, "Downloads", NotificationManager.IMPORTANCE_LOW).apply {
                            description = "Chapters downloading in the background"
                            setShowBadge(false)
                        },
                    )
                }
            }
            return CHANNEL_ID
        }
    }
}
