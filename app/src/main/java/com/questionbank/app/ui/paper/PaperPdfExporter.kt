package com.questionbank.app.ui.paper

import android.content.Context
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.Paint
import android.graphics.RectF
import android.graphics.pdf.PdfDocument
import android.net.Uri
import android.text.Layout
import android.text.StaticLayout
import android.text.TextPaint
import com.questionbank.app.data.repository.PaperSnapshotCodec
import com.questionbank.app.domain.repository.PaperRepository
import java.io.File
import java.io.FileInputStream
import java.security.MessageDigest
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.withContext

/** Creates a paginated PDF strictly from persisted paper snapshots and paper-owned media. */
object PaperPdfExporter {
    suspend fun export(context: Context, uri: Uri, repository: PaperRepository, paperId: String) =
        withContext(Dispatchers.IO) {
            val paper = repository.loadPaper(paperId) ?: error("প্রশ্নপত্র পাওয়া যায়নি")
            val sections = repository.observeSections(paperId).first()
            val items = repository.observeItems(paperId).first()
            val document = PdfDocument()
            val pageWidth = 595
            val pageHeight = 842
            val margin = 42f
            val contentWidth = (pageWidth - margin * 2).toInt()
            val bodyPaint = TextPaint(Paint.ANTI_ALIAS_FLAG).apply {
                color = android.graphics.Color.BLACK
                textSize = 12f
            }
            val headingPaint = TextPaint(Paint.ANTI_ALIAS_FLAG).apply {
                color = android.graphics.Color.BLACK
                textSize = 18f
                typeface = android.graphics.Typeface.create(android.graphics.Typeface.DEFAULT, android.graphics.Typeface.BOLD)
            }
            val sectionPaint = TextPaint(Paint.ANTI_ALIAS_FLAG).apply {
                color = android.graphics.Color.BLACK
                textSize = 14f
                typeface = android.graphics.Typeface.create(android.graphics.Typeface.DEFAULT, android.graphics.Typeface.BOLD)
            }
            var pageNumber = 0
            var page: PdfDocument.Page? = null
            var y = margin
            fun startPage() {
                pageNumber++
                page = document.startPage(PdfDocument.PageInfo.Builder(pageWidth, pageHeight, pageNumber).create())
                y = margin
            }
            fun finishPage() {
                page?.let { document.finishPage(it) }
                page = null
            }
            fun ensurePage(required: Float) {
                if (page == null) startPage()
                if (y + required > pageHeight - margin) {
                    finishPage()
                    startPage()
                }
            }
            fun drawTextBlock(text: String, paint: TextPaint, gap: Float = 8f) {
                if (text.isBlank()) return
                val layout = StaticLayout.Builder.obtain(text, 0, text.length, paint, contentWidth)
                    .setAlignment(Layout.Alignment.ALIGN_NORMAL)
                    .setIncludePad(true)
                    .build()
                var firstLine = 0
                while (firstLine < layout.lineCount) {
                    if (page == null) startPage()
                    val available = pageHeight - margin - y
                    var endLine = firstLine
                    while (endLine < layout.lineCount) {
                        val blockHeight = (layout.getLineBottom(endLine) - layout.getLineTop(firstLine)).toFloat()
                        if (blockHeight > available) break
                        endLine++
                    }
                    if (endLine == firstLine) {
                        finishPage()
                        startPage()
                        continue
                    }
                    val top = layout.getLineTop(firstLine).toFloat()
                    val bottom = layout.getLineBottom(endLine - 1).toFloat()
                    val chunkHeight = bottom - top
                    val canvas = page!!.canvas
                    canvas.save()
                    canvas.clipRect(margin, y, pageWidth - margin, pageHeight - margin)
                    canvas.translate(margin, y - top)
                    layout.draw(canvas)
                    canvas.restore()
                    y += chunkHeight
                    firstLine = endLine
                    if (firstLine < layout.lineCount) {
                        finishPage()
                        startPage()
                    } else {
                        y += gap
                    }
                }
            }
            try {
                startPage()
                drawTextBlock(paper.title, headingPaint, 8f)
                drawTextBlock(listOf(paper.subjectLine, paper.durationText, paper.totalMarks?.let { "পূর্ণমান: $it" })
                    .filterNotNull().filter { it.isNotBlank() }.joinToString("   ·   "), bodyPaint, 10f)
                if (paper.noteText.isNotBlank()) drawTextBlock(paper.noteText, bodyPaint, 12f)
                val sectionMap = sections.associateBy { it.sectionId }
                val emittedSections = mutableSetOf<String>()
                items.forEachIndexed { index, item ->
                    val sectionTitle = item.sectionId?.let { sectionMap[it]?.title }
                    if (sectionTitle != null && emittedSections.add(item.sectionId)) {
                        drawTextBlock(sectionTitle, sectionPaint, 6f)
                    }
                    val override = repository.loadItemOverride(item.itemId)
                    val marks = item.marksOverride ?: override?.marksOverride ?: PaperSnapshotCodec.marks(item.snapshotJson)
                    drawTextBlock("${index + 1}. ${PaperSnapshotCodec.title(item.snapshotJson, override)}    [$marks]", sectionPaint, 4f)
                    val assetById = repository.loadItemImages(item.itemId).associateBy { it.paperImageId }
                    val links = repository.loadItemImageLinks(item.itemId).sortedWith(compareBy({ it.position }, { it.paperImageId }))
                    fun drawPlacedImages(placement: String) {
                        links.filter { it.placement == placement }.forEach { link ->
                            val asset = assetById[link.paperImageId] ?: error("Paper image metadata is missing: ${link.paperImageId}")
                            val paperRoot = File(context.filesDir, "paper_media").canonicalFile
                            val file = File(context.filesDir, asset.relativePath).canonicalFile
                            require(file.path.startsWith(paperRoot.path + File.separator)) { "Paper image path escaped its owner directory" }
                            require(file.isFile && sha256(file) == asset.sha256) { "Paper snapshot image is missing or corrupt: ${asset.paperImageId}" }
                            val bitmap = decodeBounded(file) ?: error("Paper snapshot image could not be decoded: ${asset.paperImageId}")
                            try {
                                val ratio = minOf(contentWidth.toFloat() / bitmap.width, 180f / bitmap.height, 1f)
                                val width = bitmap.width * ratio
                                val height = bitmap.height * ratio
                                ensurePage(height + 10f)
                                val destination = RectF(margin, y, margin + width, y + height)
                                page!!.canvas.drawBitmap(bitmap, null, destination, Paint(Paint.ANTI_ALIAS_FLAG or Paint.FILTER_BITMAP_FLAG))
                                y += height + 10f
                            } finally {
                                bitmap.recycle()
                            }
                        }
                    }
                    drawPlacedImages("STIMULUS_TOP")
                    drawTextBlock(PaperSnapshotCodec.stimulusPreview(item.snapshotJson, override), bodyPaint, 4f)
                    drawPlacedImages("STIMULUS_BOTTOM")
                    drawTextBlock(PaperSnapshotCodec.questionPreview(item.snapshotJson, override), bodyPaint, 6f)
                    drawTextBlock(PaperSnapshotCodec.solutionPreview(item.snapshotJson, override), bodyPaint, 6f)
                    drawPlacedImages("SOLUTION")
                    y += 8f
                }
                finishPage()
                val output = context.contentResolver.openOutputStream(uri, "wt")
                    ?: error("PDF output stream খোলা যায়নি")
                output.use { document.writeTo(it); it.flush() }
            } finally {
                finishPage()
                document.close()
            }
        }


    private fun sha256(file: File): String {
        val digest = MessageDigest.getInstance("SHA-256")
        FileInputStream(file).use { input ->
            val buffer = ByteArray(64 * 1024)
            while (true) {
                val count = input.read(buffer)
                if (count < 0) break
                digest.update(buffer, 0, count)
            }
        }
        return digest.digest().joinToString("") { "%02x".format(it) }
    }

    private fun decodeBounded(file: File): Bitmap? {
        val bounds = BitmapFactory.Options().apply { inJustDecodeBounds = true }
        BitmapFactory.decodeFile(file.absolutePath, bounds)
        if (bounds.outWidth <= 0 || bounds.outHeight <= 0) return null
        var sample = 1
        while (bounds.outWidth / sample > 1600 || bounds.outHeight / sample > 1600) sample *= 2
        return BitmapFactory.decodeFile(file.absolutePath, BitmapFactory.Options().apply { inSampleSize = sample })
    }
}
