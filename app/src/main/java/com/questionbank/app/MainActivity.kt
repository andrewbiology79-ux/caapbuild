package com.questionbank.app

import android.os.Bundle
import android.widget.TextView
import androidx.activity.ComponentActivity
import com.questionbank.app.data.local.QuestionBankDatabase
import dagger.Lazy
import dagger.hilt.android.AndroidEntryPoint
import javax.inject.Inject

/**
 * Still a placeholder screen (Compose replaces it in v0.2.20). The only change in v0.2.19 is that
 * the activity is a Hilt entry point. The database is injected as Lazy and never touched here, so
 * starting the app does not open QuestionBank.db; the dependency graph itself is validated at compile time.
 */
@AndroidEntryPoint
class MainActivity : ComponentActivity() {

    @Inject
    lateinit var database: Lazy<QuestionBankDatabase>

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        val message = TextView(this).apply {
            text = "Question Bank\n\nv0.2.19: Hilt wired (database injected lazily)\nCompose UI comes in v0.2.20"
            textSize = 20f
            setPadding(32, 48, 32, 32)
        }
        setContentView(message)
    }
}
