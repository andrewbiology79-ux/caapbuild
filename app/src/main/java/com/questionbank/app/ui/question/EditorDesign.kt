package com.questionbank.app.ui.question

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.questionbank.app.ui.format.toBengali

private val EditorBlue = Color(0xFF3B4FD8)
private val EditorBlueText = Color(0xFF2A3BB0)
private val EditorMutedBg = Color(0xFFF2F4F8)
private val EditorBorder = Color(0xFFD5D9E2)

/** Segmented Minimum / Full Editor control from the CAAP editor header. */
@Composable
fun EditorModePicker(mode: EditorMode, enabled: Boolean, onChange: (EditorMode) -> Unit) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(10.dp))
            .background(EditorMutedBg)
            .border(1.dp, EditorBorder, RoundedCornerShape(10.dp))
            .padding(2.dp),
        horizontalArrangement = Arrangement.spacedBy(2.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        listOf(EditorMode.MINIMUM to "Minimum", EditorMode.FULL to "Full Editor").forEach { (value, label) ->
            val active = value == mode
            Box(
                modifier = Modifier
                    .weight(1f)
                    .height(29.dp)
                    .clip(RoundedCornerShape(7.dp))
                    .background(if (active) EditorBlue else Color.Transparent)
                    .clickable(enabled = enabled && !active) { onChange(value) }
                    .semantics { contentDescription = "$label${if (active) " নির্বাচিত" else ""}" },
                contentAlignment = Alignment.Center,
            ) {
                Text(
                    label,
                    color = if (active) Color.White else EditorBlueText,
                    fontWeight = FontWeight.Bold,
                    fontSize = 13.sp,
                )
            }
        }
    }
}

/** White rounded panel with the same thin grey border and spacing as the reference editor. */
@Composable
fun EditorPanel(
    modifier: Modifier = Modifier,
    content: @Composable ColumnScope.() -> Unit,
) {
    Card(
        modifier = modifier.fillMaxWidth(),
        shape = RoundedCornerShape(20.dp),
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
        elevation = CardDefaults.cardElevation(defaultElevation = 1.dp),
    ) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .border(1.dp, MaterialTheme.colorScheme.outline, RoundedCornerShape(20.dp))
                .padding(18.dp),
            verticalArrangement = Arrangement.spacedBy(10.dp),
            content = content,
        )
    }
}

@Composable
fun EditorSectionTitle(title: String, trailing: (@Composable () -> Unit)? = null) {
    Row(
        modifier = Modifier.fillMaxWidth(),
        horizontalArrangement = Arrangement.SpaceBetween,
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Text(title, color = EditorBlueText, fontSize = 15.sp, fontWeight = FontWeight.Bold)
        trailing?.invoke()
    }
}

@Composable
fun EditorDraftStatus(text: String, isSuccess: Boolean = false) {
    val bg = if (isSuccess) Color(0xFFECFDF5) else EditorMutedBg
    val fg = if (isSuccess) Color(0xFF047857) else Color(0xFF64748B)
    Text(
        text,
        modifier = Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(10.dp))
            .background(bg)
            .padding(horizontal = 12.dp, vertical = 9.dp),
        color = fg,
        fontSize = 11.sp,
        lineHeight = 16.sp,
    )
}


/** Compact 32dp rating control matching the reference editor toolbar. */
@Composable
fun EditorRatingSelect(
    selected: Int?,
    enabled: Boolean,
    onSelect: (Int?) -> Unit,
) {
    var expanded by remember { mutableStateOf(false) }
    val current = selected ?: 3
    val names = listOf("সহজ", "মোটামুটি", "মাঝারি", "ভালো", "চ্যালেঞ্জিং")
    Box {
        Text(
            "${current.toBengali()}★⌄",
            modifier = Modifier
                .clip(RoundedCornerShape(9.dp))
                .background(Color(0xFFFEF9C3))
                .border(1.dp, Color(0xFFFDE047), RoundedCornerShape(9.dp))
                .clickable(enabled = enabled) { expanded = true }
                .padding(horizontal = 12.dp, vertical = 9.dp),
            color = Color(0xFF713F12),
            fontSize = 13.sp,
            fontWeight = FontWeight.Bold,
        )
        DropdownMenu(expanded = expanded, onDismissRequest = { expanded = false }) {
            names.forEachIndexed { index, name ->
                val value = index + 1
                DropdownMenuItem(
                    text = { Text("${value.toBengali()}★  $name", fontSize = 12.sp) },
                    onClick = { expanded = false; onSelect(value) },
                )
            }
            if (selected != null) {
                DropdownMenuItem(text = { Text("রেটিং সরান", fontSize = 12.sp) }, onClick = { expanded = false; onSelect(null) })
            }
        }
    }
}

/** Small square eye toggle from the CAAP editor. */
@Composable
fun EditorEyeToggle(open: Boolean, enabled: Boolean = true, onClick: () -> Unit) {
    Box(
        modifier = Modifier
            .size(38.dp)
            .clip(RoundedCornerShape(9.dp))
            .background(if (open) EditorBlue else Color(0xFFEEF2FF))
            .border(1.dp, if (open) EditorBlue else EditorBorder, RoundedCornerShape(7.dp))
            .clickable(enabled = enabled, onClick = onClick)
            .semantics { contentDescription = if (open) "লাইভ প্রিভিউ বন্ধ করুন" else "লাইভ প্রিভিউ দেখুন" },
        contentAlignment = Alignment.Center,
    ) {
        Text(if (open) "◉" else "◎", color = if (open) Color.White else EditorBlue, fontSize = 19.sp, fontWeight = FontWeight.Bold)
    }
}

/** Live preview panel; uses the app's currently supported text rendering (the target has no KaTeX renderer yet). */
@Composable
fun EditorLivePreview(title: String, text: String) {
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(12.dp))
            .background(Color(0xFFF8FAFF))
            .border(1.dp, Color(0xFFD5D9E2), RoundedCornerShape(12.dp))
            .padding(14.dp),
        verticalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        Text("◎  $title", color = EditorBlueText, fontSize = 11.sp, fontWeight = FontWeight.Bold)
        Text(text.ifBlank { "উপরে লিখলে এখানে প্রিভিউ দেখা যাবে।" }, color = Color(0xFF1B1F2A), fontSize = 13.sp, lineHeight = 20.sp)
    }
}


/** Fixed editor toolbar: close, undo, redo and save, matching the reference modal header. */
@Composable
fun EditorHeaderActions(
    canUndo: Boolean,
    canRedo: Boolean,
    canSave: Boolean,
    saving: Boolean,
    onUndo: () -> Unit,
    onRedo: () -> Unit,
    onSave: () -> Unit,
) {
    Row(
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(2.dp),
    ) {
        EditorHeaderAction("↶", "আনডু", enabled = canUndo && !saving, onClick = onUndo)
        EditorHeaderAction("↷", "রিডু", enabled = canRedo && !saving, onClick = onRedo)
        Box(
            modifier = Modifier
                .padding(start = 2.dp)
                .size(42.dp)
                .clip(RoundedCornerShape(50))
                .background(Color.White)
                .clickable(enabled = canSave && !saving, onClick = onSave)
                .semantics { contentDescription = if (saving) "সংরক্ষণ হচ্ছে" else "প্রশ্ন সংরক্ষণ করুন" },
            contentAlignment = Alignment.Center,
        ) {
            Text(
                if (saving) "…" else "✓",
                color = EditorBlue,
                fontWeight = FontWeight.Black,
                fontSize = 27.sp,
            )
        }
    }
}

@Composable
private fun EditorHeaderAction(
    glyph: String,
    description: String,
    enabled: Boolean,
    onClick: () -> Unit,
) {
    Box(
        modifier = Modifier
            .size(40.dp)
            .clip(RoundedCornerShape(20.dp))
            .clickable(enabled = enabled, onClick = onClick)
            .semantics { contentDescription = description },
        contentAlignment = Alignment.Center,
    ) {
        Text(
            glyph,
            color = Color.White.copy(alpha = if (enabled) 1f else 0.38f),
            fontWeight = FontWeight.SemiBold,
            fontSize = 26.sp,
        )
    }
}

/** Pinned white mode strip directly below the blue editor header. */
@Composable
fun EditorModeBar(mode: EditorMode, enabled: Boolean, onChange: (EditorMode) -> Unit) {
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .background(Color.White),
    ) {
        Box(Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 6.dp)) {
            EditorModePicker(mode, enabled, onChange)
        }
        HorizontalDivider(color = EditorBorder, thickness = 1.dp)
    }
}
