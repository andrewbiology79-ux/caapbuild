package com.questionbank.app.ui.question

import com.questionbank.app.domain.question.BoardItem
import com.questionbank.app.domain.question.BoardTag
import com.questionbank.app.domain.question.SavedGroup
import com.questionbank.app.ui.format.toBengali

/**
 * Texts and small rules of the board / year chips (v0.2.30c-2, UI-08). Pure (no Compose, no Android), so a JVM unit test can check them.
 */

/** "ঢাকা · ২০১৯". A board that is not in [boards] (should not happen, the catalog never loses a board) shows its code. */
fun tagText(tag: BoardTag, boards: List<BoardItem>): String {
    val name = boards.firstOrNull { it.code == tag.boardCode }?.displayName ?: tag.boardCode
    return "$name · ${tag.year.toBengali()}"
}

/**
 * The tags shown in the light chip row under the ribbon of a card: the stimulus tags of a group that has a stimulus, or the tags of
 * the only question of a single question. The tags of the sub-questions of a group with a stimulus are shown with each question.
 */
fun cardTopTags(group: SavedGroup): List<BoardTag> =
    if (group.stimulusId != null) group.stimulusBoards else group.subQuestions.firstOrNull()?.boards.orEmpty()

/** True when neither the stimulus nor any question of the card has a tag (the chip row then says "ট্যাগ নেই"). */
fun cardHasNoTags(group: SavedGroup): Boolean = group.stimulusBoards.isEmpty() && group.subQuestions.all { it.boards.isEmpty() }

/** What a person typed in "অন্য সাল" while it cannot be used yet, or null when it is fine or still empty. */
fun yearInputError(raw: String, parse: (String) -> Int?): String? =
    if (raw.isBlank() || parse(raw) != null) null else "সাল চার অঙ্কের হতে হবে (১৯০০ থেকে ২২০০)"


/** Card chip order: newest year first, then the board catalog's display order. */
fun sortedCardBoardTags(tags: List<BoardTag>, boards: List<BoardItem>): List<BoardTag> {
    val catalogOrder = boards.mapIndexed { index, board -> board.code to index }.toMap()
    return tags.distinct().sortedWith(
        compareByDescending<BoardTag> { it.year }
            .thenBy { catalogOrder[it.boardCode] ?: Int.MAX_VALUE }
            .thenBy { it.boardCode },
    )
}


/** Compact chip label like the legacy app: board code, apostrophe, two-digit year in English digits, e.g. "DHA'26". */
fun cardBoardTagText(tag: BoardTag): String = "${tag.boardCode}'${(tag.year % 100).toString().padStart(2, '0')}"
