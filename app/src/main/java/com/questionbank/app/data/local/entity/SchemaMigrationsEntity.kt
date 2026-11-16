package com.questionbank.app.data.local.entity

import androidx.room.*

@Entity(tableName = "schema_migrations", primaryKeys = ["version"])
data class SchemaMigrationsEntity(
    @ColumnInfo(name = "version")
    val version: Long,
    @ColumnInfo(name = "description")
    val description: String,
    @ColumnInfo(name = "applied_at")
    val appliedAt: Long
)
