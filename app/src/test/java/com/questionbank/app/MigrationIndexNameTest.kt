package com.questionbank.app

import org.junit.Assert.assertTrue
import org.junit.Test
import java.io.File

/**
 * Room validates index NAMES after a migration. An entity index declared without an explicit
 * name is expected as "index_<table>_<columns>". A migration that creates a differently named
 * index makes Room throw "Migration didn't properly handle" on upgrade. This test pins the
 * 1 -> 2 migration (Kotlin and standalone SQL) to Room's generated name.
 */
class MigrationIndexNameTest {
    private val expected = "index_type_cq_stimulus_category_links_category_id_stimulus_id"

    @Test
    fun standaloneMigrationSqlUsesRoomIndexName() {
        val sql = javaClass.classLoader!!.getResource("migrations/1_to_2_stimulus_category_links.sql")!!.readText()
        assertTrue(sql.contains(expected))
        assertTrue(!sql.contains("idx_type_cq_stimulus_category_links"))
    }

    @Test
    fun kotlinMigrationUsesRoomIndexName() {
        val source = File("src/main/java/com/questionbank/app/data/local/QuestionBankDatabase.kt").readText()
        assertTrue(source.contains(expected))
        assertTrue(!source.contains("idx_type_cq_stimulus_category_links"))
    }

    /** Review fix (Finding 4/5): the canonical v1.2 schema must use the same index name as Room and the migration. */
    @Test
    fun canonicalSchemaV12UsesRoomIndexName() {
        val sql = javaClass.classLoader!!.getResource("QuestionBank_SQLite_Schema_v1_2.sql")!!.readText()
        assertTrue(sql.contains(expected))
        assertTrue(!sql.contains("idx_type_cq_stimulus_category_links"))
    }

    /** The exported Room schema (2.json) names the same index, so Room, migration and canonical SQL cannot drift apart. */
    @Test
    fun roomSchemaJsonUsesTheSameIndexName() {
        val relative = "schemas/com.questionbank.app.data.local.QuestionBankDatabase/2.json"
        val file = listOf(File(relative), File("app/$relative")).first { it.isFile }
        assertTrue(file.readText().contains("\"name\": \"$expected\""))
    }
}
