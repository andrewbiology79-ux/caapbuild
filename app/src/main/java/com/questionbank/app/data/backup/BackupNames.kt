package com.questionbank.app.data.backup

import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import java.util.TimeZone

object BackupNames {
    /** `QuestionBank-backup-20261118-2130.db` (local time of the phone). Sorts by date when listed by name. */
    fun fileName(timeMillis: Long, zone: TimeZone = TimeZone.getDefault()): String {
        val format = SimpleDateFormat("yyyyMMdd-HHmm", Locale.US)
        format.timeZone = zone
        return "QuestionBank-backup-${format.format(Date(timeMillis))}.db"
    }

    /** Human readable time for the screen, in the phone's time zone, ASCII digits. */
    fun display(timeMillis: Long, zone: TimeZone = TimeZone.getDefault()): String {
        val format = SimpleDateFormat("dd/MM/yyyy HH:mm", Locale.US)
        format.timeZone = zone
        return format.format(Date(timeMillis))
    }
}
