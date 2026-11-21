package com.questionbank.app.media

import android.content.Context
import android.content.ContentValues
import android.media.MediaScannerConnection
import android.os.Build
import android.os.Environment
import android.provider.MediaStore
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.Matrix
import android.net.Uri
import android.provider.OpenableColumns
import com.questionbank.app.data.local.dao.MediaDataDao
import com.questionbank.app.data.local.dao.SharedDataDao
import com.questionbank.app.data.local.entity.ChapterCqImagesEntity
import com.questionbank.app.data.local.entity.OperationJournalEntity
import com.questionbank.app.data.local.entity.TypeCqImagesEntity
import java.io.File
import java.io.FileInputStream
import java.io.FileOutputStream
import java.security.MessageDigest
import java.util.UUID
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import kotlinx.coroutines.withTimeout
import org.json.JSONObject
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.sync.Mutex
import com.questionbank.app.media.MediaSnapshotCoordinator
import kotlinx.coroutines.sync.withLock
import com.questionbank.app.media.recovery.ImageIntegrityChecker
import com.questionbank.app.media.recovery.ImageReferenceResolver
import com.questionbank.app.media.recovery.OrphanMediaCollector

/** The only two independent image catalogues supported by the canonical schema. */
enum class ImageScope(val journalValue: String, val folder: String) {
    TYPE_CQ("TYPE_CQ", "type_cq"),
    CHAPTER_CQ("CHAPTER_CQ", "chapter_cq"),
}

/** Metadata for a self-owned paper asset copied out of a question-scope media catalogue. */
data class PaperImageAsset(
    val relativePath: String,
    val mimeType: String,
    val width: Long,
    val height: Long,
    val byteSize: Long,
    val sha256: String,
)

/** Private, offline-first image storage. Room stores relative paths only; filesystem work is journalled separately. */
class ImagePipeline(
    private val context: Context,
    private val mediaDao: MediaDataDao,
    private val sharedDao: SharedDataDao,
    private val beforeWrite: suspend () -> Unit = {},
) {
    private val recoveryGate = CompletableDeferred<Unit>()
    private val recoveryMutex = Mutex()
    private val integrityChecker = ImageIntegrityChecker()
    private val referenceResolver = ImageReferenceResolver(mediaDao)
    private val orphanCollector = OrphanMediaCollector()

    /** Backup/export entry point: fail with a visible timeout rather than waiting forever if recovery keeps failing. */
    suspend fun awaitRecoveryReady() {
        withTimeout(60_000L) { recoveryGate.await() }
    }

    companion object {
        const val MAX_EDGE_PX = 2048
        private const val PAPER_ORPHAN_GRACE_MS = 24L * 60L * 60L * 1000L
        const val JPEG_QUALITY = 88
        private const val STATUS_READY = "READY"
        private const val STATUS_MISSING = "MISSING"
        private const val STATUS_CORRUPT = "CORRUPT"
    }

    /** Imports a picked image to private storage, verifies its decoded pixels and digest, then commits metadata. */
    suspend fun importImage(uri: Uri, scope: ImageScope): String {
        recoveryGate.await()
        return MediaSnapshotCoordinator.withMutation { withContext(Dispatchers.IO) {
        
        val id = "img_${UUID.randomUUID()}"
        val now = System.currentTimeMillis()
        val displayName = displayName(uri)
        val pendingDir = File(context.filesDir, "media/.pending").apply { mkdirs() }
        val raw = File(pendingDir, "$id.source")
        val encoded = File(pendingDir, "$id.jpg.tmp")
        val relative = "media/${scope.folder}/$id.jpg"
        val destination = safeFile(relative).apply { parentFile?.mkdirs() }
        var operationId: String? = null
        try {
            val input = context.contentResolver.openInputStream(uri) ?: error("ছবির উৎস খোলা যায়নি")
            input.use { source -> raw.outputStream().use { target -> source.copyTo(target) } }
            require(raw.length() > 0L) { "খালি ছবি আমদানি করা যাবে না" }
            val options = BitmapFactory.Options().apply { inJustDecodeBounds = true }
            BitmapFactory.decodeFile(raw.absolutePath, options)
            require(options.outWidth > 0 && options.outHeight > 0) { "ফাইলটি সমর্থিত ছবি নয়" }
            val sample = sampleSize(options.outWidth, options.outHeight)
            val bitmap = BitmapFactory.decodeFile(raw.absolutePath, BitmapFactory.Options().apply { inSampleSize = sample })
                ?: error("ছবি ডিকোড করা যায়নি")
            val scaled = scaleWithinLimit(bitmap)
            if (scaled !== bitmap) bitmap.recycle()
            encoded.outputStream().use { output ->
                check(scaled.compress(Bitmap.CompressFormat.JPEG, JPEG_QUALITY, output)) { "ছবি কমপ্রেস করা যায়নি" }
                output.fd.sync()
            }
            val width = scaled.width.toLong()
            val height = scaled.height.toLong()
            scaled.recycle()
            val digest = sha256(encoded)
            val size = encoded.length()
            val payload = JSONObject()
                .put("imageId", id).put("relativePath", relative).put("originalName", displayName)
                .put("storedName", "$id.jpg").put("mimeType", "image/jpeg")
                .put("width", width).put("height", height).put("byteSize", size)
                .put("sha256", digest).put("createdAt", now).put("updatedAt", now).toString()
            val journalId = "op_${UUID.randomUUID()}"
            operationId = journalId
            recordOperation(OperationJournalEntity(journalId, "IMAGE_IMPORT", scope.journalValue, payload, "PENDING", now, now))
            atomicMove(encoded, destination)
            insertMetadata(scope, metadataFromPayload(scope, payload))
            check(updateOperation(journalId, "COMMITTED", payload, System.currentTimeMillis()) == 1) {
                "Operation journal commit failed"
            }
            id
        } catch (error: Exception) {
            encoded.delete()
            destination.takeIf { it.exists() && metadataExists(scope, id).not() }?.delete()
            operationId?.let { runCatching { updateOperation(it, "FAILED", "{}", System.currentTimeMillis()) } }
            throw error
        } finally {
            raw.delete()
            encoded.delete()
        }
    }
    }
    }

/** Saves an edited bitmap as a NEW image asset. The source image is never overwritten. */
    suspend fun importBitmap(bitmap: Bitmap, scope: ImageScope, originalName: String = "edited-image"): String {
        recoveryGate.await()
        require(bitmap.width > 0 && bitmap.height > 0) { "সম্পাদিত ছবিটি খালি" }
        return MediaSnapshotCoordinator.withMutation { withContext(Dispatchers.IO) {
            val id = "img_${UUID.randomUUID()}"
            val now = System.currentTimeMillis()
            val pendingDir = File(context.filesDir, "media/.pending").apply { mkdirs() }
            val encoded = File(pendingDir, "$id.jpg.tmp")
            val relative = "media/${scope.folder}/$id.jpg"
            val destination = safeFile(relative).apply { parentFile?.mkdirs() }
            var operationId: String? = null
            try {
                val stored = scaleWithinLimit(bitmap)
                val storedWidth = stored.width
                val storedHeight = stored.height
                try {
                    FileOutputStream(encoded).use { output ->
                        check(stored.compress(Bitmap.CompressFormat.JPEG, JPEG_QUALITY, output)) { "সম্পাদিত ছবি কমপ্রেস করা যায়নি" }
                        output.fd.sync()
                    }
                } finally {
                    if (stored !== bitmap) stored.recycle()
                }
                val payload = JSONObject()
                    .put("imageId", id).put("relativePath", relative).put("originalName", originalName.take(180))
                    .put("storedName", "$id.jpg").put("mimeType", "image/jpeg")
                    .put("width", storedWidth).put("height", storedHeight)
                    .put("byteSize", encoded.length()).put("sha256", sha256(encoded))
                    .put("createdAt", now).put("updatedAt", now).toString()
                val journalId = "op_${UUID.randomUUID()}"
                operationId = journalId
                recordOperation(OperationJournalEntity(journalId, "IMAGE_IMPORT", scope.journalValue, payload, "PENDING", now, now))
                atomicMove(encoded, destination)
                insertMetadata(scope, metadataFromPayload(scope, payload))
                check(updateOperation(journalId, "COMMITTED", payload, System.currentTimeMillis()) == 1) {
                    "Operation journal commit failed"
                }
                id
            } catch (error: Exception) {
                encoded.delete()
                destination.takeIf { it.exists() && metadataExists(scope, id).not() }?.delete()
                operationId?.let { runCatching { updateOperation(it, "FAILED", "{}", System.currentTimeMillis()) } }
                throw error
            } finally {
                encoded.delete()
            }
        } }
    }

    /** Exports an owned image to the public Pictures/QuestionBank folder (or MediaStore on scoped-storage Android). */
    suspend fun exportImage(id: String, scope: ImageScope): String {
        recoveryGate.await()
        return withContext(Dispatchers.IO) {
            val source = fileForImage(id, scope) ?: error("ছবিটি পাওয়া যায়নি")
            val resolver = context.contentResolver
            val fileName = "QuestionBank_${System.currentTimeMillis()}_${id.takeLast(8)}.jpg"
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                val values = ContentValues().apply {
                    put(MediaStore.Images.Media.DISPLAY_NAME, fileName)
                    put(MediaStore.Images.Media.MIME_TYPE, "image/jpeg")
                    put(MediaStore.Images.Media.RELATIVE_PATH, "${Environment.DIRECTORY_PICTURES}/QuestionBank")
                    put(MediaStore.Images.Media.IS_PENDING, 1)
                }
                val uri = resolver.insert(MediaStore.Images.Media.EXTERNAL_CONTENT_URI, values)
                    ?: error("ছবি সংরক্ষণের স্থান তৈরি করা যায়নি")
                try {
                    resolver.openOutputStream(uri, "w")?.use { output -> source.inputStream().use { it.copyTo(output) } }
                        ?: error("ছবি সংরক্ষণের ফাইল খোলা যায়নি")
                    val completed = ContentValues().apply { put(MediaStore.Images.Media.IS_PENDING, 0) }
                    resolver.update(uri, completed, null, null)
                    uri.toString()
                } catch (failure: Exception) {
                    resolver.delete(uri, null, null)
                    throw failure
                }
            } else {
                val folder = File(Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_PICTURES), "QuestionBank")
                check(folder.exists() || folder.mkdirs()) { "ছবি সংরক্ষণের ফোল্ডার তৈরি করা যায়নি" }
                val target = File(folder, fileName)
                source.copyTo(target, overwrite = false)
                MediaScannerConnection.scanFile(context, arrayOf(target.absolutePath), arrayOf("image/jpeg"), null)
                target.absolutePath
            }
        }
    }

/** Rotate and/or centre-crop a stored image. Existing path and image ID stay stable. */
    suspend fun transformImage(id: String, scope: ImageScope, rotateDegrees: Int = 0, centreCropSquare: Boolean = false) {
        recoveryGate.await()
        
        MediaSnapshotCoordinator.withMutation { withContext(Dispatchers.IO) {
            require(rotateDegrees % 90 == 0) { "Rotation must be a multiple of 90 degrees" }
            val existing = metadata(scope, id) ?: error("ছবিটি পাওয়া যায়নি")
            val target = safeFile(existing.relativePath)
            require(target.isFile) { "ছবির ফাইল অনুপস্থিত" }
            val source = BitmapFactory.decodeFile(target.absolutePath) ?: error("ছবি ডিকোড করা যায়নি")
            val cropped = if (centreCropSquare) {
                val side = minOf(source.width, source.height)
                Bitmap.createBitmap(source, (source.width - side) / 2, (source.height - side) / 2, side, side)
            } else source
            val matrix = Matrix().apply { postRotate(rotateDegrees.toFloat()) }
            val transformed = if (rotateDegrees % 360 != 0) Bitmap.createBitmap(cropped, 0, 0, cropped.width, cropped.height, matrix, true) else cropped
            if (source !== cropped) source.recycle()
            if (cropped !== transformed) cropped.recycle()
            val temp = File(target.parentFile, "${id}.transform.tmp")
            val backup = File(target.parentFile, "${id}.transform.bak")
            val now = System.currentTimeMillis()
            try {
                FileOutputStream(temp).use { output ->
                    check(transformed.compress(Bitmap.CompressFormat.JPEG, JPEG_QUALITY, output))
                    output.fd.sync()
                }
                val updated = metadataCopy(existing, transformed.width.toLong(), transformed.height.toLong(), temp.length(), sha256(temp), now)
                val payload = JSONObject(encodeMetadata(scope, updated))
                    .put("previousMetadata", JSONObject(encodeMetadata(scope, existing)))
                    .toString()
                val operationId = "op_${UUID.randomUUID()}"
                recordOperation(OperationJournalEntity(operationId, "IMAGE_TRANSFORM", scope.journalValue, payload, "PENDING", now, now))
                atomicMove(target, backup)
                atomicMove(temp, target)
                updateMetadata(scope, updated)
                check(updateOperation(operationId, "COMMITTED", payload, System.currentTimeMillis()) == 1)
                backup.delete()
            } catch (error: Exception) {
                if (backup.exists()) {
                    target.delete()
                    atomicMove(backup, target)
                    runCatching { restoreMetadata(scope, existing) }
                }
                temp.delete()
                throw error
            } finally {
                transformed.recycle()
                temp.delete()
                backup.delete()
            }
        }
    }
    }

/** Refuses to delete an image while a stimulus or solution still refers to it. */
    suspend fun deleteImage(id: String, scope: ImageScope): Boolean {
        recoveryGate.await()
        return MediaSnapshotCoordinator.withMutation { withContext(Dispatchers.IO) {
        
        val row = metadata(scope, id) ?: return@withContext false
        val references = referenceResolver.referenceCount(id, scope)
        if (references != 0) return@withContext false
        val file = safeFile(row.relativePath)
        val trash = File(file.parentFile, "$id.delete.tmp")
        val now = System.currentTimeMillis()
        val payload = encodeMetadata(scope, row)
        val operationId = "op_${UUID.randomUUID()}"
        recordOperation(OperationJournalEntity(operationId, "IMAGE_DELETE", scope.journalValue, payload, "PENDING", now, now))
        try {
            if (file.exists()) atomicMove(file, trash)
            beforeWrite()
            val deleted = referenceResolver.deleteIfUnreferenced(id, scope)
            check(deleted) { "ছবিটি অন্য রেফারেন্সে ব্যবহৃত হচ্ছে অথবা metadata মুছতে ব্যর্থ" }
            check(updateOperation(operationId, "COMMITTED", payload, System.currentTimeMillis()) == 1)
            trash.delete()
            true
        } catch (error: Exception) {
            if (trash.exists() && !file.exists()) atomicMove(trash, file)
            throw error
        }
    }
    }
    }

/** One-time startup repair gate. All mutations await success so recovery cannot race with imports or deletes. */
    suspend fun runStartupRecovery() = MediaSnapshotCoordinator.withMutation { recoveryMutex.withLock {
        if (recoveryGate.isCompleted) return@withLock
        recoverPendingOperations()
        reconcileAndCollectOrphans()
        recoveryGate.complete(Unit)
    }
    }

/** Replays interrupted imports/transforms/deletes using their immutable journal payloads. */
    suspend fun recoverPendingOperations() = withContext(Dispatchers.IO) {
        mediaDao // force database holder before replay
        val imageOperationTypes = setOf("IMAGE_IMPORT", "IMAGE_TRANSFORM", "IMAGE_DELETE")
        for (operation in sharedDao.pendingOperations().filter { it.operationType in imageOperationTypes }) {
            val scope = runCatching { ImageScope.valueOf(operation.scope) }.getOrNull() ?: continue
            val now = System.currentTimeMillis()
            try {
                when (operation.operationType) {
                    "IMAGE_IMPORT", "IMAGE_TRANSFORM" -> {
                        val row = metadataFromPayload(scope, operation.payloadJson)
                        val file = safeFile(row.relativePath)
                        val backup = File(file.parentFile, "${row.imageId}.transform.bak")
                        if (file.isFile && sha256(file) == row.sha256) {
                            if (!metadataExists(scope, row.imageId)) insertMetadata(scope, row) else updateMetadata(scope, row)
                            backup.delete()
                            updateOperation(operation.operationId, "COMMITTED", operation.payloadJson, now)
                        } else if (operation.operationType == "IMAGE_TRANSFORM") {
                            val previous = previousMetadataFromPayload(scope, operation.payloadJson)
                            val previousFileHash = if (file.isFile) sha256(file) else null
                            when {
                                backup.isFile -> {
                                    file.delete()
                                    atomicMove(backup, file)
                                    restoreMetadata(scope, previous)
                                    updateOperation(operation.operationId, "FAILED", operation.payloadJson, now)
                                }
                                previousFileHash == previous.sha256 -> {
                                    restoreMetadata(scope, previous)
                                    updateOperation(operation.operationId, "FAILED", operation.payloadJson, now)
                                }
                                else -> {
                                    if (file.exists()) setStatusIfPresent(scope, row.imageId, STATUS_CORRUPT, now)
                                    else setStatusIfPresent(scope, row.imageId, STATUS_MISSING, now)
                                    updateOperation(operation.operationId, "FAILED", operation.payloadJson, now)
                                }
                            }
                        } else {
                            if (file.exists()) setStatusIfPresent(scope, row.imageId, STATUS_CORRUPT, now)
                            else setStatusIfPresent(scope, row.imageId, STATUS_MISSING, now)
                            updateOperation(operation.operationId, "FAILED", operation.payloadJson, now)
                        }
                    }
                    "IMAGE_DELETE" -> {
                        val row = metadataFromPayload(scope, operation.payloadJson)
                        val file = safeFile(row.relativePath)
                        val trash = File(file.parentFile, "${row.imageId}.delete.tmp")
                        if (!metadataExists(scope, row.imageId)) {
                            file.delete()
                            trash.delete()
                            updateOperation(operation.operationId, "COMMITTED", operation.payloadJson, now)
                        } else if (!file.exists()) {
                            beforeWrite()
                            val deleted = referenceResolver.deleteIfUnreferenced(row.imageId, scope)
                            if (deleted) {
                                trash.delete()
                                updateOperation(operation.operationId, "COMMITTED", operation.payloadJson, now)
                            } else {
                                if (trash.exists()) atomicMove(trash, file)
                                updateOperation(operation.operationId, "FAILED", operation.payloadJson, now)
                            }
                        } else {
                            updateOperation(operation.operationId, "FAILED", operation.payloadJson, now)
                        }
                    }
                    else -> updateOperation(operation.operationId, "FAILED", operation.payloadJson, now)
                }
            } catch (_: Exception) {
                updateOperation(operation.operationId, "FAILED", operation.payloadJson, now)
            }
        }
    }

    /** Reconciles owned images and collects only files inside the two managed question-image directories.
     * Paper assets and any future media namespaces are deliberately outside this collector's ownership boundary.
     */
    suspend fun reconcileAndCollectOrphans() = withContext(Dispatchers.IO) {
        val typeRows = mediaDao.allTypeImages()
        val chapterRows = mediaDao.allChapterImages()
        val knownByScope = mapOf(
            ImageScope.TYPE_CQ to typeRows.map { it.relativePath }.toSet(),
            ImageScope.CHAPTER_CQ to chapterRows.map { it.relativePath }.toSet(),
        )
        typeRows.forEach { row ->
            val file = safeFile(row.relativePath)
            val status = when (integrityChecker.check(file, row.sha256)) {
                ImageIntegrityChecker.Status.MISSING -> STATUS_MISSING
                ImageIntegrityChecker.Status.CORRUPT -> STATUS_CORRUPT
                ImageIntegrityChecker.Status.READY -> STATUS_READY
            }
            setStatusIfPresent(ImageScope.TYPE_CQ, row.imageId, status, System.currentTimeMillis())
        }
        chapterRows.forEach { row ->
            val file = safeFile(row.relativePath)
            val status = when (integrityChecker.check(file, row.sha256)) {
                ImageIntegrityChecker.Status.MISSING -> STATUS_MISSING
                ImageIntegrityChecker.Status.CORRUPT -> STATUS_CORRUPT
                ImageIntegrityChecker.Status.READY -> STATUS_READY
            }
            setStatusIfPresent(ImageScope.CHAPTER_CQ, row.imageId, status, System.currentTimeMillis())
        }

        // Do not collect files that belong to an operation still in progress.
        val imageOperationTypes = setOf("IMAGE_IMPORT", "IMAGE_TRANSFORM", "IMAGE_DELETE")
        val activeIds = sharedDao.pendingOperations()
            .filter { it.operationType in imageOperationTypes }
            .mapNotNull { operation -> runCatching { JSONObject(operation.payloadJson).optString("imageId").takeIf { id -> id.isNotBlank() } }.getOrNull() }
            .toSet()

        for (scope in ImageScope.entries) {
            // Ownership boundary is exactly media/type_cq and media/chapter_cq. Never pass paper_media here.
            val managedRoot = safeFile("media/${scope.folder}")
            orphanCollector.collect(managedRoot, context.filesDir, knownByScope.getValue(scope), activeIds)
        }

        // Import staging files are private to ImagePipeline; keep only those tied to active journal entries.
        orphanCollector.collectPending(safeFile("media/.pending"), activeIds)
    }

    suspend fun exportImage(id: String, scope: ImageScope, destination: Uri) {
        recoveryGate.await()
        MediaSnapshotCoordinator.withSnapshot { withContext(Dispatchers.IO) {
        
        val row = metadata(scope, id) ?: error("ছবিটি পাওয়া যায়নি")
        val source = safeFile(row.relativePath)
        require(source.isFile && sha256(source) == row.sha256) { "ছবিটি অনুপস্থিত বা নষ্ট" }
        val bitmap = BitmapFactory.decodeFile(source.absolutePath) ?: error("ছবি ডিকোড করা যায়নি")
        try {
            val output = context.contentResolver.openOutputStream(destination) ?: error("Export destination খোলা যায়নি")
            output.use { target -> check(bitmap.compress(Bitmap.CompressFormat.PNG, 100, target)) { "PNG export করা যায়নি" } }
        } finally {
            bitmap.recycle()
        }
    }
    }
    }


fun storedFile(relativePath: String): File = safeFile(relativePath)

    /**
     * Copies an immutable paper-owned image. The paper_media directory is deliberately outside the two
     * question-scope cleanup roots, so deleting a source question can never collect a paper snapshot asset.
     */
    suspend fun copyImageToPaperStorage(imageId: String, scope: ImageScope, paperImageId: String): PaperImageAsset? {
        recoveryGate.await()
        
        return MediaSnapshotCoordinator.withMutation { withContext(Dispatchers.IO) {
            val row = metadata(scope, imageId) ?: return@withContext null
            val source = safeFile(row.relativePath)
            require(source.isFile && sha256(source) == row.sha256) { "মূল ছবি অনুপস্থিত বা নষ্ট" }
            val extension = source.extension.lowercase().takeIf { it in setOf("jpg", "jpeg", "png", "webp") } ?: when (row.mimeType.lowercase()) {
                "image/png" -> "png"
                "image/webp" -> "webp"
                else -> "jpg"
            }
            val relative = "paper_media/$paperImageId.$extension"
            val root = File(context.filesDir, "paper_media").canonicalFile
            val destination = File(context.filesDir, relative).canonicalFile
            require(destination.path.startsWith(root.path + File.separator)) { "অবৈধ paper media path" }
            root.mkdirs()
            val temporary = File(root, "$paperImageId.copy.tmp")
            try {
                FileInputStream(source).use { input -> FileOutputStream(temporary).use { output -> input.copyTo(output); output.fd.sync() } }
                val digest = sha256(temporary)
                require(digest == row.sha256) { "কপি করা ছবির integrity মেলেনি" }
                if (destination.exists()) destination.delete()
                check(temporary.renameTo(destination)) { "Paper media copy commit failed" }
                PaperImageAsset(relative, row.mimeType, row.width, row.height, destination.length(), digest)
            } catch (error: Exception) {
                temporary.delete()
                destination.delete()
                throw error
            }
        }
    }
    }


suspend fun deletePaperStorageAsset(relativePath: String): Boolean {
        recoveryGate.await()
    
    return MediaSnapshotCoordinator.withMutation { withContext(Dispatchers.IO) {
        require(relativePath.startsWith("paper_media/") && !relativePath.contains("..")) { "অবৈধ paper media path" }
        val root = File(context.filesDir, "paper_media").canonicalFile
        val file = File(context.filesDir, relativePath).canonicalFile
        require(file.path.startsWith(root.path + File.separator)) { "অবৈধ paper media path" }
        !file.exists() || file.delete()
    }
    }
    }


/**
     * Removes files under paper_media that have no committed paper_images row.
     * The shared snapshot lock prevents concurrent paper-copy operations being mistaken for orphans.
     */
    suspend fun verifyPaperStorageAsset(relativePath: String, expectedSha256: String): Boolean = withContext(Dispatchers.IO) {
        recoveryGate.await()
        if (!relativePath.startsWith("paper_media/") || relativePath.contains("..")) return@withContext false
        val root = File(context.filesDir, "paper_media").canonicalFile
        val file = safeFile(relativePath)
        if (!file.path.startsWith(root.path + File.separator)) return@withContext false
        file.isFile && integrityChecker.check(file, expectedSha256) == ImageIntegrityChecker.Status.READY
    }

    suspend fun collectUntrackedPaperFiles(knownRelativePaths: Set<String>): Int {
        recoveryGate.await()
        
        return MediaSnapshotCoordinator.withMutation {
        withContext(Dispatchers.IO) {
            val root = File(context.filesDir, "paper_media").canonicalFile
            if (!root.exists()) return@withContext 0
            val known = knownRelativePaths.map { path -> safeFile(path).canonicalPath }.toSet()
            var removed = 0
            // PaperRepository commits the image metadata row immediately after the file copy returns.
            // A 24-hour grace period prevents a concurrent cleanup pass from deleting that just-copied
            // file in the small filesystem-copy / Room-commit window. Old process-death leftovers age out.
            val orphanCutoff = System.currentTimeMillis() - PAPER_ORPHAN_GRACE_MS
            root.walkTopDown().filter { it.isFile }.toList().forEach { file ->
                val canonical = file.canonicalFile
                require(canonical.path.startsWith(root.path + File.separator)) { "Paper media path escaped its owner directory" }
                if (canonical.path !in known && file.lastModified() <= orphanCutoff && file.delete()) removed++
            }
            removed
        }
    }
    }


/** Resolve a scoped image ID to its app-private file without exposing database metadata to the UI. */
    suspend fun fileForImage(id: String, scope: ImageScope): File? = withContext(Dispatchers.IO) {
        recoveryGate.await()
        val row = metadata(scope, id) ?: return@withContext null
        safeFile(row.relativePath).takeIf { it.isFile }
    }

    private suspend fun recordOperation(row: OperationJournalEntity) {
        beforeWrite()
        sharedDao.insertOperation(row)
    }

    private suspend fun updateOperation(id: String, status: String, payload: String, now: Long): Int {
        beforeWrite()
        return sharedDao.updateOperation(id, status, payload, now)
    }

    private fun sampleSize(width: Int, height: Int): Int {
        var sample = 1
        while (maxOf(width, height) / (sample * 2) >= MAX_EDGE_PX) sample *= 2
        return sample
    }

    private fun scaleWithinLimit(bitmap: Bitmap): Bitmap {
        val largest = maxOf(bitmap.width, bitmap.height)
        if (largest <= MAX_EDGE_PX) return bitmap
        val scale = MAX_EDGE_PX.toFloat() / largest
        return Bitmap.createScaledBitmap(bitmap, (bitmap.width * scale).toInt().coerceAtLeast(1), (bitmap.height * scale).toInt().coerceAtLeast(1), true)
    }

    private fun displayName(uri: Uri): String {
        val cursor = context.contentResolver.query(uri, arrayOf(OpenableColumns.DISPLAY_NAME), null, null, null)
        cursor?.use { if (it.moveToFirst()) return it.getString(0)?.take(180).orEmpty().ifBlank { "image" } }
        return uri.lastPathSegment?.take(180) ?: "image"
    }

    private fun safeFile(relative: String): File {
        require(relative.isNotBlank() && !relative.startsWith('/') && !relative.contains("..") && !relative.contains('\\'))
        val root = context.filesDir.canonicalFile
        val target = File(root, relative).canonicalFile
        require(target.path.startsWith(root.path + File.separator)) { "Unsafe media path" }
        return target
    }

    private fun atomicMove(source: File, destination: File) {
        destination.parentFile?.mkdirs()
        try {
            java.nio.file.Files.move(source.toPath(), destination.toPath(), java.nio.file.StandardCopyOption.ATOMIC_MOVE, java.nio.file.StandardCopyOption.REPLACE_EXISTING)
        } catch (_: Exception) {
            check(source.renameTo(destination) || source.copyTo(destination, overwrite = true).let { source.delete(); true })
        }
    }

    private fun sha256(file: File): String {
        val digest = MessageDigest.getInstance("SHA-256")
        FileInputStream(file).use { input ->
            val buffer = ByteArray(64 * 1024)
            while (true) { val count = input.read(buffer); if (count < 0) break; digest.update(buffer, 0, count) }
        }
        return digest.digest().joinToString("") { "%02x".format(it) }
    }

    private data class ImageFileRecord(
        val imageId: String,
        val relativePath: String,
        val originalName: String,
        val storedName: String,
        val mimeType: String,
        val width: Long,
        val height: Long,
        val byteSize: Long,
        val sha256: String,
        val createdAt: Long,
        val updatedAt: Long,
    )

    private suspend fun metadata(scope: ImageScope, id: String): ImageFileRecord? = when (scope) {
        ImageScope.TYPE_CQ -> mediaDao.typeImage(id)?.let { ImageFileRecord(it.imageId, it.relativePath, it.originalName, it.storedName, it.mimeType, it.width, it.height, it.byteSize, it.sha256, it.createdAt, it.updatedAt) }
        ImageScope.CHAPTER_CQ -> mediaDao.chapterImage(id)?.let { ImageFileRecord(it.imageId, it.relativePath, it.originalName, it.storedName, it.mimeType, it.width, it.height, it.byteSize, it.sha256, it.createdAt, it.updatedAt) }
    }

    private suspend fun metadataExists(scope: ImageScope, id: String): Boolean = metadata(scope, id) != null

    private suspend fun insertMetadata(scope: ImageScope, row: ImageFileRecord) {
        beforeWrite()
        when (scope) {
            ImageScope.TYPE_CQ -> mediaDao.insertTypeImage(TypeCqImagesEntity(
                row.imageId, row.relativePath, row.originalName, row.storedName, row.mimeType,
                row.width, row.height, row.byteSize, row.sha256, STATUS_READY, row.createdAt, row.updatedAt,
            ))
            ImageScope.CHAPTER_CQ -> mediaDao.insertChapterImage(ChapterCqImagesEntity(
                row.imageId, row.relativePath, row.originalName, row.storedName, row.mimeType,
                row.width, row.height, row.byteSize, row.sha256, STATUS_READY, row.createdAt, row.updatedAt,
            ))
        }
    }

    private suspend fun restoreMetadata(scope: ImageScope, row: ImageFileRecord) {
        if (metadataExists(scope, row.imageId)) updateMetadata(scope, row) else insertMetadata(scope, row)
    }

    private suspend fun updateMetadata(scope: ImageScope, row: ImageFileRecord) {
        beforeWrite()
        when (scope) {
            ImageScope.TYPE_CQ -> check(mediaDao.updateTypeImage(TypeCqImagesEntity(
                row.imageId, row.relativePath, row.originalName, row.storedName, row.mimeType,
                row.width, row.height, row.byteSize, row.sha256, STATUS_READY, row.createdAt, row.updatedAt,
            )) == 1)
            ImageScope.CHAPTER_CQ -> check(mediaDao.updateChapterImage(ChapterCqImagesEntity(
                row.imageId, row.relativePath, row.originalName, row.storedName, row.mimeType,
                row.width, row.height, row.byteSize, row.sha256, STATUS_READY, row.createdAt, row.updatedAt,
            )) == 1)
        }
    }

    private suspend fun setStatus(scope: ImageScope, id: String, status: String, now: Long) {
        beforeWrite()
        if (scope == ImageScope.TYPE_CQ) mediaDao.setTypeImageStatus(id, status, now) else mediaDao.setChapterImageStatus(id, status, now)
    }

    private suspend fun setStatusIfPresent(scope: ImageScope, id: String, status: String, now: Long) {
        if (metadataExists(scope, id)) setStatus(scope, id, status, now)
    }

    private fun metadataFromPayload(scope: ImageScope, raw: String): ImageFileRecord {
        val o = JSONObject(raw)
        val id = o.getString("imageId")
        val path = o.getString("relativePath")
        require(path.startsWith("media/${scope.folder}/") && !path.contains(".."))
        val name = o.optString("originalName", "")
        val stored = o.getString("storedName")
        val mime = o.getString("mimeType")
        val width = o.getLong("width")
        val height = o.getLong("height")
        val size = o.getLong("byteSize")
        val hash = o.getString("sha256")
        val created = o.getLong("createdAt")
        val updated = o.getLong("updatedAt")
        require(width > 0 && height > 0 && size >= 0 && hash.matches(Regex("[0-9a-f]{64}")))
        return ImageFileRecord(id, path, name, stored, mime, width, height, size, hash, created, updated)
    }

    private fun previousMetadataFromPayload(scope: ImageScope, raw: String): ImageFileRecord {
        val previous = JSONObject(raw).getJSONObject("previousMetadata")
        return metadataFromPayload(scope, previous.toString())
    }

    private fun encodeMetadata(scope: ImageScope, row: ImageFileRecord): String {
        require(row.relativePath.startsWith("media/${scope.folder}/"))
        return JSONObject().put("imageId", row.imageId).put("relativePath", row.relativePath)
            .put("originalName", row.originalName).put("storedName", row.storedName)
            .put("mimeType", row.mimeType).put("width", row.width).put("height", row.height)
            .put("byteSize", row.byteSize).put("sha256", row.sha256)
            .put("createdAt", row.createdAt).put("updatedAt", row.updatedAt).toString()
    }

    private fun metadataCopy(row: ImageFileRecord, width: Long, height: Long, size: Long, hash: String, now: Long): ImageFileRecord =
        row.copy(width = width, height = height, byteSize = size, sha256 = hash, updatedAt = now)
}
