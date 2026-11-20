package com.questionbank.app

import com.questionbank.app.domain.question.CqLabel
import com.questionbank.app.domain.question.QuestionEditBlockRules
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class QuestionEditBlockRulesTest {
    @Test
    fun persistedLabelMarkedForDeletionIsNotReusedBeforeTransactionCommit() {
        val persisted = CqLabel.entries.toSet()
        val stillVisible = setOf(CqLabel.KHA, CqLabel.GA, CqLabel.GHA)

        assertTrue(QuestionEditBlockRules.addableLabels(CqLabel.entries, persisted, stillVisible).isEmpty())
    }

    @Test
    fun onlyNeverPersistedAndNotAlreadyVisibleLabelsCanBeAdded() {
        val persisted = setOf(CqLabel.GA, CqLabel.GHA)
        val visible = setOf(CqLabel.GHA, CqLabel.KA)

        assertEquals(listOf(CqLabel.KHA), QuestionEditBlockRules.addableLabels(CqLabel.entries, persisted, visible))
    }

    @Test
    fun pendingVisibleBlankBlockCountsWhenCheckingWhetherSavedBlockCanBeRemoved() {
        assertTrue(QuestionEditBlockRules.canDeletePersistedBlock(1, 1))
        assertFalse(QuestionEditBlockRules.canDeletePersistedBlock(1, 0))
    }

    @Test
    fun negativeCountsCannotMakeAnEmptyGroupDeletable() {
        assertFalse(QuestionEditBlockRules.canDeletePersistedBlock(-1, -2))
    }
}
