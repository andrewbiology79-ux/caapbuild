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
import androidx.compose.ui.unit.dp
import com.questionbank.app.ui.settings.SpacingPolicy
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


private val HighContrastLightColors = lightColorScheme(
    primary = Color.Black, onPrimary = Color.White,
    primaryContainer = Color.White, onPrimaryContainer = Color.Black,
    secondary = Color.Black, onSecondary = Color.White,
    secondaryContainer = Color.White, onSecondaryContainer = Color.Black,
    background = Color.White, onBackground = Color.Black,
    surface = Color.White, onSurface = Color.Black,
    surfaceVariant = Color.White, onSurfaceVariant = Color.Black,
    surfaceContainer = Color.White, surfaceContainerHighest = Color.White,
    outline = Color.Black, outlineVariant = Color.Black,
    error = Color(0xFF8B0000), onError = Color.White,
)

private val HighContrastDarkColors = darkColorScheme(
    primary = Color.White, onPrimary = Color.Black,
    primaryContainer = Color.Black, onPrimaryContainer = Color.White,
    secondary = Color.White, onSecondary = Color.Black,
    secondaryContainer = Color.Black, onSecondaryContainer = Color.White,
    background = Color.Black, onBackground = Color.White,
    surface = Color.Black, onSurface = Color.White,
    surfaceVariant = Color.Black, onSurfaceVariant = Color.White,
    surfaceContainer = Color.Black, surfaceContainerHighest = Color.Black,
    outline = Color.White, outlineVariant = Color.White,
    error = Color(0xFFFF8A80), onError = Color.Black,
)

/** Cards and dialogs use 16 dp corners (design 39.4). */
private val AppShapes = Shapes(medium = RoundedCornerShape(16.dp))

/** Legacy Type CQ card palette, grounded in the previous app's QuestionCard styles. */
object TypeCqCardTokens {
    val RibbonLight = Color(0xFF3B4FD8)
    val RibbonDark = Color(0xFF2A3BB0)
    val BorderLight = Color(0xFF3B4FD8)
    val BorderDark = Color(0xFF5369B4)
    val Muted = Color(0xFF64748B)
    val PaperChipBackground = Color(0xFFECFDF5)
    val PaperChipForeground = Color(0xFF065F46)
    val PaperChipBorder = Color(0xFFA7F3D0)
    val BoardChipBorder = Color(0xFFD5D9E2)
    val ContentDivider = Color(0xFFF2F4F8)
    val SolutionPanelLight = Color(0xFFF8FAFC)
    val SolutionPanelBorderLight = Color(0xFFE2E8F0)
    val SolutionPanelDark = Color(0xFF202A44)
    val SolutionPanelBorderDark = Color(0xFF3F4D75)
}

/** Header bar colours: brand blue in Light, slate in Dark. */
val HeaderLight = Color(0xFF3B4FD8)
val HeaderDark = Color(0xFF1E293B)

/** True while the owner-chosen Dark theme is active. Read by components that need colours outside the Material scheme. */
val LocalDarkTheme = staticCompositionLocalOf { false }

/** User-selected size for question/stimulus/solution body text only; controls keep their designed typography. */
val LocalQuestionBodyTextSize = staticCompositionLocalOf { TextSizePolicy.DEFAULT }

/** Owner-chosen reading-text spacing (Settings): line-height multiplier, gap between "<br>" lines, gap around display formulas. */
val LocalLineSpacingMultiplier = staticCompositionLocalOf { SpacingPolicy.lineMultiplier(SpacingPolicy.LINE_DEFAULT) }
val LocalBreakGapDp = staticCompositionLocalOf { SpacingPolicy.BREAK_GAP_DEFAULT }
val LocalBlockGapDp = staticCompositionLocalOf { SpacingPolicy.BLOCK_GAP_DEFAULT }

/**
 * App-wide theme. Light/Dark are chosen in Settings; content body text size is separately exposed to body-text components.
 * The Settings text size is exposed only to question/stimulus/solution body text. Buttons, labels,
 * navigation and editor controls retain their designed sizes. The device accessibility font scale is preserved.
 * Fixed brand colours (no dynamic colour) so screens look the same on every device.
 */
@Composable
fun QuestionBankTheme(
    darkTheme: Boolean,
    textSize: Int,
    highContrast: Boolean = false,
    lineSpacingPercent: Int = SpacingPolicy.LINE_DEFAULT,
    breakGapDp: Int = SpacingPolicy.BREAK_GAP_DEFAULT,
    blockGapDp: Int = SpacingPolicy.BLOCK_GAP_DEFAULT,
    content: @Composable () -> Unit,
) {
    CompositionLocalProvider(
        LocalQuestionBodyTextSize provides TextSizePolicy.contentFontSizeSp(textSize),
        LocalLineSpacingMultiplier provides SpacingPolicy.lineMultiplier(lineSpacingPercent),
        LocalBreakGapDp provides SpacingPolicy.clampBreakGap(breakGapDp),
        LocalBlockGapDp provides SpacingPolicy.clampBlockGap(blockGapDp),
        LocalDarkTheme provides darkTheme,
    ) {
        MaterialTheme(
            colorScheme = when {
                highContrast && darkTheme -> HighContrastDarkColors
                highContrast -> HighContrastLightColors
                darkTheme -> DarkColors
                else -> LightColors
            },
            shapes = AppShapes,
            content = content,
        )
    }
}
