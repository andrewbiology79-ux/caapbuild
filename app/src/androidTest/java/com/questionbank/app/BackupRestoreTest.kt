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
