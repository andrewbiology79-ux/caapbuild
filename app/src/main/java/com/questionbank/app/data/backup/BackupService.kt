package com.questionbank.app.data.backup

import android.content.Context
import android.net.Uri
import com.questionbank.app.data.local.QuestionBankDatabase
import com.questionbank.app.media.MediaSnapshotCoordinator
import java.io.File
import java.io.FileInputStream
import java.io.FileOutputStream
import java.io.InputStream
import java.security.MessageDigest
import java.util.UUID
import kotlin.coroutines.cancellation.CancellationException
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import kotlinx.coroutines.TimeoutCancellationException


data class RestorePreview(
    val backup: DbCounts,
    val current: DbCounts,
    val mediaFileCount: Int = 0,
    val includesMedia: Boolean = false,
)

sealed interface ExportResult {
    data class Done(val counts: DbCounts, val bytes: Long, val mediaFiles: Int = 0) : ExportResult
    data class Failed(val why: String) : ExportResult
}

sealed interface PrepareResult {
    data class Ready(val preview: RestorePreview) : PrepareResult
    data class Rejected(val why: String) : PrepareResult
}

sealed interface ConfirmResult {
    data object Staged : ConfirmResult
    data class Failed(val why: String) : ConfirmResult
}

/**
 * Backup export and restore. Export acquires the shared media snapshot lock BEFORE
 * VACUUM INTO and holds it until the ZIP has been extracted and all database/media
 * manifest hashes have been checked. Restore stays a startup swap: a worker must
 * never replace a database while this process may still hold Room connections.
 */
class BackupService(
    private val context: Context,
    private val database: () -> QuestionBankDatabase,
    private val closeDatabase: () -> Unit,
    private val prefs: BackupPrefs,
    private val beforeMediaSnapshot: suspend () -> Unit = {},
    private val clock: () -> Long = { System.currentTimeMillis() },
) {
    private val dbFile: File get() = context.getDatabasePath(DB_NAME)
    private val exportTemp: File get() = File(context.cacheDir, "backup-export.db")
    private val archiveTemp: File get() = File(context.cacheDir, "backup-export.qbbak")
    private val candidate: File get() = File(context.cacheDir, "restore-candidate.db")
    private val extractionRoot: File get() = File(context.cacheDir, "restore-extraction")
    private val candidateMedia: File get() = File(extractionRoot, "restore-media")
    private var candidateIncludesMedia: Boolean = false
    private var candidateMediaCount: Int = 0

    suspend fun liveCounts(): DbCounts = DatabaseSnapshot.liveCounts(database())

    suspend fun exportTo(uri: Uri): ExportResult {
        try {
            beforeMediaSnapshot()
        } catch (timeout: TimeoutCancellationException) {
            return ExportResult.Failed("মিডিয়া recovery এখনো শেষ হয়নি; backup শুরু করা হয়নি। কিছুক্ষণ পরে আবার চেষ্টা করুন।")
        } catch (cancelled: CancellationException) {
            throw cancelled
        } catch (error: Exception) {
            return ExportResult.Failed("মিডিয়া recovery নিশ্চিত করা যায়নি: ${error.message ?: error.javaClass.simpleName}")
        }
        return MediaSnapshotCoordinator.withSnapshot {
        withContext(Dispatchers.IO) {
            val archive = archiveTemp
            try {
                val (counts, mediaFiles) = createValidatedArchive(archive)
                val out = context.contentResolver.openOutputStream(uri, "wt")
                    ?: return@withContext ExportResult.Failed("নির্বাচিত জায়গায় ফাইল লেখা যায়নি।")
                out.use { stream -> FileInputStream(archive).use { it.copyTo(stream) }; stream.flush() }
                val written = context.contentResolver.openInputStream(uri)
                    ?: return@withContext ExportResult.Failed("লেখা ফাইলটি আবার পড়া যায়নি; ব্যাকআপ নিশ্চিত নয়।")
                val sameBytes = written.use { sha256(it) } == FileInputStream(archive).use { sha256(it) }
                if (!sameBytes) return@withContext ExportResult.Failed("লেখা ফাইল আর মূল কপি মেলেনি; এই ব্যাকআপ বিশ্বাস করবেন না।")
                prefs.recordBackup(clock(), counts.totalQuestions)
                ExportResult.Done(counts, archive.length(), mediaFiles)
            } catch (e: CancellationException) {
                throw e
            } catch (e: Exception) {
                ExportResult.Failed("ব্যাকআপ নেওয়া যায়নি: ${e.message ?: e.javaClass.simpleName}")
            } finally {
                exportTemp.delete()
                archive.delete()
                BackupInspector.deleteSidecars(exportTemp)
            }
        }
        }
    }

    /**
     * Internal periodic safety copy. It is intentionally stored inside the app's private files area;
     * it protects against accidental edits but NOT uninstall/Clear data/device loss. Manual SAF export
     * remains the recommended off-device copy. Retention is controlled by BackupPrefs.
     */
    suspend fun exportAutomatic(): ExportResult {
        try {
            beforeMediaSnapshot()
        } catch (timeout: TimeoutCancellationException) {
            return ExportResult.Failed("মিডিয়া recovery শেষ না হওয়ায় স্বয়ংক্রিয় backup স্থগিত হয়েছে।")
        } catch (cancelled: CancellationException) {
            throw cancelled
        } catch (error: Exception) {
            return ExportResult.Failed("মিডিয়া recovery নিশ্চিত করা যায়নি: ${error.message ?: error.javaClass.simpleName}")
        }
        return MediaSnapshotCoordinator.withSnapshot {
        withContext(Dispatchers.IO) {
            val archive = archiveTemp
            val directory = File(context.filesDir, "automatic_backups")
            val stamp = clock()
            val target = File(directory, "QuestionBank-auto-$stamp.qbbak")
            val temp = File(directory, "QuestionBank-auto-$stamp.qbbak.tmp")
            try {
                require(directory.exists() || directory.mkdirs()) { "Automatic backup folder could not be created" }
                val (counts, mediaFiles) = createValidatedArchive(archive)
                FileInputStream(archive).use { input -> FileOutputStream(temp).use { output -> input.copyTo(output); output.fd.sync() } }
                require(temp.length() == archive.length() && sha256(temp) == sha256(archive)) { "Automatic backup copy did not match" }
                require(temp.renameTo(target)) { "Automatic backup final rename failed" }
                val keep = prefs.automaticRetentionCount.coerceIn(1, 10)
                directory.listFiles { file -> file.isFile && file.name.endsWith(".qbbak") }
                    ?.sortedByDescending { it.lastModified() }
                    ?.drop(keep)?.forEach { old -> old.delete() }
                prefs.recordBackup(clock(), counts.totalQuestions)
                ExportResult.Done(counts, target.length(), mediaFiles)
            } catch (e: CancellationException) {
                throw e
            } catch (e: Exception) {
                temp.delete()
                ExportResult.Failed("স্বয়ংক্রিয় ব্যাকআপ নেওয়া যায়নি: ${e.message ?: e.javaClass.simpleName}")
            } finally {
                exportTemp.delete()
                archive.delete()
                BackupInspector.deleteSidecars(exportTemp)
            }
        }
        }
    }

    private suspend fun createValidatedArchive(archive: File): Pair<DbCounts, Int> {
        val databaseSnapshot = exportTemp
        try {
            val counts = DatabaseSnapshot.create(database(), databaseSnapshot)
            val check = BackupInspector.inspect(databaseSnapshot)
            require(check.ok) { "ব্যাকআপের ডাটাবেস কপি পরীক্ষায় ব্যর্থ: ${check.problem}" }
            require(check.counts == counts) { "ব্যাকআপের কপিতে Type_CQ/Chapter_CQ প্রশ্নের সংখ্যা মেলেনি" }
            val packageInfo = runCatching {
                @Suppress("DEPRECATION")
                context.packageManager.getPackageInfo(context.packageName, 0)
            }.getOrNull()
            val appVersion = packageInfo?.versionName ?: "unknown"
            val appVersionCode = if (android.os.Build.VERSION.SDK_INT >= 28) packageInfo?.longVersionCode ?: 0L else {
                @Suppress("DEPRECATION")
                packageInfo?.versionCode?.toLong() ?: 0L
            }
            val databaseVersion = check.databaseVersion ?: error("ডাটাবেস সংস্করণ পাওয়া যায়নি")
            val identityHash = check.identityHash ?: error("Room schema পরিচয় পাওয়া যায়নি")
            val mediaFiles = BackupArchive.write(
                databaseSnapshot, context.filesDir, archive, appVersion, appVersionCode,
                databaseVersion, identityHash,
            )
            validateCompletedArchive(archive, counts, databaseVersion, identityHash, mediaFiles)
            return counts to mediaFiles
        } finally {
            databaseSnapshot.delete()
            BackupInspector.deleteSidecars(databaseSnapshot)
        }
    }

    /** Re-open the finished ZIP, verify every manifest entry hash and inspect the extracted SQLite file. */
    private fun validateCompletedArchive(
        archive: File,
        expectedCounts: DbCounts,
        expectedDatabaseVersion: Int,
        expectedIdentityHash: String,
        expectedMediaCount: Int,
    ) {
        val root = File(context.cacheDir, "backup-verify-${UUID.randomUUID()}")
        try {
            val extracted = BackupArchive.extract(archive, root)
            require(extracted.mediaFileCount == expectedMediaCount) { "ZIP media file count differs from the archive inventory" }
            require(extracted.databaseVersion == expectedDatabaseVersion && extracted.identityHash == expectedIdentityHash) {
                "ZIP manifest database identity does not match the snapshot"
            }
            val inspection = BackupInspector.inspect(extracted.databaseFile, expectedIdentityHash)
            require(inspection.ok && inspection.databaseVersion == expectedDatabaseVersion && inspection.counts == expectedCounts) {
                "Finished backup database failed self-validation: ${inspection.problem ?: "counts/schema mismatch"}"
            }
        } finally {
            root.deleteRecursively()
        }
    }

    suspend fun prepareRestore(uri: Uri): PrepareResult = withContext(Dispatchers.IO) {
        val source = File(context.cacheDir, "restore-source.bin")
        val file = candidate
        var archiveMetadata: BackupArchive.Extraction? = null
        try {
            discardCandidate()
            val input = context.contentResolver.openInputStream(uri)
                ?: return@withContext PrepareResult.Rejected("ফাইলটি খোলা যায়নি।")
            input.use { stream -> FileOutputStream(source).use { out -> stream.copyTo(out); out.fd.sync() } }
            val prefix = ByteArray(2)
            val prefixCount = source.inputStream().use { it.read(prefix) }
            if (prefixCount == 2 && prefix[0] == 'P'.code.toByte() && prefix[1] == 'K'.code.toByte()) {
                val extracted = BackupArchive.extract(source, extractionRoot)
                archiveMetadata = extracted
                extracted.databaseFile.copyTo(file, overwrite = true)
                candidateIncludesMedia = true
                candidateMediaCount = extracted.mediaFileCount
            } else {
                source.copyTo(file, overwrite = true)
                candidateIncludesMedia = false
                candidateMediaCount = 0
            }

            val liveHash = DatabaseSnapshot.liveIdentityHash(database())
            val check = BackupInspector.inspect(file, expectedHash = liveHash)
            val counts = check.counts
            if (!check.ok || counts == null) {
                discardCandidate()
                return@withContext PrepareResult.Rejected(check.problem ?: "ব্যাকআপ ফাইলটি ঠিক নয়।")
            }
            archiveMetadata?.let { metadata ->
                require(metadata.databaseVersion == check.databaseVersion && metadata.identityHash == check.identityHash) {
                    "Manifest-এর database version বা schema hash আসল ডাটাবেসের সঙ্গে মেলেনি"
                }
            }
            PrepareResult.Ready(
                RestorePreview(
                    backup = counts,
                    current = DatabaseSnapshot.liveCounts(database()),
                    mediaFileCount = candidateMediaCount,
                    includesMedia = candidateIncludesMedia,
                )
            )
        } catch (e: CancellationException) {
            discardCandidate()
            throw e
        } catch (e: Exception) {
            discardCandidate()
            PrepareResult.Rejected("ফাইলটি পরীক্ষা করা যায়নি: ${e.message ?: e.javaClass.simpleName}")
        } finally {
            source.delete()
        }
    }

    /** Owner confirmed. Stages the verified database and matching media tree; swap occurs before DB open on next start. */
    suspend fun confirmRestore(): ConfirmResult = withContext(Dispatchers.IO) {
        val source = candidate
        if (!source.isFile) return@withContext ConfirmResult.Failed("পরীক্ষিত ব্যাকআপ ফাইল আর নেই; আবার ফাইল বেছে নিন।")
        val pending = RestoreSwap.pendingFile(dbFile)
        val temp = File(pending.path + ".tmp")
        val mediaPending = File(context.filesDir, RestoreSwap.MEDIA_PENDING_DIR)
        try {
            temp.delete()
            FileOutputStream(temp).use { out -> source.inputStream().use { it.copyTo(out) }; out.fd.sync() }
            if (temp.length() != source.length() || temp.inputStream().use { sha256(it) } != source.inputStream().use { sha256(it) }) {
                temp.delete()
                return@withContext ConfirmResult.Failed("কপি মেলেনি; রিস্টোর শুরু হয়নি, আগের ডাটা যেমন ছিল তেমনই আছে।")
            }
            // Always clear a previous media stage. A DB-only legacy restore must never accidentally
            // reuse media left by an interrupted preparation of another candidate.
            if (mediaPending.exists()) require(mediaPending.deleteRecursively()) { "আগের media staging পরিষ্কার করা যায়নি" }
            if (candidateIncludesMedia) {
                val root = candidateMedia
                require(root.isDirectory) { "পরীক্ষিত media archive আর নেই" }
                root.copyRecursively(mediaPending, overwrite = true)
                require(File(mediaPending, "media/type_cq").isDirectory &&
                    File(mediaPending, "media/chapter_cq").isDirectory && File(mediaPending, "paper_media").isDirectory) {
                    "রিস্টোরের media staging অসম্পূর্ণ"
                }
            }
            pending.delete()
            if (!temp.renameTo(pending)) error("database restore stage rename failed")
            closeDatabase()
            discardCandidate()
            ConfirmResult.Staged
        } catch (e: CancellationException) {
            temp.delete()
            throw e
        } catch (e: Exception) {
            temp.delete()
            pending.delete()
            mediaPending.deleteRecursively()
            ConfirmResult.Failed("রিস্টোর শুরু করা যায়নি: ${e.message ?: e.javaClass.simpleName}; আগের ডাটা যেমন ছিল তেমনই আছে।")
        }
    }

    fun discardCandidate() {
        candidate.delete()
        BackupInspector.deleteSidecars(candidate)
        extractionRoot.deleteRecursively()
        candidateIncludesMedia = false
        candidateMediaCount = 0
    }

    private fun sha256(file: File): String = file.inputStream().use { sha256(it) }

    private fun sha256(input: InputStream): String {
        val digest = MessageDigest.getInstance("SHA-256")
        val buffer = ByteArray(64 * 1024)
        while (true) {
            val n = input.read(buffer)
            if (n < 0) break
            digest.update(buffer, 0, n)
        }
        return digest.digest().joinToString("") { "%02x".format(it) }
    }

    companion object {
        const val DB_NAME = "QuestionBank.db"
    }
}
