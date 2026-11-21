package com.questionbank.app.ui.question

import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.rememberScrollState
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp

/** Lightweight symbol insert bar. It inserts at the end of the active text field; a full equation renderer remains separate. */
@Composable
fun MathSymbolBar(enabled: Boolean = true, onInsert: (String) -> Unit) {
    Row(Modifier.horizontalScroll(rememberScrollState()), horizontalArrangement = Arrangement.spacedBy(2.dp)) {
        listOf("√", "π", "×", "÷", "±", "≤", "≥", "∞", "²", "³", "()", "{}", "∑", "∫").forEach { symbol ->
            TextButton(onClick = { onInsert(symbol) }, enabled = enabled) { Text(symbol) }
        }
    }
}

