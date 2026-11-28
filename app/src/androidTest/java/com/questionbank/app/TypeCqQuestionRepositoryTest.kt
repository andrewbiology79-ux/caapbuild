package com.questionbank.app

import android.content.Context
import androidx.room.Room
import androidx.room.RoomDatabase
import androidx.room.useReaderConnection
import androidx.room.useWriterConnection
import androidx.sqlite.driver.bundled.BundledSQLiteDriver
import androidx.test.core.app.ApplicationProvider
import androidx.test.ext.junit.runners.AndroidJUnit4
import com.questionbank.app.data.local.QuestionBankDatabase
import com.questionbank.app.data.local.entity.TypeCqQuestionCategoriesEntity
import com.questionbank.app.data.local.forceFullSync
import com.questionbank.app.data.repository.TypeCqHierarchyRepositoryImpl
import com.questionbank.app.data.repository.TypeCqQuestionRepositoryImpl
import com.questionbank.app.domain.hierarchy.AddResult
import com.questionbank.app.domain.question.CqLabel
import com.questionbank.app.domain.question.DraftText
import com.questionbank.app.domain.question.GroupEditInput
import com.questionbank.app.domain.question.QuestionGroupInput
import com.questionbank.app.domain.question.SavedGroup
import com.questionbank.app.domain.question.SaveResult
import com.questionbank.app.domain.question.SubQuestionInput
import com.questionbank.app.domain.question.UpdateResult
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.channels.Channel
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.collect
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.launch
import kotlinx.coroutines.runBlocking
import kotlinx.coroutines.withTimeout
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith
import java.util.concurrent.atomic.AtomicReference

/** Question repository on the REAL Room database (v0.2.23): atomic save, rollback, drafts, restart survival, durability. */
@RunWith(AndroidJUnit4::class)
class TypeCqQuestionRepositoryTest {
    private val dbName = "question_repo_test.db"
    private lateinit var context: Context
    private lateinit var db: QuestionBankDatabase
    private lateinit var repo: TypeCqQuestionRepositoryImpl
    private lateinit var topicId: String

    @Before
    fun setUp() {
        context = ApplicationProvider.getApplicationContext<Context>()
        db = TestDb.open(context, dbName)
        repo = TypeCqQuestionRepositoryImpl(db.typeCqQuestionDao(), beforeWrite = { db.forceFullSync() })
        topicId = runBlocking { createTopic(db) }
    }

    @After
    fun tearDown() {
        db.close()
        context.deleteDatabase(dbName)
    }

    private suspend fun createTopic(database: QuestionBankDatabase): String {
        val h = TypeCqHierarchyRepositoryImpl(database.typeCqSubjectDao(), database.typeCqChapterDao(), database.typeCqTopicDao())
        val s = (h.addSubject("রসায়ন") as AddResult.Added).id
        val c = (h.addChapter(s, "অধ্যায় ২") as AddResult.Added).id
        return (h.addTopic(c, "টপিক ১") as AddResult.Added).id
    }

    private fun group(stimulus: String, vararg subs: Triple<CqLabel, String, String>, topic: String = topicId) =
        QuestionGroupInput(topic, stimulus, subs.map { SubQuestionInput(it.first, it.second, it.third) })

    private fun count(sql: String): Long = runBlocking { db.useReaderConnection { it.scalarLong(sql) } }

    @Test
    fun fourQuestionTypesAreSeededAndSeedingIsIdempotent() {
        assertEquals(4L, count("SELECT COUNT(*) FROM type_cq_question_types WHERE is_active = 1"))
        db.close()
        // reopen without deleting: the seed runs again (INSERT OR IGNORE) and must not duplicate anything
        db = openKeepingData()
        assertEquals(4L, count("SELECT COUNT(*) FROM type_cq_question_types"))
    }

    @Test
    fun savedGroupKeepsStimulusLabelsMarksAndFtsRows() = runBlocking {
        val result = repo.saveGroup(
            group("উদ্দীপক লেখা", Triple(CqLabel.GA, "গ প্রশ্ন", "গ উত্তর"), Triple(CqLabel.KA, "ক প্রশ্ন", ""))
        )
        assertTrue("expected Saved but was $result", result is SaveResult.Saved)
        result as SaveResult.Saved
        assertNotNull(result.stimulusId)
        assertEquals(2, result.questionIds.size)

        val groups = repo.observeGroups(topicId).first()
        assertEquals(1, groups.size)
        assertEquals("উদ্দীপক লেখা", groups[0].stimulusText)
        assertEquals(listOf(CqLabel.KA, CqLabel.GA), groups[0].subQuestions.map { it.label })
        assertEquals(listOf(1.0, 3.0), groups[0].subQuestions.map { it.marks })
        assertEquals("গ উত্তর", groups[0].subQuestions[1].shortAnswer)
        assertEquals(2L, count("SELECT COUNT(*) FROM type_cq_question_fts"))
        assertEquals(2L, count("SELECT COUNT(DISTINCT fts_id) FROM type_cq_questions"))
    }


    @Test
    fun stimulusCategoriesPersistLoadInCardAndDuplicateWithTheStimulus() = runBlocking {
        insertTypeCategory("cat-one", "জীববিজ্ঞান")
        insertTypeCategory("cat-two", "পদার্থবিজ্ঞান")

        val saved = repo.saveGroup(
            group("উদ্দীপক", Triple(CqLabel.KA, "প্রশ্ন", "")).copy(
                stimulusCategoryIds = listOf("cat-one", "cat-two"),
            ),
        )
        assertTrue(saved is SaveResult.Saved)
        val sourceStimulusId = (saved as SaveResult.Saved).stimulusId!!

        val source = repo.observeGroups(topicId).first().single()
        assertEquals(listOf("cat-one", "cat-two"), source.stimulusCategoryIds)
        assertEquals(2L, count("SELECT COUNT(*) FROM type_cq_stimulus_category_links WHERE stimulus_id = '${sourceStimulusId}'"))

        val duplicate = repo.duplicateGroup(topicId, "s-$sourceStimulusId")
        assertTrue("expected Saved but was $duplicate", duplicate is SaveResult.Saved)
        val duplicateStimulusId = (duplicate as SaveResult.Saved).stimulusId!!
        assertTrue(sourceStimulusId != duplicateStimulusId)

        val groups = repo.observeGroups(topicId).first()
        assertEquals(2, groups.size)
        assertEquals(listOf("cat-one", "cat-two"), groups.first { it.stimulusId == duplicateStimulusId }.stimulusCategoryIds)
        assertEquals(4L, count("SELECT COUNT(*) FROM type_cq_stimulus_category_links"))
    }

    @Test
    fun singleQuestionCardCategoryDropdownUsesThatQuestionsExistingLinks() = runBlocking {
        insertTypeCategory("single-cat", "একক প্রশ্নের দাগ")
        val saved = repo.saveGroup(group("", Triple(CqLabel.KA, "একটি একক প্রশ্ন", "")))
        assertTrue(saved is SaveResult.Saved)
        val questionId = (saved as SaveResult.Saved).questionIds.single()

        assertTrue(repo.setStimulusCategories(topicId, null, questionId, listOf("single-cat")))

        val card = repo.observeGroups(topicId).first().single()
        assertNull(card.stimulusId)
        assertEquals(listOf("single-cat"), card.subQuestions.single().categoryIds)
        assertEquals(0L, count("SELECT COUNT(*) FROM type_cq_stimulus_category_links"))
        assertEquals(1L, count("SELECT COUNT(*) FROM type_cq_question_category_links WHERE question_id = '$questionId'"))
    }

    @Test
    fun archivedStimulusCategoryIsRetainedButCannotBeAssignedToAnotherStimulus() = runBlocking {
        insertTypeCategory("archived-cat", "পুরোনো ক্যাটাগরি")
        val source = repo.saveGroup(group("প্রথম উদ্দীপক", Triple(CqLabel.KA, "প্রথম প্রশ্ন", "")))
        val sourceStimulusId = (source as SaveResult.Saved).stimulusId!!
        assertTrue(repo.setStimulusCategories(topicId, sourceStimulusId, null, listOf("archived-cat")))
        assertEquals(1, db.categoryDataDao().setTypeCategoryArchived("archived-cat", 1, 20L))

        // Existing card keeps its archived assignment; a new card cannot claim it.
        assertEquals(listOf("archived-cat"), repo.observeGroups(topicId).first().single().stimulusCategoryIds)
        val other = repo.saveGroup(group("দ্বিতীয় উদ্দীপক", Triple(CqLabel.KA, "দ্বিতীয় প্রশ্ন", ""))) as SaveResult.Saved
        assertTrue(!repo.setStimulusCategories(topicId, other.stimulusId, null, listOf("archived-cat")))
        assertTrue(repo.setStimulusCategories(topicId, sourceStimulusId, null, emptyList()))
        assertTrue(repo.observeGroups(topicId).first().first { it.stimulusId == sourceStimulusId }.stimulusCategoryIds.isEmpty())
    }

    @Test
    fun deletingStimulusCardCascadesItsStimulusCategoryLinksOnly() = runBlocking {
        insertTypeCategory("delete-cat", "মুছে ফেলার ক্যাটাগরি")
        val saved = repo.saveGroup(
            group("মুছে ফেলার উদ্দীপক", Triple(CqLabel.KA, "প্রশ্ন", "")).copy(
                categoriesByLabel = mapOf(CqLabel.KA to listOf("delete-cat")),
            ),
        ) as SaveResult.Saved
        val stimulusId = saved.stimulusId!!
        val questionId = saved.questionIds.single()
        assertTrue(repo.setStimulusCategories(topicId, stimulusId, null, listOf("delete-cat")))

        assertTrue(repo.deleteGroup(topicId, "s-$stimulusId"))

        assertEquals(0L, count("SELECT COUNT(*) FROM type_cq_stimulus_category_links WHERE stimulus_id = '$stimulusId'"))
        assertEquals(0L, count("SELECT COUNT(*) FROM type_cq_stimuli WHERE stimulus_id = '$stimulusId'"))
        assertEquals(0L, count("SELECT COUNT(*) FROM type_cq_question_category_links WHERE question_id = '$questionId'"))
        assertEquals(1L, count("SELECT COUNT(*) FROM type_cq_question_categories WHERE category_id = 'delete-cat'"))
    }

    @Test
    fun reassigningTypeCategoryMovesBothQuestionAndStimulusLinksBeforeArchive() = runBlocking {
        insertTypeCategory("source-cat", "পুরোনো")
        insertTypeCategory("target-cat", "নতুন")
        val saved = repo.saveGroup(
            group("উদ্দীপক", Triple(CqLabel.KA, "প্রশ্ন", "")).copy(
                categoriesByLabel = mapOf(CqLabel.KA to listOf("source-cat")),
            ),
        ) as SaveResult.Saved
        val stimulusId = saved.stimulusId!!
        val questionId = saved.questionIds.single()
        assertTrue(repo.setStimulusCategories(topicId, stimulusId, null, listOf("source-cat")))

        // A category with either relation type cannot be archived as unused.
        assertTrue(!db.categoryDataDao().archiveTypeIfUnused("source-cat", 30L))
        assertTrue(db.categoryDataDao().reassignAndArchiveType("source-cat", "target-cat", 31L))

        assertEquals(0L, count("SELECT COUNT(*) FROM type_cq_question_category_links WHERE category_id = 'source-cat'"))
        assertEquals(0L, count("SELECT COUNT(*) FROM type_cq_stimulus_category_links WHERE category_id = 'source-cat'"))
        assertEquals(1L, count("SELECT COUNT(*) FROM type_cq_question_category_links WHERE question_id = '$questionId' AND category_id = 'target-cat'"))
        assertEquals(1L, count("SELECT COUNT(*) FROM type_cq_stimulus_category_links WHERE stimulus_id = '$stimulusId' AND category_id = 'target-cat'"))
        assertEquals(1L, count("SELECT is_archived FROM type_cq_question_categories WHERE category_id = 'source-cat'"))
    }

    /** Collects observeGroups(topic) the whole time and returns the newest emission (review fix P1, Finding 1/2). */
    private suspend fun waitForGroups(latest: AtomicReference<List<SavedGroup>?>, what: String, ok: (List<SavedGroup>) -> Boolean) {
        withTimeout(5_000) {
            while (latest.get()?.let(ok) != true) delay(20)
        }
        assertTrue(what, latest.get()?.let(ok) == true)
    }

    @Test
    fun liveGroupsFlowReloadsStimulusCategoryIdsAfterReassign() = runBlocking {
        insertTypeCategory("live-a", "ক")
        insertTypeCategory("live-b", "খ")
        val saved = repo.saveGroup(group("উদ্দীপক", Triple(CqLabel.KA, "প্রশ্ন", ""))) as SaveResult.Saved
        val stimulusId = saved.stimulusId!!
        assertTrue(repo.setStimulusCategories(topicId, stimulusId, null, listOf("live-a")))

        val latest = AtomicReference<List<SavedGroup>?>(null)
        val job = launch(Dispatchers.IO) { repo.observeGroups(topicId).collect { latest.set(it) } }
        try {
            waitForGroups(latest, "A must be shown first") { g -> g.singleOrNull()?.stimulusCategoryIds == listOf("live-a") }

            assertTrue(db.categoryDataDao().reassignAndArchiveType("live-a", "live-b", 40L))

            // The collector was NOT restarted: the SAME live Flow must emit the new category by itself.
            waitForGroups(latest, "after reassign the live Flow must show B only") { g -> g.singleOrNull()?.stimulusCategoryIds == listOf("live-b") }
        } finally {
            job.cancel()
        }
    }

    @Test
    fun liveGroupsFlowReloadsSingleQuestionCategoryIdsAfterReassign() = runBlocking {
        insertTypeCategory("single-a", "ক")
        insertTypeCategory("single-b", "খ")
        val saved = repo.saveGroup(
            group("", Triple(CqLabel.KA, "একক প্রশ্ন", "")).copy(categoriesByLabel = mapOf(CqLabel.KA to listOf("single-a"))),
        ) as SaveResult.Saved
        assertEquals(1, saved.questionIds.size)

        val latest = AtomicReference<List<SavedGroup>?>(null)
        val job = launch(Dispatchers.IO) { repo.observeGroups(topicId).collect { latest.set(it) } }
        try {
            waitForGroups(latest, "A must be shown first") { g -> g.singleOrNull()?.subQuestions?.singleOrNull()?.categoryIds == listOf("single-a") }

            assertTrue(db.categoryDataDao().reassignAndArchiveType("single-a", "single-b", 41L))

            waitForGroups(latest, "after reassign the live Flow must show B only") { g -> g.singleOrNull()?.subQuestions?.singleOrNull()?.categoryIds == listOf("single-b") }
        } finally {
            job.cancel()
        }
    }

    @Test
    fun reassignTouchesParentRowsButKeepsTheListOrderAndLinks() = runBlocking {
        insertTypeCategory("touch-a", "ক")
        insertTypeCategory("touch-b", "খ")
        val first = repo.saveGroup(group("উদ্দীপক ১", Triple(CqLabel.KA, "প্রশ্ন ১", ""))) as SaveResult.Saved
        repo.saveGroup(group("উদ্দীপক ২", Triple(CqLabel.KA, "প্রশ্ন ২", "")))
        assertTrue(repo.setStimulusCategories(topicId, first.stimulusId!!, null, listOf("touch-a")))
        val before = repo.observeGroups(topicId).first().map { it.stimulusId }

        assertTrue(db.categoryDataDao().reassignAndArchiveType("touch-a", "touch-b", 77L))

        assertEquals(1L, count("SELECT COUNT(*) FROM type_cq_stimuli WHERE stimulus_id = '${first.stimulusId}' AND updated_at = 77"))
        assertEquals(before, repo.observeGroups(topicId).first().map { it.stimulusId })
        assertEquals(listOf("touch-b"), repo.observeGroups(topicId).first().first { it.stimulusId == first.stimulusId }.stimulusCategoryIds)
    }

    private suspend fun insertTypeCategory(id: String, name: String) {
        db.categoryDataDao().insertTypeCategory(
            TypeCqQuestionCategoriesEntity(
                categoryId = id, name = name, description = "", color = "", icon = "",
                sortOrder = 0L, isArchived = 0L, createdAt = 1L, updatedAt = 1L,
            ),
        )
    }

    @Test
    fun paperCategoryMetadataRefreshesWhenPaperLinksAndCategoryNamesChange() = runBlocking {
        val saved = repo.saveGroup(group("", Triple(CqLabel.KA, "প্রশ্নপত্রে ব্যবহৃত প্রশ্ন", "")))
        assertTrue(saved is SaveResult.Saved)
        val questionId = (saved as SaveResult.Saved).questionIds.single()

        val updates = Channel<List<com.questionbank.app.domain.question.SavedGroup>>(Channel.UNLIMITED)
        val observer = launch { repo.observeGroups(topicId).collect { updates.send(it) } }
        try {
            val initial = withTimeout(5_000) { updates.receive() }
            assertTrue(initial.single().paperUsages.isEmpty())

            db.useWriterConnection { connection ->
                connection.exec(
                    "INSERT INTO paper_categories(paper_category_id, name, description, color, icon, sort_order, is_system, created_at, updated_at) VALUES(?, ?, '', '', '', 0, 0, 1, 1)",
                    "paper-category-test", "প্রথম ক্যাটাগরি",
                )
                connection.exec(
                    "INSERT INTO papers(paper_id, paper_category_id, short_name, title, subject_line, duration_text, total_marks, note_text, sort_order, created_at, updated_at) VALUES(?, ?, ?, ?, '', '', NULL, '', 0, 1, 1)",
                    "paper-test", "paper-category-test", "টেস্ট", "টেস্ট প্রশ্নপত্র",
                )
                connection.exec(
                    "INSERT INTO paper_question_items(item_id, paper_id, section_id, type_cq_question_id, chapter_cq_question_id, snapshot_json, sort_order, marks_override, created_at) VALUES(?, ?, NULL, ?, NULL, '{}', 0, NULL, 10)",
                    "paper-item-test", "paper-test", questionId,
                )
            }

            suspend fun nextWithCategoryName(name: String): List<com.questionbank.app.domain.question.SavedGroup> =
                withTimeout(5_000) {
                    var result: List<com.questionbank.app.domain.question.SavedGroup>? = null
                    while (result == null) {
                        val next = updates.receive()
                        if (next.singleOrNull()?.paperUsages?.any { it.categoryName == name } == true) {
                            result = next
                        }
                    }
                    result!!
                }

            val linked = nextWithCategoryName("প্রথম ক্যাটাগরি")
            assertEquals(listOf("paper-category-test"), linked.single().paperUsages.map { it.categoryId })

            db.useWriterConnection { connection ->
                connection.exec(
                    "UPDATE paper_categories SET name = ?, updated_at = ? WHERE paper_category_id = ?",
                    "পরিবর্তিত ক্যাটাগরি", 2L, "paper-category-test",
                )
            }

            val renamed = nextWithCategoryName("পরিবর্তিত ক্যাটাগরি")
            assertEquals("পরিবর্তিত ক্যাটাগরি", renamed.single().paperUsages.single().categoryName)

            db.useWriterConnection { connection ->
                connection.exec("DELETE FROM paper_question_items WHERE item_id = ?", "paper-item-test")
            }
            val unlinked = withTimeout(5_000) {
                var result: List<com.questionbank.app.domain.question.SavedGroup>? = null
                while (result == null) {
                    val next = updates.receive()
                    if (next.singleOrNull()?.paperUsages?.isEmpty() == true) result = next
                }
                result!!
            }
            assertTrue(unlinked.single().paperUsages.isEmpty())
        } finally {
            observer.cancel()
        }
    }

    @Test
    fun questionWithoutStimulusIsItsOwnGroup() = runBlocking {
        val first = repo.saveGroup(group("", Triple(CqLabel.KHA, "একক প্রশ্ন", "")))
        assertTrue(first is SaveResult.Saved)
        assertNull((first as SaveResult.Saved).stimulusId)
        repo.saveGroup(group("", Triple(CqLabel.KA, "আরেকটি", "")))
        val groups = repo.observeGroups(topicId).first()
        assertEquals(2, groups.size)
        assertEquals("একক প্রশ্ন", groups[0].subQuestions[0].text) // oldest first
        assertEquals("আরেকটি", groups[1].subQuestions[0].text)
        assertEquals("", groups[0].stimulusText)
        assertEquals(0L, count("SELECT COUNT(*) FROM type_cq_stimuli"))
    }

    @Test
    fun cardsStayInCreationOrderWhenAnOlderStimulusGetsALaterLabel() = runBlocking {
        val first = repo.saveGroup(group("প্রথম উদ্দীপক", Triple(CqLabel.KA, "প্রথম ক", ""), Triple(CqLabel.KHA, "প্রথম খ", "")))
        assertTrue(first is SaveResult.Saved)
        val stimulusId = (first as SaveResult.Saved).stimulusId!!
        repo.saveGroup(group("", Triple(CqLabel.KA, "পরে তৈরি একক প্রশ্ন", "")))

        val before = repo.observeGroups(topicId).first()
        assertEquals(listOf("প্রথম উদ্দীপক", ""), before.map { it.stimulusText })

        val result = repo.updateGroup(
            GroupEditInput(
                topicId = topicId,
                groupKey = "s-$stimulusId",
                stimulusText = "প্রথম উদ্দীপক",
                subQuestions = listOf(
                    SubQuestionInput(CqLabel.KA, "প্রথম ক", ""),
                    SubQuestionInput(CqLabel.KHA, "প্রথম খ", ""),
                    SubQuestionInput(CqLabel.GHA, "পরে যোগ করা ঘ", ""),
                ),
            ),
        )

        assertEquals(UpdateResult.Updated, result)
        val after = repo.observeGroups(topicId).first()
        assertEquals(listOf("প্রথম উদ্দীপক", ""), after.map { it.stimulusText })
        assertEquals(listOf(CqLabel.KA, CqLabel.KHA, CqLabel.GHA), after[0].subQuestions.map { it.label })
    }

    @Test
    fun rejectedInputStoresNothing() = runBlocking {
        assertEquals(SaveResult.Empty, repo.saveGroup(group("শুধু উদ্দীপক", Triple(CqLabel.KA, "", ""))))
        assertEquals(
            SaveResult.MissingQuestionText(CqLabel.GA),
            repo.saveGroup(group("", Triple(CqLabel.KA, "প্রশ্ন", ""), Triple(CqLabel.GA, "", "উত্তর")))
        )
        assertEquals(SaveResult.TopicMissing, repo.saveGroup(group("", Triple(CqLabel.KA, "প্রশ্ন", ""), topic = "no-such-topic")))
        assertEquals(0L, count("SELECT COUNT(*) FROM type_cq_questions"))
        assertEquals(0L, count("SELECT COUNT(*) FROM type_cq_stimuli"))
        assertEquals(0L, count("SELECT COUNT(*) FROM type_cq_question_fts"))
    }

    @Test
    fun failureInTheMiddleRollsEverythingBackAndKeepsTheDraft() = runBlocking {
        // Every id is "dup": the stimulus and the first question insert fine, the second question hits the primary key.
        val broken = TypeCqQuestionRepositoryImpl(db.typeCqQuestionDao(), newId = { "dup" })
        val draft = DraftText(stimulus = "উদ্দীপক", texts = listOf("ক", "খ", "", ""))
        broken.saveDraft(topicId, draft)

        val result = broken.saveGroup(group("উদ্দীপক", Triple(CqLabel.KA, "ক", ""), Triple(CqLabel.KHA, "খ", "")))
        assertTrue("expected Failed but was $result", result is SaveResult.Failed)

        assertEquals(0L, count("SELECT COUNT(*) FROM type_cq_stimuli"))
        assertEquals(0L, count("SELECT COUNT(*) FROM type_cq_questions"))
        assertEquals(0L, count("SELECT COUNT(*) FROM type_cq_question_fts"))
        assertEquals(draft, broken.loadDraft(topicId)) // the draft removal was rolled back too
    }

    @Test
    fun draftRoundTripsAndASuccessfulSaveRemovesIt() = runBlocking {
        assertNull(repo.loadDraft(topicId))
        val draft = DraftText(stimulus = "লাইন ১\nলাইন \"২\"", texts = listOf("ক প্রশ্ন", "", "গ প্রশ্ন", ""), answers = listOf("", "", "উত্তর", ""))
        repo.saveDraft(topicId, draft)
        assertEquals(draft, repo.loadDraft(topicId))

        val result = repo.saveGroup(group("লাইন ১", Triple(CqLabel.KA, "ক প্রশ্ন", "")))
        assertTrue(result is SaveResult.Saved)
        assertNull(repo.loadDraft(topicId))

        repo.saveDraft(topicId, draft)
        repo.saveDraft(topicId, DraftText()) // a blank draft removes the stored one
        assertNull(repo.loadDraft(topicId))
    }

    @Test
    fun draftsOfDifferentTopicsAreIndependent() = runBlocking {
        val h = TypeCqHierarchyRepositoryImpl(db.typeCqSubjectDao(), db.typeCqChapterDao(), db.typeCqTopicDao())
        val chapterId = db.useReaderConnection { it.scalarText("SELECT chapter_id FROM type_cq_chapters LIMIT 1") }
        val other = (h.addTopic(chapterId, "টপিক ২") as AddResult.Added).id
        repo.saveDraft(topicId, DraftText(stimulus = "এক"))
        repo.saveDraft(other, DraftText(stimulus = "দুই"))
        assertEquals("এক", repo.loadDraft(topicId)?.stimulus)
        assertEquals("দুই", repo.loadDraft(other)?.stimulus)
    }

    @Test
    fun savedQuestionsAndDraftsSurviveCloseAndReopen() = runBlocking {
        val saved = repo.saveGroup(group("উদ্দীপক", Triple(CqLabel.KA, "সম\u09DF কী?", "উত্তর")))
        assertTrue(saved is SaveResult.Saved)
        repo.saveDraft(topicId, DraftText(stimulus = "অসমাপ্ত লেখা"))

        db.close()
        db = openKeepingData()
        val reopened = TypeCqQuestionRepositoryImpl(db.typeCqQuestionDao())

        val groups = reopened.observeGroups(topicId).first()
        assertEquals(1, groups.size)
        assertEquals("উদ্দীপক", groups[0].stimulusText)
        assertEquals("উত্তর", groups[0].subQuestions[0].shortAnswer)
        assertEquals("অসমাপ্ত লেখা", reopened.loadDraft(topicId)?.stimulus)
        assertEquals("ok", db.useReaderConnection { it.scalarText("PRAGMA integrity_check") })
        assertEquals(1L, count("SELECT COUNT(*) FROM type_cq_question_fts"))
    }

    @Test
    fun nuktaSpellingsAreStoredAsOneAndFoundBySearch() = runBlocking {
        repo.saveGroup(group("", Triple(CqLabel.KA, "সম\u09AF\u09BC", ""))) // য + nukta
        repo.saveGroup(group("", Triple(CqLabel.KA, "সম\u09DF", ""))) // precomposed য়
        val texts = repo.observeGroups(topicId).first().map { it.subQuestions[0].text }
        assertEquals(1, texts.toSet().size)
        val hits = db.useReaderConnection { it.ftsCount("\"" + com.questionbank.app.data.local.BanglaText.normalize("সম\u09DF") + "\"") }
        assertEquals(2L, hits)
    }

    @Test
    fun synchronousFullIsActiveAfterASave() = runBlocking {
        val saved = repo.saveGroup(group("", Triple(CqLabel.KA, "প্রশ্ন", "")))
        assertTrue(saved is SaveResult.Saved)
        // 2 = FULL
        assertEquals(2L, db.useWriterConnection { it.scalarLong("PRAGMA synchronous") })
    }

    private fun openKeepingData(): QuestionBankDatabase =
        Room.databaseBuilder(context, QuestionBankDatabase::class.java, dbName)
            .setDriver(BundledSQLiteDriver())
            .setJournalMode(RoomDatabase.JournalMode.WRITE_AHEAD_LOGGING)
            .addMigrations(QuestionBankDatabase.MIGRATION_1_2)
            .addCallback(QuestionBankDatabase.CANONICAL_OBJECTS_CALLBACK)
            .build()
}
