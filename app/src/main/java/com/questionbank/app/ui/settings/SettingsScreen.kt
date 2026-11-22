package com.questionbank.app.ui.settings

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Card
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import com.questionbank.app.data.settings.AppSettings
import com.questionbank.app.ui.components.AppHeader
import com.questionbank.app.ui.format.toBengali
import com.questionbank.app.ui.question.RichLatexText

/** Sample shown at the top of the page so every change is visible at once (uses "<br>", a display formula and wrapping prose). */
private const val SAMPLE_TEXT =
    "মডেলের ২য় কক্ষপথের ক্ষেত্রে রৈখিক বেগ নির্ণয়ের জন্য নিচের ধাপগুলো অনুসরণ করা হলো। এই লেখাটি কয়েক লাইনে ভেঙে লাইন স্পেসিং বোঝাতে সাহায্য করে।\n" +
        "\$v_2 = \\dfrac{2.1889 \\times 10^6}{n}\$ <br> \$= \\dfrac{2.1889 \\times 10^6}{2}\$ <br> \$= 1.09445 \\times 10^6\\ \\text{ms}^{-1}\$\n" +
        "\$\$f = \\dfrac{v_2}{2\\pi r_2}\$\$\n" +
        "সবশেষে ফলাফল লেখা হলো।"

/**
 * Settings page opened from the Profile tab. Four reading-text options, each with a minus / plus / default control:
 * line spacing, the gap between "<br>" lines, the gap around display formulas, and the body font size.
 * Values apply at once everywhere the question text is shown and are remembered (see [AppSettings]).
 */
@Composable
fun SettingsScreen(settings: AppSettings, onBack: () -> Unit) {
    Column(modifier = Modifier.fillMaxSize()) {
        AppHeader(title = "সেটিংস (Settings)", onBack = onBack)
        Card(modifier = Modifier.fillMaxWidth().padding(start = 16.dp, top = 12.dp, end = 16.dp)) {
            Column(modifier = Modifier.padding(12.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                Text("নমুনা (পরিবর্তন সঙ্গে সঙ্গে দেখা যাবে)", style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.primary)
                Column(Modifier.heightIn(max = 240.dp).verticalScroll(rememberScrollState())) {
                    RichLatexText(SAMPLE_TEXT, Modifier.fillMaxWidth())
                }
            }
        }
        Column(
            modifier = Modifier.weight(1f).fillMaxWidth().verticalScroll(rememberScrollState()).padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            SettingCard(
                title = "১. লাইন স্পেসিং",
                valueText = "${settings.lineSpacingPercent.toBengali()}%",
                defaultText = "${SpacingPolicy.LINE_DEFAULT.toBengali()}%",
                canDecrease = settings.lineSpacingPercent > SpacingPolicy.LINE_MIN,
                canIncrease = settings.lineSpacingPercent < SpacingPolicy.LINE_MAX,
                canReset = settings.lineSpacingPercent != SpacingPolicy.LINE_DEFAULT,
                onDecrease = { settings.updateLineSpacing(SpacingPolicy.stepLine(settings.lineSpacingPercent, -1)) },
                onIncrease = { settings.updateLineSpacing(SpacingPolicy.stepLine(settings.lineSpacingPercent, 1)) },
                onReset = { settings.updateLineSpacing(SpacingPolicy.LINE_DEFAULT) },
                description = "একই অনুচ্ছেদের সাধারণ লেখার এক লাইন থেকে পরের লাইনের দূরত্ব (ফন্ট সাইজের শতাংশ)। ${SpacingPolicy.LINE_MIN.toBengali()}% থেকে ${SpacingPolicy.LINE_MAX.toBengali()}% পর্যন্ত। প্রশ্ন কার্ড, বিস্তারিত, সার্চ ও এডিটরের প্রিভিউতে প্রযোজ্য; এডিটরের টাইপ করার ঘর বদলায় না।",
            )
            SettingCard(
                title = "২. <br> ফাঁক",
                valueText = "${settings.breakGapDp.toBengali()} dp",
                defaultText = "${SpacingPolicy.BREAK_GAP_DEFAULT.toBengali()} dp",
                canDecrease = settings.breakGapDp > SpacingPolicy.BREAK_GAP_MIN,
                canIncrease = settings.breakGapDp < SpacingPolicy.BREAK_GAP_MAX,
                canReset = settings.breakGapDp != SpacingPolicy.BREAK_GAP_DEFAULT,
                onDecrease = { settings.updateBreakGap(SpacingPolicy.stepBreakGap(settings.breakGapDp, -1)) },
                onIncrease = { settings.updateBreakGap(SpacingPolicy.stepBreakGap(settings.breakGapDp, 1)) },
                onReset = { settings.updateBreakGap(SpacingPolicy.BREAK_GAP_DEFAULT) },
                description = "লেখায় <br> চিহ্ন দিয়ে ভাঙা দুই লাইনের মাঝের ফাঁক। ${SpacingPolicy.BREAK_GAP_MIN.toBengali()} থেকে ${SpacingPolicy.BREAK_GAP_MAX.toBengali()} dp পর্যন্ত। <br> নেই এমন লেখায় কিছুই বদলায় না।",
            )
            SettingCard(
                title = "৩. \$\$...\$\$ স্পেসিং",
                valueText = "${settings.blockGapDp.toBengali()} dp",
                defaultText = "${SpacingPolicy.BLOCK_GAP_DEFAULT.toBengali()} dp",
                canDecrease = settings.blockGapDp > SpacingPolicy.BLOCK_GAP_MIN,
                canIncrease = settings.blockGapDp < SpacingPolicy.BLOCK_GAP_MAX,
                canReset = settings.blockGapDp != SpacingPolicy.BLOCK_GAP_DEFAULT,
                onDecrease = { settings.updateBlockGap(SpacingPolicy.stepBlockGap(settings.blockGapDp, -1)) },
                onIncrease = { settings.updateBlockGap(SpacingPolicy.stepBlockGap(settings.blockGapDp, 1)) },
                onReset = { settings.updateBlockGap(SpacingPolicy.BLOCK_GAP_DEFAULT) },
                description = "ব্লক সূত্র (\$\$...\$\$) এবং তার আগের-পরের লেখার মাঝের দূরত্ব। ${SpacingPolicy.BLOCK_GAP_MIN.toBengali()} থেকে ${SpacingPolicy.BLOCK_GAP_MAX.toBengali()} dp পর্যন্ত। সূত্রের ভেতরের নিজস্ব ফাঁক এতে বদলায় না।",
            )
            SettingCard(
                title = "৪. মূল অ্যাপের ফন্ট সাইজ (লেখার আকার)",
                valueText = settings.textSize.toBengali(),
                defaultText = TextSizePolicy.DEFAULT.toBengali(),
                canDecrease = settings.textSize > TextSizePolicy.MIN,
                canIncrease = settings.textSize < TextSizePolicy.MAX,
                canReset = settings.textSize != TextSizePolicy.DEFAULT,
                onDecrease = { settings.updateTextSize(TextSizePolicy.step(settings.textSize, -1)) },
                onIncrease = { settings.updateTextSize(TextSizePolicy.step(settings.textSize, 1)) },
                onReset = { settings.updateTextSize(TextSizePolicy.DEFAULT) },
                description = "আকার ${TextSizePolicy.MIN.toBengali()} থেকে ${TextSizePolicy.MAX.toBengali()} পর্যন্ত। প্রশ্ন, উদ্দীপক, সংক্ষিপ্ত উত্তর ও সমাধানের মূল লেখায় এটি প্রযোজ্য; বাটন ও লেবেলের আকার অপরিবর্তিত থাকে।",
            )
        }
    }
}

@Composable
private fun SettingCard(
    title: String,
    valueText: String,
    defaultText: String,
    canDecrease: Boolean,
    canIncrease: Boolean,
    canReset: Boolean,
    onDecrease: () -> Unit,
    onIncrease: () -> Unit,
    onReset: () -> Unit,
    description: String,
) {
    Card(modifier = Modifier.fillMaxWidth()) {
        Column(modifier = Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
            Text(title, style = MaterialTheme.typography.titleMedium)
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                OutlinedButton(onClick = onDecrease, enabled = canDecrease) { Text("−") }
                Text(valueText, style = MaterialTheme.typography.titleMedium)
                OutlinedButton(onClick = onIncrease, enabled = canIncrease) { Text("+") }
                TextButton(onClick = onReset, enabled = canReset) { Text("ডিফল্ট ($defaultText)") }
            }
            Text(description, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
        }
    }
}
