package com.questionbank.app

import android.app.Activity
import android.os.Bundle
import android.widget.TextView

class MainActivity : Activity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        val message = TextView(this).apply {
            text = "Question Bank\n\nGitHub Auto-Build Harness\nRoom compatibility compile target"
            textSize = 20f
            setPadding(32, 48, 32, 32)
        }
        setContentView(message)
    }
}
