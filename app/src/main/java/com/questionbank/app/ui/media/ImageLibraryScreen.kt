package com.questionbank.app.ui.media

import android.graphics.Bitmap
import android.graphics.BitmapFactory
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.Image
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.FilterChip
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.SnackbarHost
import androidx.compose.material3.SnackbarHostState
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.produceState
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.unit.dp
import androidx.compose.ui.window.Dialog
import com.questionbank.app.data.local.entity.ChapterCqImagesEntity
import com.questionbank.app.data.local.entity.TypeCqImagesEntity
import com.questionbank.app.media.ImagePipeline
import com.questionbank.app.media.ImageScope
import com.questionbank.app.ui.components.AppHeader
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

@Composable
fun ImageLibraryScreen(
    pipeline: ImagePipeline,
    typeImagesFlow: Flow<List<TypeCqImagesEntity>>,
    chapterImagesFlow: Flow<List<ChapterCqImagesEntity>>,
    onBack: () -> Unit,
) {
    val scope = rememberCoroutineScope()
    var selectedScope by rememberSaveable { mutableStateOf(ImageScope.TYPE_CQ.name) }
    val imageScope = ImageScope.valueOf(selectedScope)
    val typeImages by typeImagesFlow.collectAsState(initial = emptyList())
    val chapterImages by chapterImagesFlow.collectAsState(initial = emptyList())
    val images: List<MediaRow> = if (imageScope == ImageScope.TYPE_CQ) typeImages.map { MediaRow(it.imageId, it.relativePath, it.originalName, it.width, it.height, it.byteSize, it.sha256, it.processingStatus) }
        else chapterImages.map { MediaRow(it.imageId, it.relativePath, it.originalName, it.width, it.height, it.byteSize, it.sha256, it.processingStatus) }
    val snackbar = remember { SnackbarHostState() }
    var errorText by remember { mutableStateOf("") }
    var recoveryReady by remember { mutableStateOf(false) }
    var previewPath by rememberSaveable { mutableStateOf<String?>(null) }
    var importScope by rememberSaveable { mutableStateOf(ImageScope.TYPE_CQ.name) }
    var exportId by rememberSaveable { mutableStateOf<String?>(null) }
    var exportScope by rememberSaveable { mutableStateOf(ImageScope.TYPE_CQ.name) }
    var pendingDeleteId by rememberSaveable { mutableStateOf<String?>(null) }
    var pendingDeleteScope by rememberSaveable { mutableStateOf(ImageScope.TYPE_CQ.name) }
    var pendingDeleteName by rememberSaveable { mutableStateOf("") }

    val pickImage = rememberLauncherForActivityResult(ActivityResultContracts.OpenDocument()) { uri ->
        if (uri != null) scope.launch {
            runCatching { pipeline.importImage(uri, ImageScope.valueOf(importScope)) }
                .onSuccess { snackbar.showSnackbar("ছবি নিরাপদে সংরক্ষিত হয়েছে") }
                .onFailure { errorText = it.message ?: "ছবি আমদানি করা যায়নি" }
        }
    }
    val exportImage = rememberLauncherForActivityResult(ActivityResultContracts.CreateDocument("image/png")) { uri ->
        val id = exportId
        val targetScope = ImageScope.valueOf(exportScope)
        if (uri != null && id != null) scope.launch {
            runCatching { pipeline.exportImage(id, targetScope, uri) }
                .onSuccess { snackbar.showSnackbar("ছবি Export হয়েছে") }
                .onFailure { errorText = it.message ?: "ছবি Export করা যায়নি" }
        }
        exportId = null
    }

    LaunchedEffect(Unit) {
        runCatching { pipeline.runStartupRecovery() }
            .onSuccess { recoveryReady = true }
            .onFailure { errorText = it.message ?: "মিডিয়া রিকভারি সম্পন্ন হয়নি" }
    }

    if (errorText.isNotBlank()) {
        AlertDialog(
            onDismissRequest = { errorText = "" },
            title = { Text("মিডিয়া অপারেশন") },
            text = { Text(errorText) },
            confirmButton = { TextButton(onClick = { errorText = "" }) { Text("ঠিক আছে") } },
        )
    }
    previewPath?.let { path ->
        Dialog(onDismissRequest = { previewPath = null }) {
            Card {
                Column(Modifier.padding(12.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    MediaPreview(path, pipeline, Modifier.fillMaxWidth().heightIn(max = 520.dp))
                    TextButton(onClick = { previewPath = null }) { Text("বন্ধ করুন") }
                }
            }
        }
    }

    pendingDeleteId?.let { id ->
        AlertDialog(
            onDismissRequest = { pendingDeleteId = null },
            title = { Text("ছবিটি মুছবেন?") },
            text = { Text("${pendingDeleteName.ifBlank { id }} স্থায়ীভাবে মুছে যাবে। কোনো প্রশ্ন বা সমাধানে যুক্ত থাকলে মুছতে দেওয়া হবে না।") },
            confirmButton = {
                TextButton(onClick = {
                    val targetScope = ImageScope.valueOf(pendingDeleteScope)
                    pendingDeleteId = null
                    scope.launch {
                        runCatching { pipeline.deleteImage(id, targetScope) }.onSuccess { deleted ->
                            if (!deleted) errorText = "ছবিটি কোনো প্রশ্ন/সমাধানে ব্যবহৃত হচ্ছে; আগে লিংক সরাতে হবে।"
                        }.onFailure { errorText = it.message ?: "ছবি মোছা যায়নি" }
                    }
                }) { Text("স্থায়ীভাবে মুছুন") }
            },
            dismissButton = { TextButton(onClick = { pendingDeleteId = null }) { Text("বাতিল") } },
        )
    }

    Scaffold(topBar = { AppHeader(title = "ছবি ও মিডিয়া", onBack = onBack) }, snackbarHost = { SnackbarHost(snackbar) }) { padding ->
        Column(Modifier.fillMaxSize().padding(padding).padding(16.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
            Text("ছবিগুলো অ্যাপের private storage-এ থাকবে; মূল গ্যালারির ফাইল পরিবর্তন করা হবে না।", style = MaterialTheme.typography.bodySmall)
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                FilterChip(selected = imageScope == ImageScope.TYPE_CQ, onClick = { selectedScope = ImageScope.TYPE_CQ.name }, label = { Text("Type_CQ") })
                FilterChip(selected = imageScope == ImageScope.CHAPTER_CQ, onClick = { selectedScope = ImageScope.CHAPTER_CQ.name }, label = { Text("Chapter_CQ") })
            }
            Button(
                enabled = recoveryReady,
                onClick = {
                    importScope = imageScope.name
                    pickImage.launch(arrayOf("image/*"))
                },
            ) { Text(if (recoveryReady) "＋ ছবি আমদানি করুন" else "মিডিয়া প্রস্তুত হচ্ছে…") }
            if (images.isEmpty()) {
                Text("এই scope-এ এখনো কোনো ছবি নেই।", color = MaterialTheme.colorScheme.onSurfaceVariant)
            } else {
                LazyColumn(verticalArrangement = Arrangement.spacedBy(10.dp)) {
                    items(images, key = { it.id }) { row ->
                        Card(Modifier.fillMaxWidth()) {
                            Column(Modifier.padding(12.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                                Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                                    Text(row.name.ifBlank { row.id }, style = MaterialTheme.typography.titleSmall, modifier = Modifier.weight(1f))
                                    Text(row.status, color = if (row.status == "READY") MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.error)
                                }
                                MediaPreview(row.path, pipeline, Modifier.fillMaxWidth().heightIn(max = 180.dp).clickable { previewPath = row.path }, refreshKey = row.sha)
                                Text("${row.width} × ${row.height} px · ${row.bytes / 1024} KB", style = MaterialTheme.typography.bodySmall)
                                Text("SHA-256: ${row.sha.take(16)}…", style = MaterialTheme.typography.bodySmall)
                                Row(horizontalArrangement = Arrangement.spacedBy(4.dp)) {
                                    TextButton(enabled = recoveryReady, onClick = { scope.launch { runCatching { pipeline.transformImage(row.id, imageScope, rotateDegrees = 90) }.onFailure { errorText = it.message ?: "Rotate ব্যর্থ" } } }) { Text("↻ Rotate") }
                                    TextButton(enabled = recoveryReady, onClick = { scope.launch { runCatching { pipeline.transformImage(row.id, imageScope, centreCropSquare = true) }.onFailure { errorText = it.message ?: "Crop ব্যর্থ" } } }) { Text("Crop") }
                                    TextButton(enabled = recoveryReady, onClick = {
                                        exportId = row.id
                                        exportScope = imageScope.name
                                        exportImage.launch(row.name.substringBeforeLast('.', "image").take(80) + ".png")
                                    }) { Text("Export") }
                                    TextButton(enabled = recoveryReady, onClick = {
                                        pendingDeleteId = row.id
                                        pendingDeleteScope = imageScope.name
                                        pendingDeleteName = row.name
                                    }) { Text("মুছুন", color = MaterialTheme.colorScheme.error) }
                                }
                            }
                        }
                    }
                }
            }
        }
    }
}

private data class MediaRow(val id: String, val path: String, val name: String, val width: Long, val height: Long, val bytes: Long, val sha: String, val status: String)

@Composable
private fun MediaPreview(path: String, pipeline: ImagePipeline, modifier: Modifier = Modifier, refreshKey: String = path) {
    val bitmap by produceState<Bitmap?>(null, path, refreshKey) {
        value = withContext(Dispatchers.IO) {
            val file = runCatching { pipeline.storedFile(path) }.getOrNull()
            file?.takeIf { it.isFile }?.let { source ->
                val bounds = BitmapFactory.Options().apply { inJustDecodeBounds = true }
                BitmapFactory.decodeFile(source.absolutePath, bounds)
                var sample = 1
                while (maxOf(bounds.outWidth, bounds.outHeight) / (sample * 2) > 700) sample *= 2
                BitmapFactory.decodeFile(source.absolutePath, BitmapFactory.Options().apply { inSampleSize = sample })
            }
        }
    }
    if (bitmap != null) Image(bitmap!!.asImageBitmap(), contentDescription = "সংরক্ষিত ছবি", modifier = modifier, contentScale = ContentScale.Fit)
    else Text("ছবি দেখা যাচ্ছে না", color = MaterialTheme.colorScheme.error, modifier = Modifier.padding(8.dp))
}
