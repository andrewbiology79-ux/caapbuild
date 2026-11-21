package com.questionbank.app.ui.question

import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBars
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.layout.windowInsetsPadding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Checkbox
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.LocalTextStyle
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.Stable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.drawBehind
import androidx.compose.ui.geometry.CornerRadius
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.PathEffect
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.StrokeJoin
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.TextRange
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.TextFieldValue
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.gestures.detectDragGestures
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.platform.LocalDensity
import com.questionbank.app.domain.question.AddBoardResult
import com.questionbank.app.domain.question.BoardItem
import com.questionbank.app.domain.question.BoardRules
import com.questionbank.app.domain.question.BoardTag
import com.questionbank.app.domain.question.QuestionSolutionPart
import com.questionbank.app.domain.question.QuestionStimulusImage
import com.questionbank.app.domain.question.RatingRules
import com.questionbank.app.media.ImagePipeline
import com.questionbank.app.media.ImageScope
import com.questionbank.app.ui.format.toBengali
import com.questionbank.app.ui.theme.HeaderDark
import com.questionbank.app.ui.theme.HeaderLight
import com.questionbank.app.ui.theme.LocalDarkTheme
import com.questionbank.app.ui.theme.LocalQuestionBodyTextSize
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.launch

/* ---------------------------------------------------------------------------------------------------------------------
 * Editor design (v1.73): rounded cards, pill buttons, dashed add-buttons, a blue top bar with undo/redo and a round save
 * button, and a segmented Minimum / Full Editor switch. No icon library is used; the few icons are drawn on a Canvas.
 * ------------------------------------------------------------------------------------------------------------------- */

enum class EdIcon { EYE, IMAGE_ADD, PLUS_BOX, TRASH, CHECK, CLOSE, CHEVRON, LAYERS, REFRESH, SORT }

@Composable
fun EdIconGlyph(icon: EdIcon, tint: Color, modifier: Modifier = Modifier.size(22.dp)) {
    Canvas(modifier) {
        val w = size.width
        val h = size.height
        val stroke = Stroke(width = w * 0.09f, cap = StrokeCap.Round, join = StrokeJoin.Round)
        when (icon) {
            EdIcon.EYE -> {
                val outline = Path().apply {
                    moveTo(w * 0.06f, h * 0.5f)
                    cubicTo(w * 0.3f, h * 0.1f, w * 0.7f, h * 0.1f, w * 0.94f, h * 0.5f)
                    cubicTo(w * 0.7f, h * 0.9f, w * 0.3f, h * 0.9f, w * 0.06f, h * 0.5f)
                    close()
                }
                drawPath(outline, tint, style = stroke)
                drawCircle(tint, radius = w * 0.14f, center = Offset(w * 0.5f, h * 0.5f), style = stroke)
            }
            EdIcon.IMAGE_ADD -> {
                drawRoundRect(
                    tint,
                    topLeft = Offset(w * 0.08f, h * 0.2f),
                    size = Size(w * 0.72f, h * 0.72f),
                    cornerRadius = CornerRadius(w * 0.1f),
                    style = stroke,
                )
                val hills = Path().apply {
                    moveTo(w * 0.12f, h * 0.84f)
                    lineTo(w * 0.36f, h * 0.56f)
                    lineTo(w * 0.52f, h * 0.74f)
                    lineTo(w * 0.62f, h * 0.64f)
                    lineTo(w * 0.78f, h * 0.84f)
                }
                drawPath(hills, tint, style = stroke)
                drawCircle(tint, radius = w * 0.05f, center = Offset(w * 0.3f, h * 0.38f))
                drawLine(tint, Offset(w * 0.82f, h * 0.02f), Offset(w * 0.82f, h * 0.34f), strokeWidth = stroke.width, cap = StrokeCap.Round)
                drawLine(tint, Offset(w * 0.66f, h * 0.18f), Offset(w * 0.98f, h * 0.18f), strokeWidth = stroke.width, cap = StrokeCap.Round)
            }
            EdIcon.PLUS_BOX -> {
                drawRoundRect(tint, topLeft = Offset(w * 0.1f, h * 0.1f), size = Size(w * 0.8f, h * 0.8f), cornerRadius = CornerRadius(w * 0.12f), style = stroke)
                drawLine(tint, Offset(w * 0.5f, h * 0.3f), Offset(w * 0.5f, h * 0.7f), strokeWidth = stroke.width, cap = StrokeCap.Round)
                drawLine(tint, Offset(w * 0.3f, h * 0.5f), Offset(w * 0.7f, h * 0.5f), strokeWidth = stroke.width, cap = StrokeCap.Round)
            }
            EdIcon.TRASH -> {
                drawLine(tint, Offset(w * 0.18f, h * 0.26f), Offset(w * 0.82f, h * 0.26f), strokeWidth = stroke.width, cap = StrokeCap.Round)
                val handle = Path().apply {
                    moveTo(w * 0.4f, h * 0.26f)
                    lineTo(w * 0.4f, h * 0.12f)
                    lineTo(w * 0.6f, h * 0.12f)
                    lineTo(w * 0.6f, h * 0.26f)
                }
                drawPath(handle, tint, style = stroke)
                val body = Path().apply {
                    moveTo(w * 0.27f, h * 0.26f)
                    lineTo(w * 0.32f, h * 0.88f)
                    lineTo(w * 0.68f, h * 0.88f)
                    lineTo(w * 0.73f, h * 0.26f)
                }
                drawPath(body, tint, style = stroke)
            }
            EdIcon.CHECK -> {
                val tick = Path().apply {
                    moveTo(w * 0.18f, h * 0.54f)
                    lineTo(w * 0.42f, h * 0.76f)
                    lineTo(w * 0.82f, h * 0.28f)
                }
                drawPath(tick, tint, style = Stroke(width = w * 0.12f, cap = StrokeCap.Round, join = StrokeJoin.Round))
            }
            EdIcon.CLOSE -> {
                drawLine(tint, Offset(w * 0.2f, h * 0.2f), Offset(w * 0.8f, h * 0.8f), strokeWidth = w * 0.11f, cap = StrokeCap.Round)
                drawLine(tint, Offset(w * 0.8f, h * 0.2f), Offset(w * 0.2f, h * 0.8f), strokeWidth = w * 0.11f, cap = StrokeCap.Round)
            }
            EdIcon.CHEVRON -> {
                val v = Path().apply {
                    moveTo(w * 0.22f, h * 0.38f)
                    lineTo(w * 0.5f, h * 0.66f)
                    lineTo(w * 0.78f, h * 0.38f)
                }
                drawPath(v, tint, style = Stroke(width = w * 0.11f, cap = StrokeCap.Round, join = StrokeJoin.Round))
            }
            EdIcon.LAYERS -> {
                val top = Path().apply {
                    moveTo(w * 0.5f, h * 0.1f)
                    lineTo(w * 0.92f, h * 0.34f)
                    lineTo(w * 0.5f, h * 0.58f)
                    lineTo(w * 0.08f, h * 0.34f)
                    close()
                }
                drawPath(top, tint, style = stroke)
                val mid = Path().apply {
                    moveTo(w * 0.08f, h * 0.5f)
                    lineTo(w * 0.5f, h * 0.74f)
                    lineTo(w * 0.92f, h * 0.5f)
                }
                drawPath(mid, tint, style = stroke)
                val low = Path().apply {
                    moveTo(w * 0.08f, h * 0.66f)
                    lineTo(w * 0.5f, h * 0.9f)
                    lineTo(w * 0.92f, h * 0.66f)
                }
                drawPath(low, tint, style = stroke)
            }
            EdIcon.REFRESH -> {
                drawArc(
                    tint,
                    startAngle = 40f,
                    sweepAngle = 280f,
                    useCenter = false,
                    topLeft = Offset(w * 0.15f, h * 0.15f),
                    size = Size(w * 0.7f, h * 0.7f),
                    style = stroke,
                )
                val head = Path().apply {
                    moveTo(w * 0.62f, h * 0.08f)
                    lineTo(w * 0.8f, h * 0.2f)
                    lineTo(w * 0.62f, h * 0.34f)
                }
                drawPath(head, tint, style = stroke)
            }
            EdIcon.SORT -> {
                // Lucide ArrowDownUp-like glyph used by the old "ক-খ-গ-ঘ সাজাও" control.
                drawLine(tint, Offset(w * 0.30f, h * 0.16f), Offset(w * 0.30f, h * 0.82f), strokeWidth = stroke.width, cap = StrokeCap.Round)
                drawLine(tint, Offset(w * 0.14f, h * 0.66f), Offset(w * 0.30f, h * 0.82f), strokeWidth = stroke.width, cap = StrokeCap.Round)
                drawLine(tint, Offset(w * 0.46f, h * 0.66f), Offset(w * 0.30f, h * 0.82f), strokeWidth = stroke.width, cap = StrokeCap.Round)
                drawLine(tint, Offset(w * 0.70f, h * 0.84f), Offset(w * 0.70f, h * 0.18f), strokeWidth = stroke.width, cap = StrokeCap.Round)
                drawLine(tint, Offset(w * 0.54f, h * 0.34f), Offset(w * 0.70f, h * 0.18f), strokeWidth = stroke.width, cap = StrokeCap.Round)
                drawLine(tint, Offset(w * 0.86f, h * 0.34f), Offset(w * 0.70f, h * 0.18f), strokeWidth = stroke.width, cap = StrokeCap.Round)
            }
        }
    }
}

internal fun Modifier.dashedBorder(color: Color, radius: Dp = 12.dp, width: Dp = 1.5.dp): Modifier = this.drawBehind {
    drawRoundRect(
        color = color,
        cornerRadius = CornerRadius(radius.toPx()),
        style = Stroke(width = width.toPx(), pathEffect = PathEffect.dashPathEffect(floatArrayOf(10f, 8f), 0f)),
    )
}

/** Legacy-matched 32 dp square icon button: filled light-blue, or a dashed outline for "add" actions. */
@Composable
fun EdIconButton(
    icon: EdIcon,
    description: String,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
    enabled: Boolean = true,
    dashed: Boolean = false,
    tintOverride: Color? = null,
    selected: Boolean = false,
) {
    val cs = MaterialTheme.colorScheme
    val shape = RoundedCornerShape(6.dp)
    val base = tintOverride ?: cs.primary
    val tint = if (!enabled) cs.onSurface.copy(alpha = 0.3f) else if (selected) cs.onPrimary else base
    val buttonBackground = when {
        selected -> cs.primary
        tintOverride != null -> Color(0xFFFEF2F2)
        else -> cs.primaryContainer
    }
    val buttonBorder = when {
        selected -> cs.primary
        tintOverride != null -> tintOverride.copy(alpha = 0.28f)
        else -> cs.outlineVariant
    }
    Box(
        modifier = modifier
            .size(32.dp)
            .clip(shape)
            .then(Modifier.background(buttonBackground, shape))
            .then(if (dashed) Modifier.dashedBorder(if (enabled) base else tint) else Modifier.border(1.dp, buttonBorder, shape))
            .clickable(enabled = enabled, onClick = onClick)
            .semantics { contentDescription = description },
        contentAlignment = Alignment.Center,
    ) { EdIconGlyph(icon, tint, Modifier.size(16.dp)) }
}

/** A compact 32 dp pill with an optional dropdown arrow. [accent] gives the yellow rating look. */
@Composable
fun EdPill(
    text: String,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
    enabled: Boolean = true,
    accent: Boolean = false,
    dropdown: Boolean = true,
    icon: EdIcon? = null,
) {
    val cs = MaterialTheme.colorScheme
    val dark = LocalDarkTheme.current
    val shape = RoundedCornerShape(6.dp)
    val container = if (accent) (if (dark) Color(0xFF3A3210) else Color(0xFFFFF6CC)) else cs.surface
    val border = if (accent) (if (dark) Color(0xFF6B5B1A) else Color(0xFFF0D77A)) else cs.outlineVariant
    val content = if (accent) (if (dark) Color(0xFFFDE68A) else Color(0xFF7A4B00)) else cs.onSurface
    Row(
        modifier = modifier
            .height(32.dp)
            .clip(shape)
            .background(container, shape)
            .border(1.dp, border, shape)
            .clickable(enabled = enabled, onClick = onClick)
            .padding(horizontal = 6.dp)
            .alpha(if (enabled) 1f else 0.5f),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(4.dp),
    ) {
        if (icon != null) EdIconGlyph(icon, content, Modifier.size(14.dp))
        Text(text, color = content, fontSize = 11.sp, fontWeight = FontWeight.Bold, maxLines = 1, overflow = TextOverflow.Ellipsis, modifier = Modifier.widthIn(max = 96.dp))
        if (dropdown) EdIconGlyph(EdIcon.CHEVRON, content, Modifier.size(12.dp))
    }
}

/** The big white rounded card every section of the editor sits in. */
@Composable
fun EdCard(modifier: Modifier = Modifier, content: @Composable ColumnScope.() -> Unit) {
    val cs = MaterialTheme.colorScheme
    Surface(
        shape = RoundedCornerShape(16.dp),
        color = cs.surface,
        border = BorderStroke(1.dp, cs.outlineVariant),
        shadowElevation = 1.dp,
        modifier = modifier.fillMaxWidth(),
    ) {
        Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(12.dp), content = content)
    }
}

/** Blue top bar: close, title, "unsaved" badge, undo, redo and a round white save button. */
@Composable
fun EditorTopBar(
    title: String,
    unsaved: Boolean,
    canUndo: Boolean,
    canRedo: Boolean,
    saving: Boolean,
    saveEnabled: Boolean,
    onClose: () -> Unit,
    onUndo: () -> Unit,
    onRedo: () -> Unit,
    onSave: () -> Unit,
) {
    val container = if (LocalDarkTheme.current) HeaderDark else HeaderLight
    val primary = MaterialTheme.colorScheme.primary
    Surface(color = container, contentColor = Color.White, modifier = Modifier.fillMaxWidth()) {
        Row(
            modifier = Modifier
                .windowInsetsPadding(WindowInsets.statusBars)
                .height(56.dp)
                .padding(start = 8.dp, end = 16.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(2.dp),
        ) {
            Box(
                Modifier.size(44.dp).clip(CircleShape).clickable(onClick = onClose).semantics { contentDescription = "বন্ধ করুন" },
                contentAlignment = Alignment.Center,
            ) { EdIconGlyph(EdIcon.CLOSE, Color.White, Modifier.size(20.dp)) }
            Text(
                title,
                color = Color.White,
                fontSize = 15.sp,
                fontWeight = FontWeight.Bold,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
                modifier = Modifier.weight(1f).padding(start = 4.dp),
            )
            if (unsaved) {
                Text(
                    "অসংরক্ষিত",
                    color = Color(0xFF5A3A00),
                    fontSize = 10.sp,
                    fontWeight = FontWeight.Bold,
                    modifier = Modifier
                        .background(Color(0xFFFFC21A), RoundedCornerShape(50))
                        .padding(horizontal = 6.dp, vertical = 2.dp),
                )
            }
            Box(
                Modifier
                    .size(36.dp)
                    .clip(CircleShape)
                    .clickable(enabled = canUndo, onClick = onUndo)
                    .alpha(if (canUndo) 1f else 0.4f)
                    .semantics { contentDescription = "পূর্বাবস্থা" },
                contentAlignment = Alignment.Center,
            ) { Text("↶", color = Color.White, fontSize = 20.sp) }
            Box(
                Modifier
                    .size(36.dp)
                    .clip(CircleShape)
                    .clickable(enabled = canRedo, onClick = onRedo)
                    .alpha(if (canRedo) 1f else 0.4f)
                    .semantics { contentDescription = "আবার করুন" },
                contentAlignment = Alignment.Center,
            ) { Text("↷", color = Color.White, fontSize = 20.sp) }
            Box(
                Modifier
                    .padding(start = 4.dp)
                    .size(36.dp)
                    .clip(CircleShape)
                    .background(Color.White, CircleShape)
                    .clickable(enabled = saveEnabled, onClick = onSave)
                    .alpha(if (saveEnabled || saving) 1f else 0.55f)
                    .semantics { contentDescription = "সংরক্ষণ করুন" },
                contentAlignment = Alignment.Center,
            ) {
                if (saving) CircularProgressIndicator(Modifier.size(16.dp), strokeWidth = 2.dp, color = primary)
                else EdIconGlyph(EdIcon.CHECK, primary, Modifier.size(20.dp))
            }
        }
    }
}

/** Segmented "Minimum | Full Editor" switch. */
@Composable
fun EditorModeTabs(mode: EditorMode, enabled: Boolean, onChange: (EditorMode) -> Unit) {
    val cs = MaterialTheme.colorScheme
    val shape = RoundedCornerShape(8.dp)
    Row(
        Modifier
            .fillMaxWidth()
            .clip(shape)
            .background(cs.surfaceVariant, shape)
            .border(1.dp, cs.outlineVariant, shape)
            .padding(2.dp),
        horizontalArrangement = Arrangement.spacedBy(2.dp),
    ) {
        listOf(EditorMode.MINIMUM to "Minimum", EditorMode.FULL to "Full Editor").forEach { (value, label) ->
            val selected = mode == value
            val segment = RoundedCornerShape(6.dp)
            Box(
                Modifier
                    .weight(1f)
                    .height(26.dp)
                    .clip(segment)
                    .background(if (selected) cs.primary else Color.Transparent, segment)
                    .clickable(enabled = enabled && !selected) { onChange(value) },
                contentAlignment = Alignment.Center,
            ) {
                Text(
                    label,
                    color = if (selected) cs.onPrimary else cs.primary,
                    fontSize = 12.sp,
                    fontWeight = FontWeight.Bold,
                    modifier = Modifier.alpha(if (enabled || selected) 1f else 0.5f),
                )
            }
        }
    }
}

/** Insertion instructions mirror the legacy LatexEditor selection/cursor behavior. */
private data class MathInsertSpec(
    val label: String,
    val template: String,
    val cursorBack: Int = 0,
    val wrapSelection: Boolean = false,
)

/** The legacy toolbar order: inline, block, fraction, root, power, subscript, sum, integral, Greek. */
@Composable
private fun EdMathToolbar(enabled: Boolean, onInsert: (MathInsertSpec) -> Unit) {
    val cs = MaterialTheme.colorScheme
    val items = remember {
        listOf(
            MathInsertSpec("\$ ইনলাইন", "\$\$", 1, true),
            MathInsertSpec("\$\$ ব্লক", "\n\$\$\n\n\$\$\n", 4),
            MathInsertSpec("ভগ্নাংশ", "\\frac{}{}", 1, true),
            MathInsertSpec("বর্গমূল", "\\sqrt{}", 1, true),
            MathInsertSpec("ঘাত", "^{}", 1),
            MathInsertSpec("সাবস্ক্রিপ্ট", "_{}", 1),
            MathInsertSpec("∑", "\\sum "),
            MathInsertSpec("∫", "\\int "),
        )
    }
    var greekOpen by remember { mutableStateOf(false) }
    val greekSymbols = remember {
        listOf(
            "α" to "\\alpha ", "β" to "\\beta ", "γ" to "\\gamma ", "δ" to "\\delta ",
            "ε" to "\\epsilon ", "θ" to "\\theta ", "λ" to "\\lambda ", "μ" to "\\mu ",
            "π" to "\\pi ", "ρ" to "\\rho ", "σ" to "\\sigma ", "τ" to "\\tau ",
            "φ" to "\\phi ", "ω" to "\\omega ", "Δ" to "\\Delta ", "Ω" to "\\Omega ",
        )
    }
    Row(
        Modifier.fillMaxWidth().background(cs.surfaceVariant).horizontalScroll(rememberScrollState()).padding(horizontal = 8.dp, vertical = 4.dp),
        horizontalArrangement = Arrangement.spacedBy(5.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        items.forEach { spec ->
            val shape = RoundedCornerShape(8.dp)
            Box(
                Modifier.height(36.dp).clip(shape).background(cs.surface, shape)
                    .border(1.dp, cs.outlineVariant, shape).clickable(enabled = enabled) { onInsert(spec) }
                    .padding(horizontal = 9.dp),
                contentAlignment = Alignment.Center,
            ) { Text(spec.label, fontWeight = FontWeight.Medium, color = cs.onSurface, maxLines = 1) }
        }
        Box {
            val shape = RoundedCornerShape(8.dp)
            Row(
                Modifier.height(36.dp).clip(shape).background(cs.surface, shape)
                    .border(1.dp, cs.outlineVariant, shape).clickable(enabled = enabled) { greekOpen = true }
                    .padding(horizontal = 9.dp),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(6.dp),
            ) {
                Text("α β θ", color = cs.primary, fontWeight = FontWeight.SemiBold)
                EdIconGlyph(EdIcon.CHEVRON, cs.primary, Modifier.size(14.dp))
            }
            DropdownMenu(expanded = greekOpen, onDismissRequest = { greekOpen = false }) {
                greekSymbols.chunked(4).forEach { row ->
                    Row(horizontalArrangement = Arrangement.spacedBy(2.dp), modifier = Modifier.padding(horizontal = 4.dp)) {
                        row.forEach { (symbol, latex) ->
                            DropdownMenuItem(
                                text = { Text(symbol, fontSize = 18.sp, fontWeight = FontWeight.SemiBold) },
                                onClick = { greekOpen = false; onInsert(MathInsertSpec(symbol, latex)) },
                                modifier = Modifier.width(48.dp),
                            )
                        }
                    }
                }
            }
        }
    }
}

/** Inline KaTeX preview card matching the legacy LivePreview panel (never opens a separate screen/dialog). */
@Composable
fun EdInlinePreviewCard(
    title: String,
    text: String,
    modifier: Modifier = Modifier,
) {
    val cs = MaterialTheme.colorScheme
    Surface(
        modifier = modifier.fillMaxWidth(),
        shape = RoundedCornerShape(14.dp),
        color = Color(0xFFF8FAFF),
        border = BorderStroke(1.dp, Color(0xFFD5D9E2)),
    ) {
        Column(Modifier.padding(14.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                EdIconGlyph(EdIcon.EYE, Color(0xFF2A3BB0), Modifier.size(16.dp))
                Text(title, color = Color(0xFF2A3BB0), fontSize = 12.sp, fontWeight = FontWeight.SemiBold)
            }
            HorizontalDivider(color = Color(0xFFE2E8F0))
            if (text.isBlank()) {
                Text("উপরে লিখলে এখানে প্রিভিউ দেখা যাবে।", color = cs.onSurfaceVariant, fontSize = 12.sp)
            } else {
                RichLatexText(text, Modifier.fillMaxWidth(), color = Color(0xFF1B1F2A))
            }
        }
    }
}

/**
 * Rounded multiline editor matching the legacy React LatexEditor. The full mode adds the original math toolbar;
 * both modes support manual LaTeX and an inline native rich-preview card directly below this field. The bottom-right grip resizes the field.
 */
@Composable
fun EdTextArea(
    value: String,
    onValueChange: (String) -> Unit,
    enabled: Boolean,
    modifier: Modifier = Modifier,
    minHeight: Dp = 132.dp,
    placeholder: String? = null,
    showMathBar: Boolean = false,
    previewTitle: String = "লাইভ প্রিভিউ (KaTeX)",
    externalPreviewOpen: Boolean? = null,
    showPreviewToggle: Boolean = true,
) {
    val cs = MaterialTheme.colorScheme
    val density = LocalDensity.current.density
    val bodyTextSize = LocalQuestionBodyTextSize.current.sp
    var field by remember { mutableStateOf(TextFieldValue(value, TextRange(value.length))) }
    var boxHeight by rememberSaveable(minHeight.value) { mutableStateOf(minHeight.value) }
    var internalPreviewOpen by rememberSaveable { mutableStateOf(false) }
    val previewOpen = externalPreviewOpen ?: internalPreviewOpen
    LaunchedEffect(value) {
        if (field.text != value) field = TextFieldValue(value, TextRange(value.length))
    }
    val shape = RoundedCornerShape(16.dp)
    Column(modifier.fillMaxWidth(), verticalArrangement = Arrangement.spacedBy(6.dp)) {
        Column(Modifier.fillMaxWidth().clip(shape).background(cs.surface).border(1.dp, cs.outlineVariant, shape)) {
            if (showMathBar) {
                EdMathToolbar(enabled) { spec ->
                    val sel = field.selection
                    val start = minOf(sel.start, sel.end).coerceIn(0, field.text.length)
                    val end = maxOf(sel.start, sel.end).coerceIn(0, field.text.length)
                    val selected = field.text.substring(start, end)
                    val insert = when {
                        spec.template == "\$\$" && spec.wrapSelection && selected.isNotEmpty() -> "\$${selected}\$"
                        spec.template == "\\frac{}{}" && spec.wrapSelection && selected.isNotEmpty() -> "\\frac{$selected}{}"
                        spec.template == "\\sqrt{}" && spec.wrapSelection && selected.isNotEmpty() -> "\\sqrt{$selected}"
                        else -> spec.template
                    }
                    val next = field.text.replaceRange(start, end, insert)
                    val cursorBack = when {
                        spec.template == "\$\$" && selected.isNotEmpty() -> 0
                        spec.template == "\\sqrt{}" && selected.isNotEmpty() -> 0
                        else -> spec.cursorBack
                    }
                    val cursor = (start + insert.length - cursorBack).coerceIn(0, next.length)
                    field = TextFieldValue(next, TextRange(cursor))
                    onValueChange(next)
                }
                HorizontalDivider(color = cs.outlineVariant)
            }
            Box(Modifier.fillMaxWidth().height(boxHeight.dp)) {
                BasicTextField(
                    value = field,
                    onValueChange = {
                        field = it
                        if (it.text != value) onValueChange(it.text)
                    },
                    enabled = enabled,
                    textStyle = LocalTextStyle.current.copy(color = cs.onSurface, fontSize = bodyTextSize, lineHeight = (LocalQuestionBodyTextSize.current * 1.5f).sp),
                    cursorBrush = SolidColor(cs.primary),
                    modifier = Modifier.fillMaxWidth().height(boxHeight.dp),
                    decorationBox = { inner ->
                        Box(Modifier.fillMaxWidth().height(boxHeight.dp).padding(start = 16.dp, top = 16.dp, end = 30.dp, bottom = 28.dp)) {
                            if (field.text.isEmpty() && placeholder != null) Text(placeholder, color = cs.onSurfaceVariant, fontSize = bodyTextSize)
                            inner()
                        }
                    },
                )
                Box(
                    modifier = Modifier
                        .align(Alignment.BottomEnd)
                        .size(width = 34.dp, height = 30.dp)
                        .semantics { contentDescription = "লেখার ঘর ছোট-বড় করতে ধরে টানুন" }
                        .pointerInput(enabled, minHeight.value) {
                            if (enabled) detectDragGestures { change, dragAmount ->
                                change.consume()
                                boxHeight = (boxHeight + dragAmount.y / density).coerceIn(52f, 620f)
                            }
                        },
                    contentAlignment = Alignment.Center,
                ) {
                    Text("◢", color = Color(0xFF94A3B8), fontSize = 20.sp)
                }
            }
        }
        if (showPreviewToggle && externalPreviewOpen == null) {
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.End) {
                TextButton(onClick = { internalPreviewOpen = !internalPreviewOpen }, enabled = value.isNotBlank()) {
                    EdIconGlyph(if (previewOpen) EdIcon.CLOSE else EdIcon.EYE, cs.primary, Modifier.size(16.dp))
                    Text(if (previewOpen) "প্রিভিউ বন্ধ" else "প্রিভিউ দেখুন", color = cs.primary)
                }
            }
        }
        if (previewOpen) EdInlinePreviewCard(previewTitle, value)
    }
}

private fun formatMarks(marks: Double): String = if (marks % 1.0 == 0.0) marks.toLong().toString() else marks.toString()

/** Marks box: a small bordered number field. Reports whether the typed value is a valid number above zero. */
@Composable
fun EdMarksField(
    index: Int,
    marks: Double,
    enabled: Boolean,
    onMarks: (Double) -> Unit,
    onValidity: (Boolean) -> Unit,
    modifier: Modifier = Modifier,
) {
    val cs = MaterialTheme.colorScheme
    var raw by remember(index) { mutableStateOf(formatMarks(marks)) }
    LaunchedEffect(marks) { if (raw.toDoubleOrNull() != marks) raw = formatMarks(marks) }
    val parsed = raw.toDoubleOrNull()
    val valid = parsed != null && parsed.isFinite() && parsed > 0.0
    LaunchedEffect(raw) { onValidity(valid) }
    // A removed field must not keep the save button blocked.
    DisposableEffect(Unit) { onDispose { onValidity(true) } }
    val shape = RoundedCornerShape(6.dp)
    BasicTextField(
        value = raw,
        onValueChange = { text ->
            raw = text
            text.toDoubleOrNull()?.takeIf { it.isFinite() && it > 0.0 }?.let(onMarks)
        },
        enabled = enabled,
        singleLine = true,
        keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Decimal),
        textStyle = LocalTextStyle.current.copy(color = cs.onSurface, fontSize = 12.sp, fontWeight = FontWeight.Bold, textAlign = TextAlign.Center),
        cursorBrush = SolidColor(cs.primary),
        modifier = modifier.width(36.dp).height(32.dp).semantics { contentDescription = "নম্বর" },
        decorationBox = { inner ->
            Box(
                Modifier
                    .fillMaxWidth()
                    .height(32.dp)
                    .clip(shape)
                    .border(1.dp, if (valid) cs.outlineVariant else cs.error, shape),
                contentAlignment = Alignment.Center,
            ) { inner() }
        },
    )
}

/** Blue label chip (ক / খ / গ / ঘ). With [options] it opens a menu to move the question to another free label. */
@Composable
fun EdLabelChip(
    letter: String,
    options: List<Pair<Int, String>>,
    enabled: Boolean,
    onPick: (Int) -> Unit,
    compact: Boolean = false,
) {
    val cs = MaterialTheme.colorScheme
    var open by remember { mutableStateOf(false) }
    val shape = RoundedCornerShape(if (compact) 6.dp else 8.dp)
    Box {
        Row(
            Modifier
                .height(32.dp)
                .widthIn(min = 32.dp)
                .clip(shape)
                .background(cs.primary, shape)
                .clickable(enabled = enabled && options.isNotEmpty()) { open = true }
                .padding(horizontal = if (compact) 6.dp else 12.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(4.dp),
        ) {
            Text(letter, color = cs.onPrimary, fontSize = 12.sp, fontWeight = FontWeight.Bold)
            if (options.isNotEmpty()) EdIconGlyph(EdIcon.CHEVRON, cs.onPrimary, Modifier.size(12.dp))
        }
        DropdownMenu(expanded = open, onDismissRequest = { open = false }) {
            options.forEach { (slot, text) ->
                DropdownMenuItem(text = { Text(text) }, onClick = { open = false; onPick(slot) })
            }
        }
    }
}

@Composable
fun EdRatingPill(selected: Int?, enabled: Boolean, onSelect: (Int?) -> Unit) {
    var open by remember { mutableStateOf(false) }
    val current = selected ?: 3
    Box {
        EdPill(
            text = "${current.toBengali()}★",
            onClick = { open = true },
            enabled = enabled,
            accent = true,
        )
        DropdownMenu(expanded = open, onDismissRequest = { open = false }) {
            for (v in RatingRules.MIN..RatingRules.MAX) {
                DropdownMenuItem(
                    text = { Text("${v.toBengali()}★ · ${RatingRules.name(v)}", fontSize = 12.sp, fontWeight = if (current == v) FontWeight.Bold else FontWeight.Normal) },
                    onClick = { open = false; onSelect(v) },
                    modifier = Modifier.height(36.dp),
                )
            }
        }
    }
}

/** The chosen board/year tags as small chips; tapping a chip removes it. */
@OptIn(ExperimentalLayoutApi::class)
@Composable
fun EdTagChips(tags: List<BoardTag>, boards: List<BoardItem>, enabled: Boolean, onChange: (List<BoardTag>) -> Unit) {
    if (tags.isEmpty()) return
    val cs = MaterialTheme.colorScheme
    FlowRow(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(5.dp, Alignment.End), verticalArrangement = Arrangement.spacedBy(5.dp)) {
        tags.forEach { tag ->
            val shape = RoundedCornerShape(7.dp)
            Row(
                Modifier
                    .height(20.dp)
                    .clip(shape)
                    .background(Color(0xFFEEF2FF), shape)
                    .border(1.dp, Color(0xFFD5D9E2), shape)
                    .clickable(enabled = enabled) { onChange(BoardRules.removeTag(tags, tag)) }
                    .padding(start = 6.dp, end = 3.dp)
                    .semantics { contentDescription = "${tagText(tag, boards)} মুছুন" },
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(3.dp),
            ) {
                Text("${tag.boardCode}'${tag.year.toString().takeLast(2)}", color = Color(0xFF2A3BB0), fontSize = 10.sp, fontWeight = FontWeight.SemiBold)
                Text("×", color = Color(0xFF64748B), fontSize = 12.sp, fontWeight = FontWeight.Bold)
            }
        }
    }
}

/** A small hint shown when a rating or board is set while its text is still empty (such values are not stored alone). */
@Composable
fun EdHint(text: String) {
    Text(text, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
}

/* ------------------------------------------------ image helpers ----------------------------------------------------- */

/** What the image buttons need: [pick] opens the picker (a non-null id replaces that image, null adds a new one). */
@Stable
class ImageAdder(val importing: Boolean, val error: String, val pick: (String?) -> Unit)

@Composable
fun rememberStimulusImageAdder(
    pipeline: ImagePipeline,
    imageScope: ImageScope,
    images: List<QuestionStimulusImage>,
    enabled: Boolean,
    onChange: (List<QuestionStimulusImage>) -> Unit,
): ImageAdder {
    val coroutineScope = rememberCoroutineScope()
    var importing by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf("") }
    var replaceId by remember { mutableStateOf<String?>(null) }
    val launcher = rememberLauncherForActivityResult(ActivityResultContracts.OpenDocument()) { uri ->
        if (uri != null && enabled && !importing) {
            val target = replaceId
            coroutineScope.launch {
                importing = true
                try {
                    error = ""
                    val imageId = pipeline.importImage(uri, imageScope)
                    val next = if (target != null) {
                        images.map { if (it.imageId == target) it.copy(imageId = imageId) else it }
                    } else {
                        images.sortedBy { it.position } + QuestionStimulusImage(imageId, "TOP", images.size.toLong())
                    }
                    onChange(next.mapIndexed { index, row -> row.copy(position = index.toLong()) })
                } catch (cancelled: CancellationException) {
                    throw cancelled
                } catch (failure: Exception) {
                    error = failure.message ?: "ছবি আমদানি করা যায়নি।"
                } finally {
                    replaceId = null
                    importing = false
                }
            }
        } else if (uri == null) {
            replaceId = null
        }
    }
    return ImageAdder(importing, error) { id ->
        replaceId = id
        launcher.launch(arrayOf("image/*"))
    }
}

@Composable
fun rememberSolutionImageAdder(
    pipeline: ImagePipeline,
    imageScope: ImageScope,
    parts: List<QuestionSolutionPart>,
    enabled: Boolean,
    onChange: (List<QuestionSolutionPart>) -> Unit,
    insertAtStart: Boolean = false,
): ImageAdder {
    val coroutineScope = rememberCoroutineScope()
    var importing by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf("") }
    var replaceId by remember { mutableStateOf<String?>(null) }
    val launcher = rememberLauncherForActivityResult(ActivityResultContracts.OpenDocument()) { uri ->
        if (uri != null && enabled && !importing) {
            val target = replaceId
            coroutineScope.launch {
                importing = true
                try {
                    error = ""
                    val imageId = pipeline.importImage(uri, imageScope)
                    val ordered = parts.sortedBy { it.position }
                    val imagePart = QuestionSolutionPart("solution_image_$imageId", "IMAGE", 0L, imageId = imageId)
                    val base = if (ordered.any { it.partType != "IMAGE" }) ordered else listOf(
                        QuestionSolutionPart("solution_text_initial_$imageId", "TEXT", 0L, textContent = ""),
                    )
                    val next = if (target != null) {
                        ordered.map { if (it.partId == target) it.copy(imageId = imageId) else it }
                    } else if (insertAtStart) {
                        listOf(imagePart) + base
                    } else {
                        base + imagePart.copy(position = base.size.toLong())
                    }
                    onChange(next.mapIndexed { index, row -> row.copy(position = index.toLong()) })
                } catch (cancelled: CancellationException) {
                    throw cancelled
                } catch (failure: Exception) {
                    error = failure.message ?: "সমাধানের ছবি আমদানি করা যায়নি।"
                } finally {
                    replaceId = null
                    importing = false
                }
            }
        } else if (uri == null) {
            replaceId = null
        }
    }
    return ImageAdder(importing, error) { id ->
        replaceId = id
        launcher.launch(arrayOf("image/*"))
    }
}

/** A rounded thumbnail with the red remove button at its corner and a replace button under it. */
@Composable
fun EdThumbnail(
    pipeline: ImagePipeline,
    imageId: String,
    imageScope: ImageScope,
    enabled: Boolean,
    onReplace: () -> Unit,
    onRemove: () -> Unit,
    extra: @Composable () -> Unit = {},
) {
    val cs = MaterialTheme.colorScheme
    Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
        Box {
            Box(
                Modifier
                    .padding(top = 10.dp, end = 10.dp)
                    .clip(RoundedCornerShape(16.dp))
                    .border(1.dp, cs.outlineVariant, RoundedCornerShape(16.dp)),
            ) { MediaThumbnail(pipeline, imageId, imageScope) }
            Box(
                Modifier
                    .align(Alignment.TopEnd)
                    .size(30.dp)
                    .clip(CircleShape)
                    .background(Color(0xFFE11D2E), CircleShape)
                    .clickable(enabled = enabled, onClick = onRemove)
                    .semantics { contentDescription = "ছবি সরান" },
                contentAlignment = Alignment.Center,
            ) { EdIconGlyph(EdIcon.CLOSE, Color.White, Modifier.size(14.dp)) }
        }
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalAlignment = Alignment.CenterVertically) {
            EdIconButton(EdIcon.REFRESH, "ছবি প্রতিস্থাপন", onReplace, enabled = enabled)
            extra()
        }
    }
}

/** Stimulus image strip: thumbnails with remove / replace, reorder arrows and the top-or-bottom placement toggle. */
@Composable
fun EdStimulusImages(
    pipeline: ImagePipeline,
    imageScope: ImageScope,
    images: List<QuestionStimulusImage>,
    enabled: Boolean,
    adder: ImageAdder,
    onChange: (List<QuestionStimulusImage>) -> Unit,
) {
    val ordered = images.sortedBy { it.position }
    if (ordered.isEmpty() && adder.error.isBlank()) return
    Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
        if (ordered.isNotEmpty()) {
            Row(Modifier.horizontalScroll(rememberScrollState()), horizontalArrangement = Arrangement.spacedBy(14.dp)) {
                ordered.forEachIndexed { index, item ->
                    EdThumbnail(
                        pipeline = pipeline,
                        imageId = item.imageId,
                        imageScope = imageScope,
                        enabled = enabled && !adder.importing,
                        onReplace = { adder.pick(item.imageId) },
                        onRemove = { onChange(images.filterNot { it.imageId == item.imageId }.mapIndexed { i, row -> row.copy(position = i.toLong()) }) },
                    ) {
                        TextButton(
                            enabled = enabled,
                            onClick = { onChange(images.map { if (it.imageId == item.imageId) it.copy(placement = if (it.placement == "TOP") "BOTTOM" else "TOP") else it }) },
                        ) { Text(if (item.placement == "TOP") "উপরে" else "নিচে") }
                        TextButton(enabled = enabled && index > 0, onClick = { onChange(moveStimulusImage(images, item.imageId, -1)) }) { Text("←") }
                        TextButton(enabled = enabled && index < ordered.lastIndex, onClick = { onChange(moveStimulusImage(images, item.imageId, 1)) }) { Text("→") }
                    }
                }
            }
        }
        if (adder.error.isNotBlank()) Text(adder.error, color = MaterialTheme.colorScheme.error, style = MaterialTheme.typography.bodySmall)
    }
}


/** Category option shared by Type CQ and Chapter CQ editors. */
data class EdCategoryOption(val id: String, val name: String, val archived: Boolean = false)

/** Compact multi-select category dropdown with an inline add-category dialog. */
@Composable
fun EdCategoryDropdown(
    categories: List<EdCategoryOption>,
    selectedIds: List<String>,
    enabled: Boolean,
    onToggle: (String, Boolean) -> Unit,
    onAddCategory: suspend (String) -> Boolean,
    modifier: Modifier = Modifier,
    label: String = "ক্যাটাগরি",
    onManageCategories: (() -> Unit)? = null,
) {
    val cs = MaterialTheme.colorScheme
    val scope = rememberCoroutineScope()
    var expanded by remember { mutableStateOf(false) }
    var addDialog by remember { mutableStateOf(false) }
    var newName by rememberSaveable { mutableStateOf("") }
    var adding by remember { mutableStateOf(false) }
    var addError by remember { mutableStateOf("") }
    val selectedNames = categories.filter { it.id in selectedIds }.joinToString(", ") { it.name }
    Box(modifier.fillMaxWidth()) {
        Row(
            Modifier.fillMaxWidth().heightIn(min = 38.dp).clip(RoundedCornerShape(9.dp))
                .background(cs.surface).border(1.dp, cs.outlineVariant, RoundedCornerShape(9.dp))
                .clickable(enabled = enabled) { expanded = true }
                .padding(horizontal = 10.dp, vertical = 7.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.SpaceBetween,
        ) {
            Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(1.dp)) {
                Text(label, color = cs.onSurfaceVariant, fontSize = 10.sp, fontWeight = FontWeight.SemiBold)
                Text(
                    selectedNames.ifBlank { "ক্যাটাগরি নির্বাচন করুন" },
                    color = if (selectedNames.isBlank()) cs.onSurfaceVariant else cs.onSurface,
                    fontSize = 12.sp, maxLines = 2, overflow = TextOverflow.Ellipsis,
                )
            }
            EdIconGlyph(EdIcon.CHEVRON, cs.onSurfaceVariant, Modifier.size(16.dp))
        }
        DropdownMenu(expanded = expanded, onDismissRequest = { expanded = false }) {
            val available = categories.filter { !it.archived || it.id in selectedIds }
            if (available.isEmpty()) {
                DropdownMenuItem(text = { Text("এখনো কোনো ক্যাটাগরি নেই") }, onClick = {}, enabled = false)
            }
            available.forEach { category ->
                DropdownMenuItem(
                    text = {
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            Checkbox(
                                checked = category.id in selectedIds,
                                enabled = enabled && (!category.archived || category.id in selectedIds),
                                onCheckedChange = null,
                            )
                            Text(if (category.archived) "${category.name} (আর্কাইভড)" else category.name)
                        }
                    },
                    onClick = { if (enabled && (!category.archived || category.id in selectedIds)) onToggle(category.id, category.id !in selectedIds) },
                    enabled = enabled && (!category.archived || category.id in selectedIds),
                )
            }
            HorizontalDivider()
            DropdownMenuItem(
                text = { Text("＋ নতুন ক্যাটাগরি যোগ করুন", color = cs.primary, fontWeight = FontWeight.SemiBold) },
                onClick = { expanded = false; newName = ""; addError = ""; addDialog = true },
                enabled = enabled && !adding,
            )
            if (onManageCategories != null) {
                DropdownMenuItem(
                    text = { Text("ক্যাটাগরি পরিচালনা") },
                    onClick = { expanded = false; onManageCategories() },
                    enabled = enabled,
                )
            }
        }
    }
    if (addDialog) {
        AlertDialog(
            onDismissRequest = { if (!adding) addDialog = false },
            title = { Text("নতুন ক্যাটাগরি যোগ করুন") },
            text = {
                Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    OutlinedTextField(
                        value = newName,
                        onValueChange = { newName = it; addError = "" },
                        singleLine = true,
                        label = { Text("ক্যাটাগরির নাম") },
                        enabled = !adding,
                    )
                    if (addError.isNotBlank()) Text(addError, color = cs.error, fontSize = 12.sp)
                }
            },
            confirmButton = {
                TextButton(
                    enabled = !adding && newName.isNotBlank(),
                    onClick = {
                        adding = true
                        scope.launch {
                            val ok = runCatching { onAddCategory(newName.trim()) }.getOrDefault(false)
                            adding = false
                            if (ok) addDialog = false else addError = "ক্যাটাগরি যোগ করা যায়নি। নামটি আগে থেকেই আছে কি না দেখুন।"
                        }
                    },
                ) { Text(if (adding) "যোগ হচ্ছে…" else "যোগ করুন") }
            },
            dismissButton = { TextButton(enabled = !adding, onClick = { addDialog = false }) { Text("বাতিল") } },
        )
    }
}

/** Legacy-sized, compact one-line reference field (36 dp). */
@Composable
fun EdReferenceField(value: String, onValueChange: (String) -> Unit, enabled: Boolean, modifier: Modifier = Modifier) {
    val cs = MaterialTheme.colorScheme
    BasicTextField(
        value = value,
        onValueChange = onValueChange,
        enabled = enabled,
        singleLine = true,
        textStyle = LocalTextStyle.current.copy(color = cs.onSurface, fontSize = 12.sp),
        cursorBrush = SolidColor(cs.primary),
        modifier = modifier.fillMaxWidth().height(36.dp).clip(RoundedCornerShape(9.dp))
            .background(cs.surface).border(1.dp, cs.outlineVariant, RoundedCornerShape(9.dp))
            .padding(horizontal = 10.dp, vertical = 8.dp),
        decorationBox = { inner ->
            Box {
                if (value.isEmpty()) Text("রেফারেন্স (ঐচ্ছিক)", color = cs.onSurfaceVariant, fontSize = 12.sp)
                inner()
            }
        },
    )
}

/** Small corner X shown only when a block has more than one solution text field. */
@Composable
fun EdSolutionRemoveButton(onClick: () -> Unit, enabled: Boolean, modifier: Modifier = Modifier) {
    val cs = MaterialTheme.colorScheme
    Box(
        modifier.size(22.dp).clip(CircleShape)
            .background(if (enabled) Color(0xFFFFE8E8) else cs.surfaceVariant)
            .border(1.dp, Color(0xFFF2B8B8), CircleShape)
            .clickable(enabled = enabled, onClick = onClick)
            .semantics { contentDescription = "এই সমাধানের ঘর মুছুন" },
        contentAlignment = Alignment.Center,
    ) { EdIconGlyph(EdIcon.CLOSE, Color(0xFFB42318), Modifier.size(12.dp)) }
}
