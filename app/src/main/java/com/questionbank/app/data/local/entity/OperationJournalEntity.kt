package com.questionbank.app.data.local.entity

import androidx.room.*

@Entity(tableName = "operation_journal", primaryKeys = ["operation_id"], indices = [
        Index(value = ["status", "updated_at"], unique = false)
    ])
data class OperationJournalEntity(
    @ColumnInfo(name = "operation_id")
    val operationId: String,
    @ColumnInfo(name = "operation_type")
    val operationType: String,
    @ColumnInfo(name = "scope")
    val scope: String,
    @ColumnInfo(name = "payload_json")
    val payloadJson: String,
    @ColumnInfo(name = "status")
    val status: String,
    @ColumnInfo(name = "created_at")
    val createdAt: Long,
    @ColumnInfo(name = "updated_at")
    val updatedAt: Long
)
