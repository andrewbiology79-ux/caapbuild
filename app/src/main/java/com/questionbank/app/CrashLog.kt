package com.questionbank.app

import android.content.Context
import java.io.File
import java.io.PrintWriter
import java.io.StringWriter
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

/**
 * v1.72 diagnostic: writes the last uncaught crash to crash_log.txt (app files dir and, when available,
 * the external app files dir) so the owner can read it on the phone. It never touches the database.
 */
object CrashLog {
    private const val FILE_NAME = "crash_log.txt"
    private const val MAX_CHARS = 60_000

    fun install(context: Context) {
        val app = context.applicationContext
        val previous = Thread.getDefaultUncaughtExceptionHandler()
        Thread.setDefaultUncaughtExceptionHandler { thread, error ->
            runCatching { write(app, thread, error) }
            previous?.uncaughtException(thread, error)
        }
    }

    private fun write(app: Context, thread: Thread, error: Throwable) {
        val trace = StringWriter()
        error.printStackTrace(PrintWriter(trace))
        val stamp = SimpleDateFormat("yyyy-MM-dd HH:mm:ss", Locale.US).format(Date())
        val report = "Time: $stamp\nThread: ${thread.name}\n\n$trace".take(MAX_CHARS)
        val dirs = listOfNotNull(app.filesDir, app.getExternalFilesDir(null))
        for (dir in dirs) {
            runCatching { File(dir, FILE_NAME).writeText(report) }
        }
    }

    fun read(context: Context): String? {
        val file = File(context.filesDir, FILE_NAME)
        return if (file.isFile) runCatching { file.readText() }.getOrNull() else null
    }

    fun clear(context: Context) {
        runCatching { File(context.filesDir, FILE_NAME).delete() }
        runCatching { context.getExternalFilesDir(null)?.let { File(it, FILE_NAME).delete() } }
    }
}
