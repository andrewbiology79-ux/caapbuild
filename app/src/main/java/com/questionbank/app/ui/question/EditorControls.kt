package com.questionbank.app.ui.question

import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.sp
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.rememberScrollState
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp

/** Lightweight symbol insert bar. It inserts at the end of the active text field; a full equation renderer remains separate. */
@Composable
fun MathSymbolBar(enabled: Boolean = true, onInsert: (String) -> Unit) {
    val tools = listOf(
        "\$ ইনলাইন" to "\$",
        "\$\$ ব্লক" to "\n\$\$\n\n\$\$",
        "ভগ্নাংশ" to "\\frac{}{}",
        "ঘাত" to "^{}",
        "মূল" to "\\sqrt{}",
        "ভেক্টর" to "\\vec{}",
        "হ্যাট" to "\\hat{}",
        "সিগমা" to "\\sum",
        "ইন্টিগ্রাল" to "\\int",
        "√" to "√", "π" to "π", "×" to "×", "÷" to "÷", "±" to "±",
    )
    Row(Modifier.horizontalScroll(rememberScrollState()), horizontalArrangement = Arrangement.spacedBy(7.dp)) {
        tools.forEach { (label, value) ->
            Text(
                label,
                modifier = Modifier
                    .clip(RoundedCornerShape(12.dp))
                    .background(Color.White)
                    .border(1.dp, Color(0xFFD5D9E2), RoundedCornerShape(12.dp))
                    .clickable(enabled = enabled) { onInsert(value) }
                    .padding(horizontal = 14.dp, vertical = 11.dp),
                color = Color(0xFF1B1F2A),
                fontSize = 13.sp,
                fontWeight = FontWeight.SemiBold,
                maxLines = 1,
            )
        }
    }
}

