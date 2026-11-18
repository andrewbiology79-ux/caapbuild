package com.questionbank.app

import android.graphics.Color
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.SystemBarStyle
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.compose.runtime.SideEffect
import com.questionbank.app.ui.navigation.AppNavHost
import com.questionbank.app.ui.theme.QuestionBankTheme

/**
 * Single Activity (ADR-002). All screens are Compose destinations in [AppNavHost].
 * The Activity does not open the database; it reads only the small display settings (theme, text size) from preferences.
 */
class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        val settings = (application as QuestionBankApp).container.appSettings
        setContent {
            val dark = settings.darkTheme
            val textSize = settings.textSize
            // The header bar is always dark enough for light status-bar icons; the navigation bar follows the owner's theme.
            SideEffect {
                enableEdgeToEdge(
                    statusBarStyle = SystemBarStyle.dark(Color.TRANSPARENT),
                    navigationBarStyle = if (dark) {
                        SystemBarStyle.dark(Color.TRANSPARENT)
                    } else {
                        SystemBarStyle.light(Color.TRANSPARENT, Color.TRANSPARENT)
                    },
                )
            }
            QuestionBankTheme(darkTheme = dark, textSize = textSize) {
                AppNavHost()
            }
        }
    }
}
