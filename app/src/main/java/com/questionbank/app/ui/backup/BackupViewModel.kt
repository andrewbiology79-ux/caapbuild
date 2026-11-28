package com.questionbank.app.ui.backup

import android.net.Uri
import android.content.Context
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import androidx.lifecycle.viewmodel.initializer
import androidx.lifecycle.viewmodel.viewModelFactory
import com.questionbank.app.data.backup.BackupPrefs
import com.questionbank.app.data.backup.BackupService
import com.questionbank.app.data.backup.BackupScheduler
import com.questionbank.app.data.backup.ConfirmResult
import com.questionbank.app.data.backup.DbCounts
import com.questionbank.app.data.backup.ExportResult
import com.questionbank.app.data.backup.PrepareResult
import com.questionbank.app.data.backup.RestorePreview
import kotlinx.coroutines.launch

class BackupViewModel(
    private val service: BackupService,
    private val prefs: BackupPrefs,
) : ViewModel() {

    var busy by mutableStateOf(false)
        private set
    var current by mutableStateOf<DbCounts?>(null)
        private set
    var lastBackupAt by mutableStateOf(prefs.lastBackupAt)
        private set
    var lastBackupQuestions by mutableStateOf(prefs.lastBackupQuestions)
        private set
    var automaticBackupEnabled by mutableStateOf(prefs.automaticBackupEnabled)
        private set
    var automaticIntervalDays by mutableStateOf(prefs.automaticIntervalDays)
        private set
    var automaticRetentionCount by mutableStateOf(prefs.automaticRetentionCount)
        private set
    var message by mutableStateOf<String?>(null)
        private set
    var preview by mutableStateOf<RestorePreview?>(null)
        private set
    var restartRequired by mutableStateOf(false)
        private set
    var restoreMessage by mutableStateOf(prefs.restoreMessage)
        private set

    init {
        refresh()
    }

    fun refresh() {
        viewModelScope.launch {
            current = try {
                service.liveCounts()
            } catch (e: Exception) {
                null
            }
        }
    }

    fun export(uri: Uri) {
        if (busy) return
        busy = true
        message = null
        viewModelScope.launch {
            try {
                when (val r = service.exportTo(uri)) {
                    is ExportResult.Done -> {
                        lastBackupAt = prefs.lastBackupAt
                        lastBackupQuestions = prefs.lastBackupQuestions
                        message = "ব্যাকআপ সম্পন্ন ও যাচাই করা হয়েছে ✓ (${countsLine(r.counts)} · ${r.mediaFiles}টি media file)"
                    }
                    is ExportResult.Failed -> message = "ব্যাকআপ সফল হয়নি: ${r.why}"
                }
            } finally {
                busy = false
                refresh()
            }
        }
    }


    fun updateAutomaticBackup(
        context: Context,
        enabled: Boolean,
        intervalDays: Int = automaticIntervalDays,
        retentionCount: Int = automaticRetentionCount,
    ) {
        val persisted = prefs.updateAutomaticPolicy(enabled, intervalDays, retentionCount)
        automaticBackupEnabled = prefs.automaticBackupEnabled
        automaticIntervalDays = prefs.automaticIntervalDays
        automaticRetentionCount = prefs.automaticRetentionCount
        val scheduled = persisted && runCatching { BackupScheduler.apply(context.applicationContext, prefs) }.isSuccess
        message = if (!persisted) {
            "ব্যাকআপ নীতি ফোনে সংরক্ষণ করা যায়নি; সেটিংস পরিবর্তন কার্যকর হয়েছে বলে ধরা হচ্ছে না।"
        } else if (!scheduled) {
            "ব্যাকআপ নীতি সংরক্ষিত হয়েছে, কিন্তু WorkManager schedule করা যায়নি। অ্যাপ পুনরায় খুলে চেষ্টা করুন।"
        } else if (automaticBackupEnabled) {
            "স্বয়ংক্রিয় স্থানীয় ব্যাকআপ চালু হয়েছে। ফোন হারানো বা অ্যাপ আনইনস্টল থেকে সুরক্ষার জন্য আলাদা করে Drive/কম্পিউটারে কপি রাখুন।"
        } else "স্বয়ংক্রিয় ব্যাকআপ বন্ধ করা হয়েছে।"
    }

    fun prepareRestore(uri: Uri) {
        if (busy) return
        busy = true
        message = null
        viewModelScope.launch {
            try {
                when (val r = service.prepareRestore(uri)) {
                    is PrepareResult.Ready -> preview = r.preview
                    is PrepareResult.Rejected -> message = "এই ফাইল দিয়ে রিস্টোর করা যাবে না: ${r.why}"
                }
            } finally {
                busy = false
            }
        }
    }

    fun cancelRestore() {
        service.discardCandidate()
        preview = null
    }

    fun confirmRestore() {
        if (busy) return
        busy = true
        preview = null
        viewModelScope.launch {
            try {
                when (val r = service.confirmRestore()) {
                    ConfirmResult.Staged -> restartRequired = true
                    is ConfirmResult.Failed -> message = r.why
                }
            } finally {
                busy = false
            }
        }
    }

    fun dismissRestoreMessage() {
        prefs.restoreMessage = null
        restoreMessage = null
    }

    companion object {
        fun factory(create: () -> BackupViewModel) = viewModelFactory { initializer { create() } }
    }
}
