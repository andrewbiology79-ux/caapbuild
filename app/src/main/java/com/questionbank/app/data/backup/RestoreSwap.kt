package com.questionbank.app.data.backup

import java.io.File

/**
 * Restore is done in two steps so that no live database connection is ever replaced:
 *   1. In the running app a verified backup is copied next to the database as `<db>.restore-pending` and the database is closed.
 *   2. On the NEXT process start, before the database is opened, [applyIfPending] swaps the files.
 * The previous database (main file + -wal + -shm) is kept as `<db>.replaced*`, never deleted by a restore, until the next restore.
 * If anything fails half way, the previous files are moved back.
 */
object RestoreSwap {
    const val PENDING_SUFFIX = ".restore-pending"
    const val REPLACED_SUFFIX = ".replaced"
    private val SIDES = listOf("", "-wal", "-shm")

    sealed interface Outcome {
        data object NothingPending : Outcome
        data object Applied : Outcome
        data class Rejected(val why: String) : Outcome
        data class Failed(val why: String) : Outcome
    }

    fun pendingFile(dbFile: File) = File(dbFile.path + PENDING_SUFFIX)

    fun applyIfPending(dbFile: File, inspect: (File) -> InspectResult): Outcome {
        val pending = pendingFile(dbFile)
        if (!pending.exists()) return Outcome.NothingPending

        val check = inspect(pending)
        if (!check.ok) {
            pending.delete()
            BackupInspector.deleteSidecars(pending)
            return Outcome.Rejected(check.problem ?: "ব্যাকআপ ফাইলটি ঠিক নয়।")
        }

        // 1. Make room: forget the previous .replaced copy, then move the current database aside (all three files).
        SIDES.forEach { File(dbFile.path + REPLACED_SUFFIX + it).delete() }
        val moved = mutableListOf<String>()
        try {
            for (side in SIDES) {
                val from = File(dbFile.path + side)
                if (from.exists()) {
                    if (!from.renameTo(File(dbFile.path + REPLACED_SUFFIX + side))) error("move failed: ${from.name}")
                    moved += side
                }
            }
            // 2. Put the verified backup in place.
            if (!pending.renameTo(dbFile)) error("move failed: ${pending.name}")
            return Outcome.Applied
        } catch (e: Exception) {
            // 3. Roll back: the previous database must stay usable. Only files that THIS call moved are moved back;
            // the live database file is never deleted here.
            for (side in moved) {
                File(dbFile.path + REPLACED_SUFFIX + side).renameTo(File(dbFile.path + side))
            }
            return Outcome.Failed("ফাইল বদলানো যায়নি; আগের ডাটাবেস যেমন ছিল তেমনই আছে।")
        }
    }
}
