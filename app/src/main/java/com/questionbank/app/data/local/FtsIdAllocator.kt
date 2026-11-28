package com.questionbank.app.data.local

/**
 * Hands out values for the question tables' `fts_id` column (finding F-1, ADR-003 option a).
 *
 * `fts_id` is an internal integer that is used as the FTS5 rowid, so edits and deletes reach the FTS
 * row directly instead of scanning the whole FTS table. It must never be exported to backups or
 * shared files; restore and import always allocate fresh values.
 *
 * Usage: inside the SAME write transaction as the inserts, read the current maximum once
 * (`SELECT COALESCE(MAX(fts_id), 0) FROM <questions table>`), create the allocator with that value,
 * and call [next] for every inserted question. Not thread-safe by design: there is one writer.
 */
class FtsIdAllocator(currentMax: Long) {
    private var last: Long = currentMax

    init {
        require(currentMax >= 0) { "currentMax must be >= 0" }
    }

    fun next(): Long {
        check(last < Long.MAX_VALUE) { "fts_id space exhausted" }
        last += 1
        return last
    }
}
