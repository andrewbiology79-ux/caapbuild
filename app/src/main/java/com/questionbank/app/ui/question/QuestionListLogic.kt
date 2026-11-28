package com.questionbank.app.ui.question

import com.questionbank.app.domain.question.SavedGroup
import com.questionbank.app.domain.question.RatingRules
import com.questionbank.app.ui.format.toBengali

/** Pure texts of the question list (no Android classes, so they run in plain JVM unit tests). */

/** Number of saved cards; each stimulus group or standalone question is one card. */
fun cardCount(groups: List<SavedGroup>): Int = groups.size

/** Existing shared rating text retained for Chapter CQ cards (e.g. "৩★"). */
fun ratingText(rating: Int): String = "${rating.toBengali()}★"

/** Type CQ ribbon rating text: number + one star (e.g. "৩★"); no empty stars, no rating name. */
fun typeCqRatingText(rating: Int): String {
    val safeRating = rating.coerceIn(RatingRules.MIN, RatingRules.MAX)
    return "${safeRating.toBengali()}★"
}

/** Total saved cards in the topic. */
fun totalLine(groups: List<SavedGroup>): String = "মোট: ${cardCount(groups).toBengali()}"

/** Saved cards visible in the current search or filter result. */
fun foundLine(groups: List<SavedGroup>): String = "দৃশ্যমান: ${cardCount(groups).toBengali()}"
