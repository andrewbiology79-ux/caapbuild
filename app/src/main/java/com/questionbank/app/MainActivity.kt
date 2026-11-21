package com.questionbank.app

import android.content.ClipData
import android.content.ClipboardManager
import android.content.Context
import android.graphics.Color
import android.os.Bundle
import android.widget.Button
import android.widget.LinearLayout
import android.widget.ScrollView
import android.widget.TextView
import androidx.activity.ComponentActivity
import androidx.activity.SystemBarStyle
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.compose.runtime.SideEffect
import com.questionbank.app.ui.navigation.AppNavHost
import com.questionbank.app.ui.theme.QuestionBankTheme

/**
 * Single Activity (ADR-002). All screens are Compose destinations in [AppNavHost].
 * The Activity does not open the database; it reads only the small display settings (theme, text size) from preferences.
 */
class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
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
            QuestionBankTheme(darkTheme = dark, textSize = textSize, highContrast = highContrast) {
                AppNavHost()
            }
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
