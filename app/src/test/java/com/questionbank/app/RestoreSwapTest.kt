package com.questionbank.app

import com.questionbank.app.data.backup.BackupNames
import com.questionbank.app.data.backup.DbCounts
import com.questionbank.app.data.backup.InspectResult
import com.questionbank.app.data.backup.RestoreSwap
import java.io.File
import java.util.TimeZone
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test
import org.junit.rules.TemporaryFolder

class RestoreSwapTest {
    @get:Rule
    val folder = TemporaryFolder()

    private val good = InspectResult(true, null, "hash", DbCounts(1, 1, 1, 1, 1))
    private val bad = InspectResult.bad("broken")

    private fun db(): File = File(folder.root, "QuestionBank.db")
    private fun put(file: File, text: String) = file.writeText(text)

    @Test
    fun nothingPendingChangesNothing() {
        put(db(), "old")
        val outcome = RestoreSwap.applyIfPending(db()) { good }
        assertEquals(RestoreSwap.Outcome.NothingPending, outcome)
        assertEquals("old", db().readText())
    }

    @Test
    fun appliedSwapKeepsThePreviousDatabaseWithItsWalFile() {
        put(db(), "old")
        put(File(db().path + "-wal"), "old-wal")
        put(RestoreSwap.pendingFile(db()), "new")

        val outcome = RestoreSwap.applyIfPending(db()) { good }

        assertEquals(RestoreSwap.Outcome.Applied, outcome)
        assertEquals("new", db().readText())
        assertFalse(RestoreSwap.pendingFile(db()).exists())
        assertEquals("old", File(db().path + ".replaced").readText())
        assertEquals("old-wal", File(db().path + ".replaced-wal").readText())
        assertFalse(File(db().path + "-wal").exists())
    }

    @Test
    fun rejectedBackupLeavesTheDatabaseUntouchedAndRemovesThePendingFile() {
        put(db(), "old")
        put(RestoreSwap.pendingFile(db()), "garbage")

        val outcome = RestoreSwap.applyIfPending(db()) { bad }

        assertTrue(outcome is RestoreSwap.Outcome.Rejected)
        assertEquals("old", db().readText())
        assertFalse(RestoreSwap.pendingFile(db()).exists())
        assertFalse(File(db().path + ".replaced").exists())
    }

    @Test
    fun worksWhenNoDatabaseExistedYet() {
        put(RestoreSwap.pendingFile(db()), "new")
        assertEquals(RestoreSwap.Outcome.Applied, RestoreSwap.applyIfPending(db()) { good })
        assertEquals("new", db().readText())
    }

    @Test
    fun secondRestoreReplacesTheOlderSafetyCopy() {
        put(db(), "v1")
        put(RestoreSwap.pendingFile(db()), "v2")
        RestoreSwap.applyIfPending(db()) { good }
        put(RestoreSwap.pendingFile(db()), "v3")
        RestoreSwap.applyIfPending(db()) { good }

        assertEquals("v3", db().readText())
        assertEquals("v2", File(db().path + ".replaced").readText())
    }

    @Test
    fun failureHalfWayKeepsTheCurrentDatabase() {
        put(db(), "old")
        put(RestoreSwap.pendingFile(db()), "new")
        // A non-empty directory where the safety copy must go makes the first move fail.
        val blocker = File(db().path + ".replaced")
        blocker.mkdirs()
        File(blocker, "x").writeText("x")

        val outcome = RestoreSwap.applyIfPending(db()) { good }

        assertTrue(outcome is RestoreSwap.Outcome.Failed)
        assertEquals("old", db().readText())
    }

    @Test
    fun backupFileNameIsSortableAndUsesTheGivenZone() {
        val zone = TimeZone.getTimeZone("Asia/Dhaka")
        // 2026-11-18 15:30 UTC = 21:30 in Dhaka (UTC+6)
        val millis = 1_795_015_800_000L
        assertEquals("QuestionBank-backup-20261118-2130.qbbak", BackupNames.fileName(millis, zone))
        assertEquals("18/11/2026 21:30", BackupNames.display(millis, zone))
    }
}
