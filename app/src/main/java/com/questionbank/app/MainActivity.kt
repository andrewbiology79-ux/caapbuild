package com.questionbank.app

import android.content.ClipData
import android.content.ClipboardManager
import android.content.Context
import android.Manifest
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.graphics.Color
import android.os.Bundle
import android.os.Build
import android.os.Environment
import android.provider.Settings
import android.view.KeyEvent
import android.view.MotionEvent
import android.widget.Button
import android.widget.LinearLayout
import android.widget.ScrollView
import android.widget.TextView
import androidx.activity.ComponentActivity
import androidx.activity.result.ActivityResultLauncher
import androidx.activity.result.contract.ActivityResultContracts
import androidx.activity.SystemBarStyle
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.compose.runtime.SideEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import com.questionbank.app.ui.navigation.AppNavHost
import androidx.core.content.ContextCompat
import com.questionbank.app.ui.theme.QuestionBankTheme

/**
 * Single Activity (ADR-002). All screens are Compose destinations in [AppNavHost].
 * The Activity does not open the database; it reads only the small display settings (theme, text size) from preferences.
 */
class MainActivity : ComponentActivity() {
    private var hasRequestedStorageSettings by mutableStateOf(false)
    private var storageAccessGranted by mutableStateOf(false)
    private var showStorageAccessPrompt by mutableStateOf(false)
    private lateinit var legacyStoragePermissionLauncher: ActivityResultLauncher<Array<String>>

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        legacyStoragePermissionLauncher = registerForActivityResult(ActivityResultContracts.RequestMultiplePermissions()) {
            storageAccessGranted = hasRequiredStorageAccess()
            // A denied request does not block app use; the notice is shown again on the next launch.
            showStorageAccessPrompt = false
        }
        storageAccessGranted = hasRequiredStorageAccess()
        showStorageAccessPrompt = !storageAccessGranted
        val lastCrash = CrashLog.read(this)
        if (lastCrash != null) {
            showCrashReport(lastCrash)
            return
        }
        val settings = (application as QuestionBankApp).container.appSettings
        setContent {
            val dark = settings.darkTheme
            val textSize = settings.textSize
            val highContrast = settings.highContrast
            val lineSpacingPercent = settings.lineSpacingPercent
            val breakGapDp = settings.breakGapDp
            val blockGapDp = settings.blockGapDp
            // The header bar is always dark enough for light status-bar icons; the navigation bar follows the owner's theme.
            SideEffect {
                enableEdgeToEdge(
                    statusBarStyle = SystemBarStyle.dark(Color.TRANSPARENT),
                    navigationBarStyle = if (dark) {
                        SystemBarStyle.dark(Color.TRANSPARENT)
                    } else {
                        SystemBarStyle.light(Color.TRANSPARENT, Color.TRANSPARENT)
                    },
                )
            }
            QuestionBankTheme(
                darkTheme = dark,
                textSize = textSize,
                highContrast = highContrast,
                lineSpacingPercent = lineSpacingPercent,
                breakGapDp = breakGapDp,
                blockGapDp = blockGapDp,
            ) {
                AppNavHost()
                if (showStorageAccessPrompt && !storageAccessGranted) {
                    AlertDialog(
                        onDismissRequest = { showStorageAccessPrompt = false },
                        title = { Text("স্টোরেজ ব্যবহারের অনুমতি") },
                        text = {
                            Text(
                                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
                                    "ফাইল ব্যবস্থাপনার বিস্তৃত সুবিধার জন্য ‘All files access’ অনুমতি চাওয়া হচ্ছে। পরের ধাপে Android Settings খুলবে; সেখানে Question Bank-এর অনুমতি নিজে চালু করুন। এই অনুমতি না দিলেও অ্যাপের ভেতরের ডেটা ব্যবহার এবং সাধারণ ছবি নির্বাচন/Export করা যাবে।"
                                } else {
                                    "ছবি ফোনের Pictures/QuestionBank ফোল্ডারে সংরক্ষণ করতে স্টোরেজ অনুমতি প্রয়োজন। অনুমতি না দিলেও অ্যাপের ভেতরের ডেটা ব্যবহার করা যাবে।"
                                }
                            )
                        },
                        confirmButton = {
                            TextButton(onClick = { requestStorageAccess() }) { Text("অনুমতি দিন") }
                        },
                        dismissButton = {
                            TextButton(onClick = { showStorageAccessPrompt = false }) { Text("এখন নয়") }
                        },
                    )
                }
            }
        }
    }

    /** Diagnostic: every touch is recorded in the activity log (position, tap/long-press/swipe, current screen). Never consumes it. */
    override fun dispatchTouchEvent(ev: MotionEvent): Boolean {
        val metrics = resources.displayMetrics
        ActivityLog.touch(ev, metrics.density, metrics.widthPixels, metrics.heightPixels)
        return super.dispatchTouchEvent(ev)
    }

    override fun dispatchKeyEvent(event: KeyEvent): Boolean {
        if (event.keyCode == KeyEvent.KEYCODE_BACK && event.action == KeyEvent.ACTION_UP) ActivityLog.back()
        return super.dispatchKeyEvent(event)
    }

    private fun hasRequiredStorageAccess(): Boolean {
        return when {
            Build.VERSION.SDK_INT >= Build.VERSION_CODES.R -> Environment.isExternalStorageManager()
            Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q -> true // Scoped storage + MediaStore; no broad runtime storage permission is needed.
            else -> {
                val read = ContextCompat.checkSelfPermission(this, Manifest.permission.READ_EXTERNAL_STORAGE) == PackageManager.PERMISSION_GRANTED
                val write = ContextCompat.checkSelfPermission(this, Manifest.permission.WRITE_EXTERNAL_STORAGE) == PackageManager.PERMISSION_GRANTED
                read && write
            }
        }
    }

    private fun requestStorageAccess() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
            hasRequestedStorageSettings = true
            try {
                startActivity(
                    Intent(Settings.ACTION_MANAGE_APP_ALL_FILES_ACCESS_PERMISSION).apply {
                        data = Uri.parse("package:$packageName")
                    }
                )
            } catch (_: Exception) {
                try {
                    startActivity(Intent(Settings.ACTION_MANAGE_ALL_FILES_ACCESS_PERMISSION))
                } catch (_: Exception) {
                    hasRequestedStorageSettings = false
                    showStorageAccessPrompt = false
                }
            }
        } else if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            // Android 10 uses scoped storage and the app exports with MediaStore.
            storageAccessGranted = true
            showStorageAccessPrompt = false
        } else {
            val permissions = arrayOf(Manifest.permission.READ_EXTERNAL_STORAGE, Manifest.permission.WRITE_EXTERNAL_STORAGE)
            legacyStoragePermissionLauncher.launch(permissions)
        }
    }

    override fun onResume() {
        super.onResume()
        if (hasRequestedStorageSettings) {
            hasRequestedStorageSettings = false
            storageAccessGranted = hasRequiredStorageAccess()
            // If the user returned without granting the special access, explain it again but keep the app usable.
            showStorageAccessPrompt = !storageAccessGranted
        }
    }

    /** Diagnostic screen (v1.72): shows the last crash as plain text; it does not open the database. */
    private fun showCrashReport(report: String) {
        val pad = (16 * resources.displayMetrics.density).toInt()
        val body = TextView(this).apply {
            text = report
            textSize = 11f
            setTextIsSelectable(true)
            setPadding(pad, pad, pad, pad)
        }
        val copyButton = Button(this).apply {
            text = "Copy crash text"
            setOnClickListener {
                val clipboard = getSystemService(Context.CLIPBOARD_SERVICE) as ClipboardManager
                clipboard.setPrimaryClip(ClipData.newPlainText("crash", report))
            }
        }
        val continueButton = Button(this).apply {
            text = "Delete log and open app"
            setOnClickListener {
                CrashLog.clear(this@MainActivity)
                recreate()
            }
        }
        val scroll = ScrollView(this).apply { addView(body) }
        val root = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            fitsSystemWindows = true
            addView(copyButton)
            addView(continueButton)
            addView(scroll, LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, 0, 1f))
        }
        setContentView(root)
    }
}
