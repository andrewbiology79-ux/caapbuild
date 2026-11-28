package com.questionbank.app.ui.question

/**
 * Manual line-break marker for rich text. Writing it anywhere (after a formula, between formulas,
 * or inside a formula) starts the following content on a new line. It is deliberately not a
 * backslash-n (that starts real LaTeX commands such as neq, nu, nabla) and not a double backslash
 * (already used inside aligned and matrix environments). Text without the marker renders as before.
 */
internal const val LATEX_LINE_BREAK = "<br>"

internal data class LatexSegment(
    val content: String,
    val math: Boolean,
    val block: Boolean = false,
    val lineBreak: Boolean = false,
)

internal sealed interface LatexRenderRun {
    /** [lines] holds one entry per visual line; an empty entry is a deliberate blank line. */
    data class Inline(val lines: List<List<LatexSegment>>) : LatexRenderRun
    data class Block(val formula: String) : LatexRenderRun
}

/** Matches the legacy RichText convention: ordinary text + $inline$ + $$display$$. */
internal fun tokenizeLatexText(raw: String): List<LatexSegment> {
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

/** Replaces every [LATEX_LINE_BREAK] (in prose or inside a formula) by an explicit break segment. */
internal fun expandLineBreaks(segments: List<LatexSegment>): List<LatexSegment> {
    val out = mutableListOf<LatexSegment>()
    segments.forEach { seg ->
        if (!seg.content.contains(LATEX_LINE_BREAK)) {
            out += seg
            return@forEach
        }
        seg.content.split(LATEX_LINE_BREAK).forEachIndexed { index, part ->
            if (index > 0) out += LatexSegment("", false, lineBreak = true)
            if (seg.math) {
                val formula = part.trim()
                if (formula.isNotEmpty()) out += LatexSegment(formula, true, seg.block)
            } else if (part.isNotEmpty()) out += LatexSegment(part, false)
        }
    }
    return out
}

private fun isSpacing(seg: LatexSegment): Boolean =
    seg.lineBreak || (!seg.math && seg.content.all { it == ' ' || it == '\t' })

private fun trimLineEdges(line: List<LatexSegment>): List<LatexSegment> {
    val items = line.toMutableList()
    while (items.isNotEmpty() && !items.first().math && items.first().content.trimStart(' ', '\t').isEmpty()) items.removeAt(0)
    while (items.isNotEmpty() && !items.last().math && items.last().content.trimEnd(' ', '\t').isEmpty()) items.removeAt(items.lastIndex)
    if (items.isNotEmpty() && !items.first().math) items[0] = items[0].copy(content = items[0].content.trimStart(' ', '\t'))
    if (items.isNotEmpty() && !items.last().math) items[items.lastIndex] = items.last().copy(content = items.last().content.trimEnd(' ', '\t'))
    return items
}

/**
 * Turns a run of inline segments into visual lines. Without any break marker the whole run is ONE line,
 * identical to the old behaviour. With markers: a marker touching a block formula is ignored (a block
 * already sits on its own line), spaces around a marker are dropped, and trailing blank lines are removed.
 */
internal fun buildInlineLines(inline: List<LatexSegment>, afterBlock: Boolean, beforeBlock: Boolean): List<List<LatexSegment>> {
    if (inline.none { it.lineBreak }) return listOf(inline)
    var items = inline
    if (afterBlock) items = items.dropWhile { isSpacing(it) }
    if (beforeBlock) items = items.dropLastWhile { isSpacing(it) }
    val lines = mutableListOf<MutableList<LatexSegment>>(mutableListOf())
    items.forEach { if (it.lineBreak) lines += mutableListOf<LatexSegment>() else lines.last() += it }
    return lines.map { trimLineEdges(it) }.dropLastWhile { it.isEmpty() }
}

internal fun buildRenderRuns(segments: List<LatexSegment>): List<LatexRenderRun> {
    val expanded = expandLineBreaks(segments)
    val runs = mutableListOf<LatexRenderRun>()
    val inline = mutableListOf<LatexSegment>()
    // True while the most recent run is a block formula (so a break right after it is redundant).
    var previousWasBlock = false
    fun flushInline(beforeBlock: Boolean) {
        if (inline.isEmpty()) return
        val lines = buildInlineLines(inline.toList(), afterBlock = previousWasBlock, beforeBlock = beforeBlock)
        inline.clear()
        if (lines.isNotEmpty()) {
            runs += LatexRenderRun.Inline(lines)
            previousWasBlock = false
        }
    }
    expanded.forEach { segment ->
        if (segment.math && segment.block) {
            flushInline(beforeBlock = true)
            runs += LatexRenderRun.Block(segment.content)
            previousWasBlock = true
        } else inline += segment
    }
    flushInline(beforeBlock = false)
    return runs
}
