package com.questionbank.app

import com.questionbank.app.domain.question.CqLabel
import com.questionbank.app.domain.question.QuestionSearchRules
import com.questionbank.app.domain.question.SavedGroup
import com.questionbank.app.domain.question.SavedSubQuestion
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/** Pure rules of the in-topic search (v0.2.27, ADR-011). */
class QuestionSearchRulesTest {
    private fun sub(id: String, label: CqLabel = CqLabel.KA) = SavedSubQuestion(id, label, label.marks, "text $id", "")
    private fun group(stimulusId: String?, vararg subs: SavedSubQuestion) = SavedGroup(stimulusId, "", subs.toList())

    @Test
    fun wordsAreSplitOnWhiteSpaceAndTrimmed() {
        assertEquals(listOf("আলোর", "প্রতিফলন"), QuestionSearchRules.tokens("  আলোর \n  প্রতিফলন\t"))
    }

    @Test
    fun bothSpellingsOfNuktaLettersGiveTheSameWord() {
        assertEquals(
            QuestionSearchRules.tokens("দ\u09DFা"),
            QuestionSearchRules.tokens("দ\u09AF\u09BCা")
        )
    }

    @Test
    fun quotesAreRemovedAndWordsWithoutLetterOrDigitAreDropped() {
        assertEquals(listOf("আলো"), QuestionSearchRules.tokens("\"আলো\" ... - \" *"))
        assertTrue(QuestionSearchRules.tokens("  ...  \"\" ").isEmpty())
        assertTrue(QuestionSearchRules.tokens("").isEmpty())
    }

    @Test
    fun bengaliAndLatinDigitsCountAsWords() {
        assertEquals(listOf("২০২৪", "2024"), QuestionSearchRules.tokens("২০২৪ 2024"))
    }

    @Test
    fun wordCountAndTextLengthAreLimited() {
        assertEquals(QuestionSearchRules.MAX_WORDS, QuestionSearchRules.tokens("a b c d e f g h i j k l").size)
        val long = "ক".repeat(QuestionSearchRules.MAX_QUERY_LENGTH + 50)
        assertEquals(QuestionSearchRules.MAX_QUERY_LENGTH, QuestionSearchRules.tokens(long).single().length)
    }

    @Test
    fun ftsQueryQuotesEveryWordAndMakesTheLastOneAPrefix() {
        assertEquals("\"আলো\"*", QuestionSearchRules.ftsQuery(listOf("আলো")))
        assertEquals("\"আলোর\" \"প্রতি\"*", QuestionSearchRules.ftsQuery(listOf("আলোর", "প্রতি")))
        assertNull(QuestionSearchRules.ftsQuery(emptyList()))
    }

    @Test
    fun ftsSyntaxCharactersStayInsideTheQuotes() {
        // -, :, ( and * are not FTS operators inside a quoted phrase; only the double quote could break out, and it is removed.
        val query = QuestionSearchRules.ftsQuery(QuestionSearchRules.tokens("a-b c:d (e) f* \"g"))!!
        assertEquals("\"a-b\" \"c:d\" \"(e)\" \"f*\" \"g\"*", query)
    }

    @Test
    fun plainTextMatchNeedsEveryWordAndIgnoresLatinCase() {
        val tokens = QuestionSearchRules.tokens("light আলো")
        assertTrue(QuestionSearchRules.containsAll("The LIGHT of আলোর ঝলক", tokens))
        assertFalse(QuestionSearchRules.containsAll("only light here", tokens))
        assertFalse(QuestionSearchRules.containsAll("anything", emptyList()))
    }

    @Test
    fun aCardKeepsOnlyTheMatchingSubQuestionsAndAStimulusMatchKeepsAll() {
        val g1 = group("s1", sub("a", CqLabel.KA), sub("b", CqLabel.KHA), sub("c", CqLabel.GA))
        val g2 = group("s2", sub("d", CqLabel.KA), sub("e", CqLabel.KHA))
        val g3 = group(null, sub("f"))
        val g4 = group("s4", sub("g"))

        val result = QuestionSearchRules.filter(
            listOf(g1, g2, g3, g4),
            matchedQuestionIds = setOf("b", "c", "f"),
            matchedStimulusIds = setOf("s2"),
        )

        assertEquals(listOf("s1", "s2", null), result.map { it.stimulusId }) // order kept, g4 dropped
        assertEquals(listOf("b", "c"), result[0].subQuestions.map { it.id })
        assertEquals(listOf("d", "e"), result[1].subQuestions.map { it.id })
        assertEquals(listOf("f"), result[2].subQuestions.map { it.id })
    }

    @Test
    fun nothingMatchingGivesAnEmptyList() {
        assertTrue(QuestionSearchRules.filter(listOf(group("s1", sub("a"))), emptySet(), emptySet()).isEmpty())
    }

    // ---- v0.2.29: hashtag words (plan 45.3, option A) ----

    @Test
    fun aWordThatStartsWithHashIsKeptEvenWithoutLetterOrDigit() {
        assertEquals(listOf("#"), QuestionSearchRules.tokens("#"))
        assertEquals(listOf("#", "#আলো", "#physics_cq"), QuestionSearchRules.tokens("  # #আলো ... #physics_cq "))
        assertTrue(QuestionSearchRules.isHashWord("#"))
        assertTrue(QuestionSearchRules.isHashWord("#২০২৪"))
        assertFalse(QuestionSearchRules.isHashWord("a#b")) // a hash inside a word does not make a hashtag word
        assertEquals(listOf("a#b"), QuestionSearchRules.tokens("a#b"))
    }

    @Test
    fun hashWordsNeverGoToFtsAndTheLastOtherWordStaysThePrefix() {
        assertNull(QuestionSearchRules.ftsQuery(listOf("#")))
        assertNull(QuestionSearchRules.ftsQuery(listOf("#আলো", "#optics")))
        assertEquals("\"আলো\"*", QuestionSearchRules.ftsQuery(listOf("#tag", "আলো")))
        assertEquals("\"আলো\" \"প্রতি\"*", QuestionSearchRules.ftsQuery(listOf("আলো", "#tag", "প্রতি")))
    }

    @Test
    fun hashWordsMatchAsPlainTextInTheQuestionOrTheShortAnswer() {
        val tokens = QuestionSearchRules.tokens("#আলো")
        assertTrue(QuestionSearchRules.hashWordsMatch("প্রশ্ন #আলো", "", tokens))
        assertTrue(QuestionSearchRules.hashWordsMatch("প্রশ্ন", "উত্তর #আলোর", tokens)) // a longer tag with the same start also matches
        assertFalse(QuestionSearchRules.hashWordsMatch("আলো ছাড়া হ্যাশ", "আলো", tokens)) // the bare word is not the hashtag
    }

    @Test
    fun hashWordsMatchIgnoresLatinCaseAndNeedsEveryHashWord() {
        val tokens = QuestionSearchRules.tokens("#Optics #2024")
        assertTrue(QuestionSearchRules.hashWordsMatch("x #optics y", "#2024", tokens))
        assertFalse(QuestionSearchRules.hashWordsMatch("x #optics y", "", tokens))
    }

    @Test
    fun aLoneHashMatchesAnyTextThatContainsAHash() {
        val tokens = QuestionSearchRules.tokens("#")
        assertTrue(QuestionSearchRules.hashWordsMatch("a # b", "", tokens))
        assertFalse(QuestionSearchRules.hashWordsMatch("no sign here", "none", tokens))
    }

    @Test
    fun withoutHashWordsEverythingMatchesAndTheStimulusUsesPlainTextForHashWords() {
        assertTrue(QuestionSearchRules.hashWordsMatch("anything", "", QuestionSearchRules.tokens("আলো")))
        val tokens = QuestionSearchRules.tokens("#tag আলো")
        assertTrue(QuestionSearchRules.containsAll("উদ্দীপক #TAG আলোর", tokens))
        assertFalse(QuestionSearchRules.containsAll("উদ্দীপক tag আলোর", tokens))
    }
}
