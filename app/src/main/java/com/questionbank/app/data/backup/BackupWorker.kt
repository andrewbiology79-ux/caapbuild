package com.questionbank.app.data.backup

import android.content.Context
import androidx.work.CoroutineWorker
import androidx.work.ExistingPeriodicWorkPolicy
import androidx.work.NetworkType
import androidx.work.PeriodicWorkRequestBuilder
import androidx.work.Constraints
import androidx.work.WorkManager
import androidx.work.WorkerParameters
import com.questionbank.app.QuestionBankApp
import java.util.concurrent.TimeUnit
import kotlinx.coroutines.CancellationException

/** Creates a verified, retained, app-private automatic backup. Manual off-device export remains recommended. */
class BackupWorker(context: Context, params: WorkerParameters) : CoroutineWorker(context, params) {
    override suspend fun doWork(): Result = try {
        val app = applicationContext as? QuestionBankApp ?: return Result.failure()
        if (!app.container.backupPrefs.automaticBackupEnabled) return Result.success()
        when (val result = app.container.backup.exportAutomatic()) {
            is ExportResult.Done -> Result.success()
            is ExportResult.Failed -> Result.retry()
        }
    } catch (cancelled: CancellationException) {
        throw cancelled
    } catch (_: Exception) {
        Result.retry()
    }
}

/** Schedules/cancels one unique periodic policy; policy values come from BackupPrefs. */
object BackupScheduler {
    private const val UNIQUE_NAME = "question_bank_automatic_backup_v1"

    fun apply(context: Context, prefs: BackupPrefs) {
        val manager = WorkManager.getInstance(context.applicationContext)
        if (!prefs.automaticBackupEnabled) {
            manager.cancelUniqueWork(UNIQUE_NAME)
            return
        }
        val constraints = Constraints.Builder()
            .setRequiresBatteryNotLow(true)
            .setRequiresStorageNotLow(true)
            .setRequiredNetworkType(NetworkType.NOT_REQUIRED)
            .build()
        val request = PeriodicWorkRequestBuilder<BackupWorker>(prefs.automaticIntervalDays.toLong(), TimeUnit.DAYS)
            .setConstraints(constraints)
            .build()
        manager.enqueueUniquePeriodicWork(UNIQUE_NAME, ExistingPeriodicWorkPolicy.UPDATE, request)
    }
}
