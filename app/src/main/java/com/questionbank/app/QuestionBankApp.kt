package com.questionbank.app

import android.app.Application
import com.questionbank.app.data.backup.BackupInspector
import com.questionbank.app.data.backup.BackupPrefs
import com.questionbank.app.data.backup.BackupService
import com.questionbank.app.data.backup.BackupScheduler
import com.questionbank.app.data.backup.RestoreSwap
import com.questionbank.app.data.backup.RestoreWorker
import com.questionbank.app.media.recovery.ImageRecoveryScheduler
import kotlinx.coroutines.launch

class QuestionBankApp : Application() {
    lateinit var container: AppContainer
        private set

    override fun onCreate() {
        super.onCreate()
        CrashLog.install(this)
        // A staged restore is applied here, BEFORE anything can open the database (the container opens it lazily).
        val outcome = RestoreSwap.applyIfPending(getDatabasePath(BackupService.DB_NAME), filesDir) { file -> BackupInspector.inspect(file) }
        val message = when (outcome) {
            RestoreSwap.Outcome.NothingPending -> null
            RestoreSwap.Outcome.Applied -> "রিস্টোর সম্পন্ন হয়েছে। আগের ডাটাবেস নিরাপত্তার জন্য ফোনে রাখা আছে।"
            is RestoreSwap.Outcome.Rejected -> "রিস্টোর বাতিল: ${outcome.why} আগের ডাটা যেমন ছিল তেমনই আছে।"
            is RestoreSwap.Outcome.Failed -> "রিস্টোর ব্যর্থ: ${outcome.why}"
        }
        if (message != null) BackupPrefs(this).restoreMessage = message
        if (outcome is RestoreSwap.Outcome.Failed && outcome.recoveryRequired) {
            // Fail closed: opening Room while the previous database/media pair is only partly restored can lose data.
            throw IllegalStateException(
                "Question Bank database recovery is incomplete; refusing to open Room. ${outcome.why}"
            )
        }
        container = AppContainer(this)
        // Reconcile persisted automatic-backup policy after restore swap and container setup.
        runCatching { BackupScheduler.apply(this, container.backupPrefs) }
        if (outcome is RestoreSwap.Outcome.Applied) {
            // A second read-only inspection runs in the background after the cold-start swap; it never mutates live paths.
            runCatching { RestoreWorker.enqueuePostSwapInspection(this, getDatabasePath(BackupService.DB_NAME)) }
        }
        // Schedule recovery only after the restore swap and dependency container are ready.
        // If WorkManager cannot be reached at startup, run the same fail-closed recovery in app scope;
        // media operations remain gated until it completes successfully.
        val recoveryScheduled = runCatching { ImageRecoveryScheduler.enqueue(this) }.isSuccess
        if (!recoveryScheduled) {
            container.appScope.launch {
                val recovered = runCatching {
                    container.imagePipeline.runStartupRecovery()
                    container.papers.collectOrphanMedia()
                }
                if (recovered.isFailure) {
                    container.backupPrefs.restoreMessage =
                        "মিডিয়া recovery সম্পন্ন হয়নি; ছবি পরিবর্তন ও backup সাময়িকভাবে বন্ধ রাখা হয়েছে। অ্যাপ আবার খুলে চেষ্টা করুন।"
                }
            }
        }
    }
}
