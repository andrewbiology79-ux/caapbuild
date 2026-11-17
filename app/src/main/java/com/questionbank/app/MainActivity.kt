package com.questionbank.app

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import com.questionbank.app.ui.navigation.AppNavHost
import com.questionbank.app.ui.theme.QuestionBankTheme

/**
 * Single Activity (ADR-002). All screens are Compose destinations in [AppNavHost].
 * The Activity does not open the database; repositories arrive later through AppContainer.
 */
class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContent {
            QuestionBankTheme {
                AppNavHost()
            }
        }
    }
}
