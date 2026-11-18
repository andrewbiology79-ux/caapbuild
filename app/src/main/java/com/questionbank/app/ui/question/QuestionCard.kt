package com.questionbank.app.ui.question

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.questionbank.app.domain.question.QuestionCardRules
import com.questionbank.app.domain.question.SavedGroup
import com.questionbank.app.ui.format.toBengali
import com.questionbank.app.ui.theme.LocalDarkTheme

/**
 * One question card = one stimulus group (plan 39.3, UI-04): blue ribbon with the running number and the rating badge (rule U-1),
 * a light chip row, then the stimulus and the sub-questions.
 *
 * v0.2.28: the ribbon has a 3-dot menu with one item, "সম্পাদনা" ([onEdit]); the other items come with copy and delete.
 *
 * Not in this package on purpose: checkbox, board/paper chips (no boards or papers can be entered yet), the solution
 * toggle and pictures (solutions and pictures do not exist yet). The chip row shows "ট্যাগ নেই" until boards arrive.
 * [number] is the position in the list that is shown (also in search results).
 */
@Composable
fun QuestionCard(number: Int, group: SavedGroup, onEdit: (() -> Unit)? = null) {
    var menuOpen by remember { mutableStateOf(false) }
    Card(
        modifier = Modifier.fillMaxWidth(),
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
        border = BorderStroke(1.5.dp, MaterialTheme.colorScheme.primary),
    ) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .background(MaterialTheme.colorScheme.primary)
                .padding(start = 12.dp, end = if (onEdit != null) 4.dp else 12.dp, top = 4.dp, bottom = 4.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Text(
                "প্রশ্ন ${number.toBengali()}",
                modifier = Modifier.weight(1f),
                color = MaterialTheme.colorScheme.onPrimary,
                fontWeight = FontWeight.SemiBold,
                fontSize = 14.sp,
            )
            RatingBadge(QuestionCardRules.rating(group))
            if (onEdit != null) {
                Spacer(Modifier.width(4.dp))
                Box {
                    Box(
                        modifier = Modifier
                            .size(40.dp)
                            .clickable { menuOpen = true }
                            .semantics { contentDescription = "আরও বিকল্প" },
                        contentAlignment = Alignment.Center,
                    ) {
                        Text("⋮", color = MaterialTheme.colorScheme.onPrimary, fontWeight = FontWeight.Bold, fontSize = 20.sp)
                    }
                    DropdownMenu(expanded = menuOpen, onDismissRequest = { menuOpen = false }) {
                        DropdownMenuItem(
                            text = { Text("সম্পাদনা") },
                            onClick = {
                                menuOpen = false
                                onEdit()
                            },
                        )
                    }
                }
            }
        }
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .background(MaterialTheme.colorScheme.surfaceVariant)
                .padding(horizontal = 12.dp, vertical = 6.dp),
        ) {
            Text("ট্যাগ নেই", fontSize = 10.sp, color = MaterialTheme.colorScheme.onSurfaceVariant)
        }
        Column(modifier = Modifier.padding(12.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
            if (group.stimulusText.isNotEmpty()) {
                Text(group.stimulusText, style = MaterialTheme.typography.bodyLarge)
            }
            group.subQuestions.forEach { q ->
                Column(verticalArrangement = Arrangement.spacedBy(2.dp)) {
                    val head = (q.label?.let { "${it.letter}) ${it.typeLabel}" } ?: "প্রশ্ন") + " · ${marksText(q.marks)} নম্বর"
                    Text(
                        head,
                        style = MaterialTheme.typography.labelLarge,
                        fontWeight = FontWeight.Bold,
                        color = MaterialTheme.colorScheme.primary,
                    )
                    Text(q.text, style = MaterialTheme.typography.bodyLarge)
                    if (q.shortAnswer.isNotEmpty()) {
                        Text("উত্তর: ${q.shortAnswer}", style = MaterialTheme.typography.bodyMedium)
                    }
                }
            }
        }
    }
}

/** Yellow rating badge (plan 39.4): light #FEF9C3 / #713F12 / #FDE047, dark #422006 / #FDE68A. */
@Composable
private fun RatingBadge(rating: Int) {
    val dark = LocalDarkTheme.current
    val background = if (dark) Color(0xFF422006) else Color(0xFFFEF9C3)
    val textColor = if (dark) Color(0xFFFDE68A) else Color(0xFF713F12)
    val border = if (dark) Color(0xFF713F12) else Color(0xFFFDE047)
    val shape = RoundedCornerShape(8.dp)
    Text(
        ratingText(rating),
        modifier = Modifier
            .background(background, shape)
            .border(1.dp, border, shape)
            .padding(horizontal = 8.dp, vertical = 2.dp),
        color = textColor,
        fontWeight = FontWeight.SemiBold,
        fontSize = 12.sp,
    )
}
