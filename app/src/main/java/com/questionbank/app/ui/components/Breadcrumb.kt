package com.questionbank.app.ui.components

import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp

/** A one-line horizontal path; every crumb except the last can be selected. */
@Composable
fun Breadcrumb(
    crumbs: List<String>,
    onCrumbClick: (Int) -> Unit,
    verticalPadding: Dp = 6.dp,
    itemVerticalPadding: Dp = 4.dp,
    modifier: Modifier = Modifier,
) {
    Row(
        modifier = modifier
            .fillMaxWidth()
            .horizontalScroll(rememberScrollState())
            .padding(horizontal = 16.dp, vertical = verticalPadding),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        crumbs.forEachIndexed { index, label ->
            if (index > 0) {
                Text(
                    "›",
                    modifier = Modifier.padding(horizontal = 6.dp),
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    maxLines = 1,
                )
            }
            if (index == crumbs.lastIndex) {
                Text(label, fontWeight = FontWeight.Bold, maxLines = 1)
            } else {
                Text(
                    label,
                    color = MaterialTheme.colorScheme.primary,
                    maxLines = 1,
                    modifier = Modifier.clickable { onCrumbClick(index) }.padding(vertical = itemVerticalPadding),
                )
            }
        }
    }
}
