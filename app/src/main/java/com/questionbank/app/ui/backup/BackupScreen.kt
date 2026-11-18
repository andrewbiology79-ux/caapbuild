package com.questionbank.app.ui.backup

import android.app.Activity
import android.os.Process
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import com.questionbank.app.ui.components.AppHeader
import com.questionbank.app.ui.format.toBengali
import com.questionbank.app.ui.format.toBengaliDigits
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import com.questionbank.app.data.backup.BackupNames

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun BackupScreen(viewModel: BackupViewModel, onBack: () -> Unit) {
    val activity = LocalContext.current as? Activity

    val createLauncher = rememberLauncherForActivityResult(
        ActivityResultContracts.CreateDocument("application/octet-stream")
    ) { uri -> if (uri != null) viewModel.export(uri) }

    val openLauncher = rememberLauncherForActivityResult(
        ActivityResultContracts.OpenDocument()
    ) { uri -> if (uri != null) viewModel.prepareRestore(uri) }

    Scaffold(
        topBar = {
            AppHeader(title = "ব্যাকআপ ও রিস্টোর", onBack = onBack)
        },
    ) { padding ->
        Column(
            modifier = Modifier.padding(padding).padding(16.dp).fillMaxSize().verticalScroll(rememberScrollState()),
            verticalArrangement = Arrangement.spacedBy(16.dp),
        ) {
            viewModel.restoreMessage?.let { text ->
                Card(modifier = Modifier.fillMaxWidth()) {
                    Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                        Text(text)
                        TextButton(onClick = viewModel::dismissRestoreMessage) { Text("ঠিক আছে") }
                    }
                }
            }

            Card(modifier = Modifier.fillMaxWidth()) {
                Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    Text("এখন অ্যাপে আছে", style = MaterialTheme.typography.titleMedium)
                    Text(viewModel.current?.let { countsLine(it) } ?: "গণনা হচ্ছে…")
                    if (viewModel.lastBackupAt == 0L) {
                        Text("এখনো কোনো ব্যাকআপ নেওয়া হয়নি। অ্যাপ আনইনস্টল, \"Clear data\" বা ফোন হারালে প্রশ্ন মুছে যাবে।", color = MaterialTheme.colorScheme.error)
                    } else {
                        Text("শেষ ব্যাকআপ: ${BackupNames.display(viewModel.lastBackupAt).toBengaliDigits()} (তখন প্রশ্ন ছিল ${viewModel.lastBackupQuestions.toBengali()})")
                        val now = viewModel.current?.questions
                        if (now != null && now != viewModel.lastBackupQuestions) {
                            Text("শেষ ব্যাকআপের পর প্রশ্নের সংখ্যা বদলেছে (এখন ${now.toBengali()})। নতুন ব্যাকআপ নিন।", color = MaterialTheme.colorScheme.error)
                        }
                    }
                }
            }

            Button(
                onClick = { createLauncher.launch(BackupNames.fileName(System.currentTimeMillis())) },
                enabled = !viewModel.busy,
                modifier = Modifier.fillMaxWidth(),
            ) { Text("ব্যাকআপ তৈরি করুন") }
            Text("ফাইলটি এমন জায়গায় রাখুন যা এই ফোনের বাইরেও থাকে (Google Drive, কম্পিউটার বা অন্য ফোন)। শুধু এই ফোনের ভেতরে রাখলে আনইনস্টল করলে সেটিও যেতে পারে।")

            OutlinedButton(
                onClick = { openLauncher.launch(arrayOf("*/*")) },
                enabled = !viewModel.busy,
                modifier = Modifier.fillMaxWidth(),
            ) { Text("ব্যাকআপ থেকে রিস্টোর করুন") }
            Text("রিস্টোর করলে অ্যাপের বর্তমান ডাটা ব্যাকআপের ডাটা দিয়ে বদলে যায়। আগে বর্তমান ডাটার ব্যাকআপ নিয়ে নিন।")

            if (viewModel.busy) CircularProgressIndicator()
            viewModel.message?.let { Text(it) }
        }
    }

    viewModel.preview?.let { p ->
        AlertDialog(
            onDismissRequest = viewModel::cancelRestore,
            title = { Text("রিস্টোর নিশ্চিত করুন") },
            text = {
                Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    Text("ব্যাকআপ ফাইল যাচাই হয়েছে। ফাইলে আছে:")
                    Text(countsLine(p.backup))
                    Text("অ্যাপে এখন আছে:")
                    Text(countsLine(p.current))
                    Text("নিশ্চিত করলে অ্যাপ বন্ধ হবে; আবার খুললে ব্যাকআপের ডাটা থাকবে। আগের ডাটাবেস ফোনে সংরক্ষিত থাকে।")
                }
            },
            confirmButton = { TextButton(onClick = viewModel::confirmRestore) { Text("রিস্টোর করুন") } },
            dismissButton = { TextButton(onClick = viewModel::cancelRestore) { Text("বাতিল") } },
        )
    }

    if (viewModel.restartRequired) {
        // Not dismissable on purpose: the database is closed, nothing may be saved until the app is reopened.
        AlertDialog(
            onDismissRequest = {},
            title = { Text("অ্যাপ বন্ধ করতে হবে") },
            text = { Text("রিস্টোরের জন্য সবকিছু প্রস্তুত। অ্যাপ বন্ধ করে আবার খুললে রিস্টোর সম্পন্ন হবে।") },
            confirmButton = {
                TextButton(onClick = {
                    activity?.finishAffinity()
                    Process.killProcess(Process.myPid())
                }) { Text("অ্যাপ বন্ধ করুন") }
            },
        )
    }
}
