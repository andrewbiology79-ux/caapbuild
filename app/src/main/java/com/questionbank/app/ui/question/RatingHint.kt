package com.questionbank.app.ui.question

import com.questionbank.app.domain.question.QuestionCardRules
import com.questionbank.app.domain.question.RatingRules
import com.questionbank.app.ui.format.toBengali

/** The sentence under the five rating buttons (v0.2.30b, UI-07). Pure (no Compose), so a JVM unit test can check it. */
fun ratingHint(selected: Int?): String =
    if (selected == null) {
        "রেটিং বাছা হয়নি (কার্ডে ${QuestionCardRules.DEFAULT_RATING.toBengali()}★ দেখাবে)"
    } else {
        "${selected.toBengali()}★ · ${RatingRules.name(selected)}"
    }
