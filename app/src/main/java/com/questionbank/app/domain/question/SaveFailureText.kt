package com.questionbank.app.domain.question

/**
 * Turns the raw reason of a refused/failed save into a sentence the person can act on.
 * The repository already carries the real reason ([SaveResult.Failed.reason] / [UpdateResult.Failed.reason]);
 * the screens used to throw it away and show one fixed sentence for every kind of failure.
 *
 * A reason that is already written for people (it contains Bengali letters) is shown as it is.
 * Technical database / system messages get a Bengali explanation plus the original text in brackets,
 * so a screenshot of the message is enough to find the cause.
 */
object SaveFailureText {
    private const val MAX_TECHNICAL_LENGTH = 220

    /** One-line explanation of the cause (no technical detail). */
    fun explain(reason: String?): String {
        val raw = reason?.trim().orEmpty()
        if (raw.isEmpty()) return "কারণ জানা যায়নি"
        if (containsBengali(raw)) return raw
        val lower = raw.lowercase()
        return when {
            "foreign key" in lower ->
                "ডাটাবেজে এমন কিছুর সাথে সংযোগ খোঁজা হয়েছে যা আর নেই (যেমন ছবি, ক্যাটাগরি, বোর্ড বা প্রশ্নের ধরন)। ছবি থাকলে সরিয়ে আবার যোগ করে দেখুন"
            "unique constraint" in lower ->
                "একই আইডি বা একই অবস্থানে দুটি তথ্য বসাতে চাওয়া হয়েছে (যেমন একই ছবি বা অংশ দুইবার)"
            "check failed" in lower || "check constraint" in lower ->
                "ডাটাবেজের কোনো নিয়ম ভেঙেছে, কোনো একটি মান বৈধ সীমার বাইরে"
            "read-back mismatch" in lower || "did not match" in lower ->
                "লেখার পর যাচাই করে দেখা গেছে সংরক্ষিত তথ্য আর লেখা তথ্য মেলেনি, তাই পুরো সংরক্ষণ বাতিল হয়েছে"
            "database is locked" in lower || "sqlite_busy" in lower || "busy" in lower && "database" in lower ->
                "ডাটাবেজ তখন অন্য কাজে ব্যস্ত ছিল। কয়েক সেকেন্ড পরে আবার চেষ্টা করুন"
            "disk is full" in lower || "sqlite_full" in lower || "no space left" in lower ->
                "ফোনের স্টোরেজ ভরে গেছে। জায়গা খালি করে আবার চেষ্টা করুন"
            "readonly" in lower || "read-only" in lower ->
                "ডাটাবেজ এখন শুধু পড়া যায়, লেখা যায় না। অ্যাপ পুরো বন্ধ করে আবার খুলুন"
            "closed" in lower && ("database" in lower || "connection" in lower) ->
                "ডাটাবেজ বন্ধ আছে (রিস্টোরের পর এমন হতে পারে)। অ্যাপ পুরো বন্ধ করে আবার খুলুন"
            "no such table" in lower || "no such column" in lower ->
                "ডাটাবেজের গঠন অ্যাপের সংস্করণের সাথে মিলছে না"
            "outofmemory" in lower || "out of memory" in lower ->
                "ফোনের মেমোরি কম পড়েছে। অন্য অ্যাপ বন্ধ করে আবার চেষ্টা করুন"
            else -> "অপ্রত্যাশিত সমস্যা"
        }
    }

    /**
     * Full text for the screen: the cause, the technical original when there is one, and what happened to the typed text.
     * [safeNote] says what is safe, e.g. "আপনার লেখা ড্রাফটে আছে" or "আগের লেখা অক্ষত আছে".
     */
    fun message(reason: String?, safeNote: String): String {
        val raw = reason?.trim().orEmpty()
        val cause = explain(raw)
        val technical = if (raw.isEmpty() || containsBengali(raw)) "" else "\n(বিস্তারিত: ${raw.take(MAX_TECHNICAL_LENGTH)})"
        return "সংরক্ষণ করা যায়নি। কারণ: ${cause}।${technical}\n${safeNote}; সমস্যা ঠিক করে আবার চেষ্টা করুন।"
    }

    private fun containsBengali(text: String): Boolean = text.any { it in '\u0980'..'\u09FF' }
}
