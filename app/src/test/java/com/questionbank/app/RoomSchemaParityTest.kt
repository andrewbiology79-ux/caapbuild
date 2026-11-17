package com.questionbank.app

import com.google.gson.JsonObject
import com.google.gson.JsonParser
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test
import java.io.File
import java.sql.Connection
import java.sql.DriverManager
import java.sql.ResultSet

/**
 * Compares the committed Room schema export (1.json) with the canonical SQL schema.
 *
 * Compared per table: columns (name, SQLite affinity, NOT NULL), primary key, foreign keys
 * (columns, referenced columns, parent table, ON DELETE) and indexes (columns, uniqueness).
 *
 * Known, accepted difference: the canonical SQL also declares a plain index on
 * (question_id, position) for the two *_solution_parts tables although UNIQUE(question_id, position)
 * already provides it. The Room entities intentionally declare only the unique index, so a
 * non-unique SQL index that duplicates a unique index on the same columns is ignored here.
 *
 * Not compared: CHECK clauses (covered by emulation triggers and their own tests), triggers and
 * FTS tables (installed by the database callback, not Room entities).
 */
class RoomSchemaParityTest {

    @Test
    fun roomSchemaJsonBaselineIsExpected() {
        val database = loadSchema()
        assertEquals(1, database.get("version").asInt)
        assertEquals(35, database.array("entities").size)
    }

    @Test
    fun roomSchemaJsonMatchesCanonicalSqlStructure() {
        val entities = loadSchema().array("entities").associateBy { it.get("tableName").asString }
        val sql = javaClass.classLoader!!.getResource("QuestionBank_SQLite_Schema_v1_1.sql")!!.readText()
        val problems = mutableListOf<String>()

        DriverManager.getConnection("jdbc:sqlite::memory:").use { connection ->
            connection.createStatement().use { it.execute("PRAGMA foreign_keys = ON") }
            splitSql(sql)
                .filterNot { statement ->
                    statement.startsWith("CREATE VIRTUAL TABLE", ignoreCase = true) ||
                        statement.startsWith("CREATE TRIGGER", ignoreCase = true) ||
                        statement.startsWith("INSERT OR IGNORE INTO paper_categories", ignoreCase = true)
                }
                .forEach { statement -> connection.createStatement().use { it.execute(statement) } }

            val sqlTables = connection
                .rows("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'") { it.getString(1) }
                .toSet()
            (sqlTables - entities.keys).sorted().forEach { problems += "Table only in canonical SQL: $it" }
            (entities.keys - sqlTables).sorted().forEach { problems += "Entity only in Room schema: $it" }

            for (table in (sqlTables intersect entities.keys).sorted()) {
                val entity = entities.getValue(table)

                // Columns
                val sqlInfo = connection.rows("PRAGMA table_info(\"$table\")") {
                    ColumnInfo(it.getString("name"), it.getString("type"), it.getInt("notnull") == 1, it.getInt("pk"))
                }
                val sqlColumns = sqlInfo.associate { it.name to "${sqlAffinity(it.type)}|notNull=${it.notNull}" }
                val roomColumns = entity.array("fields").associate {
                    val notNull = if (it.has("notNull")) it.get("notNull").asBoolean else false
                    it.get("columnName").asString to "${it.get("affinity").asString}|notNull=$notNull"
                }
                (sqlColumns.keys - roomColumns.keys).sorted().forEach { problems += "$table: column only in SQL: $it" }
                (roomColumns.keys - sqlColumns.keys).sorted().forEach { problems += "$table: column only in Room: $it" }
                for (column in (sqlColumns.keys intersect roomColumns.keys).sorted()) {
                    if (sqlColumns.getValue(column) != roomColumns.getValue(column)) {
                        problems += "$table.$column: SQL ${sqlColumns.getValue(column)} vs Room ${roomColumns.getValue(column)}"
                    }
                }

                // Primary key
                val sqlPk = sqlInfo.filter { it.pk > 0 }.sortedBy { it.pk }.map { it.name }
                val roomPk = entity.getAsJsonObject("primaryKey").strings("columnNames")
                if (sqlPk != roomPk) problems += "$table: primary key SQL $sqlPk vs Room $roomPk"

                // Foreign keys
                val fkRows = connection.rows("PRAGMA foreign_key_list(\"$table\")") {
                    FkRow(it.getInt("id"), it.getInt("seq"), it.getString("table"), it.getString("from"), it.getString("to"), it.getString("on_delete"))
                }
                val sqlFks = fkRows.groupBy { it.id }.values.map { group ->
                    val ordered = group.sortedBy { it.seq }
                    describeFk(ordered.map { it.from }, ordered.map { it.to }, ordered.first().table, ordered.first().onDelete)
                }.sorted()
                val roomFks = entity.array("foreignKeys").map {
                    describeFk(it.strings("columns"), it.strings("referencedColumns"), it.get("table").asString, it.get("onDelete").asString)
                }.sorted()
                if (sqlFks != roomFks) problems += "$table: foreign keys SQL $sqlFks vs Room $roomFks"

                // Indexes
                val sqlIndexes = connection.rows("PRAGMA index_list(\"$table\")") {
                    IndexRow(it.getString("name"), it.getInt("unique") == 1, it.getString("origin"))
                }.filter { it.origin == "c" || it.origin == "u" }.map { row ->
                    val columns = connection.rows("PRAGMA index_info(\"${row.name}\")") { it.getString("name") ?: "?" }
                    columns to row.unique
                }
                val uniqueColumnSets = sqlIndexes.filter { it.second }.map { it.first }.toSet()
                val normalizedSql = sqlIndexes
                    .filterNot { !it.second && it.first in uniqueColumnSets }
                    .map { describeIndex(it.first, it.second) }
                    .distinct()
                    .sorted()
                val roomIndexes = entity.array("indices").map {
                    val unique = if (it.has("unique")) it.get("unique").asBoolean else false
                    describeIndex(it.strings("columnNames"), unique)
                }.sorted()
                if (normalizedSql != roomIndexes) problems += "$table: indexes SQL $normalizedSql vs Room $roomIndexes"
            }
        }

        assertTrue("Room schema (1.json) differs from canonical SQL:\n" + problems.joinToString("\n"), problems.isEmpty())
    }

    private data class ColumnInfo(val name: String, val type: String?, val notNull: Boolean, val pk: Int)
    private data class FkRow(val id: Int, val seq: Int, val table: String, val from: String, val to: String, val onDelete: String)
    private data class IndexRow(val name: String, val unique: Boolean, val origin: String)

    private fun describeFk(columns: List<String>, referenced: List<String>, table: String, onDelete: String): String =
        "${columns.joinToString(",")}->$table(${referenced.joinToString(",")}) ON DELETE $onDelete"

    private fun describeIndex(columns: List<String>, unique: Boolean): String =
        "${columns.joinToString(",")}|unique=$unique"

    private fun sqlAffinity(declared: String?): String {
        val t = (declared ?: "").uppercase()
        return when {
            "INT" in t -> "INTEGER"
            "CHAR" in t || "CLOB" in t || "TEXT" in t -> "TEXT"
            "BLOB" in t || t.isEmpty() -> "BLOB"
            "REAL" in t || "FLOA" in t || "DOUB" in t -> "REAL"
            else -> "NUMERIC"
        }
    }

    private fun loadSchema(): JsonObject {
        val relative = "schemas/com.questionbank.app.data.local.QuestionBankDatabase/1.json"
        val file = listOf(File(relative), File("app/$relative")).firstOrNull { it.isFile }
            ?: error("Room schema export not found: $relative (working dir ${File(".").absoluteFile})")
        return JsonParser.parseString(file.readText()).asJsonObject.getAsJsonObject("database")
    }

    private fun JsonObject.array(name: String): List<JsonObject> =
        if (has(name)) getAsJsonArray(name).map { it.asJsonObject } else emptyList()

    private fun JsonObject.strings(name: String): List<String> =
        getAsJsonArray(name).map { it.asString }

    private fun <T> Connection.rows(sql: String, map: (ResultSet) -> T): List<T> =
        createStatement().use { statement ->
            statement.executeQuery(sql).use { rs ->
                val out = mutableListOf<T>()
                while (rs.next()) out.add(map(rs))
                out
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
