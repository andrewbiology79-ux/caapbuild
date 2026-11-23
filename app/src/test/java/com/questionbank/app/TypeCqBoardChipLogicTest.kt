package com.questionbank.app

import com.questionbank.app.domain.question.BoardItem
import com.questionbank.app.domain.question.BoardTag
import com.questionbank.app.ui.question.orderedTypeCqBoardTags
import org.junit.Assert.assertEquals
import org.junit.Test

class TypeCqBoardChipLogicTest {
    @Test
    fun newestYearComesFirstAndSameYearUsesBoardCatalogOrder() {
        val boards = listOf(
            BoardItem("RAJ", "রাজশাহী", isCustom = false, isArchived = false),
            BoardItem("DHA", "ঢাকা", isCustom = false, isArchived = false),
            BoardItem("CTG", "চট্টগ্রাম", isCustom = false, isArchived = false),
        )
        val input = listOf(
            BoardTag("DHA", 2025), BoardTag("RAJ", 2026), BoardTag("DHA", 2026),
            BoardTag("CTG", 2025), BoardTag("DHA", 2026),
        )
        assertEquals(
            listOf(BoardTag("RAJ", 2026), BoardTag("DHA", 2026), BoardTag("DHA", 2025), BoardTag("CTG", 2025)),
            orderedTypeCqBoardTags(input, boards),
        )
    }
}
