package com.questionbank.app.data.repository

import com.questionbank.app.data.local.QuestionBankDatabase
import com.questionbank.app.data.local.searchAllQuestions
import com.questionbank.app.domain.search.GlobalQuestionHit
import com.questionbank.app.domain.search.GlobalQuestionSearchFilters
import com.questionbank.app.domain.search.GlobalQuestionSearchRepository

class GlobalQuestionSearchRepositoryImpl(
    private val database: QuestionBankDatabase,
) : GlobalQuestionSearchRepository {
    override suspend fun search(filters: GlobalQuestionSearchFilters): List<GlobalQuestionHit> =
        database.searchAllQuestions(filters)
}
