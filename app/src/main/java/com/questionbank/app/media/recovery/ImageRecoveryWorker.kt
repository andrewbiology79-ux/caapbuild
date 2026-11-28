package com.questionbank.app.media.recovery

import android.content.Context
import androidx.work.CoroutineWorker
import androidx.work.ExistingWorkPolicy
import androidx.work.OneTimeWorkRequestBuilder
import androidx.work.WorkManager
import androidx.work.WorkerParameters
import com.questionbank.app.QuestionBankApp
import kotlinx.coroutines.CancellationException

/** Retryable startup repair for the image operation journal and the two managed image catalogues. */
class ImageRecoveryWorker(
    appContext: Context,
    workerParams: WorkerParameters,
) : CoroutineWorker(appContext, workerParams) {
    override suspend fun doWork(): Result {
        return try {
            val app = applicationContext as? QuestionBankApp ?: return Result.failure()
            app.container.imagePipeline.runStartupRecovery()
            app.container.papers.collectOrphanMedia()
            Result.success()
        } catch (cancelled: CancellationException) {
            throw cancelled
        } catch (_: Exception) {
            Result.retry()
        }
    }
}

object ImageRecoveryScheduler {
    private const val UNIQUE_WORK = "question_bank_image_recovery_v1"

    fun enqueue(context: Context) {
        val request = OneTimeWorkRequestBuilder<ImageRecoveryWorker>().build()
        WorkManager.getInstance(context).enqueueUniqueWork(UNIQUE_WORK, ExistingWorkPolicy.KEEP, request)
    }
}
