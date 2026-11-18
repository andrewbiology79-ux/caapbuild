package com.questionbank.app.data.backup

import android.content.Context

/**
 * Small facts about backups, kept in SharedPreferences ON PURPOSE (not in the database): the home screen can show the
 * backup status without opening the database (cold start, requirement N-1), and the status stays readable even when a
 * restore replaces the database.
 */
class BackupPrefs(context: Context) {
    private val prefs = context.applicationContext.getSharedPreferences("backup_prefs", Context.MODE_PRIVATE)

    val lastBackupAt: Long get() = prefs.getLong(KEY_AT, 0L)
    val lastBackupQuestions: Long get() = prefs.getLong(KEY_QUESTIONS, -1L)

    fun recordBackup(atMillis: Long, questions: Long) {
        prefs.edit().putLong(KEY_AT, atMillis).putLong(KEY_QUESTIONS, questions).commit()
    }

    /** Message about the last restore attempt (written at app start, shown once on the backup screen). */
    var restoreMessage: String?
        get() = prefs.getString(KEY_RESTORE_MESSAGE, null)
        set(value) {
            prefs.edit().apply { if (value == null) remove(KEY_RESTORE_MESSAGE) else putString(KEY_RESTORE_MESSAGE, value) }.commit()
        }

    private companion object {
        const val KEY_AT = "last_backup_at"
        const val KEY_QUESTIONS = "last_backup_questions"
        const val KEY_RESTORE_MESSAGE = "restore_message"
    }
}
