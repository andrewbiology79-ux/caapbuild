package com.questionbank.app.ui.backup

import com.questionbank.app.data.backup.BackupNames
import com.questionbank.app.data.backup.BackupPrefs
import com.questionbank.app.data.backup.DbCounts

/** One-line backup status for the home screen. Reads preferences only (no database access at cold start). */
fun backupStatusLine(prefs: BackupPrefs): String =
    if (prefs.lastBackupAt == 0L) "ব্যাকআপ: এখনো নেওয়া হয়নি — প্রশ্ন যোগ করার পর ব্যাকআপ নিন।"
    else "শেষ ব্যাকআপ: ${BackupNames.display(prefs.lastBackupAt)}"

fun countsLine(c: DbCounts): String =
    "বিষয় ${c.subjects}, অধ্যায় ${c.chapters}, টপিক ${c.topics}, উদ্দীপক ${c.stimuli}, প্রশ্ন ${c.questions}"
