package com.questionbank.app.ui.profile

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.FilterChip
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import com.questionbank.app.data.settings.AppSettings
import com.questionbank.app.ui.components.AppHeader
import com.questionbank.app.ui.format.toBengali
import com.questionbank.app.ui.settings.TextSizePolicy

/**
 * Profile tab (design 39.3): the hub for backup and settings. Statistics and categories come with later packages.
 * Settings changes apply at once to the whole app and are remembered.
 */
@Composable
fun ProfileScreen(settings: AppSettings, backupStatus: String, onOpenBackup: () -> Unit) {
    val context = LocalContext.current
    val versionName = remember(context) {
        try {
            @Suppress("DEPRECATION")
            context.packageManager.getPackageInfo(context.packageName, 0).versionName ?: "?"
        } catch (e: Exception) {
            "?"
        }
    }
    val size = settings.textSize

    Column(modifier = Modifier.fillMaxSize()) {
        AppHeader(title = "প্রোফাইল (Profile)", subtitle = "পরিসংখ্যান, ব্যাকআপ ও সেটিংস")
        Column(
            modifier = Modifier.weight(1f).fillMaxWidth().verticalScroll(rememberScrollState()).padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            SectionCard("ব্যাকআপ ও রিস্টোর") {
                Text(backupStatus)
                Button(onClick = onOpenBackup) { Text("ব্যাকআপ ও রিস্টোর খুলুন") }
            }

            SectionCard("থিম") {
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    FilterChip(
                        selected = !settings.darkTheme,
                        onClick = { settings.updateDarkTheme(false) },
                        label = { Text("লাইট") },
                    )
                    FilterChip(
                        selected = settings.darkTheme,
                        onClick = { settings.updateDarkTheme(true) },
                        label = { Text("ডার্ক") },
                    )
                }
            }

            SectionCard("লেখার আকার") {
                Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                    OutlinedButton(
                        onClick = { settings.updateTextSize(TextSizePolicy.step(size, -1)) },
                        enabled = size > TextSizePolicy.MIN,
                    ) { Text("−") }
                    Text(size.toBengali(), style = MaterialTheme.typography.titleMedium)
                    OutlinedButton(
                        onClick = { settings.updateTextSize(TextSizePolicy.step(size, 1)) },
                        enabled = size < TextSizePolicy.MAX,
                    ) { Text("+") }
                    TextButton(
                        onClick = { settings.updateTextSize(TextSizePolicy.DEFAULT) },
                        enabled = size != TextSizePolicy.DEFAULT,
                    ) { Text("ডিফল্ট (${TextSizePolicy.DEFAULT.toBengali()})") }
                }
                Text(
                    "আকার ${TextSizePolicy.MIN.toBengali()} থেকে ${TextSizePolicy.MAX.toBengali()} পর্যন্ত। পুরো অ্যাপের লেখা এর সাথে বদলায়।",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }

            SectionCard("অ্যাপ তথ্য") {
                Text("Question Bank (প্রশ্নব্যাংক)")
                Text("সংস্করণ: $versionName")
            }
        }
    }
}

@Composable
private fun SectionCard(title: String, content: @Composable () -> Unit) {
    Card(modifier = Modifier.fillMaxWidth()) {
        Column(modifier = Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
            Text(title, style = MaterialTheme.typography.titleMedium)
            content()
        }
    }
}
