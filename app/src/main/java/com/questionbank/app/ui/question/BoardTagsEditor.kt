package com.questionbank.app.ui.question

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
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
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.draw.clip
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.questionbank.app.domain.question.AddBoardResult
import com.questionbank.app.domain.question.BoardItem
import com.questionbank.app.domain.question.BoardRules
import com.questionbank.app.domain.question.BoardTag
import com.questionbank.app.ui.format.toBengali
import kotlinx.coroutines.launch
import java.util.Calendar

/** Read-only chips "ঢাকা · ২০১৯" in one line that scrolls sideways (used on the card). */
@Composable
fun TagChipRow(tags: List<BoardTag>, boards: List<BoardItem>, modifier: Modifier = Modifier) {
    Row(
        modifier = modifier.horizontalScroll(rememberScrollState()),
        horizontalArrangement = Arrangement.spacedBy(6.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        for (tag in tags) {
            Text(
                tagText(tag, boards),
                modifier = Modifier
                    .background(if (MaterialTheme.colorScheme.surface == androidx.compose.ui.graphics.Color.White) androidx.compose.ui.graphics.Color.White else MaterialTheme.colorScheme.surface, RoundedCornerShape(6.dp))
                    .border(1.dp, MaterialTheme.colorScheme.outline, RoundedCornerShape(6.dp))
                    .padding(horizontal = 8.dp, vertical = 3.dp),
                color = MaterialTheme.colorScheme.onSurface,
                fontSize = 10.sp,
            )
        }
    }
}

/**
 * Boards and years of ONE block (the stimulus or one question), v0.2.30c-2, UI-08: the chosen tags as chips (tap a chip to remove it)
 * and a button that opens the picker. [onChange] gets the full wanted list; the same tag twice is never added.
 * [onAddBoard] adds a custom board to the catalog (the picker's "নতুন বোর্ড" dialog calls it).
 */
@Composable
fun BoardTagsEditor(
    title: String,
    tags: List<BoardTag>,
    boards: List<BoardItem>,
    enabled: Boolean,
    onChange: (List<BoardTag>) -> Unit,
    onAddBoard: suspend (String, String) -> AddBoardResult,
    modifier: Modifier = Modifier,
) {
    var picking by rememberSaveable { mutableStateOf(false) }
    val chipShape = RoundedCornerShape(7.dp)
    Column(modifier = modifier.fillMaxWidth(), verticalArrangement = Arrangement.spacedBy(4.dp)) {
        Text(title, color = Color(0xFF64748B), fontSize = 10.sp, fontWeight = androidx.compose.ui.text.font.FontWeight.SemiBold)
        Row(
            modifier = Modifier.horizontalScroll(rememberScrollState()),
            horizontalArrangement = Arrangement.spacedBy(6.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            for (tag in tags) {
                Row(
                    modifier = Modifier
                        .clip(chipShape)
                        .background(Color(0xFFEEF2FF))
                        .border(1.dp, Color(0xFFD5DDFE), chipShape)
                        .clickable(enabled = enabled) { onChange(BoardRules.removeTag(tags, tag)) }
                        .padding(start = 8.dp, end = 6.dp, top = 5.dp, bottom = 5.dp),
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(5.dp),
                ) {
                    Text(tagText(tag, boards), color = Color(0xFF2A3BB0), fontSize = 10.sp, fontWeight = androidx.compose.ui.text.font.FontWeight.SemiBold)
                    Text("×", color = Color(0xFF64748B), fontSize = 11.sp)
                }
            }
            Row(
                modifier = Modifier
                    .clip(chipShape)
                    .background(Color.White)
                    .border(1.dp, Color(0xFFD5D9E2), chipShape)
                    .clickable(enabled = enabled && !BoardRules.isFull(tags)) { picking = true }
                    .padding(horizontal = 9.dp, vertical = 5.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Text(if (tags.isEmpty()) "+ বোর্ড ও সাল" else "+ যোগ করুন", color = Color(0xFF3B4FD8), fontSize = 10.sp, fontWeight = androidx.compose.ui.text.font.FontWeight.Bold)
            }
        }
        if (BoardRules.isFull(tags)) {
            Text("সর্বোচ্চ ${BoardRules.MAX_TAGS_PER_BLOCK.toBengali()}টি বোর্ড-সাল দেওয়া যায়।", style = MaterialTheme.typography.bodySmall)
        }
    }
    if (picking) {
        BoardYearDialog(
            boards = boards.filter { !it.isArchived },
            existing = tags,
            onAddBoard = onAddBoard,
            onConfirm = { tag ->
                picking = false
                onChange(BoardRules.addTag(tags, tag))
            },
            onDismiss = { picking = false },
        )
    }
}



/**
 * Compact CAAP-style board/year control for the stimulus and question toolbar rows.
 * The selected tags remain removable chips beside the board selector rather than a separate labelled form block.
 */
@Composable
fun BoardTagsInlineControl(
    tags: List<BoardTag>,
    boards: List<BoardItem>,
    enabled: Boolean,
    onChange: (List<BoardTag>) -> Unit,
    onAddBoard: suspend (String, String) -> AddBoardResult,
    modifier: Modifier = Modifier,
) {
    var picking by rememberSaveable { mutableStateOf(false) }
    Row(
        modifier = modifier.horizontalScroll(rememberScrollState()),
        horizontalArrangement = Arrangement.spacedBy(5.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Row(
            modifier = Modifier
                .clip(RoundedCornerShape(9.dp))
                .background(Color.White)
                .border(1.dp, Color(0xFFD5D9E2), RoundedCornerShape(9.dp))
                .clickable(enabled = enabled) { picking = true }
                .padding(horizontal = 10.dp, vertical = 8.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(5.dp),
        ) {
            Text("বোর্ড", color = Color(0xFF2A3BB0), fontSize = 12.sp, fontWeight = androidx.compose.ui.text.font.FontWeight.SemiBold)
            Text("⌄", color = Color(0xFF64748B), fontSize = 13.sp)
        }
        tags.forEach { tag ->
            Row(
                modifier = Modifier
                    .clip(RoundedCornerShape(9.dp))
                    .background(Color(0xFFEEF2FF))
                    .border(1.dp, Color(0xFFD5DDFE), RoundedCornerShape(9.dp))
                    .clickable(enabled = enabled) { onChange(BoardRules.removeTag(tags, tag)) }
                    .padding(start = 9.dp, end = 7.dp, top = 7.dp, bottom = 7.dp),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(5.dp),
            ) {
                Text(tagText(tag, boards), color = Color(0xFF2A3BB0), fontSize = 11.sp, fontWeight = androidx.compose.ui.text.font.FontWeight.SemiBold)
                Text("×", color = Color(0xFF64748B), fontSize = 14.sp)
            }
        }
    }
    if (picking) {
        BoardYearDialog(
            boards = boards.filter { !it.isArchived },
            existing = tags,
            onAddBoard = onAddBoard,
            onConfirm = { tag ->
                picking = false
                onChange(BoardRules.addTag(tags, tag))
            },
            onDismiss = { picking = false },
        )
    }
}

/** Picker: choose one board, then a year from the window (recent years) or type another year, then "যোগ করুন". */
@Composable
private fun BoardYearDialog(
    boards: List<BoardItem>,
    existing: List<BoardTag>,
    onAddBoard: suspend (String, String) -> AddBoardResult,
    onConfirm: (BoardTag) -> Unit,
    onDismiss: () -> Unit,
) {
    var selectedCode by rememberSaveable { mutableStateOf<String?>(null) }
    var pickedYear by rememberSaveable { mutableStateOf<Int?>(null) }
    var otherYear by rememberSaveable { mutableStateOf(false) }
    var typedYear by rememberSaveable { mutableStateOf("") }
    var newBoard by rememberSaveable { mutableStateOf(false) }
    val window = remember { BoardRules.yearWindow(Calendar.getInstance().get(Calendar.YEAR)) }

    val year: Int? = if (otherYear) BoardRules.parseYear(typedYear) else pickedYear
    val tag: BoardTag? = if (selectedCode != null && year != null) BoardTag(selectedCode!!, year) else null
    val already = tag != null && tag in existing
    val yearError = if (otherYear) yearInputError(typedYear, BoardRules::parseYear) else null

    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text("বোর্ড ও সাল") },
        text = {
            Column(
                modifier = Modifier.heightIn(max = 460.dp).verticalScroll(rememberScrollState()),
                verticalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                Text("বোর্ড", style = MaterialTheme.typography.labelLarge)
                for (board in boards) {
                    Row(
                        modifier = Modifier.fillMaxWidth().clickable { selectedCode = board.code },
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        RadioButton(selected = selectedCode == board.code, onClick = null)
                        Text(board.displayName, modifier = Modifier.padding(start = 8.dp, top = 8.dp, bottom = 8.dp))
                    }
                }
                TextButton(onClick = { newBoard = true }) { Text("+ নতুন বোর্ড") }

                Text("সাল", style = MaterialTheme.typography.labelLarge)
                Row(modifier = Modifier.horizontalScroll(rememberScrollState()), horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                    for (y in window) {
                        FilterChip(
                            selected = !otherYear && pickedYear == y,
                            onClick = {
                                otherYear = false
                                pickedYear = y
                            },
                            label = { Text(y.toBengali()) },
                        )
                    }
                    FilterChip(selected = otherYear, onClick = { otherYear = true }, label = { Text("অন্য সাল") })
                }
                if (otherYear) {
                    OutlinedTextField(
                        value = typedYear,
                        onValueChange = { typedYear = it.take(4) },
                        label = { Text("সাল লিখুন (যেমন ২০১৫)") },
                        singleLine = true,
                        isError = yearError != null,
                        supportingText = yearError?.let { { Text(it) } },
                        modifier = Modifier.fillMaxWidth(),
                    )
                }
                if (already) {
                    Text("এই বোর্ড ও সাল আগেই দেওয়া আছে।", color = MaterialTheme.colorScheme.error, style = MaterialTheme.typography.bodySmall)
                }
            }
        },
        confirmButton = {
            TextButton(onClick = { tag?.let(onConfirm) }, enabled = tag != null && !already) { Text("যোগ করুন") }
        },
        dismissButton = { TextButton(onClick = onDismiss) { Text("বাতিল") } },
    )
    if (newBoard) {
        NewBoardDialog(
            onAddBoard = onAddBoard,
            onAdded = { code ->
                selectedCode = code
                newBoard = false
            },
            onDismiss = { newBoard = false },
        )
    }
}

private fun addBoardMessage(result: AddBoardResult): String? = when (result) {
    is AddBoardResult.Added -> null
    AddBoardResult.BadCode -> "কোড শুধু ইংরেজি অক্ষর (A-Z), সংখ্যা (0-9) ও _ দিয়ে হবে, সর্বোচ্চ ${BoardRules.MAX_CODE_LENGTH.toBengali()} অক্ষর।"
    AddBoardResult.BadName -> "নাম লিখুন (সর্বোচ্চ ${BoardRules.MAX_NAME_LENGTH.toBengali()} অক্ষর)।"
    AddBoardResult.CodeExists -> "এই কোডে বোর্ড আগেই আছে।"
    AddBoardResult.NameExists -> "এই নামে বোর্ড আগেই আছে।"
    is AddBoardResult.Failed -> "বোর্ড যোগ করা যায়নি; আবার চেষ্টা করুন।"
}

/** "নতুন বোর্ড" dialog: a code (A-Z, 0-9, _) and a name. [onAdded] gets the code of the new board. */
@Composable
private fun NewBoardDialog(
    onAddBoard: suspend (String, String) -> AddBoardResult,
    onAdded: (String) -> Unit,
    onDismiss: () -> Unit,
) {
    var code by rememberSaveable { mutableStateOf("") }
    var name by rememberSaveable { mutableStateOf("") }
    var message by rememberSaveable { mutableStateOf<String?>(null) }
    var busy by rememberSaveable { mutableStateOf(false) }
    val scope = rememberCoroutineScope()
    AlertDialog(
        onDismissRequest = { if (!busy) onDismiss() },
        title = { Text("নতুন বোর্ড") },
        text = {
            Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                OutlinedTextField(
                    value = code,
                    onValueChange = { code = it.take(BoardRules.MAX_CODE_LENGTH + 5); message = null },
                    label = { Text("কোড (ইংরেজি, যেমন BARISAL2)") },
                    singleLine = true,
                    enabled = !busy,
                    modifier = Modifier.fillMaxWidth(),
                )
                OutlinedTextField(
                    value = name,
                    onValueChange = { name = it.take(BoardRules.MAX_NAME_LENGTH + 10); message = null },
                    label = { Text("বোর্ডের নাম") },
                    singleLine = true,
                    enabled = !busy,
                    modifier = Modifier.fillMaxWidth(),
                )
                message?.let { Text(it, color = MaterialTheme.colorScheme.error, style = MaterialTheme.typography.bodySmall) }
            }
        },
        confirmButton = {
            TextButton(
                enabled = !busy,
                onClick = {
                    busy = true
                    scope.launch {
                        val result = onAddBoard(code, name)
                        busy = false
                        if (result is AddBoardResult.Added) onAdded(result.board.code) else message = addBoardMessage(result)
                    }
                },
            ) { Text(if (busy) "যোগ হচ্ছে…" else "যোগ করুন") }
        },
        dismissButton = { TextButton(onClick = onDismiss, enabled = !busy) { Text("বাতিল") } },
    )
}
