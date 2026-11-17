package com.questionbank.app

import android.content.Context
import androidx.room.PooledConnection
import androidx.room.Room
import androidx.room.RoomDatabase
import androidx.sqlite.SQLiteStatement
import androidx.sqlite.driver.bundled.BundledSQLiteDriver
import com.questionbank.app.data.local.QuestionBankDatabase

/** Builds the same database configuration as production (bundled driver, WAL, canonical callback). */
object TestDb {
    fun open(context: Context, name: String): QuestionBankDatabase {
        context.deleteDatabase(name) // also removes -wal / -shm
        return Room.databaseBuilder(context, QuestionBankDatabase::class.java, name)
            .setDriver(BundledSQLiteDriver())
            .setJournalMode(RoomDatabase.JournalMode.WRITE_AHEAD_LOGGING)
            .addCallback(QuestionBankDatabase.CANONICAL_OBJECTS_CALLBACK)
            .build()
    }

    const val INSERT_QUESTION =
        "INSERT INTO type_cq_questions(question_id, stimulus_id, topic_id, question_type_id, " +
            "subquestion_label, marks, question_text, short_answer, rating, sort_order, created_at, updated_at) " +
            "VALUES(?, NULL, ?, 'qt1', ?, ?, ?, ?, NULL, ?, 1, 1)"

    const val INSERT_SOLUTION =
        "INSERT INTO type_cq_solution_parts(part_id, question_id, position, part_type, text_content, image_id, created_at) " +
            "VALUES(?, ?, ?, 'TEXT', ?, NULL, 1)"
}

internal fun bindAll(st: SQLiteStatement, args: Array<out Any?>) {
    for ((i, a) in args.withIndex()) {
        val idx = i + 1
        when (a) {
            null -> st.bindNull(idx)
            is Int -> st.bindLong(idx, a.toLong())
            is Long -> st.bindLong(idx, a)
            is Double -> st.bindDouble(idx, a)
            is String -> st.bindText(idx, a)
            else -> throw IllegalArgumentException("Unsupported bind type: ${a::class}")
        }
    }
}

suspend fun PooledConnection.exec(sql: String, vararg args: Any?) {
    usePrepared(sql) { st ->
        bindAll(st, args)
        st.step()
    }
}

suspend fun PooledConnection.scalarLong(sql: String, vararg args: Any?): Long =
    usePrepared(sql) { st ->
        bindAll(st, args)
        if (st.step()) st.getLong(0) else -1L
    }

suspend fun PooledConnection.scalarText(sql: String, vararg args: Any?): String =
    usePrepared(sql) { st ->
        bindAll(st, args)
        if (st.step() && !st.isNull(0)) st.getText(0) else ""
    }

suspend fun PooledConnection.rowCount(sql: String, vararg args: Any?): Int =
    usePrepared(sql) { st ->
        bindAll(st, args)
        var n = 0
        while (st.step()) n++
        n
    }

/** Number of FTS rows matching an FTS5 query string (already quoted by the caller where needed). */
suspend fun PooledConnection.ftsCount(query: String): Long =
    scalarLong("SELECT COUNT(*) FROM type_cq_question_fts WHERE type_cq_question_fts MATCH ?", query)

suspend fun PooledConnection.seedHierarchy(topics: Int = 2) {
    exec("INSERT INTO type_cq_subjects(subject_id, name, sort_order, created_at, updated_at) VALUES('s1','Subject',0,1,1)")
    exec("INSERT INTO type_cq_chapters(chapter_id, subject_id, name, sort_order, created_at, updated_at) VALUES('c1','s1','Chapter',0,1,1)")
    for (i in 1..topics) {
        exec(
            "INSERT INTO type_cq_topics(topic_id, chapter_id, name, sort_order, created_at, updated_at) VALUES(?, 'c1', ?, ?, 1, 1)",
            "t$i", "Topic $i", i
        )
    }
    exec("INSERT INTO type_cq_question_types(question_type_id, code, label, sort_order) VALUES('qt1','Q1','Label',0)")
}
