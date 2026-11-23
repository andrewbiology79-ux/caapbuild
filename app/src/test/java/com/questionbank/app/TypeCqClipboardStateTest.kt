package com.questionbank.app

import com.questionbank.app.ui.question.TypeCqClipboardEntry
import com.questionbank.app.ui.question.TypeCqClipboardState
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test

class TypeCqClipboardStateTest {
    @Before @After
    fun resetClipboard() = TypeCqClipboardState.clear()

    @Test
    fun clipboardKeepsCopyCutAndCrossTopicCardIdentity() {
        val entries = listOf(
            TypeCqClipboardEntry("topic-1", "s-stimulus", cut = true),
            TypeCqClipboardEntry("topic-2", "q-single", cut = false),
        )
        TypeCqClipboardState.set(entries)
        assertEquals(entries, TypeCqClipboardState.entries.value)
    }

    @Test
    fun duplicateEntriesAreCollapsed() {
        TypeCqClipboardState.set(listOf(
            TypeCqClipboardEntry("topic-1", "s-1", cut = true),
            TypeCqClipboardEntry("topic-1", "s-1", cut = true),
            TypeCqClipboardEntry("topic-1", "s-2", cut = false),
        ))
        assertEquals(2, TypeCqClipboardState.entries.value.size)
    }

    @Test
    fun fullySuccessfulCopyRemainsAvailableForRepeatedPaste() {
        val copy = TypeCqClipboardEntry("topic-1", "q-copy", cut = false)
        TypeCqClipboardState.set(listOf(copy))
        assertTrue(TypeCqClipboardState.beginPaste())
        TypeCqClipboardState.recordPasteResult(setOf(copy.clipboardId), emptySet(), hasFailures = false)
        TypeCqClipboardState.endPaste()

        assertEquals(listOf(copy), TypeCqClipboardState.entries.value)
        assertEquals(listOf(copy), TypeCqClipboardState.entriesForPaste())
    }

    @Test
    fun completedCutIsConsumedAfterPaste() {
        val cut = TypeCqClipboardEntry("topic-1", "q-cut", cut = true)
        TypeCqClipboardState.set(listOf(cut))
        TypeCqClipboardState.recordPasteResult(emptySet(), setOf(cut.clipboardId), hasFailures = false)
        assertTrue(TypeCqClipboardState.entries.value.isEmpty())
    }

    @Test
    fun partialPasteSkipsCompletedCopiesOnlyDuringRetryThenRestoresRepeatability() {
        val first = TypeCqClipboardEntry("topic-1", "q-first", cut = false)
        val second = TypeCqClipboardEntry("topic-1", "q-second", cut = false)
        TypeCqClipboardState.set(listOf(first, second))

        TypeCqClipboardState.recordPasteResult(setOf(first.clipboardId), emptySet(), hasFailures = true)
        assertEquals(listOf(first, second), TypeCqClipboardState.entries.value)
        assertEquals(listOf(second), TypeCqClipboardState.entriesForPaste())

        TypeCqClipboardState.recordPasteResult(setOf(second.clipboardId), emptySet(), hasFailures = false)
        assertEquals(listOf(first, second), TypeCqClipboardState.entriesForPaste())
    }

    @Test
    fun secondConcurrentPasteIsRejectedAndNewCopyGetsNewIdentity() {
        val original = TypeCqClipboardEntry("topic-1", "q-1", cut = false)
        TypeCqClipboardState.set(listOf(original))
        assertTrue(TypeCqClipboardState.beginPaste())
        assertFalse(TypeCqClipboardState.beginPaste())
        TypeCqClipboardState.set(listOf(TypeCqClipboardEntry("topic-1", "q-1", cut = false)))
        assertFalse(original.clipboardId == TypeCqClipboardState.entries.value.single().clipboardId)
        TypeCqClipboardState.endPaste()
    }
}
