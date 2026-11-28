package com.questionbank.app.ui.profile

import com.questionbank.app.AppSourceInfo
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

/**
 * Profile tab (design 39.3): the hub for category management, backup, media and settings.
 * Settings changes apply at once to the whole app and are remembered.
 */
@Composable
fun ProfileScreen(
    settings: AppSettings,
    backupStatus: String,
    onOpenCategories: () -> Unit,
    onOpenBackup: () -> Unit,
    onOpenMedia: () -> Unit,
    onOpenSettings: () -> Unit,
) {
    val context = LocalContext.current
    val versionName = remember(context) {
        try {
            @Suppress("DEPRECATION")
            context.packageManager.getPackageInfo(context.packageName, 0).versionName ?: "?"
        } catch (e: Exception) {
            "?"
        }
    }
    Column(modifier = Modifier.fillMaxSize()) {
        AppHeader(title = "প্রোফাইল (Profile)", subtitle = "পরিসংখ্যান, ব্যাকআপ ও সেটিংস")
        Column(
            modifier = Modifier.weight(1f).fillMaxWidth().verticalScroll(rememberScrollState()).padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            SectionCard("ক্যাটাগরি") {
                Text("প্রশ্নপত্রের ক্যাটাগরি তৈরি, নাম পরিবর্তন, সাজানো এবং ক্যাটাগরি বা তার ভেতরের প্রশ্নপত্র মুছে ফেলা।")
                Button(onClick = onOpenCategories) { Text("ক্যাটাগরি পরিচালনা") }
            }

            SectionCard("ব্যাকআপ ও রিস্টোর") {
                Text(backupStatus)
                Button(onClick = onOpenBackup) { Text("ব্যাকআপ ও রিস্টোর খুলুন") }
            }

            SectionCard("ছবি ও মিডিয়া") {
                Text("অফলাইন ছবি আমদানি, যাচাই, Rotate/Crop, Export এবং নিরাপদ মুছে ফেলা।")
                Button(onClick = onOpenMedia) { Text("মিডিয়া লাইব্রেরি খুলুন") }
            }

            SectionCard("সেটিংস") {
                Text("লাইন স্পেসিং, <br> ফাঁক, ব্লক সূত্রের ফাঁক এবং লেখার আকার (ফন্ট সাইজ)।")
                Button(onClick = onOpenSettings) { Text("সেটিংস খুলুন") }
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

            SectionCard("অ্যাক্টিভিটি লগ (Activity log)") {
                Text(
                    "কোন স্ক্রিনে কোথায় ট্যাপ করেছেন, কী লিখেছেন (দৈর্ঘ্য ও সামান্য অংশ), কোন বাটন চেপেছেন এবং সেভে কী হয়েছে — সব সময়ক্রমে লেখা হয়।",
                    style = MaterialTheme.typography.bodySmall,
                )
                Text("ফাইল: ${com.questionbank.app.ActivityLog.location()}", style = MaterialTheme.typography.bodySmall)
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    OutlinedButton(onClick = {
                        val text = com.questionbank.app.ActivityLog.read(150_000)
                        val clipboard = context.getSystemService(android.content.Context.CLIPBOARD_SERVICE) as android.content.ClipboardManager
                        clipboard.setPrimaryClip(android.content.ClipData.newPlainText("activity_log", text))
                        android.widget.Toast.makeText(context, if (text.isEmpty()) "লগ খালি" else "লগ কপি হয়েছে", android.widget.Toast.LENGTH_SHORT).show()
                    }) { Text("লগ কপি করুন") }
                    OutlinedButton(onClick = {
                        com.questionbank.app.ActivityLog.clear()
                        android.widget.Toast.makeText(context, "লগ মুছে ফেলা হয়েছে", android.widget.Toast.LENGTH_SHORT).show()
                    }) { Text("লগ মুছুন") }
                }
            }

            SectionCard("এডিটর লগ (Editor log)") {
                Text(
                    "শুধু প্রশ্ন তৈরি ও এডিটের এডিটরের কাজ: কী বদলেছেন, সেভে কী পাঠানো হয়েছে, ডাটাবেসের প্রতিটি যাচাই PASS/FAIL এবং শেষ ফল। লেখা পুরো নয়, দৈর্ঘ্য, ফাঁকা অংশ ও হ্যাশসহ সামান্য অংশ লেখা হয়।",
                    style = MaterialTheme.typography.bodySmall,
                )
                Text("ফাইল: ${com.questionbank.app.EditorLog.location()}", style = MaterialTheme.typography.bodySmall)
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    OutlinedButton(onClick = {
                        val text = com.questionbank.app.EditorLog.read(150_000)
                        val clipboard = context.getSystemService(android.content.Context.CLIPBOARD_SERVICE) as android.content.ClipboardManager
                        clipboard.setPrimaryClip(android.content.ClipData.newPlainText("editor_log", text))
                        android.widget.Toast.makeText(context, if (text.isEmpty()) "এডিটর লগ খালি" else "এডিটর লগ কপি হয়েছে", android.widget.Toast.LENGTH_SHORT).show()
                    }) { Text("লগ কপি করুন") }
                    OutlinedButton(onClick = {
                        com.questionbank.app.EditorLog.clear()
                        android.widget.Toast.makeText(context, "এডিটর লগ মুছে ফেলা হয়েছে", android.widget.Toast.LENGTH_SHORT).show()
                    }) { Text("লগ মুছুন") }
                }
            }

            SectionCard("অ্যাপ তথ্য") {
                Text("Question Bank (প্রশ্নব্যাংক)")
                Text("সংস্করণ: $versionName")
                Text("সোর্স ZIP ফাইল: ${AppSourceInfo.SOURCE_ZIP}")
                Text("প্ল্যান টেক্সট ফাইল: ${AppSourceInfo.PLAN_TEXT}")
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
