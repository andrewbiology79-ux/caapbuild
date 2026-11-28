package com.questionbank.app.ui.question

import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.net.Uri
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
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
import androidx.compose.ui.platform.LocalDensity
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

private sealed interface ThumbnailState {
    object Loading : ThumbnailState
    object Missing : ThumbnailState
    class Ready(val bitmap: Bitmap) : ThumbnailState
}

@Composable
internal fun MediaThumbnail(
    pipeline: ImagePipeline,
    imageId: String,
    imageScope: ImageScope,
    modifier: Modifier = Modifier.size(100.dp),
    contentScale: ContentScale = ContentScale.Crop,
) {
    // Loading and Missing are different states: while the file is still being read nothing is claimed about it.
    val state by produceState<ThumbnailState>(initialValue = ThumbnailState.Loading, imageId, imageScope) {
        value = withContext(Dispatchers.IO) {
            try {
                val file = pipeline.fileForImage(imageId, imageScope) ?: return@withContext ThumbnailState.Missing
                val cacheKey = "${file.absolutePath}|${file.lastModified()}|${file.length()}|4"
                val cached = ThumbnailCache.get(cacheKey)
                if (cached != null) return@withContext ThumbnailState.Ready(cached)
                val bitmap = ThumbnailCache.throttled {
                    BitmapFactory.decodeFile(file.absolutePath, BitmapFactory.Options().apply { inSampleSize = 4 })
                }
                if (bitmap != null) {
                    ThumbnailCache.put(cacheKey, bitmap)
                    ThumbnailState.Ready(bitmap)
                } else ThumbnailState.Missing
            } catch (cancelled: CancellationException) {
                throw cancelled
            } catch (_: Exception) {
                ThumbnailState.Missing
            } catch (_: OutOfMemoryError) {
                ThumbnailState.Missing
            }
        }
    }
    // Do not recycle here: Compose draws the bitmap later on the render thread; the GC frees it.
    when (val current = state) {
        is ThumbnailState.Ready -> Image(current.bitmap.asImageBitmap(), contentDescription = "সংযুক্ত ছবি", modifier = modifier, contentScale = contentScale)
        ThumbnailState.Loading -> Box(modifier)
        ThumbnailState.Missing -> Text("ছবি অনুপলব্ধ", style = MaterialTheme.typography.labelSmall, modifier = Modifier.height(48.dp))
    }
}

/** Full-width, uncropped stimulus image decoded near the rendered width instead of the 100dp thumbnail size. */
@Composable
internal fun MediaFullWidthImage(
    pipeline: ImagePipeline,
    imageId: String,
    imageScope: ImageScope,
) {
    BoxWithConstraints(Modifier.fillMaxWidth()) {
        val targetWidthPx = with(LocalDensity.current) { maxWidth.roundToPx().coerceAtLeast(1) }
        val state by produceState<ThumbnailState>(
            initialValue = ThumbnailState.Loading,
            imageId,
            imageScope,
            targetWidthPx,
        ) {
            value = withContext(Dispatchers.IO) {
                try {
                    val file = pipeline.fileForImage(imageId, imageScope)
                        ?: return@withContext ThumbnailState.Missing
                    val bounds = BitmapFactory.Options().apply { inJustDecodeBounds = true }
                    BitmapFactory.decodeFile(file.absolutePath, bounds)
                    if (bounds.outWidth <= 0 || bounds.outHeight <= 0) {
                        return@withContext ThumbnailState.Missing
                    }
                    var sampleSize = 1
                    while (bounds.outWidth / (sampleSize * 2) >= targetWidthPx) {
                        sampleSize *= 2
                    }
                    val cacheKey = "${file.absolutePath}|${file.lastModified()}|${file.length()}|$sampleSize"
                    val cached = ThumbnailCache.get(cacheKey)
                    if (cached != null) return@withContext ThumbnailState.Ready(cached)
                    val bitmap = ThumbnailCache.throttled {
                        BitmapFactory.decodeFile(
                            file.absolutePath,
                            BitmapFactory.Options().apply {
                                inSampleSize = sampleSize
                                inPreferredConfig = Bitmap.Config.ARGB_8888
                            },
                        )
                    }
                    if (bitmap != null) {
                        ThumbnailCache.put(cacheKey, bitmap)
                        ThumbnailState.Ready(bitmap)
                    } else {
                        ThumbnailState.Missing
                    }
                } catch (cancelled: CancellationException) {
                    throw cancelled
                } catch (_: Exception) {
                    ThumbnailState.Missing
                } catch (_: OutOfMemoryError) {
                    ThumbnailState.Missing
                }
            }
        }
        when (val current = state) {
            is ThumbnailState.Ready -> {
                val ratio = current.bitmap.width.toFloat() / current.bitmap.height.toFloat()
                Image(
                    current.bitmap.asImageBitmap(),
                    contentDescription = "উদ্দীপকের ছবি",
                    modifier = Modifier.fillMaxWidth().aspectRatio(ratio),
                    contentScale = ContentScale.FillWidth,
                )
            }
            ThumbnailState.Loading -> Box(
                Modifier.fillMaxWidth().height(96.dp)
                    .background(MaterialTheme.colorScheme.surfaceVariant),
            )
            ThumbnailState.Missing -> Box(
                Modifier.fillMaxWidth().height(96.dp)
                    .background(MaterialTheme.colorScheme.surfaceVariant),
                contentAlignment = Alignment.Center,
            ) {
                Text("ছবি অনুপলব্ধ", style = MaterialTheme.typography.labelSmall)
            }
        }
    }
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
