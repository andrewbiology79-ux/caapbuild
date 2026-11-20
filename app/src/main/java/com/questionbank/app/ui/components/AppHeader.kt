package com.questionbank.app.ui.components

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.RowScope
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.statusBars
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.windowInsetsPadding
import androidx.compose.material3.IconButton
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.questionbank.app.ui.theme.HeaderDark
import com.questionbank.app.ui.theme.HeaderLight
import com.questionbank.app.ui.theme.LocalDarkTheme

/**
 * The blue header bar of every screen (design 39.3): optional back arrow, title with optional small subtitle, optional
 * action buttons on the right. The bar also fills the area behind the status bar, so content never sits under it.
 */
@Composable
fun AppHeader(
    title: String,
    subtitle: String? = null,
    onBack: (() -> Unit)? = null,
    leadingGlyph: String = "←",
    actions: @Composable RowScope.() -> Unit = {},
) {
    val container = if (LocalDarkTheme.current) HeaderDark else HeaderLight
    Surface(color = container, contentColor = Color.White, modifier = Modifier.fillMaxWidth()) {
        Row(
            modifier = Modifier
                .windowInsetsPadding(WindowInsets.statusBars)
                .height(64.dp)
                .padding(horizontal = 4.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            if (onBack != null) {
                IconButton(
                    onClick = onBack,
                    modifier = Modifier.semantics { contentDescription = if (leadingGlyph == "×") "বন্ধ করুন" else "পিছনে" },
                ) { Text(leadingGlyph, fontSize = if (leadingGlyph == "×") 32.sp else 24.sp, color = Color.White, fontWeight = FontWeight.Light) }
            } else {
                Spacer(Modifier.width(12.dp))
            }
            Column(modifier = Modifier.weight(1f), verticalArrangement = Arrangement.Center) {
                Text(
                    title,
                    fontSize = 18.sp,
                    fontWeight = FontWeight.SemiBold,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                    color = Color.White,
                )
                if (subtitle != null) {
                    Text(
                        subtitle,
                        fontSize = 11.sp,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis,
                        color = Color(0xFFDCE3FF),
                    )
                }
            }
            actions()
        }
    }
}
