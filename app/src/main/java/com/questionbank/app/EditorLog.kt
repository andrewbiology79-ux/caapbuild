package com.questionbank.app

import android.app.Application
import android.util.Log
import java.io.File
import java.io.PrintWriter
import java.io.StringWriter
import java.text.Normalizer
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import java.util.concurrent.Executors

/**
 * Editor-only audit log. It records ONLY what happens in the question editors (the "create" editor and the "edit" editor of
 * Type CQ): the editor being opened, every field the person changes, every solution text/image block change, the exact data
 * handed over when the tick (save) is pressed, the outcome of the edit rules, EVERY read-back check of the database save
 * (PASS / FAIL with expected-vs-stored detail) and the final result with the full stack trace of an error.
 *
 * It is separate from [ActivityLog] (which records taps, navigation and lifecycle of the whole app): file editor_log.txt in the
 * app files dir and, when available, in the external app files dir (Android/data/com.questionbank.app/files/editor_log.txt).
 * Past [MAX_BYTES] the file is moved to editor_log_old.txt. It never touches the database and never changes a save.
 *
 * Text is never written in full: a field is described as length, blank / leading / trailing whitespace, line breaks, whether
 * Unicode NFC would change it, zero-width joiners, a hash and a short preview, so two descriptions can be compared even when
 * the visible text looks identical.
 */
object EditorLog {
    private const val FILE_NAME = "editor_log.txt"
    private const val OLD_FILE_NAME = "editor_log_old.txt"
    private const val MAX_BYTES = 1_000_000L
    private const val PREVIEW_CHARS = 30

    private val stamp = SimpleDateFormat("yyyy-MM-dd HH:mm:ss.SSS", Locale.US)
    private val io = Executors.newSingleThreadExecutor { r -> Thread(r, "editor-log").apply { isDaemon = true } }
    private var dirs: List<File> = emptyList()
    private var counter = 0

    /** Editor session id ("E1", "E2", ...) written on every line; one session = one opening of an editor screen. */
    @Volatile
    private var session: String = "E0"

    @Volatile
    private var kind: String = "-"

    fun init(app: Application) {
        if (dirs.isNotEmpty()) return
        dirs = listOfNotNull(app.filesDir, runCatching { app.getExternalFilesDir(null) }.getOrNull())
        raw("=== EDITOR LOG START ===")
    }

    /** A person opened an editor screen. [mode] is "CREATE" or "EDIT"; [ref] is the topic / group it works on. */
    fun begin(mode: String, ref: String) {
        synchronized(this) { counter += 1; session = "E$counter"; kind = mode }
        raw("---- $mode editor opened | $ref")
    }

    fun end(reason: String) = raw("---- ${kind} editor closed | $reason")

    /** A general editor line. */
    fun event(tag: String, message: String) = raw("${tag.padEnd(9)} $message")

    /** A button / action inside an editor. */
    fun action(what: String, detail: String = "") =
        raw("ACTION    $what${if (detail.isNotEmpty()) " | $detail" else ""}")

    // ---- typed text: keystrokes of one field less than 1.5 s apart are merged into the final line
    private val typedLock = Any()
    private var pendingTyped: String? = null
    private var lastField = ""
    private var lastAt = 0L

    fun typed(field: String, value: String) {
        val line = "TYPED     $field: ${describe(value)}"
        val now = System.nanoTime() / 1_000_000L
        synchronized(typedLock) {
            if (field == lastField && now - lastAt < 1500L) {
                pendingTyped = line
                lastAt = now
                return
            }
            flushTypedLocked()
            lastField = field
            lastAt = now
        }
        rawLine(line)
    }

    private fun flushTypedLocked() {
        val line = pendingTyped ?: return
        pendingTyped = null
        rawLine(line)
    }

    // ---- descriptions

    /** Compact, comparable description of a text (see class comment). */
    fun describe(text: String?): String {
        if (text == null) return "null"
        val lead = text.takeWhile { it.isWhitespace() }.length
        val trail = text.takeLastWhile { it.isWhitespace() }.length
        val nfcChanges = Normalizer.normalize(text, Normalizer.Form.NFC) != text
        val preview = text.replace('\n', ' ').replace('\r', ' ').take(PREVIEW_CHARS) + if (text.length > PREVIEW_CHARS) "…" else ""
        return "len=${text.length} blank=${text.isBlank()} lead=$lead trail=$trail nl=${text.count { it == '\n' }} " +
            "cr=${text.count { it == '\r' }} nfcChanges=$nfcChanges zwj=${text.count { it == '\u200D' }} " +
            "zwnj=${text.count { it == '\u200C' }} h=${Integer.toHexString(text.hashCode())} \"$preview\""
    }

    /** One solution block, written the same way for what is sent, what is expected and what is stored. */
    data class LogPart(val id: String, val type: String, val position: Long, val text: String?, val imageId: String?) {
        fun line(): String =
            "$type#$position id=${id.take(40)} " + if (type == "IMAGE") "image=$imageId" else "text{${describe(text)}}"
    }

    fun parts(title: String, list: List<LogPart>) {
        raw("PARTS     $title (${list.size})")
        list.forEach { rawLine("PARTS       - ${it.line()}") }
    }

    // ---- save audit

    /** One named read-back check of the database save: PASS, or FAIL with the detail that shows why. */
    fun verify(name: String, ok: Boolean, detail: () -> String = { "" }) {
        if (ok) raw("VERIFY    PASS $name")
        else raw("VERIFY    FAIL $name | ${runCatching(detail).getOrElse { "(detail failed: ${it.message})" }}")
    }

    fun result(text: String) = raw("RESULT    $text")

    fun error(where: String, message: String, t: Throwable? = null) {
        val trace = t?.let { StringWriter().also { w -> it.printStackTrace(PrintWriter(w)) }.toString() }
        raw("ERROR     $where: $message${if (trace != null) "\n$trace" else ""}")
    }

    // ---- reading (Profile screen)

    fun read(maxChars: Int = 200_000): String {
        val file = dirs.firstOrNull()?.let { File(it, FILE_NAME) }
        if (file == null || !file.isFile) return ""
        runCatching { io.submit(Runnable { }).get(500, java.util.concurrent.TimeUnit.MILLISECONDS) }
        val text = runCatching { file.readText() }.getOrDefault("")
        return if (text.length > maxChars) text.takeLast(maxChars) else text
    }

    fun clear() {
        io.execute {
            for (dir in dirs) {
                runCatching { File(dir, FILE_NAME).delete() }
                runCatching { File(dir, OLD_FILE_NAME).delete() }
            }
        }
    }

    fun location(): String =
        dirs.getOrNull(1)?.let { File(it, FILE_NAME).absolutePath } ?: dirs.firstOrNull()?.let { File(it, FILE_NAME).absolutePath } ?: "-"

    // ---- internals

    private fun raw(message: String) {
        synchronized(typedLock) { flushTypedLocked(); lastField = "" }
        rawLine(message)
    }

    private fun rawLine(message: String) {
        val time = synchronized(stamp) { stamp.format(Date()) }
        val full = "$time [$session ${kind}] $message\n"
        // Plain JVM unit tests have no android.util.Log; logging must never break them or a save.
        runCatching { Log.d("QBEditor", full.trimEnd()) }
        if (dirs.isEmpty()) return
        io.execute {
            for (dir in dirs) {
                runCatching {
                    val file = File(dir, FILE_NAME)
                    if (file.length() > MAX_BYTES) {
                        val old = File(dir, OLD_FILE_NAME)
                        old.delete()
                        file.renameTo(old)
                    }
                    file.appendText(full)
                }
            }
        }
    }
}
