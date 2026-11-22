package com.questionbank.app.ui.question

import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.Color as AndroidColor
import android.graphics.Matrix
import androidx.compose.foundation.Image
import androidx.compose.ui.platform.LocalContext
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.AlertDialog
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.draw.clip
import androidx.compose.foundation.clickable
import androidx.compose.foundation.background
import androidx.compose.ui.unit.sp
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.FilterChip
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Slider
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.unit.dp
import androidx.compose.ui.window.Dialog
import androidx.compose.ui.window.DialogProperties
import com.questionbank.app.media.ImagePipeline
import com.questionbank.app.media.ImageScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import kotlin.math.max
import kotlin.math.roundToInt

private enum class ImageScanMode { ORIGINAL, CLEAN_GRAY, BLACK_WHITE }
private enum class CropSide(val label: String) { TOP("উপর"), BOTTOM("নিচ"), LEFT("বাম"), RIGHT("ডান") }

/** Legacy-equivalent image editor: rotate, four-edge crop, clean grayscale and Otsu black/white scan. */
@Composable
internal fun ImageEditDialog(
    pipeline: ImagePipeline,
    imageId: String,
    imageScope: ImageScope,
    onDismiss: () -> Unit,
    onSaved: (String) -> Unit,
) {
    val scope = rememberCoroutineScope()
    val sourceState = remember(imageId) { mutableStateOf<Bitmap?>(null) }
    val previewState = remember(imageId) { mutableStateOf<Bitmap?>(null) }
    var loading by remember(imageId) { mutableStateOf(true) }
    var saving by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf("") }
    var rotation by remember(imageId) { mutableStateOf(0) }
    var top by remember(imageId) { mutableStateOf(0f) }
    var bottom by remember(imageId) { mutableStateOf(0f) }
    var left by remember(imageId) { mutableStateOf(0f) }
    var right by remember(imageId) { mutableStateOf(0f) }
    var scan by remember(imageId) { mutableStateOf(ImageScanMode.ORIGINAL) }
    // Resize target (0 = keep size). Applied after rotate/crop/scan; the whole picture is scaled to exactly this size (it may stretch).
    var targetW by remember(imageId) { mutableStateOf(0) }
    var targetH by remember(imageId) { mutableStateOf(0) }
    val context = LocalContext.current
    var customSizes by remember { mutableStateOf(loadCustomSizes(context)) }
    var resizeMenuOpen by remember { mutableStateOf(false) }
    var addSizeOpen by remember { mutableStateOf(false) }
    // A crop/rotation/scan change invalidates the old preview immediately. Do not allow Save
    // until the preview that matches the current controls has finished rendering.
    var previewKey by remember(imageId) { mutableStateOf("") }
    val currentPreviewKey = "$rotation|$top|$bottom|$left|$right|${scan.name}|$targetW|$targetH"
    val hasEdits = targetW > 0 || rotation != 0 || top > 0f || bottom > 0f || left > 0f || right > 0f || scan != ImageScanMode.ORIGINAL

    LaunchedEffect(imageId) {
        loading = true
        error = ""
        val decoded = withContext(Dispatchers.IO) {
            val file = pipeline.fileForImage(imageId, imageScope) ?: return@withContext null
            BitmapFactory.decodeFile(file.absolutePath)
        }
        sourceState.value = decoded
        loading = false
        if (decoded == null) error = "ছবিটি খোলা যায়নি।"
    }

    val source = sourceState.value
    LaunchedEffect(source, rotation, top, bottom, left, right, scan, targetW, targetH) {
        if (source == null) return@LaunchedEffect
        val renderKey = "$rotation|$top|$bottom|$left|$right|${scan.name}|$targetW|$targetH"
        val next = withContext(Dispatchers.Default) {
            renderEditedBitmap(source, rotation, top, bottom, left, right, scan, targetW, targetH)
        }
        previewState.value = next
        previewKey = renderKey
    }

    fun updateCrop(side: CropSide, raw: Float) {
        val value = raw.coerceIn(0f, 100f)
        when (side) {
            CropSide.TOP -> top = value
            CropSide.BOTTOM -> bottom = value
            CropSide.LEFT -> left = value
            CropSide.RIGHT -> right = value
        }
    }

    if (addSizeOpen) {
        AddResizeSizeDialog(
            onDismiss = { addSizeOpen = false },
            onAdd = { w, h ->
                if ((w to h) !in DEFAULT_RESIZE_SIZES && (w to h) !in customSizes) {
                    customSizes = customSizes + (w to h)
                    saveCustomSizes(context, customSizes)
                }
                targetW = w
                targetH = h
                addSizeOpen = false
            },
        )
    }

    Dialog(onDismissRequest = { if (!saving) onDismiss() }, properties = DialogProperties(usePlatformDefaultWidth = false)) {
        Surface(
            modifier = Modifier.fillMaxWidth(0.96f).heightIn(max = 760.dp),
            shape = MaterialTheme.shapes.extraLarge,
            color = MaterialTheme.colorScheme.surface,
            tonalElevation = 8.dp,
        ) {
            Column(Modifier.verticalScroll(rememberScrollState()).padding(16.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
                Text("ছবি এডিট", style = MaterialTheme.typography.titleLarge)
                // Ribbon: current resolution + resize dropdown.
                Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.SpaceBetween) {
                    val shown = previewState.value
                    val sizeText = if (shown != null && previewKey == currentPreviewKey) "${shown.width}×${shown.height}" else "…"
                    Text("মাপ: $sizeText", style = MaterialTheme.typography.bodyMedium, fontWeight = FontWeight.SemiBold)
                    Box {
                        OutlinedButton(enabled = !saving && source != null, onClick = { resizeMenuOpen = true }) {
                            Text(if (targetW > 0) "রিসাইজ: $targetW×$targetH ▾" else "রিসাইজ ▾")
                        }
                        DropdownMenu(expanded = resizeMenuOpen, onDismissRequest = { resizeMenuOpen = false }) {
                            DropdownMenuItem(
                                text = { Text(if (targetW == 0) "✓ রিসাইজ নেই" else "রিসাইজ নেই") },
                                onClick = { targetW = 0; targetH = 0; resizeMenuOpen = false },
                            )
                            (DEFAULT_RESIZE_SIZES + customSizes.filterNot { it in DEFAULT_RESIZE_SIZES }).forEach { (w, h) ->
                                DropdownMenuItem(
                                    text = { Text((if (targetW == w && targetH == h) "✓ " else "") + "$w×$h") },
                                    onClick = { targetW = w; targetH = h; resizeMenuOpen = false },
                                )
                            }
                            HorizontalDivider()
                            DropdownMenuItem(
                                text = { Text("+ নতুন মাপ যোগ করুন", color = MaterialTheme.colorScheme.primary) },
                                onClick = { resizeMenuOpen = false; addSizeOpen = true },
                            )
                        }
                    }
                }
                Surface(
                    modifier = Modifier.fillMaxWidth().heightIn(min = 160.dp, max = 280.dp),
                    color = MaterialTheme.colorScheme.surfaceVariant,
                    shape = MaterialTheme.shapes.medium,
                ) {
                    when {
                        loading -> Column(Modifier.fillMaxWidth().padding(24.dp), horizontalAlignment = Alignment.CenterHorizontally) {
                            CircularProgressIndicator()
                            Text("ছবি লোড হচ্ছে…")
                        }
                        previewState.value != null -> Image(
                            bitmap = previewState.value!!.asImageBitmap(),
                            contentDescription = "সম্পাদিত ছবির প্রিভিউ",
                            modifier = Modifier.fillMaxWidth().heightIn(max = 280.dp).padding(4.dp),
                            contentScale = ContentScale.Fit,
                        )
                        else -> Text(error.ifBlank { "ছবি দেখা যাচ্ছে না।" }, modifier = Modifier.padding(20.dp))
                    }
                }
                Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    OutlinedButton(
                        enabled = !saving && source != null,
                        modifier = Modifier.weight(1f),
                        onClick = { rotation = (rotation + 270) % 360; top = 0f; bottom = 0f; left = 0f; right = 0f },
                    ) { Text("↶ বাঁয়ে ঘোরাও") }
                    OutlinedButton(
                        enabled = !saving && source != null,
                        modifier = Modifier.weight(1f),
                        onClick = { rotation = (rotation + 90) % 360; top = 0f; bottom = 0f; left = 0f; right = 0f },
                    ) { Text("↷ ডানে ঘোরাও") }
                }
                Text("ক্রপ (কেটে ফেলার অংশ)", style = MaterialTheme.typography.titleSmall)
                CropSide.entries.forEach { side ->
                    val value = when (side) {
                        CropSide.TOP -> top
                        CropSide.BOTTOM -> bottom
                        CropSide.LEFT -> left
                        CropSide.RIGHT -> right
                    }
                    CropRow(
                        label = side.label,
                        value = value,
                        maxValue = 100f,
                        enabled = !saving && source != null,
                        onChange = { updateCrop(side, it) },
                    )
                }
                Text("স্ক্যান মোড (কাগজের ছবির জন্য)", style = MaterialTheme.typography.titleSmall)
                Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(4.dp)) {
                    FilterChip(selected = scan == ImageScanMode.ORIGINAL, onClick = { scan = ImageScanMode.ORIGINAL }, label = { Text("যেমন আছে") }, enabled = !saving, modifier = Modifier.weight(1f))
                    FilterChip(selected = scan == ImageScanMode.CLEAN_GRAY, onClick = { scan = ImageScanMode.CLEAN_GRAY }, label = { Text("পরিষ্কার (গ্রে)") }, enabled = !saving, modifier = Modifier.weight(1f))
                    FilterChip(selected = scan == ImageScanMode.BLACK_WHITE, onClick = { scan = ImageScanMode.BLACK_WHITE }, label = { Text("সাদা-কালো") }, enabled = !saving, modifier = Modifier.weight(1f))
                }
                if (previewState.value != null && previewKey != currentPreviewKey && !loading) {
                    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        CircularProgressIndicator(Modifier.size(14.dp), strokeWidth = 2.dp)
                        Text("পরিবর্তিত প্রিভিউ তৈরি হচ্ছে…", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                    }
                }
                if (error.isNotBlank()) Text(error, color = MaterialTheme.colorScheme.error, style = MaterialTheme.typography.bodySmall)
                Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp), verticalAlignment = Alignment.CenterVertically) {
                    TextButton(enabled = !saving, onClick = onDismiss, modifier = Modifier.weight(1f)) { Text("বাতিল") }
                    Button(
                        enabled = !saving && previewState.value != null && previewKey == currentPreviewKey,
                        onClick = {
                            if (previewKey != currentPreviewKey) return@Button
                            if (!hasEdits) { onDismiss(); return@Button }
                            val edited = previewState.value ?: return@Button
                            saving = true
                            error = ""
                            scope.launch {
                                runCatching { pipeline.importBitmap(edited, imageScope) }
                                    .onSuccess { newId -> onSaved(newId) }
                                    .onFailure { error = it.message ?: "সম্পাদিত ছবি সংরক্ষণ করা যায়নি।"; saving = false }
                            }
                        },
                        modifier = Modifier.weight(1f),
                    ) {
                        if (saving) CircularProgressIndicator(Modifier.size(16.dp), strokeWidth = 2.dp)
                        else Text("ঠিক আছে / সংরক্ষণ")
                    }
                }
                Spacer(Modifier.height(2.dp))
            }
        }
    }
}

private fun cropText(v: Float): String =
    String.format(java.util.Locale.US, "%.2f", v).trimEnd('0').trimEnd('.')

/** One crop edge: label, fine slider (0.01% steps, no limit) and a box to type an exact value such as 12.5. */
@Composable
private fun CropRow(label: String, value: Float, maxValue: Float, enabled: Boolean, onChange: (Float) -> Unit) {
    val cs = MaterialTheme.colorScheme
    var text by remember { mutableStateOf(cropText(value)) }
    // Follow outside changes (slider, rotate reset, opposite edge limit) without fighting the user's typing ("12." stays "12.").
    LaunchedEffect(value) {
        val parsed = text.toFloatOrNull()
        if (parsed != null && kotlin.math.abs(parsed - value) > 0.0001f) text = cropText(value)
    }
    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp)) {
        Text(label, modifier = Modifier.width(34.dp), style = MaterialTheme.typography.bodySmall)
        Slider(
            value = value.coerceIn(0f, maxValue),
            onValueChange = { onChange((it * 100f).roundToInt() / 100f) },
            valueRange = 0f..maxValue,
            enabled = enabled,
            modifier = Modifier.weight(1f),
        )
        CropStepButton("−", enabled && value > 0f) { onChange((((value * 100f).roundToInt() - 1) / 100f).coerceIn(0f, maxValue)) }
        Box(
            Modifier.width(68.dp).height(34.dp)
                .border(1.dp, cs.outline, RoundedCornerShape(8.dp))
                .padding(horizontal = 6.dp),
            contentAlignment = Alignment.CenterEnd,
        ) {
            BasicTextField(
                value = text,
                onValueChange = { raw ->
                    val clean = raw.filter { it.isDigit() || it == '.' }.take(6)
                    if (clean.count { it == '.' } <= 1) {
                        text = clean
                        clean.toFloatOrNull()?.let { typed ->
                            val limited = (typed * 100f).roundToInt() / 100f
                            onChange(limited.coerceIn(0f, maxValue))
                        }
                    }
                },
                enabled = enabled,
                singleLine = true,
                keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Decimal),
                textStyle = TextStyle(color = cs.onSurface, fontSize = 13.sp, textAlign = TextAlign.End),
                cursorBrush = SolidColor(cs.primary),
                modifier = Modifier.fillMaxWidth(),
            )
        }
        CropStepButton("+", enabled && value < maxValue) { onChange((((value * 100f).roundToInt() + 1) / 100f).coerceIn(0f, maxValue)) }
        Text("%", style = MaterialTheme.typography.labelSmall)
    }
}

/** Small − / + button: one tap moves the crop edge by 0.01%. */
@Composable
private fun CropStepButton(symbol: String, enabled: Boolean, onClick: () -> Unit) {
    val cs = MaterialTheme.colorScheme
    Box(
        Modifier.size(30.dp)
            .clip(RoundedCornerShape(8.dp))
            .background(if (enabled) cs.primaryContainer else cs.surfaceVariant)
            .clickable(enabled = enabled, onClick = onClick),
        contentAlignment = Alignment.Center,
    ) {
        Text(symbol, color = if (enabled) cs.primary else cs.onSurface.copy(alpha = 0.3f), fontSize = 18.sp, fontWeight = FontWeight.SemiBold)
    }
}

private val DEFAULT_RESIZE_SIZES = listOf(1024 to 350, 1024 to 400)
private const val RESIZE_PREFS = "image_edit_prefs"
private const val RESIZE_PREFS_KEY = "custom_resize_sizes"
/** The saved image pipeline never stores an edge above this (see ImagePipeline.MAX_EDGE_PX). */
private const val RESIZE_MAX_EDGE = 2048

private fun loadCustomSizes(context: android.content.Context): List<Pair<Int, Int>> =
    context.getSharedPreferences(RESIZE_PREFS, android.content.Context.MODE_PRIVATE)
        .getString(RESIZE_PREFS_KEY, "").orEmpty().split(';').mapNotNull { item ->
            val parts = item.split('x')
            val w = parts.getOrNull(0)?.toIntOrNull()
            val h = parts.getOrNull(1)?.toIntOrNull()
            if (w != null && h != null && w in 1..RESIZE_MAX_EDGE && h in 1..RESIZE_MAX_EDGE) w to h else null
        }

private fun saveCustomSizes(context: android.content.Context, sizes: List<Pair<Int, Int>>) {
    context.getSharedPreferences(RESIZE_PREFS, android.content.Context.MODE_PRIVATE).edit()
        .putString(RESIZE_PREFS_KEY, sizes.joinToString(";") { "${it.first}x${it.second}" }).apply()
}

/** Asks for a width and height; the new size is saved so it appears in the list next time. */
@Composable
private fun AddResizeSizeDialog(onDismiss: () -> Unit, onAdd: (Int, Int) -> Unit) {
    var widthText by remember { mutableStateOf("") }
    var heightText by remember { mutableStateOf("") }
    val w = widthText.toIntOrNull()
    val h = heightText.toIntOrNull()
    val valid = w != null && h != null && w in 1..RESIZE_MAX_EDGE && h in 1..RESIZE_MAX_EDGE
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text("নতুন রিসাইজ মাপ") },
        text = {
            Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                OutlinedTextField(
                    value = widthText,
                    onValueChange = { widthText = it.filter(Char::isDigit).take(4) },
                    label = { Text("প্রস্থ (px)") },
                    singleLine = true,
                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
                )
                OutlinedTextField(
                    value = heightText,
                    onValueChange = { heightText = it.filter(Char::isDigit).take(4) },
                    label = { Text("উচ্চতা (px)") },
                    singleLine = true,
                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
                )
                Text("সর্বোচ্চ $RESIZE_MAX_EDGE px", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
        },
        confirmButton = { TextButton(enabled = valid, onClick = { onAdd(w!!, h!!) }) { Text("যোগ করুন") } },
        dismissButton = { TextButton(onClick = onDismiss) { Text("বাতিল") } },
    )
}

private fun renderEditedBitmap(
    source: Bitmap,
    rotation: Int,
    top: Float,
    bottom: Float,
    left: Float,
    right: Float,
    scan: ImageScanMode,
    targetW: Int = 0,
    targetH: Int = 0,
): Bitmap {
    val working = source.copy(Bitmap.Config.ARGB_8888, true)
    val rotated = if (rotation % 360 == 0) working else {
        val matrix = Matrix().apply { postRotate(rotation.toFloat()) }
        Bitmap.createBitmap(working, 0, 0, working.width, working.height, matrix, true).also { if (it !== working) working.recycle() }
    }
    val x = (rotated.width * (left / 100f)).roundToInt().coerceIn(0, rotated.width - 1)
    val y = (rotated.height * (top / 100f)).roundToInt().coerceIn(0, rotated.height - 1)
    val cropWidth = (rotated.width * (1f - (left + right) / 100f)).roundToInt().coerceAtLeast(1).coerceAtMost(rotated.width - x)
    val cropHeight = (rotated.height * (1f - (top + bottom) / 100f)).roundToInt().coerceAtLeast(1).coerceAtMost(rotated.height - y)
    val cropped = Bitmap.createBitmap(rotated, x, y, cropWidth, cropHeight)
    if (cropped !== rotated) rotated.recycle()
    if (scan != ImageScanMode.ORIGINAL) applyScanMode(cropped, scan)
    if (targetW > 0 && targetH > 0 && (cropped.width != targetW || cropped.height != targetH)) {
        val resized = Bitmap.createScaledBitmap(cropped, targetW, targetH, true)
        if (resized !== cropped) cropped.recycle()
        return resized
    }
    return cropped
}

private fun applyScanMode(bitmap: Bitmap, scan: ImageScanMode) {
    val count = bitmap.width * bitmap.height
    val pixels = IntArray(count)
    bitmap.getPixels(pixels, 0, bitmap.width, 0, 0, bitmap.width, bitmap.height)
    val luminance = IntArray(count)
    val histogram = IntArray(256)
    for (i in pixels.indices) {
        val color = pixels[i]
        val luma = (0.299 * AndroidColor.red(color) + 0.587 * AndroidColor.green(color) + 0.114 * AndroidColor.blue(color)).roundToInt().coerceIn(0, 255)
        luminance[i] = luma
        histogram[luma]++
    }
    if (scan == ImageScanMode.BLACK_WHITE) {
        val threshold = otsuThreshold(histogram)
        for (i in pixels.indices) {
            val value = if (luminance[i] > threshold) 255 else 0
            pixels[i] = AndroidColor.rgb(value, value, value)
        }
    } else {
        val cut = max(1, (count * 0.02).toInt())
        var accumulated = 0
        var low = 0
        for (i in 0..255) {
            accumulated += histogram[i]
            if (accumulated >= cut) { low = i; break }
        }
        accumulated = 0
        var high = 255
        for (i in 255 downTo 0) {
            accumulated += histogram[i]
            if (accumulated >= cut) { high = i; break }
        }
        if (high - low < 10) { low = 0; high = 255 }
        val scale = 255f / (high - low).coerceAtLeast(1)
        for (i in pixels.indices) {
            val value = ((luminance[i] - low) * scale).roundToInt().coerceIn(0, 255)
            pixels[i] = AndroidColor.rgb(value, value, value)
        }
    }
    bitmap.setPixels(pixels, 0, bitmap.width, 0, 0, bitmap.width, bitmap.height)
}

private fun otsuThreshold(histogram: IntArray): Int {
    val total = histogram.sum()
    if (total == 0) return 128
    var sumAll = 0L
    for (i in 0..255) sumAll += i.toLong() * histogram[i]
    var weightBackground = 0L
    var sumBackground = 0L
    var bestThreshold = 0
    var bestVariance = -1.0
    for (threshold in 0..255) {
        weightBackground += histogram[threshold]
        if (weightBackground == 0L) continue
        val weightForeground = total - weightBackground
        if (weightForeground == 0L) break
        sumBackground += threshold.toLong() * histogram[threshold]
        val meanBackground = sumBackground.toDouble() / weightBackground
        val meanForeground = (sumAll - sumBackground).toDouble() / weightForeground
        val delta = meanBackground - meanForeground
        val variance = weightBackground.toDouble() * weightForeground * delta * delta
        if (variance > bestVariance) { bestVariance = variance; bestThreshold = threshold }
    }
    return bestThreshold
}
