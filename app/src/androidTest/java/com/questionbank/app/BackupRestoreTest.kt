package com.questionbank.app

import android.content.Context
import androidx.room.Room
import androidx.room.RoomDatabase
import androidx.room.useReaderConnection
import androidx.sqlite.driver.bundled.BundledSQLiteDriver
import androidx.sqlite.execSQL
import androidx.test.core.app.ApplicationProvider
import androidx.test.ext.junit.runners.AndroidJUnit4
import com.questionbank.app.data.backup.BackupInspector
import com.questionbank.app.data.backup.DatabaseSnapshot
import com.questionbank.app.data.backup.RestoreSwap
import com.questionbank.app.data.local.QuestionBankDatabase
import com.questionbank.app.data.repository.TypeCqHierarchyRepositoryImpl
import com.questionbank.app.data.repository.TypeCqQuestionRepositoryImpl
import com.questionbank.app.domain.hierarchy.AddResult
import com.questionbank.app.domain.question.CqLabel
import com.questionbank.app.domain.question.QuestionGroupInput
import com.questionbank.app.domain.question.SaveResult
import com.questionbank.app.domain.question.SubQuestionInput
import java.io.File
import kotlinx.coroutines.runBlocking
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith

/** Backup snapshot, inspection and the restore file swap on the REAL Room database (v0.2.24, P-31). */
@RunWith(AndroidJUnit4::class)
class BackupRestoreTest {
    private val sourceName = "backup_source_test.db"
    private val liveName = "backup_live_test.db"
    private lateinit var context: Context
    private lateinit var source: QuestionBankDatabase
    private val opened = mutableListOf<QuestionBankDatabase>()
    private val tempFiles = mutableListOf<File>()

    @Before
    fun setUp() {
        context = ApplicationProvider.getApplicationContext<Context>()
        listOf(liveName).forEach { cleanDbFiles(it) }
        source = TestDb.open(context, sourceName)
        opened += source
    }

    @After
    fun tearDown() {
        opened.forEach { runCatching { it.close() } }
        listOf(sourceName, liveName).forEach { cleanDbFiles(it) }
        tempFiles.forEach { f -> f.delete(); BackupInspector.deleteSidecars(f) }
    }

    private fun cleanDbFiles(name: String) {
        context.deleteDatabase(name)
        val f = context.getDatabasePath(name)
        listOf("", RestoreSwap.PENDING_SUFFIX, RestoreSwap.REPLACED_SUFFIX).forEach { suffix ->
            listOf("", "-wal", "-shm").forEach { side -> File(f.path + suffix + side).delete() }
        }
    }

    private fun temp(name: String): File = File(context.cacheDir, name).also { tempFiles += it }

    /** Opens a database file by name WITHOUT deleting it (production configuration). */
    private fun openKeeping(name: String): QuestionBankDatabase =
        Room.databaseBuilder(context, QuestionBankDatabase::class.java, name)
            .setDriver(BundledSQLiteDriver())
            .setJournalMode(RoomDatabase.JournalMode.WRITE_AHEAD_LOGGING)
            .addCallback(QuestionBankDatabase.CANONICAL_OBJECTS_CALLBACK)
            .build()
            .also { opened += it }

    private suspend fun addQuestions(db: QuestionBankDatabase, groups: Int): Int {
        val h = TypeCqHierarchyRepositoryImpl(db.typeCqSubjectDao(), db.typeCqChapterDao(), db.typeCqTopicDao())
        val s = (h.addSubject("রসায়ন") as AddResult.Added).id
        val c = (h.addChapter(s, "অধ্যায় ২") as AddResult.Added).id
        val t = (h.addTopic(c, "টপিক ১") as AddResult.Added).id
        val repo = TypeCqQuestionRepositoryImpl(db.typeCqQuestionDao())
        var saved = 0
        repeat(groups) { i ->
            val r = repo.saveGroup(
                QuestionGroupInput(
                    t, "উদ্দীপক $i",
                    listOf(SubQuestionInput(CqLabel.KA, "ক প্রশ্ন $i", "উত্তর"), SubQuestionInput(CqLabel.GA, "গ প্রশ্ন $i", ""))
                )
            )
            assertTrue("save $i failed: $r", r is SaveResult.Saved)
            saved += 2
        }
        return saved
    }

    /**
     * Make a current v4 test database structurally match its pre-v4 v3 schema.
     *
     * SQLite refuses `ALTER TABLE ... DROP COLUMN` for a column that is part of a FOREIGN KEY
     * ("unknown column card_category_id in foreign key definition"), so both tables are rebuilt in
     * their exact v3 shape instead. Dropping a table also drops its triggers; the canonical triggers
     * are installed again when Room opens the database (CANONICAL_OBJECTS_CALLBACK.onOpen).
     * legacy_alter_table avoids SQLite re-validating the other triggers that still mention the
     * table while it is briefly missing during the rename.
     */
    private fun removeCardCategoryV4Columns(connection: androidx.sqlite.SQLiteConnection) {
        connection.execSQL("PRAGMA foreign_keys = OFF")
        connection.execSQL("PRAGMA legacy_alter_table = ON")
        connection.execSQL("BEGIN")
        try {
            rebuildAsV3(connection, "type_cq_questions", V3_QUESTIONS_DDL, V3_QUESTIONS_COLUMNS, V3_QUESTIONS_INDEXES)
            rebuildAsV3(connection, "type_cq_stimuli", V3_STIMULI_DDL, V3_STIMULI_COLUMNS, V3_STIMULI_INDEXES)
            connection.execSQL("COMMIT")
        } catch (t: Throwable) {
            connection.execSQL("ROLLBACK")
            throw t
        } finally {
            connection.execSQL("PRAGMA legacy_alter_table = OFF")
        }
    }

    private fun rebuildAsV3(
        connection: androidx.sqlite.SQLiteConnection,
        table: String,
        createSql: String,
        columns: String,
        indexSql: List<String>,
    ) {
        connection.execSQL("DROP INDEX IF EXISTS index_${table}_card_category_id")
        connection.execSQL(createSql.replace("`$table`", "`${table}_v3`"))
        connection.execSQL("INSERT INTO `${table}_v3`($columns) SELECT $columns FROM `$table`")
        connection.execSQL("DROP TABLE `$table`")
        connection.execSQL("ALTER TABLE `${table}_v3` RENAME TO `$table`")
        indexSql.forEach { connection.execSQL(it) }
    }

    private fun androidx.sqlite.SQLiteConnection.firstLong(sql: String): Long {
        val st = prepare(sql)
        try {
            return if (st.step()) st.getLong(0) else -1L
        } finally {
            st.close()
        }
    }

    private fun count(db: QuestionBankDatabase, sql: String): Long = runBlocking { db.useReaderConnection { it.scalarLong(sql) } }

    @Test
    fun v1DatabaseRunsAllProductionRoomMigrationsWithoutLosingQuestionData() = runBlocking {
        addQuestions(source, groups = 2)
        val originalCounts = DatabaseSnapshot.liveCounts(source)
        val file = context.getDatabasePath(sourceName)
        source.close()

        val legacyHash = "786b471dfa14c9ae4739bb81479bab25"
        val raw = BundledSQLiteDriver().open(file.absolutePath)
        try {
            // Version 1 predates both Concept tables and the v4 card-category columns.
            removeCardCategoryV4Columns(raw)
            raw.execSQL("DROP TABLE IF EXISTS type_cq_concept_parts")
            raw.execSQL("DROP TABLE IF EXISTS type_cq_concepts")
            raw.execSQL("UPDATE room_master_table SET identity_hash = '$legacyHash' WHERE id = 42")
            raw.execSQL("PRAGMA user_version = 1")
        } finally {
            raw.close()
        }

        source = QuestionBankDatabase.create(context, sourceName)
        opened += source
        val migratedCounts = DatabaseSnapshot.liveCounts(source)
        val currentHash = DatabaseSnapshot.liveIdentityHash(source)
        assertEquals(originalCounts, migratedCounts)
        assertEquals(4L, source.useReaderConnection { it.scalarLong("PRAGMA user_version") })
        assertTrue(source.useReaderConnection { it.scalarLong("SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name IN ('type_cq_concepts','type_cq_concept_parts')") } == 2L)
        val inspected = BackupInspector.inspect(file, expectedHash = currentHash)
        assertTrue("v1 migration failed: ${inspected.problem}", inspected.ok)
        assertEquals(originalCounts, inspected.counts)
    }

    @Test
    fun v2DatabaseGetsOneTimeOldestFirstQuestionOrderMigration() = runBlocking {
        addQuestions(source, groups = 2)
        val topicId = source.useReaderConnection { it.scalarText("SELECT topic_id FROM type_cq_topics LIMIT 1") }
        val single = TypeCqQuestionRepositoryImpl(source.typeCqQuestionDao()).saveGroup(
            QuestionGroupInput(topicId, "", listOf(SubQuestionInput(CqLabel.KA, "স্বতন্ত্র প্রশ্ন", "উত্তর")))
        ) as SaveResult.Saved
        val singleQuestionId = single.questionIds.single()
        val file = context.getDatabasePath(sourceName)
        val hash = DatabaseSnapshot.liveIdentityHash(source)
        val oldestStimulus = source.useReaderConnection { it.scalarText("SELECT stimulus_id FROM type_cq_stimuli ORDER BY stimulus_id LIMIT 1") }
        source.close()
        val raw = BundledSQLiteDriver().open(file.absolutePath)
        try {
            raw.execSQL("UPDATE type_cq_stimuli SET created_at = CASE stimulus_id WHEN '$oldestStimulus' THEN 100 ELSE 200 END")
            raw.execSQL("UPDATE type_cq_questions SET sort_order = CASE WHEN question_id IN (SELECT question_id FROM type_cq_questions ORDER BY question_id LIMIT 2) THEN 100 ELSE 10 END")
            // Version 2 has Concept tables but predates the v4 card-category columns.
            removeCardCategoryV4Columns(raw)
            raw.execSQL("PRAGMA user_version = 2")
        } finally {
            raw.close()
        }
        source = QuestionBankDatabase.create(context, sourceName)
        opened += source
        assertEquals(4L, source.useReaderConnection { it.scalarLong("PRAGMA user_version") })
        val order = source.useReaderConnection { connection ->
            connection.textList("SELECT stimulus_id FROM type_cq_questions WHERE stimulus_id IS NOT NULL GROUP BY stimulus_id ORDER BY MAX(sort_order) DESC")
        }
        assertEquals(2, order.size)
        assertEquals(oldestStimulus, order.first())
        val cardOrder = source.useReaderConnection { connection ->
            connection.textList("""
                SELECT COALESCE(stimulus_id, 'single:' || question_id) AS group_key
                FROM type_cq_questions
                GROUP BY COALESCE(stimulus_id, 'single:' || question_id)
                ORDER BY MAX(sort_order) DESC
            """.trimIndent())
        }
        assertEquals(3, cardOrder.size)
        assertEquals("s-$oldestStimulus", "s-${cardOrder.first()}")
        assertEquals("single:$singleQuestionId", cardOrder.last())
        val oldestLabels = source.useReaderConnection { connection ->
            connection.textList("SELECT subquestion_label FROM type_cq_questions WHERE stimulus_id = ? ORDER BY sort_order DESC", oldestStimulus)
        }
        assertEquals(listOf("ক", "গ"), oldestLabels)
        assertEquals(hash, DatabaseSnapshot.liveIdentityHash(source))
        assertTrue(BackupInspector.inspect(file, expectedHash = hash).ok)
    }

    @Test
    fun v3MigrationAddsOneCardCategoryWithoutChangingLegacyQuestionCategories() = runBlocking {
        addQuestions(source, groups = 1)
        val topicId = source.useReaderConnection { it.scalarText("SELECT topic_id FROM type_cq_topics LIMIT 1") }
        val saved = TypeCqQuestionRepositoryImpl(source.typeCqQuestionDao()).saveGroup(
            QuestionGroupInput(
                topicId = topicId,
                stimulusText = "একটি উদ্দীপক",
                subQuestions = listOf(
                    SubQuestionInput(CqLabel.KA, "ক প্রশ্ন", "উত্তর"),
                    SubQuestionInput(CqLabel.GA, "গ প্রশ্ন", "উত্তর"),
                ),
            )
        )
        assertTrue("group creation failed: $saved", saved is SaveResult.Saved)
        saved as SaveResult.Saved
        val stimulusId = requireNotNull(saved.stimulusId)
        val questionIds = saved.questionIds
        assertEquals(2, questionIds.size)

        // Two different legacy categories on one card prove that no old assignment is inferred or collapsed.
        val raw = BundledSQLiteDriver().open(context.getDatabasePath(sourceName).absolutePath)
        val categoryValues = listOf("legacy-card-a", "legacy-card-b", "new-card-category")
        try {
            categoryValues.forEachIndexed { index, id ->
                raw.execSQL(
                    "INSERT INTO type_cq_question_categories(category_id,name,description,color,icon,sort_order,is_archived,created_at,updated_at) " +
                        "VALUES('$id','Test $index','','','',$index,0,1,1)"
                )
            }
            raw.execSQL("INSERT INTO type_cq_question_category_links(question_id,category_id,assigned_at) VALUES('${questionIds[0]}','legacy-card-a',101)")
            raw.execSQL("INSERT INTO type_cq_question_category_links(question_id,category_id,assigned_at) VALUES('${questionIds[1]}','legacy-card-b',202)")
        } finally {
            raw.close()
        }
        val legacyBefore = source.useReaderConnection { connection ->
            connection.textList(
                "SELECT question_id || '|' || category_id || '|' || assigned_at FROM type_cq_question_category_links ORDER BY question_id,category_id"
            )
        }

        val file = context.getDatabasePath(sourceName)
        source.close()
        val legacyRaw = BundledSQLiteDriver().open(file.absolutePath)
        try {
            removeCardCategoryV4Columns(legacyRaw)
            legacyRaw.execSQL("PRAGMA user_version = 3")
        } finally {
            legacyRaw.close()
        }

        source = QuestionBankDatabase.create(context, sourceName)
        opened += source
        assertEquals(4L, source.useReaderConnection { it.scalarLong("PRAGMA user_version") })
        assertEquals(2L, count(source, "SELECT COUNT(*) FROM type_cq_question_category_links"))
        assertEquals(0L, count(source, "SELECT COUNT(*) FROM type_cq_stimuli WHERE card_category_id IS NOT NULL"))
        assertEquals(0L, count(source, "SELECT COUNT(*) FROM type_cq_questions WHERE card_category_id IS NOT NULL"))
        val legacyAfterMigration = source.useReaderConnection { connection ->
            connection.textList(
                "SELECT question_id || '|' || category_id || '|' || assigned_at FROM type_cq_question_category_links ORDER BY question_id,category_id"
            )
        }
        assertEquals(legacyBefore, legacyAfterMigration)

        val repository = TypeCqQuestionRepositoryImpl(source.typeCqQuestionDao())
        val groupKey = "s-$stimulusId"
        val beforeSelection = requireNotNull(repository.loadGroup(topicId, groupKey))
        assertEquals(null, beforeSelection.cardCategoryId)
        assertEquals(setOf("legacy-card-a", "legacy-card-b"), beforeSelection.subQuestions.flatMap { it.categoryIds }.toSet())

        assertTrue(repository.updateCardCategory(topicId, groupKey, "new-card-category"))
        val afterSelection = requireNotNull(repository.loadGroup(topicId, groupKey))
        assertEquals("new-card-category", afterSelection.cardCategoryId)
        assertEquals(legacyBefore, source.useReaderConnection { connection ->
            connection.textList(
                "SELECT question_id || '|' || category_id || '|' || assigned_at FROM type_cq_question_category_links ORDER BY question_id,category_id"
            )
        })

        assertTrue(repository.updateCardCategory(topicId, groupKey, null))
        val afterClear = requireNotNull(repository.loadGroup(topicId, groupKey))
        assertEquals(null, afterClear.cardCategoryId)
        assertEquals(legacyBefore, source.useReaderConnection { connection ->
            connection.textList(
                "SELECT question_id || '|' || category_id || '|' || assigned_at FROM type_cq_question_category_links ORDER BY question_id,category_id"
            )
        })

        // A no-stimulus question is its own card and stores the independent value on the question row.
        val standaloneSaved = repository.saveGroup(
            QuestionGroupInput(
                topicId = topicId,
                stimulusText = "",
                subQuestions = listOf(SubQuestionInput(CqLabel.KHA, "স্বতন্ত্র প্রশ্ন", "উত্তর")),
                cardCategoryId = "new-card-category",
            )
        )
        assertTrue("standalone save failed: $standaloneSaved", standaloneSaved is SaveResult.Saved)
        standaloneSaved as SaveResult.Saved
        val standaloneKey = "q-${standaloneSaved.questionIds.single()}"
        val standaloneGroup = requireNotNull(repository.loadGroup(topicId, standaloneKey))
        assertEquals("new-card-category", standaloneGroup.cardCategoryId)
    }

    @Test
    fun snapshotOfALiveDatabasePassesInspectionAndMatchesTheLiveCounts() = runBlocking {
        val expected = addQuestions(source, groups = 3) // 6 questions, still partly in the -wal file
        val file = temp("snapshot_test.db")

        val counts = DatabaseSnapshot.create(source, file)
        val hash = DatabaseSnapshot.liveIdentityHash(source)
        val check = BackupInspector.inspect(file, expectedHash = hash)

        assertTrue("inspection failed: ${check.problem}", check.ok)
        assertEquals(expected.toLong(), counts.questions)
        assertEquals(counts, check.counts)
        assertEquals(3L, counts.stimuli)
        assertEquals(hash, check.identityHash)
    }

    @Test
    fun snapshotKeepsSearchRowsAndTriggersAndCanBeOpenedByRoom() = runBlocking {
        addQuestions(source, groups = 2)
        val file = temp("snapshot_open_test.db")
        DatabaseSnapshot.create(source, file)

        // Look into the snapshot FILE first (no Room, so Room's onOpen cannot re-create anything): every trigger of the live
        // database (17 canonical + the CHECK-emulation triggers) and both FTS virtual tables must already be inside the copy.
        val liveTriggers = count(source, "SELECT COUNT(*) FROM sqlite_master WHERE type = 'trigger'")
        assertTrue("expected the canonical and CHECK-emulation triggers, found $liveTriggers", liveTriggers >= 63)
        val plain = BundledSQLiteDriver().open(file.absolutePath)
        try {
            assertEquals(liveTriggers, plain.firstLong("SELECT COUNT(*) FROM sqlite_master WHERE type = 'trigger'"))
            assertEquals(2L, plain.firstLong("SELECT COUNT(*) FROM sqlite_master WHERE type = 'table' AND sql LIKE 'CREATE VIRTUAL TABLE%'"))
        } finally {
            plain.close()
            BackupInspector.deleteSidecars(file)
        }

        // put the snapshot where Room expects a database and open it with the production configuration
        val target = context.getDatabasePath(liveName)
        target.parentFile?.mkdirs()
        file.copyTo(target, overwrite = true)
        val restored = openKeeping(liveName)

        assertEquals(4L, count(restored, "SELECT COUNT(*) FROM type_cq_questions"))
        assertEquals(4L, count(restored, "SELECT COUNT(*) FROM type_cq_question_fts"))
        // the search rows stay in step with new questions
        addMoreInto(restored)
        assertEquals(6L, count(restored, "SELECT COUNT(*) FROM type_cq_questions"))
        assertEquals(6L, count(restored, "SELECT COUNT(*) FROM type_cq_question_fts"))
        assertEquals("ok", runBlocking { restored.useReaderConnection { it.scalarText("PRAGMA integrity_check") } })
    }

    private suspend fun addMoreInto(db: QuestionBankDatabase) {
        val topic = db.useReaderConnection { it.scalarText("SELECT topic_id FROM type_cq_topics LIMIT 1") }
        val repo = TypeCqQuestionRepositoryImpl(db.typeCqQuestionDao())
        val r = repo.saveGroup(QuestionGroupInput(topic, "", listOf(SubQuestionInput(CqLabel.KHA, "নতুন", ""), SubQuestionInput(CqLabel.GHA, "আরেক", ""))))
        assertTrue(r is SaveResult.Saved)
    }

    @Test
    fun inspectorRejectsFilesThatAreNotUsableBackups() = runBlocking {
        addQuestions(source, groups = 1)
        val good = temp("inspect_good.db")
        DatabaseSnapshot.create(source, good)

        val empty = temp("inspect_empty.db").also { it.writeBytes(ByteArray(0)) }
        val text = temp("inspect_text.db").also { it.writeText("not a database ".repeat(100)) }
        val truncated = temp("inspect_truncated.db").also { it.writeBytes(good.readBytes().copyOf(1200)) }

        assertFalse(BackupInspector.inspect(empty).ok)
        assertFalse(BackupInspector.inspect(text).ok)
        assertFalse("a truncated copy must not pass", BackupInspector.inspect(truncated).ok)
    }

    @Test
    fun inspectorRejectsAPlainSqliteFileThatIsNotQuestionBank() {
        val plain = temp("inspect_plain.db")
        plain.delete()
        val connection = BundledSQLiteDriver().open(plain.absolutePath)
        try {
            connection.execSQL("CREATE TABLE notes(id INTEGER PRIMARY KEY, body TEXT)")
            connection.execSQL("INSERT INTO notes(body) VALUES('x')")
        } finally {
            connection.close()
        }
        val check = BackupInspector.inspect(plain)
        assertFalse(check.ok)
        assertNotNull(check.problem)
    }

    @Test
    fun inspectorRejectsADatabaseWithAnotherSchemaHash() = runBlocking {
        addQuestions(source, groups = 1)
        val file = temp("inspect_hash.db")
        DatabaseSnapshot.create(source, file)
        val check = BackupInspector.inspect(file, expectedHash = "0000000000000000000000000000000f")
        assertFalse(check.ok)
    }

    @Test
    fun fullRestoreReplacesTheLiveDatabaseAndKeepsTheOldOneAsASafetyCopy() = runBlocking {
        // the "backup": 3 groups = 6 questions
        addQuestions(source, groups = 3)
        val snapshot = temp("restore_snapshot.db")
        DatabaseSnapshot.create(source, snapshot)

        // the "live" database on the phone: 1 group = 2 questions
        var live = openKeeping(liveName)
        addQuestions(live, groups = 1)
        live.close() // as the app does after staging a restore (checkpoints the -wal file)

        val liveFile = context.getDatabasePath(liveName)
        snapshot.copyTo(RestoreSwap.pendingFile(liveFile), overwrite = true)

        val outcome = RestoreSwap.applyIfPending(liveFile) { BackupInspector.inspect(it) }
        assertEquals(RestoreSwap.Outcome.Applied, outcome)

        live = openKeeping(liveName)
        assertEquals(6L, count(live, "SELECT COUNT(*) FROM type_cq_questions"))
        assertEquals(6L, count(live, "SELECT COUNT(*) FROM type_cq_question_fts"))
        assertEquals("ok", live.useReaderConnection { it.scalarText("PRAGMA integrity_check") })
        assertFalse(RestoreSwap.pendingFile(liveFile).exists())

        // the previous database is still there and still holds its 2 questions
        val safety = File(liveFile.path + RestoreSwap.REPLACED_SUFFIX)
        assertTrue(safety.exists())
        val copy = temp("safety_copy.db")
        safety.copyTo(copy, overwrite = true)
        assertEquals(2L, BackupInspector.inspect(copy).counts?.questions)
    }

    @Test
    fun aDamagedPendingRestoreIsRejectedAndTheLiveDatabaseIsUntouched() = runBlocking {
        var live = openKeeping(liveName)
        addQuestions(live, groups = 1)
        live.close()

        val liveFile = context.getDatabasePath(liveName)
        RestoreSwap.pendingFile(liveFile).writeText("damaged ".repeat(200))

        val outcome = RestoreSwap.applyIfPending(liveFile) { BackupInspector.inspect(it) }
        assertTrue(outcome is RestoreSwap.Outcome.Rejected)

        live = openKeeping(liveName)
        assertEquals(2L, count(live, "SELECT COUNT(*) FROM type_cq_questions"))
        assertFalse(RestoreSwap.pendingFile(liveFile).exists())
    }
}


// ---- Exact pre-v4 (v3) table shapes, taken from the Room v4 schema minus card_category_id. ----
private const val V3_QUESTIONS_DDL =
    "CREATE TABLE IF NOT EXISTS `type_cq_questions` (`question_id` TEXT NOT NULL, `fts_id` INTEGER NOT NULL, `stimulus_id` TEXT, " +
        "`topic_id` TEXT NOT NULL, `question_type_id` TEXT NOT NULL, `subquestion_label` TEXT NOT NULL, `marks` REAL NOT NULL, " +
        "`question_text` TEXT NOT NULL DEFAULT '', `short_answer` TEXT NOT NULL DEFAULT '', `rating` INTEGER, " +
        "`sort_order` INTEGER NOT NULL DEFAULT 0, `created_at` INTEGER NOT NULL, `updated_at` INTEGER NOT NULL, " +
        "PRIMARY KEY(`question_id`), " +
        "FOREIGN KEY(`question_type_id`) REFERENCES `type_cq_question_types`(`question_type_id`) ON UPDATE CASCADE ON DELETE RESTRICT , " +
        "FOREIGN KEY(`topic_id`) REFERENCES `type_cq_topics`(`topic_id`) ON UPDATE CASCADE ON DELETE RESTRICT , " +
        "FOREIGN KEY(`stimulus_id`) REFERENCES `type_cq_stimuli`(`stimulus_id`) ON UPDATE CASCADE ON DELETE RESTRICT )"
private const val V3_QUESTIONS_COLUMNS =
    "question_id, fts_id, stimulus_id, topic_id, question_type_id, subquestion_label, marks, question_text, " +
        "short_answer, rating, sort_order, created_at, updated_at"
private val V3_QUESTIONS_INDEXES = listOf(
    "CREATE UNIQUE INDEX IF NOT EXISTS `index_type_cq_questions_fts_id` ON `type_cq_questions` (`fts_id`)",
    "CREATE INDEX IF NOT EXISTS `index_type_cq_questions_question_type_id_sort_order` ON `type_cq_questions` (`question_type_id`, `sort_order`)",
    "CREATE INDEX IF NOT EXISTS `index_type_cq_questions_stimulus_id_sort_order` ON `type_cq_questions` (`stimulus_id`, `sort_order`)",
    "CREATE INDEX IF NOT EXISTS `index_type_cq_questions_topic_id_sort_order` ON `type_cq_questions` (`topic_id`, `sort_order`)",
)
private const val V3_STIMULI_DDL =
    "CREATE TABLE IF NOT EXISTS `type_cq_stimuli` (`stimulus_id` TEXT NOT NULL, `topic_id` TEXT NOT NULL, " +
        "`stimulus_text` TEXT NOT NULL DEFAULT '', `rating` INTEGER, `reference_text` TEXT NOT NULL DEFAULT '', " +
        "`created_at` INTEGER NOT NULL, `updated_at` INTEGER NOT NULL, PRIMARY KEY(`stimulus_id`), " +
        "FOREIGN KEY(`topic_id`) REFERENCES `type_cq_topics`(`topic_id`) ON UPDATE CASCADE ON DELETE RESTRICT )"
private const val V3_STIMULI_COLUMNS = "stimulus_id, topic_id, stimulus_text, rating, reference_text, created_at, updated_at"
private val V3_STIMULI_INDEXES = listOf(
    "CREATE INDEX IF NOT EXISTS `index_type_cq_stimuli_topic_id_updated_at` ON `type_cq_stimuli` (`topic_id`, `updated_at`)",
)
