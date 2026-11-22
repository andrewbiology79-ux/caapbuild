package com.questionbank.app

import com.questionbank.app.media.recovery.OrphanMediaCollector
import java.io.File
import java.nio.file.Files
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test
import org.junit.rules.TemporaryFolder

/**
 * Regression: stored images vanished after the app restarted. The collector compared a canonical managed root
 * with a non-canonical filesDir (on Android /data/user/0/... is a symlink to /data/data/...), so every image
 * looked like an orphan and was deleted. These tests rebuild that situation with a symlink.
 */
class OrphanMediaCollectorTest {
    @get:Rule
    val temp = TemporaryFolder()

    private val collector = OrphanMediaCollector()

    private fun image(filesDir: File, relative: String, bytes: Int = 4): File =
        File(filesDir, relative).apply { parentFile!!.mkdirs(); writeBytes(ByteArray(bytes) { 1 }) }

    @Test
    fun knownImageSurvivesWhenFilesDirIsReachedThroughASymlink() {
        val real = temp.newFolder("real")
        val filesDir = File(real, "files").apply { mkdirs() }
        val kept = image(filesDir, "media/type_cq/img_a.jpg")
        val link = File(temp.root, "link")
        Files.createSymbolicLink(link.toPath(), real.toPath())
        val nonCanonicalFilesDir = File(link, "files")
        val managedRoot = File(nonCanonicalFilesDir, "media/type_cq").canonicalFile

        val result = collector.collect(managedRoot, nonCanonicalFilesDir, setOf("media/type_cq/img_a.jpg"), emptySet())

        assertTrue("known image must still exist", kept.isFile)
        assertEquals(1, result.kept)
        assertEquals(0, result.quarantined)
        assertFalse(result.skippedAsSuspicious)
    }

    @Test
    fun unknownFileIsMovedToQuarantineNotDeleted() {
        val filesDir = temp.newFolder("files")
        image(filesDir, "media/type_cq/img_known.jpg")
        val stray = image(filesDir, "media/type_cq/img_stray.jpg", bytes = 9)
        val managedRoot = File(filesDir, "media/type_cq")

        val result = collector.collect(managedRoot, filesDir, setOf("media/type_cq/img_known.jpg"), emptySet())

        assertFalse(stray.exists())
        val quarantined = File(filesDir, "media/.quarantine/media/type_cq/img_stray.jpg")
        assertTrue("stray file must be recoverable from quarantine", quarantined.isFile)
        assertEquals(9L, quarantined.length())
        assertEquals(1, result.quarantined)
        assertEquals(1, result.kept)
    }

    @Test
    fun filesOfActiveOperationsAreKept() {
        val filesDir = temp.newFolder("files")
        val pendingImport = image(filesDir, "media/type_cq/img_busy.jpg")
        image(filesDir, "media/type_cq/img_known.jpg")
        val managedRoot = File(filesDir, "media/type_cq")

        val result = collector.collect(managedRoot, filesDir, setOf("media/type_cq/img_known.jpg"), setOf("img_busy"))

        assertTrue(pendingImport.isFile)
        assertEquals(0, result.quarantined)
    }

    @Test
    fun passIsSkippedWhenDatabaseKnowsFilesButNoneOnDiskMatch() {
        val filesDir = temp.newFolder("files")
        val a = image(filesDir, "media/type_cq/img_a.jpg")
        val b = image(filesDir, "media/type_cq/img_b.jpg")
        val managedRoot = File(filesDir, "media/type_cq")

        val result = collector.collect(managedRoot, filesDir, setOf("media/type_cq/img_other.jpg"), emptySet())

        assertTrue(result.skippedAsSuspicious)
        assertEquals(0, result.quarantined)
        assertTrue(a.isFile && b.isFile)
    }

    @Test
    fun missingManagedRootIsANoOp() {
        val filesDir = temp.newFolder("files")
        val result = collector.collect(File(filesDir, "media/type_cq"), filesDir, emptySet(), emptySet())
        assertEquals(0, result.kept + result.quarantined)
        assertFalse(result.skippedAsSuspicious)
    }

    @Test
    fun purgeRemovesOnlyOldQuarantinedFiles() {
        val quarantine = temp.newFolder("quarantine")
        val old = image(quarantine, "media/type_cq/old.jpg")
        val fresh = image(quarantine, "media/type_cq/fresh.jpg")
        val now = 100L * 24L * 60L * 60L * 1000L
        old.setLastModified(now - OrphanMediaCollector.QUARANTINE_MAX_AGE_MS - 60_000L)
        fresh.setLastModified(now - 60_000L)

        val removed = collector.purgeQuarantine(quarantine, OrphanMediaCollector.QUARANTINE_MAX_AGE_MS, now)

        assertEquals(1, removed)
        assertFalse(old.exists())
        assertTrue(fresh.isFile)
    }
}
