package com.questionbank.app.ui.question

import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.net.Uri
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.Image
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.material3.AssistChip
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.produceState
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.unit.dp
import com.questionbank.app.domain.question.QuestionStimulusImage
import com.questionbank.app.media.ImagePipeline
import com.questionbank.app.media.ImageScope
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

@Composable
fun StimulusImageAttachments(
    pipeline: ImagePipeline,
    imageScope: ImageScope,
    images: List<QuestionStimulusImage>,
    enabled: Boolean,
    onChange: (List<QuestionStimulusImage>) -> Unit,
) {
    val coroutineScope = rememberCoroutineScope()
    var importing by remember { mutableStateOf(false) }
    var importError by remember { mutableStateOf("") }
    var pickerScope by remember { mutableStateOf(imageScope) }
    var replacementImageId by remember { mutableStateOf<String?>(null) }
    val launcher = rememberLauncherForActivityResult(ActivityResultContracts.OpenDocument()) { uri ->
        if (uri != null && enabled && !importing) {
            val capturedScope = pickerScope
            val replaceId = replacementImageId
            coroutineScope.launch {
                importing = true
                try {
                    importError = ""
                    val imageId = pipeline.importImage(uri, capturedScope)
                    val next = if (replaceId != null) {
                        images.map { if (it.imageId == replaceId) it.copy(imageId = imageId) else it }
                    } else {
                        images.sortedBy { it.position } + QuestionStimulusImage(imageId, "TOP", images.size.toLong())
                    }
                    onChange(next.mapIndexed { index, row -> row.copy(position = index.toLong()) })
                } catch (cancelled: CancellationException) {
                    throw cancelled
                } catch (failure: Exception) {
                    importError = failure.message ?: "ছবি আমদানি করা যায়নি।"
                } finally {
                    replacementImageId = null
                    importing = false
                }
            }
        } else if (uri == null) {
            replacementImageId = null
        }
    }
    Column(verticalArrangement = Arrangement.spacedBy(6.dp), modifier = Modifier.fillMaxWidth()) {
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            Text("উদ্দীপকের ছবি", style = MaterialTheme.typography.titleSmall)
            OutlinedButton(enabled = enabled && !importing, onClick = { pickerScope = imageScope; launcher.launch(arrayOf("image/*")) }) {
                Text(if (importing) "আমদানি হচ্ছে…" else "ছবি যোগ করুন")
            }
        }
        if (importError.isNotBlank()) Text(importError, color = MaterialTheme.colorScheme.error, style = MaterialTheme.typography.bodySmall)
        if (images.isEmpty()) Text("এখনো কোনো ছবি যুক্ত নেই।", style = MaterialTheme.typography.bodySmall)
        LazyRow(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            itemsIndexed(images.sortedBy { it.position }, key = { _, item -> item.imageId }) { index, item ->
                Column(verticalArrangement = Arrangement.spacedBy(4.dp), horizontalAlignment = Alignment.CenterHorizontally) {
                    MediaThumbnail(pipeline, item.imageId, imageScope)
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        AssistChip(
                            onClick = { if (enabled) onChange(images.map { if (it.imageId == item.imageId) it.copy(placement = if (it.placement == "TOP") "BOTTOM" else "TOP") else it }) },
                            enabled = enabled,
                            label = { Text(item.placement) },
                        )
                        TextButton(enabled = enabled && index > 0, onClick = { onChange(moveStimulusImage(images, item.imageId, -1)) }) { Text("←") }
                        TextButton(enabled = enabled && index < images.size - 1, onClick = { onChange(moveStimulusImage(images, item.imageId, 1)) }) { Text("→") }
                        TextButton(enabled = enabled && !importing, onClick = { replacementImageId = item.imageId; pickerScope = imageScope; launcher.launch(arrayOf("image/*")) }) { Text("প্রতিস্থাপন") }
                        TextButton(enabled = enabled, onClick = { onChange(images.filterNot { it.imageId == item.imageId }.mapIndexed { i, row -> row.copy(position = i.toLong()) }) }) { Text("সরান") }
                    }
                }
            }
        }
    }
}

@Composable
internal fun MediaThumbnail(pipeline: ImagePipeline, imageId: String, imageScope: ImageScope) {
    val bitmap by produceState<Bitmap?>(initialValue = null, imageId, imageScope) {
        value = withContext(Dispatchers.IO) {
            val file = pipeline.fileForImage(imageId, imageScope) ?: return@withContext null
            BitmapFactory.decodeFile(file.absolutePath, BitmapFactory.Options().apply { inSampleSize = 4 })
        }
    }
    DisposableEffect(bitmap) {
        onDispose { bitmap?.takeUnless { it.isRecycled }?.recycle() }
    }
    if (bitmap != null) Image(bitmap!!.asImageBitmap(), contentDescription = "সংযুক্ত ছবি", modifier = Modifier.size(100.dp), contentScale = ContentScale.Crop)
    else Text("ছবি অনুপলব্ধ", style = MaterialTheme.typography.labelSmall, modifier = Modifier.height(48.dp))
}

internal fun moveStimulusImage(images: List<QuestionStimulusImage>, imageId: String, delta: Int): List<QuestionStimulusImage> {
    val ordered = images.sortedBy { it.position }.toMutableList()
    val from = ordered.indexOfFirst { it.imageId == imageId }
    val to = from + delta
    if (from !in ordered.indices || to !in ordered.indices) return images
    val row = ordered.removeAt(from)
    ordered.add(to, row)
    return ordered.mapIndexed { index, item -> item.copy(position = index.toLong()) }
}
