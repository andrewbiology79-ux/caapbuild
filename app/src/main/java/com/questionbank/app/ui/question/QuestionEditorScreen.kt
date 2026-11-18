package com.questionbank.app.ui.question

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import com.questionbank.app.ui.components.AppHeader
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.questionbank.app.domain.question.CqLabel
import com.questionbank.app.domain.question.QuestionRules
import com.questionbank.app.domain.question.SaveResult

private fun resultText(result: SaveResult?): String? = when (result) {
    null, is SaveResult.Saved -> null
    SaveResult.Empty -> "কমপক্ষে একটি প্রশ্নের লেখা দিন।"
    is SaveResult.MissingQuestionText -> "${result.label.letter}) এর উত্তর লেখা আছে, কিন্তু প্রশ্ন খালি। প্রশ্ন লিখুন বা উত্তরটি মুছুন।"
    is SaveResult.TooLong -> "${result.field} অনেক বড় (সর্বোচ্চ ${QuestionRules.MAX_TEXT_LENGTH} অক্ষর)।"
    SaveResult.TopicMissing -> "টপিকটি আর নেই। আপনার লেখা ড্রাফটে আছে; ফিরে গিয়ে আবার চেষ্টা করুন।"
    is SaveResult.Failed -> "সংরক্ষণ করা যায়নি, কিছুই হারায়নি। আপনার লেখা ড্রাফটে আছে; আবার চেষ্টা করুন।"
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun QuestionEditorScreen(
    viewModel: QuestionEditorViewModel,
    onSaved: (Int) -> Unit,
    onBack: () -> Unit,
) {
    val draft = viewModel.draft
    Scaffold(
        topBar = {
            AppHeader(title = "প্রশ্ন যোগ করুন", onBack = onBack)
        },
    ) { innerPadding ->
        if (!viewModel.loaded) {
            Column(modifier = Modifier.fillMaxSize().padding(innerPadding), horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.Center) {
                CircularProgressIndicator()
            }
            return@Scaffold
        }
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(innerPadding)
                .imePadding()
                .verticalScroll(rememberScrollState())
                .padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            val status = when (viewModel.draftStatus) {
                DraftStatus.NONE -> "লেখা স্বয়ংক্রিয়ভাবে ড্রাফটে সংরক্ষিত হয়। অ্যাপ বন্ধ হলেও হারাবে না।"
                DraftStatus.WAITING -> "ড্রাফটে সংরক্ষণ হচ্ছে…"
                DraftStatus.SAVED -> "ড্রাফট সংরক্ষিত ✓ (এখনো প্রশ্ন হিসেবে সংরক্ষিত হয়নি)"
            }
            Text(status, style = MaterialTheme.typography.bodySmall)
            if (viewModel.restoredFromDraft) {
                Text("আগের অসমাপ্ত লেখা ফিরিয়ে আনা হয়েছে।", style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.primary)
            }

            OutlinedTextField(
                value = draft.stimulus,
                onValueChange = viewModel::setStimulus,
                label = { Text("উদ্দীপক (ঐচ্ছিক)") },
                minLines = 3,
                modifier = Modifier.fillMaxWidth(),
            )
            // A stimulus rating is stored only with a stimulus text, so the buttons appear when there is one.
            if (draft.stimulus.isNotBlank()) {
                RatingPicker(
                    title = "উদ্দীপকের রেটিং",
                    selected = draft.stimulusRating,
                    enabled = !viewModel.saving,
                    onSelect = viewModel::changeStimulusRating,
                )
            }

            CqLabel.entries.forEachIndexed { i, label ->
                Text(
                    "${label.letter}) ${label.typeLabel} · ${marksText(label.marks)} নম্বর",
                    style = MaterialTheme.typography.titleMedium,
                    fontWeight = FontWeight.Bold,
                )
                OutlinedTextField(
                    value = draft.texts[i],
                    onValueChange = { viewModel.setText(i, it) },
                    label = { Text("প্রশ্ন") },
                    minLines = 2,
                    modifier = Modifier.fillMaxWidth(),
                )
                // Same for a question: its rating is stored only with its question text.
                if (draft.texts[i].isNotBlank()) {
                    RatingPicker(
                        title = "${label.letter}) প্রশ্নের রেটিং",
                        selected = draft.ratings[i],
                        enabled = !viewModel.saving,
                        onSelect = { viewModel.changeRating(i, it) },
                    )
                }
                OutlinedTextField(
                    value = draft.answers[i],
                    onValueChange = { viewModel.setAnswer(i, it) },
                    label = { Text("সংক্ষিপ্ত উত্তর (ঐচ্ছিক)") },
                    minLines = 1,
                    modifier = Modifier.fillMaxWidth(),
                )
            }

            resultText(viewModel.result)?.let {
                Text(it, color = MaterialTheme.colorScheme.error, style = MaterialTheme.typography.bodyMedium)
            }

            Button(
                onClick = {
                    viewModel.save {
                        val n = (viewModel.result as? SaveResult.Saved)?.questionIds?.size ?: 0
                        onSaved(n)
                    }
                },
                enabled = !viewModel.saving && !draft.isBlank,
                modifier = Modifier.fillMaxWidth(),
            ) { Text(if (viewModel.saving) "সংরক্ষণ হচ্ছে…" else "সংরক্ষণ করুন") }

            TextButton(onClick = viewModel::clearAll, enabled = !viewModel.saving && !draft.isBlank) {
                Text("সব লেখা মুছে ফেলুন")
            }
        }
    }
}
