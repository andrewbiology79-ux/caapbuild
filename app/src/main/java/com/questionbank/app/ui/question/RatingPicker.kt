package com.questionbank.app.ui.question

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.material3.FilterChip
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import com.questionbank.app.domain.question.RatingRules
import com.questionbank.app.ui.format.toBengali

/**
 * Five buttons 1-5 with the names of plan 39.3. Tapping the selected one again clears the rating (null = not saved).
 * [title] says what is rated ("উদ্দীপকের রেটিং", "ক) প্রশ্নের রেটিং").
 */
@Composable
fun RatingPicker(
    title: String,
    selected: Int?,
    enabled: Boolean,
    onSelect: (Int?) -> Unit,
    modifier: Modifier = Modifier,
) {
    Column(modifier = modifier.fillMaxWidth(), verticalArrangement = Arrangement.spacedBy(4.dp)) {
        Text(title, style = MaterialTheme.typography.labelLarge)
        Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(6.dp)) {
            for (value in RatingRules.MIN..RatingRules.MAX) {
                FilterChip(
                    selected = selected == value,
                    onClick = { onSelect(if (selected == value) null else value) },
                    enabled = enabled,
                    label = { Text("${value.toBengali()}★", textAlign = TextAlign.Center, modifier = Modifier.fillMaxWidth()) },
                    modifier = Modifier.weight(1f),
                )
            }
        }
        Text(ratingHint(selected), style = MaterialTheme.typography.bodySmall)
    }
}
