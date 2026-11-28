package com.questionbank.app

import com.questionbank.app.domain.editor.EditorScope
import com.questionbank.app.domain.editor.EditorSessionDraft
import com.questionbank.app.domain.editor.EditorSessionEvent
import com.questionbank.app.domain.editor.EditorSessionReducer
import com.questionbank.app.domain.editor.EditorSessionState
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class EditorSessionReducerTest {
    private fun initial() = EditorSessionState(EditorSessionDraft(scope = EditorScope.TYPE_CQ, ownerId = "owner"))

    @Test fun failedSaveReleasesSavingFlag() {
        val saving = EditorSessionReducer.reduce(initial(), EditorSessionEvent.SaveStarted)
        assertTrue(saving.isSaving)
        val failed = EditorSessionReducer.reduce(saving, EditorSessionEvent.SaveFailed("x"))
        assertFalse(failed.isSaving)
        assertTrue(failed.isDirty)
        assertEquals("x", failed.saveError)
    }

    @Test fun editsAreIgnoredWhileSaving() {
        val saving = EditorSessionReducer.reduce(initial(), EditorSessionEvent.SaveStarted)
        val after = EditorSessionReducer.reduce(saving, EditorSessionEvent.SetStimulusText("changed"))
        assertEquals("", after.draft.stimulus.text)
    }
}
