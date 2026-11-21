package com.questionbank.app.ui.question

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.grid.GridCells
import androidx.compose.foundation.lazy.grid.LazyVerticalGrid
import androidx.compose.foundation.lazy.grid.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardCapitalization
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.window.Dialog
import androidx.compose.ui.window.DialogProperties
import com.questionbank.app.domain.question.AddBoardResult
import com.questionbank.app.domain.question.BoardItem
import com.questionbank.app.domain.question.BoardRules
import com.questionbank.app.domain.question.BoardTag
import com.questionbank.app.domain.question.groupBoardYears
import com.questionbank.app.ui.format.toBengali
import kotlinx.coroutines.launch
import java.util.Calendar

private val LegacyBlue = Color(0xFF3B4FD8)
private val LegacyBlueDark = Color(0xFF2A3BB0)
private val LegacyBorder = Color(0xFFD5D9E2)
private val LegacyMuted = Color(0xFF64748B)

/** Read-only compact chips matching the legacy notation, e.g. DB'23,25. */
@Suppress("UNUSED_PARAMETER")
@Composable
fun TagChipRow(tags: List<BoardTag>, boards: List<BoardItem>, modifier: Modifier = Modifier) {
    Row(
        modifier = modifier.horizontalScroll(rememberScrollState()),
        horizontalArrangement = Arrangement.spacedBy(6.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        for (group in groupBoardYears(tags)) {
            val yearsText = group.years.joinToString(separator = ",") { it.toString().takeLast(2) }
            Text(
                "${group.boardCode}'$yearsText",
                modifier = Modifier
                    .background(MaterialTheme.colorScheme.secondaryContainer, RoundedCornerShape(8.dp))
                    .padding(horizontal = 8.dp, vertical = 2.dp),
                color = MaterialTheme.colorScheme.onSecondaryContainer,
                fontSize = 11.sp,
            )
        }
    }
}

/** Board and year tags for one section. The picker follows the legacy flow: compact board menu -> year window. */
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
    Column(modifier = modifier.fillMaxWidth(), verticalArrangement = Arrangement.spacedBy(5.dp)) {
        Row(
            modifier = Modifier.fillMaxWidth(),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.SpaceBetween,
        ) {
            Text(title, style = MaterialTheme.typography.labelLarge, color = MaterialTheme.colorScheme.onSurface)
            BoardPickerButton(
                tags = tags,
                boards = boards,
                enabled = enabled,
                onAddBoard = onAddBoard,
                onSelect = { onChange(BoardRules.addTag(tags, it)) },
            )
        }
        if (tags.isNotEmpty()) {
            Row(
                modifier = Modifier.fillMaxWidth().horizontalScroll(rememberScrollState()),
                horizontalArrangement = Arrangement.spacedBy(5.dp),
            ) {
                groupBoardYears(tags).forEach { group ->
                    Row(
                        modifier = Modifier
                            .clip(RoundedCornerShape(7.dp))
                            .background(Color(0xFFEEF2FF))
                            .border(1.dp, LegacyBorder, RoundedCornerShape(7.dp))
                            .padding(start = 7.dp, end = 4.dp, top = 3.dp, bottom = 3.dp),
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(2.dp),
                    ) {
                        // Match the old app's exact board-chip notation: DB'23,25 (apostrophe once per board).
                        Text("${group.boardCode}'", color = LegacyBlueDark, fontSize = 10.sp, fontWeight = FontWeight.SemiBold)
                        group.years.forEachIndexed { index, year ->
                            if (index > 0) Text(",", color = LegacyBlueDark, fontSize = 10.sp, fontWeight = FontWeight.SemiBold)
                            Row(
                                modifier = Modifier
                                    .clip(RoundedCornerShape(4.dp))
                                    .clickable(enabled = enabled) { onChange(BoardRules.removeTag(tags, BoardTag(group.boardCode, year))) }
                                    .padding(horizontal = 1.dp),
                                verticalAlignment = Alignment.CenterVertically,
                                horizontalArrangement = Arrangement.spacedBy(1.dp),
                            ) {
                                Text(year.toString().takeLast(2), color = LegacyBlueDark, fontSize = 10.sp, fontWeight = FontWeight.SemiBold)
                                Text("×", color = LegacyMuted, fontSize = 11.sp, fontWeight = FontWeight.Bold)
                            }
                        }
                    }
                }
            }
        }
        if (BoardRules.isFull(tags)) {
            Text("সর্বোচ্চ ${BoardRules.MAX_TAGS_PER_BLOCK.toBengali()}টি বোর্ড-সাল দেওয়া যায়।", style = MaterialTheme.typography.bodySmall, color = LegacyMuted)
        }
    }
}

/** The compact 54dp board selector used beside the stimulus/question controls in the old editor. */
@Composable
fun EdBoardPill(
    tags: List<BoardTag>,
    boards: List<BoardItem>,
    enabled: Boolean,
    onChange: (List<BoardTag>) -> Unit,
    onAddBoard: suspend (String, String) -> AddBoardResult,
) {
    BoardPickerButton(
        tags = tags,
        boards = boards,
        enabled = enabled,
        onAddBoard = onAddBoard,
        onSelect = { onChange(BoardRules.addTag(tags, it)) },
    )
}

@Composable
private fun BoardPickerButton(
    tags: List<BoardTag>,
    boards: List<BoardItem>,
    enabled: Boolean,
    onAddBoard: suspend (String, String) -> AddBoardResult,
    onSelect: (BoardTag) -> Unit,
) {
    var menuOpen by remember { mutableStateOf(false) }
    var yearBoard by remember { mutableStateOf<BoardItem?>(null) }
    var addBoardOpen by remember { mutableStateOf(false) }
    val availableBoards = boards.filter { !it.isArchived }
    val canAdd = enabled && !BoardRules.isFull(tags)

    Box {
        val shape = RoundedCornerShape(6.dp)
        Row(
            modifier = Modifier
                .width(54.dp)
                .height(32.dp)
                .clip(shape)
                .background(Color.White)
                .border(1.dp, LegacyBorder, shape)
                .clickable(enabled = canAdd) { menuOpen = true }
                .padding(horizontal = 5.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.Center,
        ) {
            Text("বোর্ড", color = LegacyBlueDark, fontSize = 10.sp, fontWeight = FontWeight.Bold, maxLines = 1)
            EdIconGlyph(EdIcon.CHEVRON, LegacyBlueDark, Modifier.size(11.dp))
        }
        DropdownMenu(expanded = menuOpen, onDismissRequest = { menuOpen = false }) {
            availableBoards.forEach { board ->
                DropdownMenuItem(
                    text = { Text(board.displayName, fontSize = 13.sp) },
                    onClick = { menuOpen = false; yearBoard = board },
                )
            }
            if (availableBoards.isNotEmpty()) {
                HorizontalDivider(color = LegacyBorder)
            }
            DropdownMenuItem(
                text = { Text("+ নতুন বোর্ড যুক্ত করুন", color = LegacyBlueDark, fontWeight = FontWeight.SemiBold, fontSize = 13.sp) },
                onClick = { menuOpen = false; addBoardOpen = true },
            )
        }
    }

    yearBoard?.let { board ->
        BoardYearWindow(
            board = board,
            addedYears = tags.filter { it.boardCode == board.code }.map { it.year },
            onPickYear = { year ->
                onSelect(BoardTag(board.code, year))
                yearBoard = null
            },
            onClose = { yearBoard = null },
        )
    }
    if (addBoardOpen) {
        NewBoardWindow(
            onAddBoard = onAddBoard,
            onAdded = { board ->
                addBoardOpen = false
                yearBoard = board
            },
            onClose = { addBoardOpen = false },
        )
    }
}

/** Legacy year-picker card: year grid in four columns, then a manual year input and blue add button. */
@Composable
private fun BoardYearWindow(
    board: BoardItem,
    addedYears: List<Int>,
    onPickYear: (Int) -> Unit,
    onClose: () -> Unit,
) {
    var manualYear by rememberSaveable(board.code) { mutableStateOf("") }
    var error by rememberSaveable(board.code) { mutableStateOf<String?>(null) }
    val currentYear = remember { Calendar.getInstance().get(Calendar.YEAR) }
    val years = remember(currentYear) { (currentYear downTo 2010).toList() }
    val existing = remember(addedYears) { addedYears.toSet() }

    Dialog(onDismissRequest = onClose, properties = DialogProperties(usePlatformDefaultWidth = false)) {
        Surface(
            modifier = Modifier.fillMaxWidth().padding(horizontal = 20.dp),
            shape = RoundedCornerShape(16.dp),
            color = Color.White,
            shadowElevation = 18.dp,
        ) {
            Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
                Row(verticalAlignment = Alignment.Top, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    Column(Modifier.weight(1f)) {
                        Text("সাল বাছুন", color = LegacyBlueDark, fontSize = 14.sp, fontWeight = FontWeight.Bold)
                        Text(board.displayName, color = LegacyMuted, fontSize = 11.sp, maxLines = 1)
                    }
                    Box(
                        Modifier.size(36.dp).clip(CircleShape).clickable(onClick = onClose),
                        contentAlignment = Alignment.Center,
                    ) { Text("×", color = LegacyMuted, fontSize = 22.sp) }
                }
                LazyVerticalGrid(
                    columns = GridCells.Fixed(4),
                    modifier = Modifier.fillMaxWidth().heightIn(max = 224.dp),
                    horizontalArrangement = Arrangement.spacedBy(6.dp),
                    verticalArrangement = Arrangement.spacedBy(6.dp),
                ) {
                    items(years) { year ->
                        val already = year in existing
                        val shape = RoundedCornerShape(11.dp)
                        Row(
                            modifier = Modifier
                                .fillMaxWidth()
                                .height(44.dp)
                                .clip(shape)
                                .background(if (already) Color(0xFFEEF2FF) else Color.White)
                                .border(1.dp, if (already) Color(0xFFC7D2FE) else LegacyBorder, shape)
                                .clickable(enabled = !already) { onPickYear(year) },
                            verticalAlignment = Alignment.CenterVertically,
                            horizontalArrangement = Arrangement.Center,
                        ) {
                            if (already) Text("✓ ", color = LegacyBlue, fontSize = 12.sp, fontWeight = FontWeight.Bold)
                            Text(year.toBengali(), color = if (already) Color(0xFF94A3B8) else Color(0xFF1B1F2A), fontSize = 12.sp, fontWeight = FontWeight.SemiBold)
                        }
                    }
                }
                HorizontalDivider(color = Color(0xFFF2F4F8))
                Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    BoardTextInput(
                        value = manualYear,
                        onValueChange = { manualYear = it.filter { ch -> ch.isDigit() }.take(4); error = null },
                        placeholder = "অন্য সাল (যেমন: ২০০৯)",
                        modifier = Modifier.weight(1f),
                        keyboardType = KeyboardType.Number,
                    )
                    BlueActionButton(text = "+ যোগ", enabled = manualYear.isNotBlank()) {
                        val year = BoardRules.parseYear(manualYear)
                        when {
                            year == null || year !in 1990..2099 -> error = "সাল ১৯৯০–২০৯৯-এর মধ্যে চার অঙ্কের হতে হবে।"
                            year in existing -> error = "এই বোর্ড ও সাল আগেই যোগ করা আছে।"
                            else -> onPickYear(year)
                        }
                    }
                }
                error?.let { Text(it, color = Color(0xFFDC2626), fontSize = 11.sp) }
            }
        }
    }
}

/** Legacy add-board card: code and name side-by-side, followed by equal Save / Cancel buttons. */
@Composable
private fun NewBoardWindow(
    onAddBoard: suspend (String, String) -> AddBoardResult,
    onAdded: (BoardItem) -> Unit,
    onClose: () -> Unit,
) {
    var code by rememberSaveable { mutableStateOf("") }
    var name by rememberSaveable { mutableStateOf("") }
    var error by rememberSaveable { mutableStateOf<String?>(null) }
    var busy by rememberSaveable { mutableStateOf(false) }
    val scope = rememberCoroutineScope()

    Dialog(onDismissRequest = { if (!busy) onClose() }, properties = DialogProperties(usePlatformDefaultWidth = false)) {
        Surface(
            modifier = Modifier.fillMaxWidth().padding(horizontal = 20.dp),
            shape = RoundedCornerShape(16.dp),
            color = Color.White,
            shadowElevation = 18.dp,
        ) {
            Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
                Text("নতুন বোর্ড যুক্ত করুন", color = LegacyBlueDark, fontSize = 14.sp, fontWeight = FontWeight.Bold)
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    BoardTextInput(
                        value = code,
                        onValueChange = { code = it.take(BoardRules.MAX_CODE_LENGTH + 5).uppercase(); error = null },
                        placeholder = "কোড (যেমন: CTB)",
                        modifier = Modifier.width(112.dp),
                        keyboardType = KeyboardType.Ascii,
                        capitalization = KeyboardCapitalization.Characters,
                    )
                    BoardTextInput(
                        value = name,
                        onValueChange = { name = it.take(BoardRules.MAX_NAME_LENGTH + 10); error = null },
                        placeholder = "নাম (যেমন: চট্টগ্রাম বোর্ড)",
                        modifier = Modifier.weight(1f),
                    )
                }
                error?.let { Text(it, color = Color(0xFFDC2626), fontSize = 11.sp) }
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    BlueActionButton(text = if (busy) "সংরক্ষণ হচ্ছে…" else "সংরক্ষণ", enabled = !busy, modifier = Modifier.weight(1f)) {
                        busy = true
                        scope.launch {
                            when (val result = onAddBoard(code, name)) {
                                is AddBoardResult.Added -> onAdded(result.board)
                                else -> error = addBoardMessage(result)
                            }
                            busy = false
                        }
                    }
                    WhiteActionButton(text = "বাতিল", enabled = !busy, modifier = Modifier.weight(1f), onClick = onClose)
                }
            }
        }
    }
}

@Composable
private fun BoardTextInput(
    value: String,
    onValueChange: (String) -> Unit,
    placeholder: String,
    modifier: Modifier = Modifier,
    keyboardType: KeyboardType = KeyboardType.Text,
    capitalization: KeyboardCapitalization = KeyboardCapitalization.None,
) {
    val shape = RoundedCornerShape(12.dp)
    BasicTextField(
        value = value,
        onValueChange = onValueChange,
        singleLine = true,
        keyboardOptions = KeyboardOptions(keyboardType = keyboardType, capitalization = capitalization),
        textStyle = MaterialTheme.typography.bodySmall.copy(color = Color(0xFF1B1F2A), fontSize = 12.sp),
        modifier = modifier.height(44.dp).clip(shape).background(Color.White).border(1.dp, LegacyBorder, shape)
            .padding(horizontal = 12.dp, vertical = 13.dp),
        decorationBox = { inner ->
            Box {
                if (value.isEmpty()) Text(placeholder, color = LegacyMuted, fontSize = 11.sp, maxLines = 1)
                inner()
            }
        },
    )
}

@Composable
private fun BlueActionButton(text: String, enabled: Boolean, modifier: Modifier = Modifier, onClick: () -> Unit) {
    Box(
        modifier.height(44.dp).clip(RoundedCornerShape(12.dp)).background(if (enabled) LegacyBlue else LegacyBlue.copy(alpha = 0.5f))
            .clickable(enabled = enabled, onClick = onClick),
        contentAlignment = Alignment.Center,
    ) { Text(text, color = Color.White, fontSize = 12.sp, fontWeight = FontWeight.SemiBold) }
}

@Composable
private fun WhiteActionButton(text: String, enabled: Boolean, modifier: Modifier = Modifier, onClick: () -> Unit) {
    Box(
        modifier.height(44.dp).clip(RoundedCornerShape(12.dp)).background(Color.White)
            .border(1.dp, LegacyBorder, RoundedCornerShape(12.dp))
            .clickable(enabled = enabled, onClick = onClick),
        contentAlignment = Alignment.Center,
    ) { Text(text, color = Color(0xFF1B1F2A), fontSize = 12.sp, fontWeight = FontWeight.SemiBold) }
}

private fun addBoardMessage(result: AddBoardResult): String = when (result) {
    is AddBoardResult.Added -> ""
    AddBoardResult.BadCode -> "সংক্ষিপ্ত কোডটি A-Z, 0-9 বা _ দিয়ে লিখুন (সর্বোচ্চ ${BoardRules.MAX_CODE_LENGTH.toBengali()} অক্ষর)।"
    AddBoardResult.BadName -> "বোর্ডের নাম লিখুন (সর্বোচ্চ ${BoardRules.MAX_NAME_LENGTH.toBengali()} অক্ষর)।"
    AddBoardResult.CodeExists -> "এই কোডের বোর্ড আগে থেকেই আছে।"
    AddBoardResult.NameExists -> "এই নামে বোর্ড আগে থেকেই আছে।"
    is AddBoardResult.Failed -> "বোর্ড যোগ করা যায়নি; আবার চেষ্টা করুন।"
}
