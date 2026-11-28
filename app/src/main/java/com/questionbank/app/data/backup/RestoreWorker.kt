package com.questionbank.app.data.backup

import android.content.Context
import androidx.work.CoroutineWorker
import androidx.work.Data
import androidx.work.ExistingWorkPolicy
import androidx.work.OneTimeWorkRequestBuilder
import androidx.work.WorkManager
import androidx.work.WorkerParameters
import java.io.File
import kotlinx.coroutines.CancellationException

/**
 * Performs a read-only inspection after a successful cold-start database/media swap.
 * It never opens Room or changes live paths. The actual database/media swap intentionally remains
 * a cold-start operation in QuestionBankApp,
 * because WorkManager must never replace a database while another component could hold a Room connection.
 */
class RestoreWorker(context: Context, params: WorkerParameters) : CoroutineWorker(context, params) {
    override suspend fun doWork(): Result = try {
        val path = inputData.getString(KEY_DATABASE_PATH) ?: return Result.failure()
        val expectedHash = inputData.getString(KEY_EXPECTED_IDENTITY_HASH)
        val file = File(path).canonicalFile
        if (!file.isFile) return Result.retry()
        val inspected = BackupInspector.inspect(file, expectedHash)
        if (inspected.ok) Result.success() else Result.failure()
    } catch (cancelled: CancellationException) {
        throw cancelled
    } catch (_: Exception) {
        Result.retry()
    }

    companion object {
        const val KEY_DATABASE_PATH = "restored_database_path"
        const val KEY_EXPECTED_IDENTITY_HASH = "expected_identity_hash"
        private const val UNIQUE_NAME = "question_bank_restore_post_swap_inspection_v1"

        /** Read-only post-swap inspection. The destructive swap itself stays in Application.onCreate before Room opens. */
        fun enqueuePostSwapInspection(context: Context, databaseFile: File, expectedIdentityHash: String? = null) {
            val request = OneTimeWorkRequestBuilder<RestoreWorker>()
                .setInputData(Data.Builder()
                    .putString(KEY_DATABASE_PATH, databaseFile.absolutePath)
                    .apply { expectedIdentityHash?.let { putString(KEY_EXPECTED_IDENTITY_HASH, it) } }
                    .build())
                .build()
            WorkManager.getInstance(context.applicationContext)
                .enqueueUniqueWork(UNIQUE_NAME, ExistingWorkPolicy.REPLACE, request)
        }
    }
}
