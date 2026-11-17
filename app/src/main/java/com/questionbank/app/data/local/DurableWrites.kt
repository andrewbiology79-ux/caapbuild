package com.questionbank.app.data.local

import androidx.room.useWriterConnection

/**
 * Sets `PRAGMA synchronous=FULL` on the writer connection: every commit is flushed to storage before it returns.
 * Called before each question save (see AppContainer). It must run OUTSIDE a transaction (SQLite refuses to change the
 * safety level inside one), which is why it is not part of the database callback. The instrumented test
 * `synchronousFullIsActiveAfterASave` reads the value back, so a wrong assumption shows up in the emulator run.
 */
suspend fun QuestionBankDatabase.forceFullSync() {
    useWriterConnection { connection ->
        connection.usePrepared("PRAGMA synchronous=FULL") { statement -> statement.step() }
    }
}
