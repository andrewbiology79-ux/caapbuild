package com.questionbank.app

import android.app.Application
import dagger.hilt.android.HiltAndroidApp

/** Hilt entry point for the whole application (ADR-002). No other initialisation belongs here yet. */
@HiltAndroidApp
class QuestionBankApp : Application()
