package com.questionbank.app.ui.theme

import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color

private val Brand = Color(0xFF315EFB)

private val LightColors = lightColorScheme(primary = Brand)
private val DarkColors = darkColorScheme(primary = Color(0xFFB4C5FF))

/** App-wide Material 3 theme. Fixed brand colours (no dynamic colour) so screens look the same on every device. */
@Composable
fun QuestionBankTheme(content: @Composable () -> Unit) {
    MaterialTheme(
        colorScheme = if (isSystemInDarkTheme()) DarkColors else LightColors,
        content = content,
    )
}
