package com.questionbank.app.data.backup

import android.content.Context
import android.net.Uri
import com.questionbank.app.data.local.QuestionBankDatabase
import java.io.File
import java.io.FileOutputStream
import java.io.InputStream
import java.security.MessageDigest
import kotlin.coroutines.cancellation.CancellationException
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext

data class RestorePreview(val backup: DbCounts, val current: DbCounts)

sealed interface ExportResult {
    data class Done(val counts: DbCounts, val bytes: Long) : ExportResult
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
 * Backup export and restore (P-31, requirement N-2: questions must never be lost).
 *
 * Export: consistent copy (VACUUM INTO) -> inspected (integrity, foreign keys, counts equal to the live database) ->
 * copied to the file the owner chose -> read back from that file and compared byte for byte (SHA-256). "Done" is reported
 * only after all of that.
 *
 * Restore: the chosen file is copied to the cache and inspected (including: same Room schema as this app). The owner sees
 * what the backup contains next to what is in the app now and must confirm. Only then is it staged; the swap itself happens
 * at the next process start (see [RestoreSwap]). The database is closed after staging so nothing can be written to the old file.
 */
class BackupService(
    private val context: Context,
    private val database: () -> QuestionBankDatabase,
    private val closeDatabase: () -> Unit,
    private val prefs: BackupPrefs,
    private val clock: () -> Long = { System.currentTimeMillis() },
) {
    private val dbFile: File get() = context.getDatabasePath(DB_NAME)
    private val exportTemp: File get() = File(context.cacheDir, "backup-export.db")
    private val candidate: File get() = File(context.cacheDir, "restore-candidate.db")

    suspend fun liveCounts(): DbCounts = DatabaseSnapshot.liveCounts(database())

    suspend fun exportTo(uri: Uri): ExportResult = withContext(Dispatchers.IO) {
        val temp = exportTemp
        try {
            val counts = DatabaseSnapshot.create(database(), temp)
            val check = BackupInspector.inspect(temp)
            if (!check.ok) return@withContext ExportResult.Failed("ব্যাকআপের কপি পরীক্ষায় ব্যর্থ: ${check.problem}")
            if (check.counts != counts) return@withContext ExportResult.Failed("ব্যাকআপের কপিতে প্রশ্নের সংখ্যা মেলেনি; ব্যাকআপ বাতিল।")

            val out = context.contentResolver.openOutputStream(uri, "wt")
                ?: return@withContext ExportResult.Failed("নির্বাচিত জায়গায় ফাইল লেখা যায়নি।")
            out.use { stream ->
                temp.inputStream().use { it.copyTo(stream) }
                stream.flush()
            }

            val written = context.contentResolver.openInputStream(uri)
                ?: return@withContext ExportResult.Failed("লেখা ফাইলটি আবার পড়া যায়নি; ব্যাকআপ নিশ্চিত নয়।")
            val sameBytes = written.use { sha256(it) } == temp.inputStream().use { sha256(it) }
            if (!sameBytes) return@withContext ExportResult.Failed("লেখা ফাইল আর মূল কপি মেলেনি; এই ব্যাকআপ বিশ্বাস করবেন না।")

            prefs.recordBackup(clock(), counts.questions)
            ExportResult.Done(counts, temp.length())
        } catch (e: CancellationException) {
            throw e
        } catch (e: Exception) {
            ExportResult.Failed("ব্যাকআপ নেওয়া যায়নি: ${e.message ?: e.javaClass.simpleName}")
        } finally {
            temp.delete()
            BackupInspector.deleteSidecars(temp)
        }
    }

    suspend fun prepareRestore(uri: Uri): PrepareResult = withContext(Dispatchers.IO) {
        val file = candidate
        try {
            file.delete()
            BackupInspector.deleteSidecars(file)
            val input = context.contentResolver.openInputStream(uri)
                ?: return@withContext PrepareResult.Rejected("ফাইলটি খোলা যায়নি।")
            input.use { source -> FileOutputStream(file).use { out -> source.copyTo(out); out.fd.sync() } }

            val liveHash = DatabaseSnapshot.liveIdentityHash(database())
            val check = BackupInspector.inspect(file, expectedHash = liveHash)
            val counts = check.counts
            if (!check.ok || counts == null) {
                file.delete()
                return@withContext PrepareResult.Rejected(check.problem ?: "ব্যাকআপ ফাইলটি ঠিক নয়।")
            }
            PrepareResult.Ready(RestorePreview(backup = counts, current = DatabaseSnapshot.liveCounts(database())))
        } catch (e: CancellationException) {
            file.delete()
            throw e
        } catch (e: Exception) {
            file.delete()
            PrepareResult.Rejected("ফাইলটি পরীক্ষা করা যায়নি: ${e.message ?: e.javaClass.simpleName}")
        }
    }

    /** Owner confirmed. Stages the verified file and closes the database; the app must be restarted to finish. */
    suspend fun confirmRestore(): ConfirmResult = withContext(Dispatchers.IO) {
        val source = candidate
        if (!source.isFile) return@withContext ConfirmResult.Failed("পরীক্ষিত ব্যাকআপ ফাইল আর নেই; আবার ফাইল বেছে নিন।")
        val pending = RestoreSwap.pendingFile(dbFile)
        val temp = File(pending.path + ".tmp")
        try {
            temp.delete()
            FileOutputStream(temp).use { out -> source.inputStream().use { it.copyTo(out) }; out.fd.sync() }
            if (temp.length() != source.length() || temp.inputStream().use { sha256(it) } != source.inputStream().use { sha256(it) }) {
                temp.delete()
                return@withContext ConfirmResult.Failed("কপি মেলেনি; রিস্টোর শুরু হয়নি, আগের ডাটা যেমন ছিল তেমনই আছে।")
            }
            pending.delete()
            if (!temp.renameTo(pending)) {
                temp.delete()
                return@withContext ConfirmResult.Failed("রিস্টোরের ফাইল প্রস্তুত করা যায়নি; আগের ডাটা যেমন ছিল তেমনই আছে।")
            }
            source.delete()
            BackupInspector.deleteSidecars(source)
            closeDatabase()
            ConfirmResult.Staged
        } catch (e: CancellationException) {
            throw e
        } catch (e: Exception) {
            temp.delete()
            ConfirmResult.Failed("রিস্টোর শুরু করা যায়নি: ${e.message ?: e.javaClass.simpleName}; আগের ডাটা যেমন ছিল তেমনই আছে।")
        }
    }

    /** Owner cancelled the confirmation. */
    fun discardCandidate() {
        candidate.delete()
        BackupInspector.deleteSidecars(candidate)
    }

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
