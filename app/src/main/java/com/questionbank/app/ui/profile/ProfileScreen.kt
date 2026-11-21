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
import androidx.compose.material3.Switch
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import com.questionbank.app.data.settings.AppSettings
import com.questionbank.app.ui.question.EditorMode
import com.questionbank.app.ui.components.AppHeader
import com.questionbank.app.ui.format.toBengali
import com.questionbank.app.ui.settings.TextSizePolicy

/**
 * Profile tab (design 39.3): the hub for backup and settings. Statistics and categories come with later packages.
 * Settings changes apply at once to the whole app and are remembered.
 */
@Composable
fun ProfileScreen(settings: AppSettings, backupStatus: String, onOpenBackup: () -> Unit, onOpenMedia: () -> Unit) {
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

            SectionCard("ছবি ও মিডিয়া") {
                Text("অফলাইন ছবি আমদানি, যাচাই, Rotate/Crop, Export এবং নিরাপদ মুছে ফেলা।")
                Button(onClick = onOpenMedia) { Text("মিডিয়া লাইব্রেরি খুলুন") }
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

            SectionCard("Editor-এর ডিফল্ট মোড") {
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    FilterChip(
                        selected = settings.defaultEditorMode == EditorMode.MINIMUM,
                        onClick = { settings.updateDefaultEditorMode(EditorMode.MINIMUM) },
                        label = { Text("Minimum") },
                    )
                    FilterChip(
                        selected = settings.defaultEditorMode == EditorMode.FULL,
                        onClick = { settings.updateDefaultEditorMode(EditorMode.FULL) },
                        label = { Text("Full Editor") },
                    )
                }
                Text("নতুন প্রশ্ন তৈরির সময় এই মোডটি প্রাথমিকভাবে নির্বাচন হবে। আগে থেকে থাকা draft-এর নিজস্ব মোড অক্ষুণ্ণ থাকবে।", style = MaterialTheme.typography.bodySmall)
            }

            SectionCard("Search ও Accessibility") {
                Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                    Column(Modifier.weight(1f)) {
                        Text("Search term highlight")
                        Text("ফলাফলে খোঁজার শব্দ আলাদা করে দেখাবে।", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                    }
                    Switch(
                        checked = settings.highlightSearchTerms,
                        onCheckedChange = settings::updateHighlightSearchTerms,
                        modifier = Modifier.semantics { contentDescription = "সার্চের শব্দ highlight চালু বা বন্ধ" },
                    )
                }
                Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                    Column(Modifier.weight(1f)) {
                        Text("High contrast")
                        Text("লেখা ও পটভূমির পার্থক্য বাড়ায়।", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                    }
                    Switch(
                        checked = settings.highContrast,
                        onCheckedChange = settings::updateHighContrast,
                        modifier = Modifier.semantics { contentDescription = "High contrast mode চালু বা বন্ধ" },
                    )
                }
                Text("লেখার আকার, contrast এবং স্পষ্ট টেক্সট-লেবেল সহায়তা করে। Screen reader, keyboard focus ও touch-target-এর পূর্ণ যাচাই এখনো বাকি।", style = MaterialTheme.typography.bodySmall)
            }

            SectionCard("ছবির সংরক্ষণ নীতি") {
                Text("JPEG · সর্বোচ্চ ২০৪৮ px · quality ৮৮। Paper Builder-এ যোগ করা ছবি আলাদা paper_media কপিতে থাকে; মূল প্রশ্ন মুছলেও paper snapshot-এর ছবি রাখা হয়।", style = MaterialTheme.typography.bodySmall)
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
                    "আকার ${TextSizePolicy.MIN.toBengali()} থেকে ${TextSizePolicy.MAX.toBengali()} পর্যন্ত। প্রশ্ন, উদ্দীপক, সংক্ষিপ্ত উত্তর ও সমাধানের মূল লেখায় এটি প্রযোজ্য; বাটন ও লেবেলের আকার অপরিবর্তিত থাকে।",
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
