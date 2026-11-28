package com.questionbank.app

import android.content.Context
import android.util.Log
import androidx.room.Transactor
import androidx.room.useReaderConnection
import androidx.room.useWriterConnection
import androidx.test.core.app.ApplicationProvider
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import com.questionbank.app.TestDb.INSERT_QUESTION_EXPLICIT_FTS
import com.questionbank.app.data.local.FtsIdAllocator
import com.questionbank.app.TestDb.INSERT_SOLUTION
import com.questionbank.app.data.local.QuestionBankDatabase
import kotlinx.coroutines.runBlocking
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith
import java.io.File
import java.util.Random
import kotlin.math.min

/**
 * Scale benchmark for the real Room database with ALL triggers active (17 canonical + 46 CHECK emulation,
 * including FTS sync). Row count comes from the instrumentation argument `benchmarkRows`
 * (default 20000; use 300000 for the real target). Results go to logcat, tag QB_BENCH.
 * This test measures; its only assertions are sanity checks (row counts), not speed thresholds.
 */
@RunWith(AndroidJUnit4::class)
class ScaleBenchmarkTest {
    private val dbName = "scale_benchmark.db"
    private lateinit var context: Context
    private lateinit var db: QuestionBankDatabase

    private val words = listOf(
        "বিদ্যুৎ", "প্রবাহ", "কর্মক্ষমতা", "প্রতিক্রিয়া", "বিক্রিয়া", "শক্তি", "গতিশীল", "চুম্বক", "ক্ষেত্র", "তরঙ্গ",
        "আলোক", "প্রতিফলন", "বেগ", "ত্বরণ", "বল", "ভর", "চাপ", "তাপমাত্রা", "দ্রবণ", "অণু",
        "পরমাণু", "মৌল", "যৌগ", "আয়ন", "ক্ষার", "অম্ল", "লবণ", "কোষ", "জীব", "উদ্ভিদ",
        "প্রাণী", "পুষ্টি", "শ্বসন", "রক্ত", "হৃৎপিণ্ড", "সমীকরণ", "ত্রিভুজ", "বৃত্ত", "সূত্র", "প্রমাণ"
    )
    private val rareWord = "বিরলশব্দ"
    private val labels = listOf("ক", "খ", "গ", "ঘ")

    @Before
    fun setUp() {
        context = ApplicationProvider.getApplicationContext()
        db = TestDb.open(context, dbName)
    }

    @After
    fun tearDown() {
        db.close()
        context.deleteDatabase(dbName)
    }

    private fun log(msg: String) {
        Log.i("QB_BENCH", msg)
    }

    private inline fun <T> timed(block: () -> T): Pair<T, Double> {
        val t0 = System.nanoTime()
        val r = block()
        return r to (System.nanoTime() - t0) / 1_000_000.0
    }

    private fun sentence(rnd: Random, n: Int, rare: Boolean = false): String {
        val sb = StringBuilder()
        repeat(n) { if (it > 0) sb.append(' '); sb.append(words[rnd.nextInt(words.size)]) }
        if (rare) sb.append(' ').append(rareWord)
        return sb.toString()
    }

    private fun fileKb(suffix: String): Long = File(context.getDatabasePath(dbName).path + suffix).let { if (it.exists()) it.length() / 1024 else 0L }

    @Test
    fun importSearchAndMaintenanceAtScale() {
        runBlocking { runBenchmark() }
    }

    private suspend fun runBenchmark() {
        val rows = InstrumentationRegistry.getArguments().getString("benchmarkRows")?.toIntOrNull() ?: 20_000
        val topics = 200
        log("START rows=$rows solutionsPerQuestion=2 device=${android.os.Build.MODEL} sdk=${android.os.Build.VERSION.SDK_INT}")

        db.useWriterConnection { tx ->
            tx.withTransaction(Transactor.SQLiteTransactionType.IMMEDIATE) {
                exec("INSERT INTO type_cq_subjects(subject_id, name, sort_order, created_at, updated_at) VALUES('s1','Subject',0,1,1)")
                for (c in 1..20) exec("INSERT INTO type_cq_chapters(chapter_id, subject_id, name, sort_order, created_at, updated_at) VALUES(?, 's1', ?, ?, 1, 1)", "c$c", "Chapter $c", c)
                for (t in 1..topics) exec("INSERT INTO type_cq_topics(topic_id, chapter_id, name, sort_order, created_at, updated_at) VALUES(?, ?, ?, ?, 1, 1)", "t$t", "c${(t - 1) % 20 + 1}", "Topic $t", t)
                exec("INSERT INTO type_cq_question_types(question_type_id, code, label, sort_order) VALUES('qt1','Q1','Label',0)")
            }
        }

        // ---- 1. Import (batches of 10,000 questions + 20,000 solution parts per transaction) ----
        val rnd = Random(42)
        val ids = FtsIdAllocator(0)
        val batch = 10_000
        var done = 0
        val (_, importMs) = timed {
            while (done < rows) {
                val n = min(batch, rows - done)
                val start = done
                val (_, ms) = timed {
                    db.useWriterConnection { tx ->
                        tx.withTransaction(Transactor.SQLiteTransactionType.IMMEDIATE) {
                            usePrepared(INSERT_QUESTION_EXPLICIT_FTS) { st ->
                                for (k in 0 until n) {
                                    val i = start + k
                                    st.reset()
                                    bindAll(st, arrayOf<Any?>("q$i", ids.next(), "t${i % topics + 1}", labels[i % 4], (i % 4 + 1).toDouble(), sentence(rnd, 14, i % 1000 == 0), sentence(rnd, 5), i))
                                    st.step()
                                }
                            }
                            usePrepared(INSERT_SOLUTION) { st ->
                                for (k in 0 until n) {
                                    val i = start + k
                                    for (p in 1..2) {
                                        st.reset()
                                        bindAll(st, arrayOf<Any?>("p${i}_$p", "q$i", p, sentence(rnd, 25)))
                                        st.step()
                                    }
                                }
                            }
                        }
                    }
                }
                done += n
                log("IMPORT batch rows=$n ms=${"%.0f".format(ms)} rows_per_s=${"%.0f".format(n / (ms / 1000))} total=$done")
            }
        }
        log("IMPORT total rows=$rows ms=${"%.0f".format(importMs)} avg_rows_per_s=${"%.0f".format(rows / (importMs / 1000))}")
        assertEquals(rows.toLong(), db.useReaderConnection { it.scalarLong("SELECT COUNT(*) FROM type_cq_questions") })
        assertEquals(rows.toLong(), db.useReaderConnection { it.scalarLong("SELECT COUNT(*) FROM type_cq_question_fts") })

        // ---- 2. File sizes, checkpoint, FTS optimize ----
        log("SIZE before_checkpoint db_kb=${fileKb("")} wal_kb=${fileKb("-wal")}")
        val (_, cpMs) = timed { db.useWriterConnection { it.exec("PRAGMA wal_checkpoint(TRUNCATE)") } }
        log("CHECKPOINT ms=${"%.0f".format(cpMs)} db_kb=${fileKb("")} wal_kb=${fileKb("-wal")}")
        val (_, optMs) = timed { db.useWriterConnection { it.exec("INSERT INTO type_cq_question_fts(type_cq_question_fts) VALUES('optimize')") } }
        db.useWriterConnection { it.exec("PRAGMA wal_checkpoint(TRUNCATE)") }
        log("FTS_OPTIMIZE ms=${"%.0f".format(optMs)} db_kb=${fileKb("")}")
        try {
            val ftsBytes = db.useReaderConnection { it.scalarLong("SELECT COALESCE(SUM(pgsize),0) FROM dbstat WHERE name LIKE 'type_cq_question_fts%'") }
            val qBytes = db.useReaderConnection { it.scalarLong("SELECT COALESCE(SUM(pgsize),0) FROM dbstat WHERE name LIKE 'type_cq_questions%' OR name LIKE 'idx_type_cq_questions%'") }
            log("SIZE fts_kb=${ftsBytes / 1024} questions_kb=${qBytes / 1024}")
        } catch (e: Exception) {
            log("SIZE dbstat unavailable: ${e.javaClass.simpleName}")
        }

        // ---- 3. Search / paging latency (reader connection) ----
        val common = words[0]
        val queries = listOf(
            Triple("fts_common_limit50", "SELECT rowid FROM type_cq_question_fts WHERE type_cq_question_fts MATCH ? LIMIT 50", "\"$common\""),
            Triple("fts_common_rank_limit50", "SELECT rowid FROM type_cq_question_fts WHERE type_cq_question_fts MATCH ? ORDER BY rank LIMIT 50", "\"$common\""),
            Triple("fts_common_count", "SELECT COUNT(*) FROM type_cq_question_fts WHERE type_cq_question_fts MATCH ?", "\"$common\""),
            Triple("fts_rare_word", "SELECT rowid FROM type_cq_question_fts WHERE type_cq_question_fts MATCH ?", "\"$rareWord\""),
            Triple("fts_prefix_limit50", "SELECT rowid FROM type_cq_question_fts WHERE type_cq_question_fts MATCH ? LIMIT 50", "\"${common.take(3)}\"*"),
            Triple("fts_join_topic_limit50", "SELECT q.question_id FROM type_cq_question_fts f JOIN type_cq_questions q ON q.fts_id = f.rowid WHERE f.type_cq_question_fts MATCH ? AND q.topic_id = 't7' LIMIT 50", "\"$common\"")
        )
        for ((label, sql, arg) in queries) {
            var hits = 0
            val runs = 10
            db.useReaderConnection { it.rowCount(sql, arg) } // warm-up
            val (_, ms) = timed { repeat(runs) { hits = db.useReaderConnection { c -> c.rowCount(sql, arg) } } }
            log("SEARCH $label avg_ms=${"%.1f".format(ms / runs)} rows_returned=$hits")
        }
        val pageOffset = rows / 2
        val (_, pageMs) = timed {
            repeat(10) {
                db.useReaderConnection { it.rowCount("SELECT question_id, question_text FROM type_cq_questions WHERE topic_id = 't7' ORDER BY sort_order LIMIT 50 OFFSET ?", 0) }
            }
        }
        log("PAGING topic_first_page avg_ms=${"%.1f".format(pageMs / 10)}")
        val (_, deepMs) = timed {
            repeat(10) {
                db.useReaderConnection { it.rowCount("SELECT question_id FROM type_cq_questions ORDER BY sort_order LIMIT 50 OFFSET ?", pageOffset) }
            }
        }
        log("PAGING global_deep_offset=$pageOffset avg_ms=${"%.1f".format(deepMs / 10)}")

        // ---- 4. Edit / delete with FTS trigger (the real app path) ----
        val k = min(200, rows / 10)
        val (_, updMs) = timed {
            db.useWriterConnection { tx ->
                tx.withTransaction(Transactor.SQLiteTransactionType.IMMEDIATE) {
                    for (i in 0 until k) exec("UPDATE type_cq_questions SET question_text = ?, updated_at = 2 WHERE question_id = ?", sentence(rnd, 14), "q$i")
                }
            }
        }
        log("EDIT updates=$k total_ms=${"%.0f".format(updMs)} per_row_ms=${"%.2f".format(updMs / k)}")
        val (_, delMs) = timed {
            db.useWriterConnection { tx ->
                tx.withTransaction(Transactor.SQLiteTransactionType.IMMEDIATE) {
                    for (i in k until 2 * k) exec("DELETE FROM type_cq_questions WHERE question_id = ?", "q$i")
                }
            }
        }
        log("DELETE rows=$k total_ms=${"%.0f".format(delMs)} per_row_ms=${"%.2f".format(delMs / k)} (cascades solution parts, fires FTS delete trigger)")

        // ---- 5. Consistency: every remaining question has exactly one FTS row ----
        val qRows = db.useReaderConnection { it.scalarLong("SELECT COUNT(*) FROM type_cq_questions") }
        val fRows = db.useReaderConnection { it.scalarLong("SELECT COUNT(*) FROM type_cq_question_fts") }
        log("CONSISTENCY questions=$qRows fts_rows=$fRows")
        assertEquals("FTS rows must match question rows after edits and deletes", qRows, fRows)
        log("DONE rows=$rows")
    }
}
