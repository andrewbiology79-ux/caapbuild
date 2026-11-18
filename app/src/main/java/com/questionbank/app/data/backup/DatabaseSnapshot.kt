package com.questionbank.app.data.backup

import androidx.room.PooledConnection
import androidx.room.useReaderConnection
import androidx.room.useWriterConnection
import com.questionbank.app.data.local.QuestionBankDatabase
import java.io.File

/**
 * A consistent copy of the live database, made with `VACUUM INTO`. It sees everything committed so far (including rows that
 * are still only in the -wal file), needs no checkpoint and no closing, and writes one standalone file.
 * The counts are read on the SAME writer connection right after the copy, so they describe exactly what was copied.
 */
object DatabaseSnapshot {
    suspend fun create(db: QuestionBankDatabase, target: File): DbCounts {
        target.parentFile?.mkdirs()
        target.delete() // VACUUM INTO refuses an existing non-empty file
        BackupInspector.deleteSidecars(target)
        return db.useWriterConnection { connection ->
            connection.usePrepared("VACUUM INTO ?") { st ->
                st.bindText(1, target.absolutePath)
                st.step()
            }
            connection.counts()
        }
    }

    suspend fun liveCounts(db: QuestionBankDatabase): DbCounts = db.useReaderConnection { it.counts() }

    suspend fun liveIdentityHash(db: QuestionBankDatabase): String? = db.useReaderConnection { connection ->
        connection.usePrepared("SELECT identity_hash FROM room_master_table WHERE id = 42") { st ->
            if (st.step() && !st.isNull(0)) st.getText(0) else null
        }
    }

    private suspend fun PooledConnection.counts(): DbCounts = DbCounts(
        subjects = scalar("SELECT COUNT(*) FROM type_cq_subjects"),
        chapters = scalar("SELECT COUNT(*) FROM type_cq_chapters"),
        topics = scalar("SELECT COUNT(*) FROM type_cq_topics"),
        stimuli = scalar("SELECT COUNT(*) FROM type_cq_stimuli"),
        questions = scalar("SELECT COUNT(*) FROM type_cq_questions"),
    )

    private suspend fun PooledConnection.scalar(sql: String): Long =
        usePrepared(sql) { st -> if (st.step()) st.getLong(0) else 0L }
}
