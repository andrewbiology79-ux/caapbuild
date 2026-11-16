package com.questionbank.app.data.local.entity

import androidx.room.*

@Entity(tableName = "app_metadata", primaryKeys = ["key"])
data class AppMetadataEntity(
    @ColumnInfo(name = "key")
    val key: String,
    @ColumnInfo(name = "value_json")
    val valueJson: String,
    @ColumnInfo(name = "updated_at")
    val updatedAt: Long
)
