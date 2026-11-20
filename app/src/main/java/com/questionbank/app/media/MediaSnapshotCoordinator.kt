package com.questionbank.app.media

import kotlinx.coroutines.sync.Mutex

/**
 * Process-wide exclusion boundary for private media mutations and backup snapshots.
 * A backup holds this lock from before its DB snapshot until its archive is re-opened
 * and validated, so all ImagePipeline file mutations are excluded for that interval.
 */
object MediaSnapshotCoordinator {
    private val mutex = Mutex()

    suspend fun <T> withMutation(block: suspend () -> T): T = withExclusive(block)

    suspend fun <T> withSnapshot(block: suspend () -> T): T = withExclusive(block)

    private suspend fun <T> withExclusive(block: suspend () -> T): T {
        mutex.lock()
        try {
            return block()
        } finally {
            mutex.unlock()
        }
    }
}
