package com.questionbank.app

import com.questionbank.app.data.local.dao.ChapterCqQuestionCardDb
import com.questionbank.app.data.local.entity.ChapterCqChaptersEntity
import com.questionbank.app.data.local.entity.ChapterCqQuestionBoardsEntity
import com.questionbank.app.data.local.entity.ChapterCqQuestionCategoriesEntity
import com.questionbank.app.data.local.entity.ChapterCqQuestionCategoryLinksEntity
import com.questionbank.app.data.local.entity.ChapterCqQuestionsEntity
import com.questionbank.app.data.local.entity.ChapterCqSolutionPartsEntity
import com.questionbank.app.data.local.entity.ChapterCqStimuliEntity
import com.questionbank.app.data.local.entity.ChapterCqSubjectsEntity
import com.questionbank.app.data.local.entity.PaperQuestionItemsEntity
import com.questionbank.app.data.local.entity.PapersEntity
import com.questionbank.app.data.local.entity.TypeCqQuestionBoardsEntity
import com.questionbank.app.data.local.entity.TypeCqQuestionCategoriesEntity
import com.questionbank.app.data.local.entity.TypeCqQuestionCategoryLinksEntity
import com.questionbank.app.data.local.entity.TypeCqQuestionTypesEntity
import com.questionbank.app.data.local.entity.TypeCqQuestionsEntity
import com.questionbank.app.data.local.entity.TypeCqSolutionPartsEntity
import com.questionbank.app.data.local.entity.TypeCqStimuliEntity
import com.questionbank.app.data.local.entity.TypeCqStimulusImagesEntity
import com.questionbank.app.domain.repository.ChapterCqRepository
import com.questionbank.app.domain.repository.EditorDraftRepository
import com.questionbank.app.domain.repository.PaperRepository
import com.questionbank.app.domain.repository.TypeCqRepository
import com.questionbank.app.domain.usecase.AssignQuestionCategories
import com.questionbank.app.domain.usecase.BuildPaperSnapshot
import com.questionbank.app.domain.usecase.CheckDuplicateQuestion
import com.questionbank.app.domain.usecase.DiscardEditorDraft
import com.questionbank.app.domain.usecase.EditorDraft
import com.questionbank.app.domain.usecase.LoadEditorDraft
import com.questionbank.app.domain.usecase.ReorderSolutionParts
import com.questionbank.app.domain.usecase.ReplaceBoardYearLinks
import com.questionbank.app.domain.usecase.SaveEditorDraft
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.emptyFlow
import kotlinx.coroutines.runBlocking
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Assert.fail
import org.junit.Test

/** Pure JVM tests of the Phase 4 use-case rules, using in-memory fakes (no Room, no Android). */
class EditorWorkflowUseCasesTest {

    private class FakeTypeRepo : TypeCqRepository {
        val calls = mutableListOf<String>()
        var duplicate = false
        var lastParts: List<TypeCqSolutionPartsEntity> = emptyList()
        override fun observeQuestionTypes(): Flow<List<TypeCqQuestionTypesEntity>> = emptyFlow()
        override fun observeStimuli(topicId: String): Flow<List<TypeCqStimuliEntity>> = emptyFlow()
        override fun observeQuestions(topicId: String): Flow<List<TypeCqQuestionsEntity>> = emptyFlow()
        override fun observeCategories(): Flow<List<TypeCqQuestionCategoriesEntity>> = emptyFlow()
        override suspend fun isDuplicate(topicId: String, questionText: String): Boolean { calls += "dup"; return duplicate }
        override suspend fun replaceBoards(questionId: String, rows: List<TypeCqQuestionBoardsEntity>) { calls += "boards" }
        override suspend fun replaceCategories(questionId: String, rows: List<TypeCqQuestionCategoryLinksEntity>) { calls += "categories" }
        override suspend fun replaceSolutionParts(questionId: String, rows: List<TypeCqSolutionPartsEntity>) { calls += "parts"; lastParts = rows }
        override suspend fun replaceStimulusImages(stimulusId: String, rows: List<TypeCqStimulusImagesEntity>) { calls += "images" }
    }

    private class FakeChapterRepo : ChapterCqRepository {
        val calls = mutableListOf<String>()
        var duplicate = false
        var lastParts: List<ChapterCqSolutionPartsEntity> = emptyList()
        override fun observeSubjects(): Flow<List<ChapterCqSubjectsEntity>> = emptyFlow()
        override fun observeChapters(subjectId: String): Flow<List<ChapterCqChaptersEntity>> = emptyFlow()
        override fun observeStimuli(chapterId: String): Flow<List<ChapterCqStimuliEntity>> = emptyFlow()
        override fun observeCategories(): Flow<List<ChapterCqQuestionCategoriesEntity>> = emptyFlow()
        override fun observeQuestions(chapterId: String): Flow<List<ChapterCqQuestionsEntity>> = emptyFlow()
        override fun observeQuestionCards(chapterId: String): Flow<List<ChapterCqQuestionCardDb>> = emptyFlow()
        override suspend fun loadQuestion(questionId: String): ChapterCqQuestionsEntity? = null
        override suspend fun saveQuestion(
            question: ChapterCqQuestionsEntity,
            solutionParts: List<ChapterCqSolutionPartsEntity>,
            boards: List<ChapterCqQuestionBoardsEntity>,
            categories: List<ChapterCqQuestionCategoryLinksEntity>,
        ): Boolean { calls += "save"; return true }
        override suspend fun isDuplicate(chapterId: String, questionText: String): Boolean { calls += "dup"; return duplicate }
        override suspend fun replaceBoards(questionId: String, rows: List<ChapterCqQuestionBoardsEntity>) { calls += "boards" }
        override suspend fun replaceCategories(questionId: String, rows: List<ChapterCqQuestionCategoryLinksEntity>) { calls += "categories" }
        override suspend fun replaceSolutionParts(questionId: String, rows: List<ChapterCqSolutionPartsEntity>) { calls += "parts"; lastParts = rows }
    }

    private class FakePaperRepo : PaperRepository {
        var added: PaperQuestionItemsEntity? = null
        override fun observePapers(categoryId: String): Flow<List<PapersEntity>> = emptyFlow()
        override fun observeItems(paperId: String): Flow<List<PaperQuestionItemsEntity>> = emptyFlow()
        override suspend fun loadPaper(paperId: String): PapersEntity? = null
        override suspend fun addSnapshotItem(item: PaperQuestionItemsEntity): Boolean { added = item; return true }
    }

    private class FakeDraftRepo : EditorDraftRepository {
        val store = mutableMapOf<String, String>()
        override suspend fun load(scope: String, ownerId: String): String? = store["$scope|$ownerId"]
        override suspend fun save(scope: String, ownerId: String, draftJson: String) { store["$scope|$ownerId"] = draftJson }
        override suspend fun discard(scope: String, ownerId: String) { store.remove("$scope|$ownerId") }
    }

    private fun typePart(id: String, q: String, pos: Long) = TypeCqSolutionPartsEntity(id, q, pos, "TEXT", "x", null, 1)
    private fun chapterPart(id: String, q: String, pos: Long) = ChapterCqSolutionPartsEntity(id, q, pos, "TEXT", "x", null, 1)

    private inline fun <reified T : Throwable> expectThrows(block: () -> Unit) {
        try { block() } catch (e: Throwable) {
            if (e is T) return
            throw e
        }
        fail("expected ${T::class.simpleName}")
    }

    @Test fun reorderSolutionPartsRenumbersFromZeroInGivenOrder() = runBlocking {
        val type = FakeTypeRepo(); val chapter = FakeChapterRepo()
        ReorderSolutionParts(type, chapter).forTypeCq("q1", listOf(typePart("b", "q1", 9), typePart("a", "q1", 4), typePart("c", "q1", 7)))
        assertEquals(listOf("b", "a", "c"), type.lastParts.map { it.partId })
        assertEquals(listOf(0L, 1L, 2L), type.lastParts.map { it.position })
        assertTrue(chapter.calls.isEmpty())
    }

    @Test fun reorderSolutionPartsRejectsForeignQuestionAndDuplicateIds() {
        val uc = ReorderSolutionParts(FakeTypeRepo(), FakeChapterRepo())
        expectThrows<IllegalArgumentException> { runBlocking { uc.forChapterCq("q1", listOf(chapterPart("a", "other", 0))) } }
        expectThrows<IllegalArgumentException> { runBlocking { uc.forChapterCq("q1", listOf(chapterPart("a", "q1", 0), chapterPart("a", "q1", 1))) } }
    }

    @Test fun categoryAndBoardLinksMustBelongToTheSelectedQuestion() {
        val cats = AssignQuestionCategories(FakeTypeRepo(), FakeChapterRepo())
        val boards = ReplaceBoardYearLinks(FakeTypeRepo(), FakeChapterRepo())
        expectThrows<IllegalArgumentException> { runBlocking { cats.forTypeCq("q1", listOf(TypeCqQuestionCategoryLinksEntity("other", "c1", 1))) } }
        expectThrows<IllegalArgumentException> { runBlocking { boards.forChapterCq("q1", listOf(ChapterCqQuestionBoardsEntity("id", "other", "DHAKA", 2024, 0))) } }
    }

    @Test fun categoryAssignmentRoutesOnlyToTheMatchingScope() = runBlocking {
        val type = FakeTypeRepo(); val chapter = FakeChapterRepo()
        AssignQuestionCategories(type, chapter).forChapterCq("q1", listOf(ChapterCqQuestionCategoryLinksEntity("q1", "c1", 1)))
        assertEquals(listOf("categories"), chapter.calls)
        assertTrue(type.calls.isEmpty())
    }

    @Test fun duplicateCheckUsesTheRequestedScopeOnly() = runBlocking {
        val type = FakeTypeRepo().apply { duplicate = true }; val chapter = FakeChapterRepo()
        val uc = CheckDuplicateQuestion(type, chapter)
        assertTrue(uc.inTypeCq("t1", "text"))
        assertFalse(uc.inChapterCq("c1", "text"))
        assertEquals(listOf("dup"), type.calls)
        assertEquals(listOf("dup"), chapter.calls)
    }

    @Test fun paperSnapshotNeedsExactlyOneSourceQuestionAndNonBlankJson() {
        val uc = BuildPaperSnapshot(FakePaperRepo())
        expectThrows<IllegalArgumentException> { runBlocking { uc("i1", "p1", null, null, null, "{}", 0, 1) } }
        expectThrows<IllegalArgumentException> { runBlocking { uc("i1", "p1", null, "t", "c", "{}", 0, 1) } }
        expectThrows<IllegalArgumentException> { runBlocking { uc("i1", "p1", null, "t", null, "  ", 0, 1) } }
    }

    @Test fun paperSnapshotPassesAllFieldsToTheRepository() = runBlocking {
        val repo = FakePaperRepo()
        assertTrue(BuildPaperSnapshot(repo)("i1", "p1", "s1", null, "chq1", "{\"q\":1}", 3, 99))
        val item = repo.added!!
        assertEquals("i1", item.itemId); assertEquals("p1", item.paperId); assertEquals("s1", item.sectionId)
        assertNull(item.typeCqQuestionId); assertEquals("chq1", item.chapterCqQuestionId)
        assertEquals(3L, item.sortOrder); assertEquals(99L, item.createdAt); assertNull(item.marksOverride)
    }

    @Test fun draftUseCasesKeepScopesSeparate() = runBlocking {
        val repo = FakeDraftRepo()
        SaveEditorDraft(repo)(EditorDraft.Scope.TYPE_CQ, "o1", "{\"a\":1}")
        assertEquals("{\"a\":1}", LoadEditorDraft(repo)(EditorDraft.Scope.TYPE_CQ, "o1"))
        assertNull(LoadEditorDraft(repo)(EditorDraft.Scope.CHAPTER_CQ, "o1"))
        DiscardEditorDraft(repo)(EditorDraft.Scope.TYPE_CQ, "o1")
        assertNull(LoadEditorDraft(repo)(EditorDraft.Scope.TYPE_CQ, "o1"))
    }
}
