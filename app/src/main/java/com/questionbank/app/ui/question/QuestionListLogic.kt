package com.questionbank.app.ui.question

import com.questionbank.app.domain.question.SavedGroup
import com.questionbank.app.domain.question.QuestionGroupKey
import com.questionbank.app.ui.format.toBengali

/** Pure texts of the question list (no Android classes, so they run in plain JVM unit tests). */

/** Number of visual cards. One stimulus and all its sub-questions count as one card. */
fun questionCount(groups: List<SavedGroup>): Int = groups.size

/** Rating badge on the card ribbon: "৩★". */
fun ratingText(rating: Int): String = "${rating.toBengali()}★"

/** Line above the cards in the normal list. */
fun totalLine(groups: List<SavedGroup>): String = "মোট ${questionCount(groups).toBengali()} টি প্রশ্ন"

/** Search result count is measured in visual cards, not individual sub-questions. */
fun foundLine(groups: List<SavedGroup>): String = "${questionCount(groups).toBengali()} টি প্রশ্ন কার্ড পাওয়া গেছে"

/** Stable card number from the complete, unfiltered topic order (not a filtered/sorted viewport index). */
fun topicCardNumber(topicGroups: List<SavedGroup>, group: SavedGroup): Int {
    val key = QuestionGroupKey.of(group) ?: return 1
    val index = topicGroups.indexOfFirst { QuestionGroupKey.of(it) == key }
    return if (index >= 0) index + 1 else 1
}
