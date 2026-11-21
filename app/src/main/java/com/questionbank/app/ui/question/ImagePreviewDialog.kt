package com.questionbank.app.ui.question

import android.graphics.Bitmap
import android.graphics.BitmapFactory
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.gestures.detectTransformGestures
import androidx.compose.foundation.gestures.detectTapGestures
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.weight
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableFloatStateOf
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.unit.dp
import androidx.compose.ui.window.Dialog
import androidx.compose.ui.window.DialogProperties
import com.questionbank.app.media.ImagePipeline
import com.questionbank.app.media.ImageScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext

/** Full-screen image viewer with pinch zoom and previous/next navigation, matching the legacy viewer. */
@Composable
internal fun ImagePreviewDialog(
    pipeline: ImagePipeline,
    imageScope: ImageScope,
    imageIds: List<String>,
    initialIndex: Int,
    onDismiss: () -> Unit,
) {
    if (imageIds.isEmpty()) return
    var index by remember(imageIds, initialIndex) { mutableIntStateOf(initialIndex.coerceIn(imageIds.indices)) }
    val imageId = imageIds[index]
    val bitmapState = remember(imageId) { mutableStateOf<Bitmap?>(null) }
    var scale by remember(imageId) { mutableFloatStateOf(1f) }
    var offsetX by remember(imageId) { mutableFloatStateOf(0f) }
    var offsetY by remember(imageId) { mutableFloatStateOf(0f) }
    DisposableEffect(imageId) {
        onDispose { bitmapState.value?.takeUnless { it.isRecycled }?.recycle() }
    }
    LaunchedEffect(imageId) {
        bitmapState.value = withContext(Dispatchers.IO) {
            val file = pipeline.fileForImage(imageId, imageScope) ?: return@withContext null
            val options = BitmapFactory.Options().apply { inSampleSize = 1 }
            BitmapFactory.decodeFile(file.absolutePath, options)
        }
    }
    Dialog(onDismissRequest = onDismiss, properties = DialogProperties(usePlatformDefaultWidth = false)) {
        Column(Modifier.fillMaxSize().background(Color.Black)) {
            Row(
                Modifier.fillMaxWidth().padding(horizontal = 12.dp, vertical = 8.dp),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.SpaceBetween,
            ) {
                Text(if (imageIds.size > 1) "${index + 1} / ${imageIds.size}" else "ছবি", color = Color.White, style = MaterialTheme.typography.labelLarge)
                IconButton(onClick = onDismiss) { Text("×", color = Color.White, style = MaterialTheme.typography.headlineMedium) }
            }
            Box(Modifier.weight(1f).fillMaxWidth(), contentAlignment = Alignment.Center) {
                val bitmap = bitmapState.value
                if (bitmap != null) {
                    Image(
                        bitmap = bitmap.asImageBitmap(),
                        contentDescription = "ছবির বড় প্রিভিউ",
                        modifier = Modifier.fillMaxSize()
                            .graphicsLayer(scaleX = scale, scaleY = scale, translationX = offsetX, translationY = offsetY)
                            .pointerInput(imageId) {
                                detectTransformGestures { _, pan, zoom, _ ->
                                    scale = (scale * zoom).coerceIn(1f, 6f)
                                    offsetX += pan.x
                                    offsetY += pan.y
                                    if (scale == 1f) { offsetX = 0f; offsetY = 0f }
                                }
                            }
                            .pointerInput(imageId) {
                                detectTapGestures(onDoubleTap = {
                                    if (scale > 1f) {
                                        scale = 1f
                                        offsetX = 0f
                                        offsetY = 0f
                                    } else {
                                        scale = 2.5f
                                    }
                                })
                            },
                        contentScale = ContentScale.Fit,
                    )
                } else Text("ছবি লোড হচ্ছে…", color = Color.White)
                if (imageIds.size > 1) {
                    IconButton(
                        onClick = { index = if (index == 0) imageIds.lastIndex else index - 1 },
                        modifier = Modifier.align(Alignment.CenterStart).size(52.dp),
                    ) { Text("‹", color = Color.White, style = MaterialTheme.typography.displaySmall) }
                    IconButton(
                        onClick = { index = (index + 1) % imageIds.size },
                        modifier = Modifier.align(Alignment.CenterEnd).size(52.dp),
                    ) { Text("›", color = Color.White, style = MaterialTheme.typography.displaySmall) }
                }
            }
            Text("জুম করতে পিঞ্চ বা ডাবল ট্যাপ করুন", color = Color.White.copy(alpha = 0.72f), modifier = Modifier.align(Alignment.CenterHorizontally).padding(12.dp), style = MaterialTheme.typography.labelSmall)
        }
    }
}
