package com.questionbank.app.data.settings

import android.content.Context
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import com.questionbank.app.ui.settings.TextSizePolicy

/**
 * Owner-chosen display settings (decision D-3): Light/Dark theme (NOT the system theme) and text size.
 *
 * Kept in SharedPreferences ON PURPOSE, like [com.questionbank.app.data.backup.BackupPrefs]: the theme must be known at the
 * first frame, before the database is opened (cold start, requirement N-1). The values are Compose state, so the whole UI
 * changes the moment the owner changes them. Known limit: they are not part of the backup file (the file holds the database
 * only); moving them into the database is planned together with the other settings (plan 39.5).
 */
class AppSettings(context: Context) {
    private val prefs = context.applicationContext.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)

    var darkTheme by mutableStateOf(prefs.getBoolean(KEY_DARK, false))
        private set

    var textSize by mutableIntStateOf(TextSizePolicy.clamp(prefs.getInt(KEY_TEXT_SIZE, TextSizePolicy.DEFAULT)))
        private set

    fun updateDarkTheme(dark: Boolean) {
        darkTheme = dark
        prefs.edit().putBoolean(KEY_DARK, dark).apply()
    }

    fun updateTextSize(size: Int) {
        val value = TextSizePolicy.clamp(size)
        textSize = value
        prefs.edit().putInt(KEY_TEXT_SIZE, value).apply()
    }

    companion object {
        const val PREFS_NAME = "app_settings"
        private const val KEY_DARK = "dark_theme"
        private const val KEY_TEXT_SIZE = "text_size"
    }
}
