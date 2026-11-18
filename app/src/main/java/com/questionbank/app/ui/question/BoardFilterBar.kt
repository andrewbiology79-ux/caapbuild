package com.questionbank.app.ui.question

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.FilterChip
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.RadioButton
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import com.questionbank.app.domain.question.BoardFilter
import com.questionbank.app.domain.question.BoardItem
import com.questionbank.app.domain.question.BoardRules
import com.questionbank.app.ui.format.toBengali
import java.util.Calendar

/** The text of a filter chip: "বোর্ড: সব" / "বোর্ড: ঢাকা", "সাল: সব" / "সাল: ২০১৯" (v0.2.30c-3). Pure, so a JVM unit test can check it. */
fun boardFilterLabel(filter: BoardFilter, boards: List<BoardItem>): String {
    val name = filter.boardCode?.let { code -> boards.firstOrNull { it.code == code }?.displayName ?: code }
    return "বোর্ড: ${name ?: "সব"}"
}

fun yearFilterLabel(filter: BoardFilter): String = "সাল: ${filter.year?.toBengali() ?: "সব"}"

/**
 * Board and year filter under the search box (v0.2.30c-3, closes the open part of UI-05 for boards and years). Two chips open a small
 * dialog each; "ফিল্টার মুছুন" clears both. [onChange] gets the new filter at once; the search runs on every change.
 */
@Composable
fun BoardFilterBar(filter: BoardFilter, boards: List<BoardItem>, onChange: (BoardFilter) -> Unit, modifier: Modifier = Modifier) {
    var pickBoard by rememberSaveable { mutableStateOf(false) }
    var pickYear by rememberSaveable { mutableStateOf(false) }
    Row(
        modifier = modifier
            .fillMaxWidth()
            .background(MaterialTheme.colorScheme.surface)
            .horizontalScroll(rememberScrollState())
            .padding(horizontal = 12.dp, vertical = 4.dp),
        horizontalArrangement = Arrangement.spacedBy(6.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        FilterChip(selected = filter.boardCode != null, onClick = { pickBoard = true }, label = { Text(boardFilterLabel(filter, boards)) })
        FilterChip(selected = filter.year != null, onClick = { pickYear = true }, label = { Text(yearFilterLabel(filter)) })
        if (!filter.isEmpty) {
            TextButton(onClick = { onChange(BoardFilter()) }) { Text("ফিল্টার মুছুন") }
        }
    }
    if (pickBoard) {
        AlertDialog(
            onDismissRequest = { pickBoard = false },
            title = { Text("বোর্ড বাছুন") },
            text = {
                Column(modifier = Modifier.heightIn(max = 420.dp).verticalScroll(rememberScrollState())) {
                    FilterChoiceRow("সব বোর্ড", filter.boardCode == null) {
                        pickBoard = false
                        onChange(filter.copy(boardCode = null))
                    }
                    for (board in boards) {
                        FilterChoiceRow(board.displayName, filter.boardCode == board.code) {
                            pickBoard = false
                            onChange(filter.copy(boardCode = board.code))
                        }
                    }
                }
            },
            confirmButton = {},
            dismissButton = { TextButton(onClick = { pickBoard = false }) { Text("বন্ধ করুন") } },
        )
    }
    if (pickYear) {
        YearFilterDialog(
            current = filter.year,
            onPick = { year ->
                pickYear = false
                onChange(filter.copy(year = year))
            },
            onDismiss = { pickYear = false },
        )
    }
}

@Composable
private fun FilterChoiceRow(text: String, selected: Boolean, onClick: () -> Unit) {
    Row(modifier = Modifier.fillMaxWidth().clickable(onClick = onClick), verticalAlignment = Alignment.CenterVertically) {
        RadioButton(selected = selected, onClick = null)
        Text(text, modifier = Modifier.padding(start = 8.dp, top = 10.dp, bottom = 10.dp))
    }
}

/** Year of the filter: "সব সাল", a year of the window, or "অন্য সাল" typed with Bengali or Latin digits. [onPick] gets null for "all years". */
@Composable
private fun YearFilterDialog(current: Int?, onPick: (Int?) -> Unit, onDismiss: () -> Unit) {
    var otherYear by rememberSaveable { mutableStateOf(false) }
    var typed by rememberSaveable { mutableStateOf("") }
    val window = remember { BoardRules.yearWindow(Calendar.getInstance().get(Calendar.YEAR)) }
    val parsed = if (otherYear) BoardRules.parseYear(typed) else null
    val error = if (otherYear) yearInputError(typed, BoardRules::parseYear) else null
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text("সাল বাছুন") },
        text = {
            Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                FilterChoiceRow("সব সাল", current == null && !otherYear) { onPick(null) }
                Row(modifier = Modifier.horizontalScroll(rememberScrollState()), horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                    for (y in window) {
                        FilterChip(selected = !otherYear && current == y, onClick = { onPick(y) }, label = { Text(y.toBengali()) })
                    }
                    FilterChip(selected = otherYear, onClick = { otherYear = true }, label = { Text("অন্য সাল") })
                }
                if (otherYear) {
                    OutlinedTextField(
                        value = typed,
                        onValueChange = { typed = it.take(4) },
                        label = { Text("সাল লিখুন (যেমন ২০১৫)") },
                        singleLine = true,
                        isError = error != null,
                        supportingText = error?.let { { Text(it) } },
                        modifier = Modifier.fillMaxWidth(),
                    )
                }
            }
        },
        confirmButton = {
            if (otherYear) TextButton(onClick = { parsed?.let { onPick(it) } }, enabled = parsed != null) { Text("ঠিক আছে") }
        },
        dismissButton = { TextButton(onClick = onDismiss) { Text("বন্ধ করুন") } },
    )
}
