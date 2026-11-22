package com.questionbank.app.data.settings

import android.content.Context
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import com.questionbank.app.ui.settings.SpacingPolicy
import com.questionbank.app.ui.settings.TextSizePolicy
import com.questionbank.app.ui.question.EditorMode

/**
 * Owner-chosen first-frame preferences: theme, text size, default editor mode and search term highlighting.
 *
 * Kept in SharedPreferences ON PURPOSE, like [com.questionbank.app.data.backup.BackupPrefs]: the theme must be known at the
 * first frame, before the database is opened (cold start, requirement N-1). The values are Compose state, so the whole UI
 * changes the moment the owner changes them. These preferences remain in SharedPreferences and are not included in the
 * database/media backup archive; that is intentional because theme is needed before the database is opened.
 */
class AppSettings(context: Context) {
    private val prefs = context.applicationContext.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)

    var darkTheme by mutableStateOf(prefs.getBoolean(KEY_DARK, false))
        private set

    var textSize by mutableIntStateOf(TextSizePolicy.clamp(prefs.getInt(KEY_TEXT_SIZE, TextSizePolicy.DEFAULT)))
        private set

    var defaultEditorMode by mutableStateOf(
        runCatching { EditorMode.valueOf(prefs.getString(KEY_EDITOR_MODE, EditorMode.MINIMUM.name) ?: EditorMode.MINIMUM.name) }
            .getOrDefault(EditorMode.MINIMUM)
    )
        private set

    var highlightSearchTerms by mutableStateOf(prefs.getBoolean(KEY_SEARCH_HIGHLIGHT, true))
        private set

    var highContrast by mutableStateOf(prefs.getBoolean(KEY_HIGH_CONTRAST, false))
        private set

    /** Line height of ordinary text as a percent of the font size (see [SpacingPolicy]). */
    var lineSpacingPercent by mutableIntStateOf(SpacingPolicy.clampLine(prefs.getInt(KEY_LINE_SPACING, SpacingPolicy.LINE_DEFAULT)))
        private set

    /** Extra gap in dp between lines split with the manual "<br>" marker. */
    var breakGapDp by mutableIntStateOf(SpacingPolicy.clampBreakGap(prefs.getInt(KEY_BREAK_GAP, SpacingPolicy.BREAK_GAP_DEFAULT)))
        private set

    /** Gap in dp above and below a display formula written with double dollar signs. */
    var blockGapDp by mutableIntStateOf(SpacingPolicy.clampBlockGap(prefs.getInt(KEY_BLOCK_GAP, SpacingPolicy.BLOCK_GAP_DEFAULT)))
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

    fun updateLineSpacing(percent: Int) {
        val value = SpacingPolicy.clampLine(percent)
        lineSpacingPercent = value
        prefs.edit().putInt(KEY_LINE_SPACING, value).apply()
    }

    fun updateBreakGap(dp: Int) {
        val value = SpacingPolicy.clampBreakGap(dp)
        breakGapDp = value
        prefs.edit().putInt(KEY_BREAK_GAP, value).apply()
    }

    fun updateBlockGap(dp: Int) {
        val value = SpacingPolicy.clampBlockGap(dp)
        blockGapDp = value
        prefs.edit().putInt(KEY_BLOCK_GAP, value).apply()
    }

    fun updateDefaultEditorMode(mode: EditorMode) {
        defaultEditorMode = mode
        prefs.edit().putString(KEY_EDITOR_MODE, mode.name).apply()
    }

    fun updateHighlightSearchTerms(enabled: Boolean) {
        highlightSearchTerms = enabled
        prefs.edit().putBoolean(KEY_SEARCH_HIGHLIGHT, enabled).apply()
    }

    fun updateHighContrast(enabled: Boolean) {
        highContrast = enabled
        prefs.edit().putBoolean(KEY_HIGH_CONTRAST, enabled).apply()
    }

    companion object {
        const val PREFS_NAME = "app_settings"
        private const val KEY_DARK = "dark_theme"
        private const val KEY_TEXT_SIZE = "text_size"
        private const val KEY_EDITOR_MODE = "default_editor_mode"
        private const val KEY_SEARCH_HIGHLIGHT = "search_highlight_terms"
        private const val KEY_HIGH_CONTRAST = "high_contrast"
        private const val KEY_LINE_SPACING = "line_spacing_percent"
        private const val KEY_BREAK_GAP = "break_gap_dp"
        private const val KEY_BLOCK_GAP = "block_gap_dp"
    }
}
