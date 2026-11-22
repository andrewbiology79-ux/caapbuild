package com.questionbank.app.ui.question

import android.view.View
import android.view.ViewGroup
import android.widget.FrameLayout
import android.widget.HorizontalScrollView
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.material3.Text
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.toArgb
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.TextUnit
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.viewinterop.AndroidView
import com.questionbank.app.ui.theme.LocalQuestionBodyTextSize
import io.ratex.RaTeXView
import kotlinx.coroutines.CancellationException

/**
 * Offline native KaTeX-compatible rich-text renderer.
 * Every formula is independently horizontally scrollable; the scroll indicators are hidden and
 * the requested font size is passed through unchanged. Ordinary text remains line-wrapped.
 * Writing "<br>" anywhere starts the following content on a new line (see LatexLineBreaks.kt).
 */
@Composable
fun RichLatexText(
    text: String,
    modifier: Modifier = Modifier,
    color: Color = Color(0xFF1B1F2A),
    fontSize: TextUnit = LocalQuestionBodyTextSize.current.sp,
    lineSpacingMultiplier: Float = 1.18f,
    fontFamily: FontFamily? = null,
    fontWeight: FontWeight = FontWeight.Normal,
) {
    val segments = remember(text) { tokenizeLatexText(text) }
    val runs = remember(segments) { buildRenderRuns(segments) }
    Column(modifier = modifier, verticalArrangement = Arrangement.spacedBy(2.dp)) {
        runs.forEach { run ->
            when (run) {
                is LatexRenderRun.Inline -> InlineLatexRun(
                    lines = run.lines,
                    color = color,
                    fontSize = fontSize,
                    lineSpacingMultiplier = lineSpacingMultiplier,
                    fontFamily = fontFamily,
                    fontWeight = fontWeight,
                )
                is LatexRenderRun.Block -> ScrollableLatexFormula(
                    formula = run.formula,
                    color = color,
                    fontSize = fontSize,
                    displayMode = true,
                    modifier = Modifier.fillMaxWidth(),
                )
            }
        }
    }
}

@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun InlineLatexRun(
    lines: List<List<LatexSegment>>,
    color: Color,
    fontSize: TextUnit,
    lineSpacingMultiplier: Float,
    fontFamily: FontFamily?,
    fontWeight: FontWeight,
) {
    val density = LocalDensity.current
    // One FlowRow per visual line: a "<br>" always starts a fresh row below the previous one.
    Column(modifier = Modifier.fillMaxWidth()) {
        lines.forEach { line ->
            if (line.isEmpty()) {
                // Deliberate blank line (two "<br>" in a row).
                Spacer(Modifier.fillMaxWidth().height(with(density) { (fontSize * lineSpacingMultiplier).toDp() }))
            } else {
                // FlowRow lets normal prose wrap while keeping each math expression as its own scroll target.
                FlowRow(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.spacedBy(0.dp),
                    verticalArrangement = Arrangement.spacedBy(0.dp),
                ) {
                    line.forEach { segment ->
                        if (segment.math) {
                            ScrollableLatexFormula(
                                formula = segment.content,
                                color = color,
                                fontSize = fontSize,
                                displayMode = false,
                                modifier = Modifier.align(Alignment.CenterVertically),
                            )
                        } else if (segment.content.isNotEmpty()) {
                            Text(
                                text = segment.content,
                                color = color,
                                fontSize = fontSize,
                                lineHeight = fontSize * lineSpacingMultiplier,
                                fontFamily = fontFamily,
                                fontWeight = fontWeight,
                            )
                        }
                    }
                }
            }
        }
    }
}

/**
 * RaTeX is hosted inside a native HorizontalScrollView so Android handles swipe gestures reliably.
 * Both native scrollbars are disabled; the formula's fontSize is never scaled to fit the viewport.
 */
@Composable
private fun ScrollableLatexFormula(
    formula: String,
    color: Color,
    fontSize: TextUnit,
    displayMode: Boolean,
    modifier: Modifier = Modifier,
) {
    val context = LocalContext.current
    val renderKey = remember(formula, fontSize, displayMode, color) {
        listOf(formula, fontSize.value, displayMode, color.toArgb())
    }
    var renderError by remember(formula, displayMode) { mutableStateOf(false) }

    if (renderError) {
        val fallback = if (displayMode) "\$\$${formula}\$\$" else "\$${formula}\$"
        Text(
            text = fallback,
            color = Color.Red,
            fontSize = fontSize,
            modifier = modifier.horizontalScroll(rememberScrollState()),
        )
    } else {
        AndroidView(
            factory = {
                HorizontalScrollView(context).apply {
                    isHorizontalScrollBarEnabled = false
                    isVerticalScrollBarEnabled = false
                    overScrollMode = View.OVER_SCROLL_NEVER
                    isFillViewport = false
                    clipToPadding = true
                    setPadding(0, 0, 0, 0)
                    addView(
                        RaTeXView(context),
                        FrameLayout.LayoutParams(
                            ViewGroup.LayoutParams.WRAP_CONTENT,
                            ViewGroup.LayoutParams.WRAP_CONTENT,
                        ),
                    )
                }
            },
            modifier = modifier.heightIn(min = 1.dp),
            update = { scrollView ->
                // A changed formula/configuration starts at its left edge, not the previous offset.
                if (scrollView.tag != renderKey) {
                    scrollView.tag = renderKey
                    scrollView.scrollTo(0, 0)
                }
                val formulaView = scrollView.getChildAt(0) as? RaTeXView
                if (formulaView != null) {
                    try {
                        formulaView.latex = formula
                        formulaView.fontSize = fontSize.value
                        formulaView.displayMode = displayMode
                        formulaView.color = color.toArgb()
                        formulaView.requestLayout()
                        scrollView.requestLayout()
                        // Explicitly keep indicators hidden after updates as well.
                        scrollView.isHorizontalScrollBarEnabled = false
                        scrollView.isVerticalScrollBarEnabled = false
                    } catch (cancelled: CancellationException) {
                        throw cancelled
                    } catch (_: Exception) {
                        renderError = true
                    } catch (_: LinkageError) {
                        renderError = true
                    }
                }
            },
        )
    }
}
