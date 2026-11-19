package com.questionbank.app

import com.questionbank.app.domain.editor.TypeCqDraftAdapter
import com.questionbank.app.domain.question.CqLabel
import com.questionbank.app.domain.question.DraftText
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

class TypeCqDraftAdapterTest {
    @Test fun questionIdsFollowLabelsWhenCardHasOnlySomeBlocks() {
        val first = CqLabel.entries[0]
        val third = CqLabel.entries[2]
        val result = TypeCqDraftAdapter.fromLegacy(
            ownerId = "owner",
            draft = DraftText(),
            questionIdsByLabel = mapOf(first.letter to "q-first", third.letter to "q-third"),
        )
        val byLabel = result.questionBlocks.associateBy { it.label }
        assertEquals("q-first", byLabel[first.letter]?.questionId)
        assertNull(byLabel[CqLabel.entries[1].letter]?.questionId)
        assertEquals("q-third", byLabel[third.letter]?.questionId)
    }
}
