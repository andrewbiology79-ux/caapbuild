package com.questionbank.app.ui.backup

import com.questionbank.app.data.backup.BackupNames
import com.questionbank.app.data.backup.BackupPrefs
import com.questionbank.app.data.backup.DbCounts
import com.questionbank.app.ui.format.toBengali
import com.questionbank.app.ui.format.toBengaliDigits

/** One-line backup status for the home screen. Reads preferences only (no database access at cold start). */
fun backupStatusLine(prefs: BackupPrefs): String =
    if (prefs.lastBackupAt == 0L) "ব্যাকআপ: এখনো নেওয়া হয়নি — প্রশ্ন যোগ করার পর ব্যাকআপ নিন।"
    else "শেষ ব্যাকআপ: ${BackupNames.display(prefs.lastBackupAt).toBengaliDigits()}"

fun countsLine(c: DbCounts): String = buildString {
    append("Type_CQ: বিষয় ${c.subjects.toBengali()}, অধ্যায় ${c.chapters.toBengali()}, টপিক ${c.topics.toBengali()}, উদ্দীপক ${c.stimuli.toBengali()}, প্রশ্ন ${c.questions.toBengali()}")
    append("\nChapter_CQ: বিষয় ${c.chapterSubjects.toBengali()}, অধ্যায় ${c.chapterChapters.toBengali()}, উদ্দীপক ${c.chapterStimuli.toBengali()}, প্রশ্ন ${c.chapterQuestions.toBengali()}")
    append("\nমোট প্রশ্ন: ${c.totalQuestions.toBengali()}")
}
