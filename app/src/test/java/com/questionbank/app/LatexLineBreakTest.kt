package com.questionbank.app

import com.questionbank.app.ui.question.LatexRenderRun
import com.questionbank.app.ui.question.buildRenderRuns
import com.questionbank.app.ui.question.tokenizeLatexText
import org.junit.Assert.assertEquals
import org.junit.Test

/** The "<br>" manual line break for RichLatexText (pure logic; no Compose). */
class LatexLineBreakTest {
    /** One string per visual row: M(formula) / T(text) pieces joined by "|", or BLOCK(formula). */
    private fun shape(text: String): List<String> = buildRenderRuns(tokenizeLatexText(text)).flatMap { run ->
        when (run) {
            is LatexRenderRun.Block -> listOf("BLOCK(${run.formula})")
            is LatexRenderRun.Inline -> run.lines.map { line ->
                line.joinToString("|") { if (it.math) "M(${it.content})" else "T(${it.content})" }
            }
        }
    }

    @Test fun textWithoutMarkerStaysOneLineAsBefore() {
        assertEquals(listOf("T(ক )|M(x)|T( খ)"), shape("ক \$x\$ খ"))
    }

    @Test fun emptyTextHasNoRuns() {
        assertEquals(emptyList<String>(), shape(""))
    }

    @Test fun ownerExampleBecomesThreeRowsOneBelowAnother() {
        val text = "\$v_2 = \\frac{2.1889 \\times 10^6}{n}\$ <br> " +
            "\$= \\frac{2.1889 \\times 10^6}{2}\$ <br> " +
            "\$= 1.09445 \\times 10^6\\ \\text{ms}^{-1}\$"
        assertEquals(
            listOf(
                "M(v_2 = \\frac{2.1889 \\times 10^6}{n})",
                "M(= \\frac{2.1889 \\times 10^6}{2})",
                "M(= 1.09445 \\times 10^6\\ \\text{ms}^{-1})",
            ),
            shape(text),
        )
    }

    @Test fun markerInsideAFormulaSplitsItIntoTwoRows() {
        assertEquals(listOf("M(a = b)", "M(= c)"), shape("\$a = b<br>= c\$"))
    }

    @Test fun markerBetweenProseAndFormula() {
        assertEquals(listOf("T(A )|M(x)", "T(B)"), shape("A \$x\$<br>B"))
    }

    @Test fun twoMarkersInARowLeaveOneBlankRow() {
        assertEquals(listOf("M(a)", "", "M(b)"), shape("\$a\$<br><br>\$b\$"))
    }

    @Test fun markerNextToABlockFormulaIsRedundantAndIgnored() {
        assertEquals(listOf("BLOCK(a)", "T(text)"), shape("\$\$a\$\$ <br> text"))
        assertEquals(listOf("T(text)", "BLOCK(a)"), shape("text <br> \$\$a\$\$"))
        assertEquals(listOf("BLOCK(a)", "BLOCK(b)"), shape("\$\$a<br>b\$\$"))
    }

    @Test fun trailingMarkerAddsNoBlankRow() {
        assertEquals(listOf("M(a)"), shape("\$a\$ <br>"))
    }

    @Test fun latexCommandsAndDoubleBackslashAreNeverTreatedAsBreaks() {
        assertEquals(listOf("M(a \\neq b \\nu \\nabla)"), shape("\$a \\neq b \\nu \\nabla\$"))
        assertEquals(
            listOf("BLOCK(\\begin{aligned}a&=1\\\\b&=2\\end{aligned})"),
            shape("\$\$\\begin{aligned}a&=1\\\\b&=2\\end{aligned}\$\$"),
        )
    }

    @Test fun plainEnterBehavesExactlyAsBefore() {
        assertEquals(listOf("M(a)|T(\n)|M(b)"), shape("\$a\$\n\$b\$"))
    }
}
