package com.questionbank.app

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Assert.assertFalse
import org.junit.Test
import java.sql.DriverManager

class CanonicalSqlContractTest {
    @Test
    fun canonicalInventoryMatchesReviewedBaseline() {
        val sql = javaClass.classLoader!!.getResource("QuestionBank_SQLite_Schema_v1_1.sql")!!.readText()
        assertEquals(35, Regex("CREATE TABLE IF NOT EXISTS", RegexOption.IGNORE_CASE).findAll(sql).count())
        assertEquals(2, Regex("CREATE VIRTUAL TABLE", RegexOption.IGNORE_CASE).findAll(sql).count())
        assertEquals(17, Regex("CREATE TRIGGER", RegexOption.IGNORE_CASE).findAll(sql).count())
        assertEquals(48, Regex("\\bCHECK\\s*\\(", RegexOption.IGNORE_CASE).findAll(sql).count())

        val requiredTriggers = setOf(
            "trg_paper_item_source_required_insert",
            "trg_type_question_topic_match_insert",
            "trg_type_question_topic_match_update",
            "trg_type_stimulus_topic_parent_update",
            "trg_chapter_question_chapter_match_insert",
            "trg_chapter_question_chapter_match_update",
            "trg_chapter_stimulus_chapter_parent_update",
            "trg_paper_item_section_match_insert",
            "trg_paper_item_section_match_update",
            "trg_paper_section_parent_update",
            "trg_system_paper_category_no_delete",
            "trg_type_question_fts_insert",
            "trg_type_question_fts_update",
            "trg_type_question_fts_delete",
            "trg_chapter_question_fts_insert",
            "trg_chapter_question_fts_update",
            "trg_chapter_question_fts_delete"
        )
        val declaredTriggers = Regex("CREATE TRIGGER IF NOT EXISTS\\s+(\\w+)", RegexOption.IGNORE_CASE)
            .findAll(sql).map { it.groupValues[1] }.toSet()
        assertEquals(requiredTriggers, declaredTriggers)
        requiredTriggers.forEach { trigger ->
            assertTrue("Runtime installer missing $trigger", CanonicalDatabaseObjects.statements.any { it.contains(trigger) })
        }
        assertFalse("Runtime installer must not register FTS shadow tables as Room entities", CanonicalDatabaseObjects.statements.any { it.contains("CREATE TABLE IF NOT EXISTS type_cq_question_fts_") })
    }

    @Test
    fun runtimeInstallerCreatesAllCanonicalNonEntityObjects() {
        val sql = javaClass.classLoader!!.getResource("QuestionBank_SQLite_Schema_v1_1.sql")!!.readText()
        DriverManager.getConnection("jdbc:sqlite::memory:").use { connection ->
            connection.createStatement().use { it.execute("PRAGMA foreign_keys = ON") }
            splitSql(sql)
                .filterNot { statement ->
                    statement.startsWith("CREATE VIRTUAL TABLE", ignoreCase = true) ||
                        statement.startsWith("CREATE TRIGGER", ignoreCase = true) ||
                        statement.startsWith("INSERT OR IGNORE INTO paper_categories", ignoreCase = true)
                }
                .forEach { statement -> connection.createStatement().use { it.execute(statement) } }

            CanonicalDatabaseObjects.statements.forEach { statement ->
                connection.createStatement().use { it.execute(statement) }
            }

            connection.createStatement().use { st ->
                st.executeQuery("SELECT COUNT(*) FROM sqlite_master WHERE type='trigger'").use { rs ->
                    assertTrue(rs.next())
                    assertEquals(17, rs.getInt(1))
                }
                st.executeQuery("SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name IN ('type_cq_question_fts','chapter_cq_question_fts')").use { rs ->
                    assertTrue(rs.next())
                    assertEquals(2, rs.getInt(1))
                }
                st.executeQuery("SELECT COUNT(*) FROM paper_categories WHERE paper_category_id='system_uncategorized' AND is_system=1").use { rs ->
                    assertTrue(rs.next())
                    assertEquals(1, rs.getInt(1))
                }
            }
        }
    }

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
