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

/** Fixed light/dark tokens for Type CQ question cards, matching the legacy Collection card palette. */
object QuestionCardPalette {
    val Ribbon = Color(0xFF3B4FD8)
    val LightCardBorder = Color(0xFF3B4FD8)
    val DarkCardBorder = Color(0xFF334155)

    val LightMetaRow = Color(0xFFF8FAFC)
    val DarkMetaRow = Color(0xFF1E293B)
    val LightPaperRow = Color(0xFFF8FAFC)
    val DarkPaperRow = Color(0xFF162033)
    val LightMuted = Color(0xFF64748B)
    val DarkMuted = Color(0xFF94A3B8)

    val LightPaperChip = Color(0xFFECFDF5)
    val LightPaperChipText = Color(0xFF065F46)
    val LightPaperChipBorder = Color(0xFFA7F3D0)
    val DarkPaperChip = Color(0xFF052E16)
    val DarkPaperChipText = Color(0xFF6EE7B7)
    val DarkPaperChipBorder = Color(0xFF065F46)

    val LightHeading = Color(0xFF2A3BB0)
    val DarkHeading = Color(0xFFA5B4FC)
    val LightQuestionDivider = Color(0xFFF2F4F8)
    val DarkQuestionDivider = Color(0xFF334155)

    val LightBoardBackground = Color.White
    val LightBoardText = Color(0xFF1B1F2A)
    val LightBoardBorder = Color(0xFFD5D9E2)
    val DarkBoardBackground = Color(0xFF1E293B)
    val DarkBoardText = Color(0xFFF1F5F9)
    val DarkBoardBorder = Color(0xFF334155)

    val LightSolutionButton = Color.White
    val LightSolutionText = Color(0xFF2A3BB0)
    val LightSolutionBorder = Color(0xFFD5D9E2)
    val DarkSolutionButton = Color(0xFF1E1B4B)
    val DarkSolutionText = Color(0xFFA5B4FC)
    val DarkSolutionBorder = Color(0xFF3730A3)
    val LightDisabledSolution = Color(0xFFF1F5F9)
    val DarkDisabledSolution = Color(0xFF334155)
    val LightSolutionPanel = Color(0xFFF8FAFC)
    val LightSolutionPanelBorder = Color(0xFFE2E8F0)
    val DarkSolutionPanel = Color(0xFF162033)
    val DarkSolutionPanelBorder = Color(0xFF334155)

    val LightRatingBackground = Color(0xFFFEF9C3)
    val LightRatingText = Color(0xFF713F12)
    val LightRatingBorder = Color(0xFFFDE047)
    val DarkRatingBackground = Color(0xFF422006)
    val DarkRatingText = Color(0xFFFDE68A)
    val DarkRatingBorder = Color(0xFF713F12)
}
