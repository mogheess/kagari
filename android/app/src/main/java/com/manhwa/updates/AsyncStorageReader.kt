package com.manhwa.updates

import android.content.Context
import android.database.sqlite.SQLiteDatabase

/**
 * Read-only access to the JS side's AsyncStorage, so the background update job
 * can see the library and its chapter snapshots without starting React Native.
 * AsyncStorage keeps every key in one SQLite table, `Storage(key, value)`, in the
 * `AsyncStorage` database; values are the JSON the JS stores wrote.
 */
internal class AsyncStorageReader(private val context: Context) {

    fun read(key: String): String? {
        val file = context.getDatabasePath(DATABASE)
        if (!file.exists()) return null
        return try {
            SQLiteDatabase.openDatabase(file.path, null, SQLiteDatabase.OPEN_READONLY).use { db ->
                db.rawQuery("SELECT value FROM Storage WHERE key = ?", arrayOf(key)).use { cursor ->
                    if (cursor.moveToFirst()) cursor.getString(0) else null
                }
            }
        } catch (_: Exception) {
            null
        }
    }

    private companion object {
        const val DATABASE = "AsyncStorage"
    }
}
