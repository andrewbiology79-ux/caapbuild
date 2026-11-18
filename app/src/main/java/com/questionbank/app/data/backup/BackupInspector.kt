package com.questionbank.app.data.backup

import androidx.sqlite.SQLiteConnection
import androidx.sqlite.driver.bundled.BundledSQLiteDriver
import java.io.File

/**
 * Looks inside a database FILE without Room: header, PRAGMA integrity_check, PRAGMA foreign_key_check, Room identity hash,
 * and the row counts. A backup is trusted only after this passes. Always run on a COPY (opening a file can create -wal/-shm
 * files next to it; they are removed again).
 */
object BackupInspector {
    private const val SQLITE_MAGIC = "SQLite format 3\u0000"

    /** [expectedHash]: when given, the file's Room identity hash must equal it (same schema as the running app). */
    fun inspect(file: File, expectedHash: String? = null): InspectResult {
        if (!file.isFile || file.length() < 512) return InspectResult.bad("ফাইলটি খালি বা খুব ছোট; এটি ব্যাকআপ ফাইল নয়।")
        val head = ByteArray(16)
        val read = try {
            file.inputStream().use { it.read(head) }
        } catch (e: Exception) {
            return InspectResult.bad("ফাইল পড়া যায়নি।")
        }
        if (read != 16 || String(head, Charsets.ISO_8859_1) != SQLITE_MAGIC) {
            return InspectResult.bad("এটি SQLite ডাটাবেস ফাইল নয়।")
        }
        var connection: SQLiteConnection? = null
        try {
            connection = BundledSQLiteDriver().open(file.absolutePath)
            val integrity = connection.firstText("PRAGMA integrity_check")
            if (integrity != "ok") return InspectResult.bad("ডাটাবেসের অখণ্ডতা পরীক্ষায় ত্রুটি পাওয়া গেছে।")
            if (connection.rowCount("PRAGMA foreign_key_check") > 0) {
                return InspectResult.bad("ডাটাবেসের সম্পর্ক (foreign key) পরীক্ষায় ত্রুটি পাওয়া গেছে।")
            }
            val hash = connection.firstText("SELECT identity_hash FROM room_master_table WHERE id = 42")
                ?: return InspectResult.bad("এটি Question Bank-এর ডাটাবেস নয়।")
            if (expectedHash != null && hash != expectedHash) {
                return InspectResult.bad("ব্যাকআপটি অ্যাপের অন্য সংস্করণের ডাটাবেস কাঠামোর; এই অ্যাপে রিস্টোর করা যাবে না।")
            }
            val counts = DbCounts(
                subjects = connection.firstLong("SELECT COUNT(*) FROM type_cq_subjects"),
                chapters = connection.firstLong("SELECT COUNT(*) FROM type_cq_chapters"),
                topics = connection.firstLong("SELECT COUNT(*) FROM type_cq_topics"),
                stimuli = connection.firstLong("SELECT COUNT(*) FROM type_cq_stimuli"),
                questions = connection.firstLong("SELECT COUNT(*) FROM type_cq_questions"),
            )
            return InspectResult(true, null, hash, counts)
        } catch (e: Exception) {
            return InspectResult.bad("ফাইলটি খোলা বা পরীক্ষা করা যায়নি।")
        } finally {
            try {
                connection?.close()
            } catch (_: Exception) {
            }
            deleteSidecars(file)
        }
    }

    fun deleteSidecars(file: File) {
        File(file.path + "-wal").delete()
        File(file.path + "-shm").delete()
        File(file.path + "-journal").delete()
    }

    private fun SQLiteConnection.firstText(sql: String): String? {
        val st = prepare(sql)
        try {
            return if (st.step() && !st.isNull(0)) st.getText(0) else null
        } finally {
            st.close()
        }
    }

    private fun SQLiteConnection.firstLong(sql: String): Long {
        val st = prepare(sql)
        try {
            return if (st.step()) st.getLong(0) else 0L
        } finally {
            st.close()
        }
    }

    private fun SQLiteConnection.rowCount(sql: String): Int {
        val st = prepare(sql)
        try {
            var n = 0
            while (st.step()) n++
            return n
        } finally {
            st.close()
        }
    }
}
