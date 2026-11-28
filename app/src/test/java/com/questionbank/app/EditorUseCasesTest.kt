package com.questionbank.app

import com.questionbank.app.domain.usecase.EditorDraft
import com.questionbank.app.domain.usecase.ValidateEditorDraft
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class EditorUseCasesTest {
    private val validate = ValidateEditorDraft()

    @Test fun validTypeCqDraftRequiresParentTextMarksAndQuestionType() {
        val result = validate(EditorDraft(
            scope = EditorDraft.Scope.TYPE_CQ,
            parentId = "topic-1",
            questionText = "প্রশ্ন",
            marks = 2.0,
            questionTypeId = "cq",
        ))
        assertTrue(result.valid)
        assertTrue(result.errors.isEmpty())
    }

    @Test fun chapterCqDraftDoesNotRequireTypeCqQuestionType() {
        val result = validate(EditorDraft(
            scope = EditorDraft.Scope.CHAPTER_CQ,
            parentId = "chapter-1",
            questionText = "প্রশ্ন",
            marks = 1.0,
        ))
        assertTrue(result.valid)
    }

    @Test fun invalidDraftReturnsAllValidationErrors() {
        val result = validate(EditorDraft(
            scope = EditorDraft.Scope.TYPE_CQ,
            parentId = " ",
            questionText = "",
            marks = Double.NaN,
        ))
        assertFalse(result.valid)
        assertEquals(4, result.errors.size)
    }
}
