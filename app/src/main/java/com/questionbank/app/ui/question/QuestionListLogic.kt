package com.questionbank.app.ui.question

import com.questionbank.app.domain.question.SavedGroup
import com.questionbank.app.ui.format.toBengali

/** Pure texts of the question list (no Android classes, so they run in plain JVM unit tests). */

/** Number of sub-questions in [groups]; the unit of "মোট N টি প্রশ্ন". */
fun questionCount(groups: List<SavedGroup>): Int = groups.sumOf { it.subQuestions.size }

/** Rating badge on the card ribbon: "৩★". */
fun ratingText(rating: Int): String = "${rating.toBengali()}★"

/** Line above the cards in the normal list. */
fun totalLine(groups: List<SavedGroup>): String = "মোট ${questionCount(groups).toBengali()} টি প্রশ্ন"

/** Line above the cards while searching: "৩ টি প্রশ্ন পাওয়া গেছে". The number counts sub-questions, as the total does. */
fun foundLine(groups: List<SavedGroup>): String = "${questionCount(groups).toBengali()} টি প্রশ্ন পাওয়া গেছে"
