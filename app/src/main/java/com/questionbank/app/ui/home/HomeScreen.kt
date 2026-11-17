package com.questionbank.app.ui.home

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Card
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp

/**
 * Placeholder home screen (v0.2.20). It exists to prove Compose, Material 3 and Navigation Compose build and run,
 * and to show Bengali text with the system font. Real content (subject/chapter hierarchy) starts in Step D.
 */
@Composable
fun HomeScreen() {
    val context = LocalContext.current
    val versionName = remember(context) {
        try {
            @Suppress("DEPRECATION")
            context.packageManager.getPackageInfo(context.packageName, 0).versionName ?: "?"
        } catch (e: Exception) {
            "?"
        }
    }
    Scaffold(modifier = Modifier.fillMaxSize()) { innerPadding ->
        Column(
            modifier = Modifier.padding(innerPadding).padding(24.dp),
            verticalArrangement = Arrangement.spacedBy(16.dp),
        ) {
            Text("Question Bank", style = MaterialTheme.typography.headlineMedium)
            Text("প্রশ্নব্যাংক", style = MaterialTheme.typography.titleLarge)
            Card {
                Column(
                    modifier = Modifier.padding(16.dp),
                    verticalArrangement = Arrangement.spacedBy(8.dp),
                ) {
                    Text("Build foundation", style = MaterialTheme.typography.titleMedium)
                    Text("Version: $versionName")
                    Text("এটি এখনো সম্পূর্ণ অ্যাপ নয়। পরবর্তী ধাপ: Type_CQ প্রশ্নের তালিকা।")
                }
            }
        }
    }
}
