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
    return "${tag.boardCode} · ${tag.year.toBengali()}"
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
