package com.questionbank.app

import com.questionbank.app.domain.editor.EditorQuestionBlockDraft
import com.questionbank.app.domain.editor.EditorScope
import com.questionbank.app.domain.editor.EditorSessionDraft
import com.questionbank.app.domain.editor.EditorSessionDraftCodec
import org.json.JSONObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Test

/** Runs on device/emulator because it needs the real org.json implementation. */
class EditorSessionDraftCodecTest {
    private fun draft(rating: Int?, previous: String? = null) = EditorSessionDraft(
        scope = EditorScope.TYPE_CQ,
        ownerId = "owner",
        questionBlocks = listOf(EditorQuestionBlockDraft(blockId = "b1", label = "ক", rating = rating)),
        preservedJson = previous,
    )

    @Test fun clearingRatingPersistsAfterRoundTrip() {
        val first = EditorSessionDraftCodec.encode(draft(rating = 3))
        val restored = EditorSessionDraftCodec.decode(first)
        assertNotNull(restored)
        assertEquals(3, restored!!.questionBlocks[0].rating)
        val cleared = EditorSessionDraftCodec.encode(restored.copy(questionBlocks = listOf(restored.questionBlocks[0].copy(rating = null))))
        assertNull(EditorSessionDraftCodec.decode(cleared)!!.questionBlocks[0].rating)
    }

    @Test fun unknownKeysSurvive() {
        val withExtra = JSONObject(EditorSessionDraftCodec.encode(draft(1))).put("futureField", "keep").toString()
        val restored = EditorSessionDraftCodec.decode(withExtra)!!
        val again = JSONObject(EditorSessionDraftCodec.encode(restored))
        assertEquals("keep", again.getString("futureField"))
    }
}
