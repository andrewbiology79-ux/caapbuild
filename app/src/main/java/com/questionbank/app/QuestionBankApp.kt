package com.questionbank.app

import android.app.Application
import com.questionbank.app.data.backup.BackupInspector
import com.questionbank.app.data.backup.BackupPrefs
import com.questionbank.app.data.backup.BackupService
import com.questionbank.app.data.backup.RestoreSwap

class QuestionBankApp : Application() {
    lateinit var container: AppContainer
        private set

    override fun onCreate() {
        super.onCreate()
        // A staged restore is applied here, BEFORE anything can open the database (the container opens it lazily).
        val outcome = RestoreSwap.applyIfPending(getDatabasePath(BackupService.DB_NAME)) { file -> BackupInspector.inspect(file) }
        val message = when (outcome) {
            RestoreSwap.Outcome.NothingPending -> null
            RestoreSwap.Outcome.Applied -> "রিস্টোর সম্পন্ন হয়েছে। আগের ডাটাবেস নিরাপত্তার জন্য ফোনে রাখা আছে।"
            is RestoreSwap.Outcome.Rejected -> "রিস্টোর বাতিল: ${outcome.why} আগের ডাটা যেমন ছিল তেমনই আছে।"
            is RestoreSwap.Outcome.Failed -> "রিস্টোর ব্যর্থ: ${outcome.why}"
        }
        if (message != null) BackupPrefs(this).restoreMessage = message
        container = AppContainer(this)
    }
}
