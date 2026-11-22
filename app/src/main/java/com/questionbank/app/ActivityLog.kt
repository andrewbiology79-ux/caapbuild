package com.questionbank.app

import android.app.Activity
import android.app.Application
import android.content.Context
import android.os.Build
import android.os.Bundle
import android.util.Log
import android.view.MotionEvent
import java.io.File
import java.io.PrintWriter
import java.io.StringWriter
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import java.util.concurrent.Executors

/**
 * Detailed user-activity log (diagnostic). Records, with a timestamp and the current screen:
 *  - every tap / long-press / swipe (position in px, dp and % of the screen),
 *  - screen (navigation route) changes and Back presses,
 *  - editor actions (typing, add/remove solution box, category, undo/redo, mode switch ...),
 *  - save/update start, parts about to be written, the result and any exception with full stack trace,
 *  - activity lifecycle (opened, paused, resumed, closed) and uncaught crashes.
 *
 * File: activity_log.txt in the app files dir and, when available, the external app files dir
 * (Android/data/com.questionbank.app/files/activity_log.txt). When it passes [MAX_BYTES] it is moved to
 * activity_log_old.txt, so the log never grows without limit. It never touches the database.
 * Typed text is logged only as length + a short preview ([PREVIEW_CHARS] characters).
 */
object ActivityLog {
    private const val FILE_NAME = "activity_log.txt"
    private const val OLD_FILE_NAME = "activity_log_old.txt"
    private const val MAX_BYTES = 1_500_000L
    private const val PREVIEW_CHARS = 40
    private const val TAP_SLOP_PX = 24f
    private const val LONG_PRESS_MS = 500L

    private val stamp = SimpleDateFormat("yyyy-MM-dd HH:mm:ss.SSS", Locale.US)
    private val io = Executors.newSingleThreadExecutor { r -> Thread(r, "activity-log").apply { isDaemon = true } }
    private var dirs: List<File> = emptyList()
    private var appContext: Context? = null

    /** The screen (navigation route) the person is currently on; shown on every touch line. */
    @Volatile
    var currentScreen: String = "-"
        private set

    // Touch tracking state (main thread only).
    private var downX = 0f
    private var downY = 0f
    private var downTime = 0L

    fun init(app: Application) {
        if (appContext != null) return
        appContext = app
        dirs = listOfNotNull(app.filesDir, runCatching { app.getExternalFilesDir(null) }.getOrNull())
        val info = runCatching { app.packageManager.getPackageInfo(app.packageName, 0) }.getOrNull()
        write(
            "=== SESSION START | app ${info?.versionName ?: "?"} | ${Build.MANUFACTURER} ${Build.MODEL} | " +
                "Android ${Build.VERSION.RELEASE} (API ${Build.VERSION.SDK_INT}) | " +
                "density ${app.resources.displayMetrics.density} | " +
                "screen ${app.resources.displayMetrics.widthPixels}x${app.resources.displayMetrics.heightPixels}px ===",
        )
        app.registerActivityLifecycleCallbacks(object : Application.ActivityLifecycleCallbacks {
            override fun onActivityCreated(a: Activity, s: Bundle?) = event("LIFECYCLE", "${a.javaClass.simpleName} created (restored=${s != null})")
            override fun onActivityStarted(a: Activity) = event("LIFECYCLE", "${a.javaClass.simpleName} started")
            override fun onActivityResumed(a: Activity) = event("LIFECYCLE", "${a.javaClass.simpleName} resumed (app in foreground)")
            override fun onActivityPaused(a: Activity) = event("LIFECYCLE", "${a.javaClass.simpleName} paused")
            override fun onActivityStopped(a: Activity) = event("LIFECYCLE", "${a.javaClass.simpleName} stopped (app in background)")
            override fun onActivitySaveInstanceState(a: Activity, out: Bundle) = Unit
            override fun onActivityDestroyed(a: Activity) = event("LIFECYCLE", "${a.javaClass.simpleName} destroyed (finishing=${a.isFinishing})")
        })
    }

    // ------------------------------------------------------------------ public API

    /** A general event line: `HH:mm:ss.SSS [screen] TAG  message`. */
    fun event(tag: String, message: String) = write("[$currentScreen] ${tag.padEnd(9)} $message")

    /** A named user action (ViewModel level), e.g. action("EDIT", "save pressed"). */
    fun action(area: String, what: String, detail: String = "") =
        write("[$currentScreen] ACTION    $area: $what${if (detail.isNotEmpty()) " | $detail" else ""}")

    /**
     * A typed-text change: length + short preview only. Keystrokes in the same field less than 1.5 s apart are
     * merged: the line is written when the person pauses, switches field, taps something or saves.
     */
    fun typed(field: String, value: String) {
        val line = "[$currentScreen] TYPED     $field: ${value.length} chars | \"${preview(value)}\""
        val now = System.nanoTime() / 1_000_000L
        synchronized(typedLock) {
            if (field == lastTypedField && now - lastTypedAt < 1500L) {
                pendingTyped = line
                lastTypedAt = now
                return
            }
            flushTypedLocked()
            lastTypedField = field
            lastTypedAt = now
        }
        rawWrite(line)
    }

    private val typedLock = Any()
    private var pendingTyped: String? = null
    private var lastTypedField = ""
    private var lastTypedAt = 0L

    private fun flushTypedLocked() {
        val line = pendingTyped ?: return
        pendingTyped = null
        rawWrite(line)
    }

    private val labelNames = listOf("ক", "খ", "গ", "ঘ")

    /**
     * Central hook for the two editor ViewModels. [group] is the history group name they already use
     * ("stimulus", "question-1", "solution-2-0", "categories-1" ...). [base] is 0 when the labels are 0-based
     * (create screen) or 1 when 1-based (edit screen). Typed fields are logged with their text length/preview;
     * every other change is logged as an action.
     */
    fun changed(
        group: String, base: Int, stimulus: String, reference: String,
        texts: List<String>, answers: List<String>, solutions: List<List<String>>,
    ) {
        val parts = group.split('-')
        fun label(i: String): String {
            val n = i.toIntOrNull() ?: return "?"
            return labelNames.getOrNull(n - base) ?: "?"
        }
        when {
            group == "stimulus" -> typed("stimulus(উদ্দীপক)", stimulus)
            group == "reference" -> typed("reference(সূত্র)", reference)
            parts.size == 2 && parts[0] == "question" && parts[1].toIntOrNull() != null ->
                typed("question ${label(parts[1])} (প্রশ্ন)", texts.getOrNull((parts[1].toInt()) - base).orEmpty())
            parts.size == 2 && parts[0] == "answer" && parts[1].toIntOrNull() != null ->
                typed("short-answer ${label(parts[1])} (সংক্ষিপ্ত উত্তর)", answers.getOrNull((parts[1].toInt()) - base).orEmpty())
            parts.size == 3 && parts[0] == "solution" && parts[1].toIntOrNull() != null && parts[2].toIntOrNull() != null ->
                typed(
                    "solution ${label(parts[1])} box#${parts[2]} (সমাধান)",
                    solutions.getOrNull(parts[1].toInt() - base)?.getOrNull(parts[2].toInt()).orEmpty(),
                )
            else -> action("EDIT", "changed", group)
        }
    }

    /** An error with the full stack trace. */
    fun error(where: String, message: String, t: Throwable? = null) {
        val trace = t?.let { StringWriter().also { w -> it.printStackTrace(PrintWriter(w)) }.toString() }
        write("[$currentScreen] ERROR     $where: $message${if (trace != null) "\n$trace" else ""}")
    }

    /** Synchronous write used by the crash handler: the process is about to die, so no background thread is used. */
    fun crash(thread: Thread, t: Throwable) {
        val trace = StringWriter().also { w -> t.printStackTrace(PrintWriter(w)) }.toString()
        val time = synchronized(stamp) { stamp.format(Date()) }
        val text = "$time [$currentScreen] CRASH     Uncaught exception on thread ${thread.name}\n$trace\n"
        for (dir in dirs) runCatching { File(dir, FILE_NAME).appendText(text) }
    }

    fun screen(route: String?, args: String = "") {
        val next = route ?: "-"
        write("[$currentScreen] NAVIGATE  -> $next${if (args.isNotEmpty()) " | $args" else ""}")
        currentScreen = next
    }

    fun back() = write("[$currentScreen] BACK      Back button/gesture pressed")

    /** Call from Activity.dispatchTouchEvent for every touch. Never consumes the event. */
    fun touch(ev: MotionEvent, density: Float, widthPx: Int, heightPx: Int) {
        try {
            when (ev.actionMasked) {
                MotionEvent.ACTION_DOWN -> {
                    downX = ev.rawX; downY = ev.rawY; downTime = ev.eventTime
                }
                MotionEvent.ACTION_POINTER_DOWN -> write("[$currentScreen] TOUCH     multi-touch (${ev.pointerCount} fingers)")
                MotionEvent.ACTION_UP -> {
                    val dx = ev.rawX - downX
                    val dy = ev.rawY - downY
                    val held = ev.eventTime - downTime
                    val moved = kotlin.math.sqrt(dx * dx + dy * dy)
                    val kind = when {
                        moved > TAP_SLOP_PX -> swipeName(dx, dy) + " dist=${(moved / density).toInt()}dp ${held}ms"
                        held >= LONG_PRESS_MS -> "LONG-PRESS ${held}ms"
                        else -> "TAP"
                    }
                    write("[$currentScreen] TOUCH     $kind at ${position(downX, downY, density, widthPx, heightPx)}")
                }
            }
        } catch (_: Throwable) {
            // Logging must never break touch handling.
        }
    }

    fun read(maxChars: Int = 200_000): String {
        val file = dirs.firstOrNull()?.let { File(it, FILE_NAME) }
        if (file == null || !file.isFile) return ""
        flush()
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

    /** Human-readable location of the log on the phone (for the Profile screen). */
    fun location(): String =
        dirs.getOrNull(1)?.let { File(it, FILE_NAME).absolutePath } ?: dirs.firstOrNull()?.let { File(it, FILE_NAME).absolutePath } ?: "-"

    // ------------------------------------------------------------------ internals

    private fun swipeName(dx: Float, dy: Float): String =
        if (kotlin.math.abs(dx) > kotlin.math.abs(dy)) (if (dx > 0) "SWIPE-RIGHT" else "SWIPE-LEFT")
        else (if (dy > 0) "SWIPE-DOWN(scroll up)" else "SWIPE-UP(scroll down)")

    private fun position(x: Float, y: Float, density: Float, w: Int, h: Int): String {
        val xp = if (w > 0) (x * 100f / w).toInt() else 0
        val yp = if (h > 0) (y * 100f / h).toInt() else 0
        val region = (if (yp < 33) "top" else if (yp < 66) "middle" else "bottom") + "-" +
            (if (xp < 33) "left" else if (xp < 66) "center" else "right")
        return "x=${x.toInt()}px y=${y.toInt()}px (${(x / density).toInt()}dp, ${(y / density).toInt()}dp) [$xp%,$yp%] $region"
    }

    private fun preview(value: String): String =
        value.replace('\n', ' ').take(PREVIEW_CHARS) + if (value.length > PREVIEW_CHARS) "…" else ""

    private fun flush() {
        runCatching { io.submit(Runnable { }).get(500, java.util.concurrent.TimeUnit.MILLISECONDS) }
    }

    private fun write(line: String) {
        synchronized(typedLock) { flushTypedLocked(); lastTypedField = "" }
        rawWrite(line)
    }

    private fun rawWrite(line: String) {
        val time = synchronized(stamp) { stamp.format(Date()) }
        val full = "$time $line\n"
        // Plain JVM unit tests have no android.util.Log; logging must never break them.
        runCatching { Log.d("QBActivity", line) }
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
