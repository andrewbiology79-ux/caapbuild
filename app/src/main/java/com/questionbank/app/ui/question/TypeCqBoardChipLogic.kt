package com.questionbank.app.ui.question

import com.questionbank.app.domain.question.BoardItem
import com.questionbank.app.domain.question.BoardTag

/** Type-CQ-only board chip order: newest year first, then the configured board-catalog order. */
fun orderedTypeCqBoardTags(tags: List<BoardTag>, boards: List<BoardItem>): List<BoardTag> =
    tags.distinct().sortedWith(
        compareByDescending<BoardTag> { it.year }
            .thenBy { tag -> boards.indexOfFirst { it.code == tag.boardCode }.let { if (it < 0) Int.MAX_VALUE else it } }
            .thenBy { it.boardCode },
    )
