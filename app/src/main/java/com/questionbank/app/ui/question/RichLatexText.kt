package com.questionbank.app.ui.question

import android.graphics.Typeface
import android.text.SpannableStringBuilder
import android.text.Spanned
import android.text.style.ForegroundColorSpan
import android.util.TypedValue
import android.widget.TextView
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.remember
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.getValue
import androidx.compose.runtime.setValue
import androidx.compose.material3.Text
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.toArgb
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.TextUnit
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.questionbank.app.ui.theme.LocalQuestionBodyTextSize
import androidx.compose.ui.viewinterop.AndroidView
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.foundation.layout.fillMaxWidth
import io.ratex.RaTeXSpan
import io.ratex.RaTeXView
import kotlinx.coroutines.CancellationException

private data class LatexSegment(val content: String, val math: Boolean, val block: Boolean = false)
private sealed interface LatexRenderRun {
    data class Inline(val segments: List<LatexSegment>) : LatexRenderRun
    data class Block(val formula: String) : LatexRenderRun
}

/** Matches the legacy RichText convention: ordinary text + $inline$ + $$display$$. */
private fun tokenizeLatexText(raw: String): List<LatexSegment> {
    if (raw.isEmpty()) return emptyList()
    val matcher = Regex("(\\$\\$[\\s\\S]*?\\$\\$|\\$[^\\$\\n]+?\\$)")
    val result = mutableListOf<LatexSegment>()
    var cursor = 0
    matcher.findAll(raw).forEach { match ->
        if (match.range.first > cursor) result += LatexSegment(raw.substring(cursor, match.range.first), false)
        val token = match.value
        if (token.startsWith("$$") && token.endsWith("$$") && token.length >= 4) {
            result += LatexSegment(token.substring(2, token.length - 2).trim(), true, true)
        } else if (token.startsWith("$") && token.endsWith("$") && token.length >= 2) {
            result += LatexSegment(token.substring(1, token.length - 1).trim(), true, false)
        } else result += LatexSegment(token, false)
        cursor = match.range.last + 1
    }
    if (cursor < raw.length) result += LatexSegment(raw.substring(cursor), false)
    return result
}

private fun buildRenderRuns(segments: List<LatexSegment>): List<LatexRenderRun> {
    val runs = mutableListOf<LatexRenderRun>()
    val inline = mutableListOf<LatexSegment>()
    fun flushInline() {
        if (inline.isNotEmpty()) {
            runs += LatexRenderRun.Inline(inline.toList())
            inline.clear()
        }
    }
    segments.forEach { segment ->
        if (segment.math && segment.block) {
            flushInline()
            runs += LatexRenderRun.Block(segment.content)
        } else inline += segment
    }
    flushInline()
    return runs
}

/**
 * Offline native KaTeX-compatible rich-text renderer. Inline math shares the text baseline; display math is
 * rendered as a centered block. Invalid formulas remain visible in red rather than breaking the screen.
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
        runs.forEachIndexed { index, run ->
            when (run) {
                is LatexRenderRun.Inline -> InlineLatexRun(
                    segments = run.segments,
                    color = color,
                    fontSize = fontSize,
                    lineSpacingMultiplier = lineSpacingMultiplier,
                    fontFamily = fontFamily,
                    fontWeight = fontWeight,
                    key = index,
                )
                is LatexRenderRun.Block -> BlockLatexRun(run.formula, color, fontSize)
            }
        }
    }
}

@Composable
private fun InlineLatexRun(
    segments: List<LatexSegment>,
    color: Color,
    fontSize: TextUnit,
    lineSpacingMultiplier: Float,
    fontFamily: FontFamily?,
    fontWeight: FontWeight,
    key: Int,
) {
    val context = LocalContext.current
    val textSizePx = with(LocalDensity.current) { fontSize.toPx() }
    val textView = remember(key, context) {
        TextView(context).apply {
            setTextColor(color.toArgb())
            setTextSize(TypedValue.COMPLEX_UNIT_PX, textSizePx)
            setLineSpacing(0f, lineSpacingMultiplier)
            includeFontPadding = true
            setTextIsSelectable(true)
        }
    }

    LaunchedEffect(segments, color, fontSize, textSizePx, lineSpacingMultiplier, fontWeight, fontFamily) {
        textView.setTextColor(color.toArgb())
        textView.setTextSize(TypedValue.COMPLEX_UNIT_PX, textSizePx)
        textView.setLineSpacing(0f, lineSpacingMultiplier)
        textView.typeface = Typeface.create(
            when (fontFamily) {
                FontFamily.Serif -> "serif"
                FontFamily.Monospace -> "monospace"
                else -> "sans-serif"
            },
            if (fontWeight >= FontWeight.SemiBold) Typeface.BOLD else Typeface.NORMAL,
        )
        val out = SpannableStringBuilder()
        segments.forEach { segment ->
            if (!segment.math) {
                out.append(segment.content)
            } else {
                val start = out.length
                out.append('\u200B')
                try {
                    val span = RaTeXSpan.create(context = context, latex = segment.content, fontSize = fontSize.value)
                    out.setSpan(span, start, start + 1, Spanned.SPAN_EXCLUSIVE_EXCLUSIVE)
                } catch (cancelled: CancellationException) {
                    throw cancelled
                } catch (_: Exception) {
                    out.replace(start, start + 1, "\$${segment.content}\$")
                    out.setSpan(ForegroundColorSpan(android.graphics.Color.RED), start, out.length, Spanned.SPAN_EXCLUSIVE_EXCLUSIVE)
                } catch (_: LinkageError) {
                    out.replace(start, start + 1, "\$${segment.content}\$")
                    out.setSpan(ForegroundColorSpan(android.graphics.Color.RED), start, out.length, Spanned.SPAN_EXCLUSIVE_EXCLUSIVE)
                }
            }
        }
        textView.text = out
    }

    AndroidView(
        factory = { textView },
        modifier = Modifier.fillMaxWidth(),
        update = { it.setTextColor(color.toArgb()) },
    )
}

@Composable
private fun BlockLatexRun(formula: String, color: Color, fontSize: TextUnit) {
    val context = LocalContext.current
    var renderError by remember(formula) { mutableStateOf(false) }
    if (renderError) {
        Text("\$\$${formula}\$\$", color = Color.Red, fontSize = fontSize)
    } else {
        AndroidView(
            factory = { RaTeXView(context) },
            modifier = Modifier.fillMaxWidth(),
            update = { view ->
                try {
                    view.latex = formula
                    view.fontSize = fontSize.value
                    view.displayMode = true
                    view.color = color.toArgb()
                } catch (_: Exception) {
                    renderError = true
                } catch (_: LinkageError) {
                    renderError = true
                }
            },
        )
    }
}
