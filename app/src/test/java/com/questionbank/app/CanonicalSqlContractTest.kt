package com.questionbank.app

import com.questionbank.app.data.local.CanonicalDatabaseObjects
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Assert.assertFalse
import org.junit.Test
import java.sql.DriverManager

class CanonicalSqlContractTest {
    @Test
    fun canonicalInventoryMatchesReviewedBaseline() {
        val sql = javaClass.classLoader!!.getResource("QuestionBank_SQLite_Schema_v1_1.sql")!!.readText()
        assertEquals(38, Regex("CREATE TABLE IF NOT EXISTS", RegexOption.IGNORE_CASE).findAll(sql).count())
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
                    assertEquals(21 + 46, rs.getInt(1))
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
    fun importedUncategorizedVariantsAreMergedIntoOnePermanentSystemRow() {
        DriverManager.getConnection("jdbc:sqlite::memory:").use { connection ->
            connection.createStatement().use { st ->
                st.execute("PRAGMA foreign_keys = ON")
                st.execute("CREATE TABLE paper_categories (paper_category_id TEXT PRIMARY KEY NOT NULL, name TEXT NOT NULL UNIQUE, description TEXT NOT NULL DEFAULT '', color TEXT NOT NULL DEFAULT '', icon TEXT NOT NULL DEFAULT '', sort_order INTEGER NOT NULL DEFAULT 0, is_system INTEGER NOT NULL DEFAULT 0, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL)")
                st.execute("CREATE TABLE papers (paper_id TEXT PRIMARY KEY NOT NULL, paper_category_id TEXT NOT NULL, short_name TEXT NOT NULL DEFAULT '', title TEXT NOT NULL, subject_line TEXT NOT NULL DEFAULT '', duration_text TEXT NOT NULL DEFAULT '', total_marks REAL, note_text TEXT NOT NULL DEFAULT '', sort_order INTEGER NOT NULL DEFAULT 0, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL, FOREIGN KEY(paper_category_id) REFERENCES paper_categories(paper_category_id) ON UPDATE CASCADE ON DELETE RESTRICT)")
                // Original app / schema spelling is short ই. The long ঈ spelling is a legacy typo to absorb.
                st.execute("INSERT INTO paper_categories(paper_category_id,name,created_at,updated_at) VALUES('old_uncat','অশ্রেণিবদ্ধ',1,1)")
                st.execute("INSERT INTO paper_categories(paper_category_id,name,created_at,updated_at) VALUES('legacy_uncat_copy','অশ্রেণীবদ্ধ ',2,2)")
                st.execute("INSERT INTO papers(paper_id,paper_category_id,title,created_at,updated_at) VALUES('p1','legacy_uncat_copy','legacy paper',2,2)")
            }
            CanonicalDatabaseObjects.uncategorizedRepairStatements.forEach { statement ->
                connection.createStatement().use { it.execute(statement) }
            }
            // Running the on-open repair again must remain safe and leave the same singleton.
            CanonicalDatabaseObjects.uncategorizedRepairStatements.forEach { statement ->
                connection.createStatement().use { it.execute(statement) }
            }
            connection.createStatement().use { st ->
                st.executeQuery("SELECT paper_category_id, name, is_system FROM paper_categories").use { rs ->
                    assertTrue(rs.next())
                    assertEquals("system_uncategorized", rs.getString(1))
                    assertEquals("অশ্রেণিবদ্ধ", rs.getString(2))
                    assertEquals(1, rs.getInt(3))
                    assertFalse(rs.next())
                }
                st.executeQuery("SELECT paper_category_id FROM papers WHERE paper_id='p1'").use { rs ->
                    assertTrue(rs.next())
                    assertEquals("system_uncategorized", rs.getString(1))
                }
                st.executeQuery("PRAGMA foreign_key_check").use { rs -> assertFalse(rs.next()) }
            }
        }
    }

    @Test
    fun existingPermanentCategoryAbsorbsImportedSpellingAndWhitespaceDuplicates() {
        DriverManager.getConnection("jdbc:sqlite::memory:").use { connection ->
            connection.createStatement().use { st ->
                st.execute("PRAGMA foreign_keys = ON")
                st.execute("CREATE TABLE paper_categories (paper_category_id TEXT PRIMARY KEY NOT NULL, name TEXT NOT NULL UNIQUE, description TEXT NOT NULL DEFAULT '', color TEXT NOT NULL DEFAULT '', icon TEXT NOT NULL DEFAULT '', sort_order INTEGER NOT NULL DEFAULT 0, is_system INTEGER NOT NULL DEFAULT 0, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL)")
                st.execute("CREATE TABLE papers (paper_id TEXT PRIMARY KEY NOT NULL, paper_category_id TEXT NOT NULL, title TEXT NOT NULL, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL, FOREIGN KEY(paper_category_id) REFERENCES paper_categories(paper_category_id) ON UPDATE CASCADE ON DELETE RESTRICT)")
                st.execute("INSERT INTO paper_categories(paper_category_id,name,is_system,created_at,updated_at) VALUES('system_uncategorized','অশ্রেণিবদ্ধ',1,0,0)")
                st.execute("INSERT INTO paper_categories(paper_category_id,name,created_at,updated_at) VALUES('copy_short',' অশ্রেণিবদ্ধ  ',1,1)")
                st.execute("INSERT INTO paper_categories(paper_category_id,name,created_at,updated_at) VALUES('copy_long','অশ্রেণীবদ্ধ',2,2)")
                st.execute("INSERT INTO papers VALUES('p-short','copy_short','short spelling paper',1,1)")
                st.execute("INSERT INTO papers VALUES('p-long','copy_long','long spelling paper',2,2)")
            }
            CanonicalDatabaseObjects.uncategorizedRepairStatements.forEach { statement ->
                connection.createStatement().use { it.execute(statement) }
            }
            connection.createStatement().use { st ->
                st.executeQuery("SELECT COUNT(*), MIN(name), MIN(is_system) FROM paper_categories").use { rs ->
                    assertTrue(rs.next())
                    assertEquals(1, rs.getInt(1))
                    assertEquals("অশ্রেণিবদ্ধ", rs.getString(2))
                    assertEquals(1, rs.getInt(3))
                }
                st.executeQuery("SELECT COUNT(*) FROM papers WHERE paper_category_id='system_uncategorized'").use { rs ->
                    assertTrue(rs.next())
                    assertEquals(2, rs.getInt(1))
                }
                st.executeQuery("PRAGMA foreign_key_check").use { rs -> assertFalse(rs.next()) }
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
                    assertEquals(50, rs.getInt(1))
                }
            }
            // Exercise a valid Type_CQ insert and verify its FTS trigger.
            connection.createStatement().use { st ->
                st.execute("INSERT INTO type_cq_subjects(subject_id,name,created_at,updated_at) VALUES('s1','Chemistry',1,1)")
                st.execute("INSERT INTO type_cq_chapters(chapter_id,subject_id,name,created_at,updated_at) VALUES('c1','s1','Acids',1,1)")
                st.execute("INSERT INTO type_cq_topics(topic_id,chapter_id,name,created_at,updated_at) VALUES('t1','c1','Reaction',1,1)")
                st.execute("INSERT INTO type_cq_question_types(question_type_id,code,label) VALUES('qt1','T1','T1')")
                st.execute("INSERT INTO type_cq_questions(question_id,fts_id,stimulus_id,topic_id,question_type_id,subquestion_label,marks,question_text,short_answer,sort_order,created_at,updated_at) VALUES('q1',1,NULL,'t1','qt1','ক',1,'Acid reaction test','Neutralization',0,1,1)")
                st.executeQuery("SELECT COUNT(*) FROM type_cq_question_fts WHERE type_cq_question_fts MATCH 'Acid'").use { rs ->
                    assertTrue(rs.next())
                    assertEquals(1, rs.getInt(1))
                }
            }
        }
    }

    @Test
    fun checkEmulationTriggersReplaceDroppedCheckConstraints() {
        // Room creates tables WITHOUT CHECK clauses, so strip them from the canonical SQL and
        // verify the emulation triggers still reject invalid rows and accept valid ones.
        val sql = javaClass.classLoader!!.getResource("QuestionBank_SQLite_Schema_v1_1.sql")!!.readText()
        DriverManager.getConnection("jdbc:sqlite::memory:").use { connection ->
            splitSql(stripChecks(sql))
                .filterNot { it.startsWith("CREATE VIRTUAL TABLE", ignoreCase = true) ||
                    it.startsWith("CREATE TRIGGER", ignoreCase = true) ||
                    it.startsWith("INSERT OR IGNORE INTO paper_categories", ignoreCase = true) }
                .forEach { statement -> connection.createStatement().use { it.execute(statement) } }
            CanonicalDatabaseObjects.statements.forEach { statement ->
                connection.createStatement().use { it.execute(statement) }
            }
            val sha = "a".repeat(64)
            val validImage = "INSERT INTO paper_images(paper_image_id,relative_path,mime_type,width,height,byte_size,sha256,created_at) VALUES('p1','a/b.png','image/png',1,1,0,'$sha',1)"
            connection.createStatement().use { it.execute(validImage) }
            val invalid = listOf(
                "INSERT INTO paper_images(paper_image_id,relative_path,mime_type,width,height,byte_size,sha256,created_at) VALUES('p2','../x.png','image/png',1,1,0,'$sha',1)",
                "INSERT INTO paper_images(paper_image_id,relative_path,mime_type,width,height,byte_size,sha256,created_at) VALUES('p3','/abs.png','image/png',1,1,0,'$sha',1)",
                "INSERT INTO paper_images(paper_image_id,relative_path,mime_type,width,height,byte_size,sha256,created_at) VALUES('p4','c.png','image/png',0,1,0,'$sha',1)",
                "INSERT INTO paper_images(paper_image_id,relative_path,mime_type,width,height,byte_size,sha256,created_at) VALUES('p5','d.png','image/png',1,1,0,'short',1)",
                "UPDATE paper_images SET width = 0 WHERE paper_image_id = 'p1'"
            )
            invalid.forEach { statement ->
                val message = runCatching { connection.createStatement().use { it.execute(statement) } }
                    .exceptionOrNull()?.message.orEmpty()
                assertTrue("Expected CHECK emulation failure for: $statement (got: $message)", message.contains("CHECK failed"))
            }
        }
    }

    @Test
    fun banglaFtsKeepsVowelSignsInsideWords() {
        val sql = javaClass.classLoader!!.getResource("QuestionBank_SQLite_Schema_v1_1.sql")!!.readText()
        DriverManager.getConnection("jdbc:sqlite::memory:").use { connection ->
            connection.createStatement().use { st ->
                val ftsDdl = Regex("CREATE VIRTUAL TABLE IF NOT EXISTS type_cq_question_fts[^;]*").find(sql)!!.value
                st.execute(ftsDdl)
                st.execute("INSERT INTO type_cq_question_fts(rowid, question_text, short_answer) VALUES(1,'বাংলাদেশ সরকার পরীক্ষা','')")
                fun hits(q: String) = st.executeQuery("SELECT COUNT(*) FROM type_cq_question_fts WHERE type_cq_question_fts MATCH '$q'").use { rs -> rs.next(); rs.getInt(1) }
                assertEquals(1, hits("পরীক্ষা"))
                assertEquals(1, hits("সরকার"))
                assertEquals(0, hits("পর"))
                assertEquals(0, hits("বাংলাদ"))
            }
        }
    }

    private fun stripChecks(source: String): String {
        var s = source
        val start = Regex("(,\\s*)?\\bCHECK\\s*\\(", RegexOption.IGNORE_CASE)
        while (true) {
            val m = start.find(s) ?: return s
            var j = m.range.last + 1
            var depth = 1
            while (depth > 0) {
                val c = s[j]
                if (c == '\'') {
                    j++
                    while (s[j] != '\'') j++
                } else if (c == '(') {
                    depth++
                } else if (c == ')') {
                    depth--
                }
                j++
            }
            s = s.removeRange(m.range.first, j)
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
