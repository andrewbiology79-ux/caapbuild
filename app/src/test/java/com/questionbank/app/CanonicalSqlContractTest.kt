package com.questionbank.app

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test
import java.sql.DriverManager

class CanonicalSqlContractTest {
    @Test
    fun canonicalSqlExecutesAndPassesIntegrityAndFtsChecks() {
        val sql = javaClass.classLoader!!.getResource("QuestionBank_SQLite_Schema_v1_1.sql")!!.readText()
        DriverManager.getConnection("jdbc:sqlite::memory:").use { connection ->
            connection.createStatement().use { it.execute("PRAGMA foreign_keys = ON") }
            splitSql(sql).forEach { statement ->
                connection.createStatement().use { it.execute(statement) }
            }
            connection.createStatement().use { st ->
                st.executeQuery("PRAGMA integrity_check").use { rs ->
                    assertTrue(rs.next())
                    assertEquals("ok", rs.getString(1))
                }
                st.executeQuery("PRAGMA foreign_key_check").use { rs ->
                    assertTrue("Foreign-key violations found", !rs.next())
                }
                st.executeQuery("SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'").use { rs ->
                    assertTrue(rs.next())
                    assertEquals(47, rs.getInt(1))
                }
            }
            // Exercise a valid Type_CQ insert and verify its FTS trigger.
            connection.createStatement().use { st ->
                st.execute("INSERT INTO type_cq_subjects(subject_id,name,created_at,updated_at) VALUES('s1','Chemistry',1,1)")
                st.execute("INSERT INTO type_cq_chapters(chapter_id,subject_id,name,created_at,updated_at) VALUES('c1','s1','Acids',1,1)")
                st.execute("INSERT INTO type_cq_topics(topic_id,chapter_id,name,created_at,updated_at) VALUES('t1','c1','Reaction',1,1)")
                st.execute("INSERT INTO type_cq_question_types(question_type_id,code,label) VALUES('qt1','T1','T1')")
                st.execute("INSERT INTO type_cq_questions(question_id,stimulus_id,topic_id,question_type_id,subquestion_label,marks,question_text,short_answer,sort_order,created_at,updated_at) VALUES('q1',NULL,'t1','qt1','ক',1,'Acid reaction test','Neutralization',0,1,1)")
                st.executeQuery("SELECT COUNT(*) FROM type_cq_question_fts WHERE type_cq_question_fts MATCH 'Acid'").use { rs ->
                    assertTrue(rs.next())
                    assertEquals(1, rs.getInt(1))
                }
            }
        }
    }

    private fun splitSql(source: String): List<String> {
        val result = mutableListOf<String>()
        val buffer = StringBuilder()
        var inTrigger = false
        for (line in source.lines()) {
            val trimmed = line.trim()
            if (trimmed.isEmpty() || trimmed.startsWith("--")) continue
            if (buffer.isEmpty() && trimmed.startsWith("CREATE TRIGGER", ignoreCase = true)) inTrigger = true
            buffer.append(line).append('\n')
            if (inTrigger) {
                if (Regex("\\bEND\\s*;\\s*$", RegexOption.IGNORE_CASE).containsMatchIn(trimmed)) {
                    result += buffer.toString().trim().removeSuffix(";")
                    buffer.clear(); inTrigger = false
                }
            } else if (trimmed.endsWith(";")) {
                result += buffer.toString().trim().removeSuffix(";")
                buffer.clear()
            }
        }
        if (buffer.isNotBlank()) error("Unterminated SQL statement: $buffer")
        return result
    }
}
