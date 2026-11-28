package com.questionbank.app.ui.hierarchy

import com.questionbank.app.domain.hierarchy.HierarchyRow
import com.questionbank.app.ui.format.toBengali

/**
 * Pure helpers of the list screens (no Android classes, so they run in plain JVM unit tests).
 */

/** Moves the item at [index] by [delta] places (-1 = up, +1 = down). Out-of-range moves return the list unchanged. */
fun <T> List<T>.moved(index: Int, delta: Int): List<T> {
    val target = index + delta
    if (index !in indices || target !in indices || delta == 0) return this
    val out = toMutableList()
    val item = out.removeAt(index)
    out.add(target, item)
    return out
}

/** The line under a card's name: "২ টি অধ্যায় · ১৪ টি প্রশ্ন" ([childUnit] is null for topics). */
fun countLine(row: HierarchyRow, childUnit: String?): String {
    val parts = ArrayList<String>(2)
    if (childUnit != null) parts += "${row.childCount.toBengali()} টি $childUnit"
    parts += "${row.questionCount.toBengali()} টি প্রশ্ন"
    return parts.joinToString(" · ")
}

/**
 * Text of the dialog shown when delete is refused because the item is not empty (ADR-010).
 * Questions come first in the hint: while any question exists below, deleting the inner items is not possible either.
 */
fun blockedDeleteText(row: HierarchyRow, childUnit: String?): String {
    val what = ArrayList<String>(2)
    if (childUnit != null && row.childCount > 0) what += "${row.childCount.toBengali()} টি $childUnit"
    if (row.questionCount > 0) what += "${row.questionCount.toBengali()} টি প্রশ্ন"
    val hint = when {
        row.questionCount > 0 -> "প্রশ্ন মুছে ফেলার সুবিধা পরের সংস্করণে আসছে।"
        childUnit != null && row.childCount > 0 -> "আগে ভেতরের $childUnit মুছে ফেলুন।"
        else -> ""
    }
    val head = "‘${row.name}’ খালি নয়: এতে ${what.joinToString(" ও ")} আছে, তাই মুছে ফেলা যাবে না।"
    return if (hint.isEmpty()) head else "$head $hint"
}
