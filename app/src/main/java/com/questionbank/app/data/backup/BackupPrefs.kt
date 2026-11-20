package com.questionbank.app.data.backup

import android.content.Context

/**
 * Small backup facts and policy, kept in SharedPreferences so status/policy are readable before Room opens.
 * Automatic copies live only in app-private storage; they are not a substitute for exporting a copy off-device.
 */
class BackupPrefs(context: Context) {
    private val prefs = context.applicationContext.getSharedPreferences("backup_prefs", Context.MODE_PRIVATE)

    val lastBackupAt: Long get() = prefs.getLong(KEY_AT, 0L)
    val lastBackupQuestions: Long get() = prefs.getLong(KEY_QUESTIONS, -1L)
    val automaticBackupEnabled: Boolean get() = prefs.getBoolean(KEY_AUTO_ENABLED, false)
    val automaticIntervalDays: Int get() = prefs.getInt(KEY_AUTO_INTERVAL_DAYS, 7).coerceIn(1, 30)
    val automaticRetentionCount: Int get() = prefs.getInt(KEY_AUTO_RETENTION, 3).coerceIn(1, 10)

    fun recordBackup(atMillis: Long, questions: Long) {
        prefs.edit().putLong(KEY_AT, atMillis).putLong(KEY_QUESTIONS, questions).commit()
    }

    fun updateAutomaticPolicy(enabled: Boolean, intervalDays: Int = automaticIntervalDays, retentionCount: Int = automaticRetentionCount): Boolean {
        val interval = intervalDays.coerceIn(1, 30)
        val retention = retentionCount.coerceIn(1, 10)
        return prefs.edit()
            .putBoolean(KEY_AUTO_ENABLED, enabled)
            .putInt(KEY_AUTO_INTERVAL_DAYS, interval)
            .putInt(KEY_AUTO_RETENTION, retention)
            .commit()
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
        const val KEY_AUTO_ENABLED = "automatic_backup_enabled"
        const val KEY_AUTO_INTERVAL_DAYS = "automatic_backup_interval_days"
        const val KEY_AUTO_RETENTION = "automatic_backup_retention"
    }
}
