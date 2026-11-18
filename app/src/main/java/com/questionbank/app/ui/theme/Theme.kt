package com.questionbank.app.ui.theme

import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Shapes
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.staticCompositionLocalOf
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.unit.Density
import androidx.compose.ui.unit.dp
import com.questionbank.app.ui.settings.TextSizePolicy

/** Colours follow the owner's design (plan 39.4, decision D-4: brand #3B4FD8). */
private val LightColors = lightColorScheme(
    primary = Color(0xFF3B4FD8),
    onPrimary = Color.White,
    primaryContainer = Color(0xFFEEF2FF),
    onPrimaryContainer = Color(0xFF2A3BB0),
    secondaryContainer = Color(0xFFEEF2FF),
    onSecondaryContainer = Color(0xFF2A3BB0),
    background = Color(0xFFF2F4F8),
    onBackground = Color(0xFF1B1F2A),
    surface = Color.White,
    onSurface = Color(0xFF1B1F2A),
    surfaceVariant = Color(0xFFF8FAFC),
    onSurfaceVariant = Color(0xFF64748B),
    surfaceContainer = Color.White,
    surfaceContainerHighest = Color.White,
    outline = Color(0xFFD5D9E2),
    outlineVariant = Color(0xFFE2E8F0),
)

private val DarkColors = darkColorScheme(
    primary = Color(0xFF818CF8),
    onPrimary = Color(0xFF1E1B4B),
    primaryContainer = Color(0xFF1E1B4B),
    onPrimaryContainer = Color(0xFFA5B4FC),
    secondaryContainer = Color(0xFF1E1B4B),
    onSecondaryContainer = Color(0xFFA5B4FC),
    background = Color(0xFF0F172A),
    onBackground = Color(0xFFF1F5F9),
    surface = Color(0xFF1E293B),
    onSurface = Color(0xFFF1F5F9),
    surfaceVariant = Color(0xFF1E293B),
    onSurfaceVariant = Color(0xFF94A3B8),
    surfaceContainer = Color(0xFF1E293B),
    surfaceContainerHighest = Color(0xFF1E293B),
    outline = Color(0xFF334155),
    outlineVariant = Color(0xFF334155),
    errorContainer = Color(0xFF450A0A),
)

/** Cards and dialogs use 16 dp corners (design 39.4). */
private val AppShapes = Shapes(medium = RoundedCornerShape(16.dp))

/** Header bar colours: brand blue in Light, slate in Dark. */
val HeaderLight = Color(0xFF3B4FD8)
val HeaderDark = Color(0xFF1E293B)

/** True while the owner-chosen Dark theme is active. Read by components that need colours outside the Material scheme. */
val LocalDarkTheme = staticCompositionLocalOf { false }

/**
 * App-wide theme. Light/Dark and text size are chosen by the owner in Settings, not by the system (decision D-3).
 * Text size scales every sp value from the base size 16: size 16 changes nothing.
 * Fixed brand colours (no dynamic colour) so screens look the same on every device.
 */
@Composable
fun QuestionBankTheme(darkTheme: Boolean, textSize: Int, content: @Composable () -> Unit) {
    val base = LocalDensity.current
    val scaled = Density(base.density, base.fontScale * TextSizePolicy.scale(textSize))
    CompositionLocalProvider(
        LocalDensity provides scaled,
        LocalDarkTheme provides darkTheme,
    ) {
        MaterialTheme(
            colorScheme = if (darkTheme) DarkColors else LightColors,
            shapes = AppShapes,
            content = content,
        )
    }
}
