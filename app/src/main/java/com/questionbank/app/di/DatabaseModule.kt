package com.questionbank.app.di

import android.content.Context
import com.questionbank.app.data.local.QuestionBankDatabase
import dagger.Module
import dagger.Provides
import dagger.hilt.InstallIn
import dagger.hilt.android.qualifiers.ApplicationContext
import dagger.hilt.components.SingletonComponent
import javax.inject.Singleton

/**
 * The single physical QuestionBank.db (ADR-001) is created exactly once, through the same
 * factory the tests use, so bundled driver, WAL and the canonical-objects callback stay identical.
 * DAOs are deliberately NOT provided here: UI code must not receive DAOs (plan rule); repositories
 * arrive with Step D and will be the only consumers of DAOs.
 */
@Module
@InstallIn(SingletonComponent::class)
object DatabaseModule {
    @Provides
    @Singleton
    fun provideQuestionBankDatabase(@ApplicationContext context: Context): QuestionBankDatabase =
        QuestionBankDatabase.create(context)
}
