package com.questionbank.app.ui.question

import android.graphics.Bitmap
import android.graphics.BitmapFactory
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.produceState
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.questionbank.app.domain.question.BoardItem
import com.questionbank.app.domain.question.QuestionCardRules
import com.questionbank.app.domain.question.QuestionSolutionPart
import com.questionbank.app.domain.question.SavedGroup
import com.questionbank.app.media.ImagePipeline
import com.questionbank.app.media.ImageScope
import com.questionbank.app.ui.format.toBengali
import com.questionbank.app.ui.theme.LocalDarkTheme
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext

private val BrandBlue = Color(0xFF3B4FD8)
private val Ink = Color(0xFF1B1F2A)
private val MutedInk = Color(0xFF64748B)
private val Line = Color(0xFFD5D9E2)
private val SoftLine = Color(0xFFF2F4F8)
private val RibbonBg = Color(0xFFF8FAFC)

/**
 * CAAP-inspired question card, rebuilt natively in Compose. The visual order mirrors the reference:
 * blue ribbon (serial / select / rating / menu), pale tag strip, stimulus and images, then question
 * rows with an inline solution toggle and an expandable solution panel.
 */
@Composable
fun QuestionCard(
    number: Int,
    group: SavedGroup,
    boards: List<BoardItem> = emptyList(),
    imagePipeline: ImagePipeline? = null,
    selected: Boolean = false,
    onToggleSelected: (() -> Unit)? = null,
    onEdit: (() -> Unit)? = null,
    onDelete: (() -> Unit)? = null,
    onCopy: (() -> Unit)? = null,
    onView: (() -> Unit)? = null,
) {
    var menuOpen by remember { mutableStateOf(false) }
    var confirmDelete by remember { mutableStateOf(false) }
    var referenceOpen by remember { mutableStateOf(false) }
    var openSolutions by remember(group) { mutableStateOf(emptySet<String>()) }
    val dark = LocalDarkTheme.current
    val cardBg = MaterialTheme.colorScheme.surface
    val bodyText = MaterialTheme.colorScheme.onSurface
    val tagTextColor = if (dark) Color(0xFFE2E8F0) else Ink
    val softTagBg = if (dark) Color(0xFF263449) else RibbonBg

    if (confirmDelete) AlertDialog(
        onDismissRequest = { confirmDelete = false },
        title = { Text("প্রশ্ন কার্ড মুছবেন?") },
        text = { Text("এই কার্ডের অন্তর্ভুক্ত সব প্রশ্ন মুছে যাবে। সার্চের ফলাফলে কিছু প্রশ্ন দেখা গেলেও পুরো কার্ডটি মুছবে। সংরক্ষিত প্রশ্নপত্রে ব্যবহৃত প্রশ্ন হলে ডাটাবেস মুছতে বাধা দিতে পারে।") },
        confirmButton = { TextButton(onClick = { confirmDelete = false; onDelete?.invoke() }) { Text("মুছুন") } },
        dismissButton = { TextButton(onClick = { confirmDelete = false }) { Text("বাতিল") } },
    )
    if (referenceOpen) AlertDialog(
        onDismissRequest = { referenceOpen = false },
        title = { Text("রেফারেন্স") },
        text = { Text(group.referenceText.ifBlank { "এই প্রশ্নের কোনো রেফারেন্স দেওয়া হয়নি।" }) },
        confirmButton = { TextButton(onClick = { referenceOpen = false }) { Text("বন্ধ করুন") } },
    )

    Card(
        modifier = Modifier.fillMaxWidth(),
        colors = CardDefaults.cardColors(containerColor = cardBg),
        border = androidx.compose.foundation.BorderStroke(
            1.5.dp,
            if (selected) BrandBlue else if (dark) Color(0xFF6574E8) else BrandBlue,
        ),
        elevation = CardDefaults.cardElevation(defaultElevation = 1.dp),
        shape = RoundedCornerShape(16.dp),
    ) {
        Column {
            // Top ribbon: serial, white selection control, yellow rating badge and kebab menu.
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .background(BrandBlue)
                    .heightIn(min = 44.dp)
                    .padding(start = 12.dp, end = 4.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Text(
                    "প্রশ্ন ${number.toBengali()}",
                    color = Color.White,
                    fontWeight = FontWeight.Bold,
                    fontSize = 12.sp,
                    modifier = Modifier,
                )
                if (onToggleSelected != null) {
                    Box(
                        modifier = Modifier
                            .size(44.dp)
                            .clickable(onClick = onToggleSelected)
                            .semantics { contentDescription = if (selected) "নির্বাচন বাতিল করুন" else "নির্বাচন করুন" },
                        contentAlignment = Alignment.Center,
                    ) {
                        Box(
                            modifier = Modifier
                                .size(20.dp)
                                .clip(RoundedCornerShape(4.dp))
                                .background(if (selected) Color.White else Color.Transparent)
                                .border(2.dp, Color.White, RoundedCornerShape(4.dp)),
                            contentAlignment = Alignment.Center,
                        ) {
                            if (selected) Text("✓", color = BrandBlue, fontWeight = FontWeight.Black, fontSize = 14.sp, lineHeight = 14.sp)
                        }
                    }
                } else {
                    Spacer(Modifier.width(8.dp))
                }
                RatingBadge(QuestionCardRules.rating(group))
                Spacer(Modifier.weight(1f))
                if (onEdit != null || onDelete != null || onCopy != null || group.referenceText.isNotBlank()) {
                    Box {
                        Box(
                            modifier = Modifier
                                .size(40.dp)
                                .clip(RoundedCornerShape(10.dp))
                                .clickable { menuOpen = true }
                                .semantics { contentDescription = "মেনু" },
                            contentAlignment = Alignment.Center,
                        ) {
                            Text("⋮", color = Color.White, fontWeight = FontWeight.Bold, fontSize = 22.sp)
                        }
                        DropdownMenu(expanded = menuOpen, onDismissRequest = { menuOpen = false }) {
                            if (onEdit != null) DropdownMenuItem(text = { Text("সম্পাদনা") }, onClick = { menuOpen = false; onEdit() })
                            if (group.referenceText.isNotBlank()) DropdownMenuItem(text = { Text("রেফারেন্স দেখুন") }, onClick = { menuOpen = false; referenceOpen = true })
                            if (onCopy != null) DropdownMenuItem(text = { Text("সম্পূর্ণ কপি তৈরি") }, onClick = { menuOpen = false; onCopy() })
                            if (onDelete != null) DropdownMenuItem(text = { Text("কার্ড মুছুন") }, onClick = { menuOpen = false; confirmDelete = true })
                        }
                    }
                }
            }

            // Light tag strip (board tags; question-specific tags remain beside the question).
            // CAAP keeps stimulus tags in the shared strip; each sub-question's own tags stay beside its action.
            // For a standalone question card, cardTopTags() returns that question's tags instead.
            val top = cardTopTags(group)
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .background(softTagBg)
                    .border(width = 0.5.dp, color = if (dark) Color(0xFF334155) else Color(0xFFE2E8F0))
                    .padding(horizontal = 12.dp, vertical = 8.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                if (top.isNotEmpty()) {
                    TagChipRow(top, boards)
                } else {
                    Text("ট্যাগ নেই", fontSize = 10.sp, color = Color(0xFF94A3B8))
                }
            }

            Column(
                modifier = Modifier.padding(horizontal = 14.dp, vertical = 12.dp),
                verticalArrangement = Arrangement.spacedBy(12.dp),
            ) {
                // Stimulus image placement is preserved: TOP images, text, then BOTTOM images.
                val orderedStimulusImages = group.stimulusImages.sortedWith(
                    compareBy<com.questionbank.app.domain.question.QuestionStimulusImage> { if (it.placement.equals("TOP", true)) 0 else 1 }
                        .thenBy { it.position },
                )
                orderedStimulusImages.filter { it.placement.equals("TOP", true) }.forEach { image ->
                    if (imagePipeline != null) CardMediaImage(imagePipeline, image.imageId, ImageScope.TYPE_CQ)
                }
                if (group.stimulusText.isNotBlank()) {
                    Text(
                        group.stimulusText,
                        color = bodyText,
                        fontSize = 13.sp,
                        fontWeight = FontWeight.Medium,
                        lineHeight = 21.sp,
                    )
                }
                orderedStimulusImages.filterNot { it.placement.equals("TOP", true) }.forEach { image ->
                    if (imagePipeline != null) CardMediaImage(imagePipeline, image.imageId, ImageScope.TYPE_CQ)
                }

                Column(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(top = 2.dp)
                        .border(width = 0.dp, color = Color.Transparent)
                        .padding(top = 10.dp),
                    verticalArrangement = Arrangement.spacedBy(12.dp),
                ) {
                    // A subtle separator at the start of the sub-question block.
                    Box(Modifier.fillMaxWidth().heightIn(min = 1.dp).background(SoftLine).padding(vertical = 0.dp))
                    group.subQuestions.forEach { question ->
                        val key = question.id
                        val isOpen = key in openSolutions
                        Column(verticalArrangement = Arrangement.spacedBy(7.dp)) {
                            Row(
                                modifier = Modifier.fillMaxWidth(),
                                verticalAlignment = Alignment.Top,
                                horizontalArrangement = Arrangement.spacedBy(6.dp),
                            ) {
                                Text(
                                    question.label?.letter?.plus(".") ?: "",
                                    color = bodyText,
                                    fontSize = 13.sp,
                                    fontWeight = FontWeight.Bold,
                                )
                                Text(
                                    question.text,
                                    modifier = Modifier.weight(1f),
                                    color = bodyText,
                                    fontSize = 13.sp,
                                    fontWeight = FontWeight.Medium,
                                    lineHeight = 21.sp,
                                )
                            }
                            Row(
                                modifier = Modifier.fillMaxWidth(),
                                verticalAlignment = Alignment.CenterVertically,
                                horizontalArrangement = Arrangement.spacedBy(8.dp),
                            ) {
                                Row(
                                    modifier = Modifier
                                        .heightIn(min = 26.dp)
                                        .clip(RoundedCornerShape(6.dp))
                                        .background(if (dark) Color(0xFF172235) else Color.White)
                                        .border(1.dp, if (dark) Color(0xFF334155) else Line, RoundedCornerShape(6.dp))
                                        .clickable {
                                            openSolutions = if (isOpen) openSolutions - key else openSolutions + key
                                        }
                                        .padding(horizontal = 8.dp, vertical = 3.dp),
                                    verticalAlignment = Alignment.CenterVertically,
                                    horizontalArrangement = Arrangement.spacedBy(4.dp),
                                ) {
                                    Text(
                                        if (isOpen) "◉" else "◎",
                                        fontSize = 11.sp,
                                        color = if (dark) Color(0xFFA5B4FC) else Color(0xFF2A3BB0),
                                    )
                                    Text(
                                        if (isOpen) "সমাধান লুকাও" else "সমাধান দেখো",
                                        fontSize = 10.sp,
                                        color = if (dark) Color(0xFFA5B4FC) else Color(0xFF2A3BB0),
                                        fontWeight = FontWeight.SemiBold,
                                    )
                                }
                                if (group.stimulusId != null && question.boards.isNotEmpty()) {
                                    TagChipRow(question.boards, boards)
                                }
                            }
                            if (isOpen) {
                                Column(
                                    modifier = Modifier
                                        .fillMaxWidth()
                                        .clip(RoundedCornerShape(12.dp))
                                        .background(if (dark) Color(0xFF172235) else RibbonBg)
                                        .border(1.dp, if (dark) Color(0xFF334155) else Color(0xFFE2E8F0), RoundedCornerShape(12.dp))
                                        .padding(12.dp),
                                    verticalArrangement = Arrangement.spacedBy(8.dp),
                                ) {
                                    Text("সমাধান:", color = if (dark) Color(0xFFA5B4FC) else Color(0xFF2A3BB0), fontSize = 11.sp, fontWeight = FontWeight.Bold)
                                    val parts = question.orderedSolutionParts.sortedBy { it.position }
                                    if (parts.isNotEmpty()) {
                                        parts.forEach { part ->
                                            if (part.partType == "TEXT") {
                                                Text(part.textContent.orEmpty(), color = bodyText, fontSize = 12.sp, lineHeight = 19.sp)
                                            } else {
                                                part.imageId?.let { imageId -> if (imagePipeline != null) CardMediaImage(imagePipeline, imageId, ImageScope.TYPE_CQ) }
                                            }
                                        }
                                    } else if (question.solutionParts.isNotEmpty()) {
                                        question.solutionParts.forEach { part -> Text(part, color = bodyText, fontSize = 12.sp, lineHeight = 19.sp) }
                                    } else {
                                        Text("এখনো কোনো সমাধান যোগ করা হয়নি।", color = MutedInk, fontSize = 11.sp)
                                    }
                                }
                            }
                        }
                    }
                }
                if (onView != null) {
                    TextButton(onClick = onView, modifier = Modifier.align(Alignment.End)) { Text("বিস্তারিত দেখুন", fontSize = 11.sp) }
                }
            }
        }
    }
}

/** Yellow rating badge from the reference palette. */
@Composable
private fun RatingBadge(rating: Int) {
    val dark = LocalDarkTheme.current
    val background = if (dark) Color(0xFF422006) else Color(0xFFFEF9C3)
    val textColor = if (dark) Color(0xFFFDE68A) else Color(0xFF713F12)
    val border = if (dark) Color(0xFF713F12) else Color(0xFFFDE047)
    val shape = RoundedCornerShape(7.dp)
    Text(
        ratingText(rating),
        modifier = Modifier
            .background(background, shape)
            .border(1.dp, border, shape)
            .padding(horizontal = 8.dp, vertical = 3.dp),
        color = textColor,
        fontWeight = FontWeight.Bold,
        fontSize = 10.sp,
        maxLines = 1,
    )
}

@Composable
private fun CardMediaImage(pipeline: ImagePipeline, imageId: String, scope: ImageScope) {
    val bitmap by produceState<Bitmap?>(initialValue = null, imageId, scope) {
        value = runCatching {
            withContext(Dispatchers.IO) {
                val file = pipeline.fileForImage(imageId, scope) ?: return@withContext null
                val bounds = BitmapFactory.Options().apply { inJustDecodeBounds = true }
                BitmapFactory.decodeFile(file.absolutePath, bounds)
                val sample = maxOf(1, maxOf(bounds.outWidth / 1400, bounds.outHeight / 1000))
                BitmapFactory.decodeFile(file.absolutePath, BitmapFactory.Options().apply { inSampleSize = sample })
            }
        }.getOrNull()
    }
    DisposableEffect(bitmap) {
        onDispose { bitmap?.takeUnless { it.isRecycled }?.recycle() }
    }
    if (bitmap != null) {
        Image(
            bitmap = bitmap!!.asImageBitmap(),
            contentDescription = "উদ্দীপক বা সমাধানের ছবি",
            modifier = Modifier
                .fillMaxWidth()
                .heightIn(max = 240.dp)
                .clip(RoundedCornerShape(12.dp))
                .border(1.dp, Line, RoundedCornerShape(12.dp)),
            contentScale = ContentScale.Fit,
        )
    } else {
        Box(
            modifier = Modifier
                .fillMaxWidth()
                .heightIn(min = 48.dp, max = 72.dp)
                .clip(RoundedCornerShape(12.dp))
                .background(MaterialTheme.colorScheme.surfaceVariant)
                .border(1.dp, Line, RoundedCornerShape(12.dp)),
            contentAlignment = Alignment.Center,
        ) {
            Text("ছবি লোড হচ্ছে / অনুপলব্ধ", color = MutedInk, fontSize = 10.sp)
        }
    }
}
