package com.questionbank.app.data.backup

import java.io.File
import java.io.FileOutputStream

/**
 * Startup-only restore swap. The database and media trees are staged before the app exits, then installed together
 * before Room can open. The old database/media trees are retained as .replaced files for recovery.
 *
 * Recovery is deliberately fail-closed: if any preserved old path cannot be restored, the marker is retained and the
 * caller must not open Room. A later process start can retry recovery without discarding the only old copy.
 */
object RestoreSwap {
    const val PENDING_SUFFIX = ".restore-pending"
    const val REPLACED_SUFFIX = ".replaced"
    const val MEDIA_PENDING_DIR = ".media-restore-pending"
    private const val MARKER = ".restore-in-progress"
    private val SIDES = listOf("", "-wal", "-shm")
    private val MOVE_ORDER = listOf("-wal", "-shm", "")

    sealed interface Outcome {
        data object NothingPending : Outcome
        data object Applied : Outcome
        data class Rejected(val why: String) : Outcome
        data class Failed(val why: String, val recoveryRequired: Boolean = false) : Outcome
    }

    fun pendingFile(dbFile: File) = File(dbFile.path + PENDING_SUFFIX)

    /** Legacy DB-only entry point retained for source compatibility. */
    fun applyIfPending(dbFile: File, inspect: (File) -> InspectResult): Outcome =
        applyIfPending(dbFile, dbFile.parentFile ?: File("."), inspect)

    fun applyIfPending(dbFile: File, filesDir: File, inspect: (File) -> InspectResult): Outcome {
        if (!recoverInterrupted(dbFile, filesDir)) {
            return Outcome.Failed(
                "আগের রিস্টোরের rollback সম্পূর্ণ হয়নি। পুরোনো ডাটা নিরাপত্তার জন্য সংরক্ষিত আছে; ডাটাবেস খোলা বন্ধ রাখা হয়েছে।",
                recoveryRequired = true,
            )
        }

        val pending = pendingFile(dbFile)
        if (!pending.exists()) {
            // A process may have died after extracting media but before the database stage was committed.
            val staged = File(filesDir, MEDIA_PENDING_DIR)
            if (staged.exists() && !staged.deleteRecursively()) {
                return Outcome.Failed("অসম্পূর্ণ media staging পরিষ্কার করা যায়নি।", recoveryRequired = false)
            }
            return Outcome.NothingPending
        }

        val check = inspect(pending)
        if (!check.ok) {
            deleteIfExists(pending)
            BackupInspector.deleteSidecars(pending)
            val staged = File(filesDir, MEDIA_PENDING_DIR)
            if (staged.exists() && !staged.deleteRecursively()) {
                return Outcome.Failed("ব্যাকআপ বাতিল হয়েছে, তবে অসম্পূর্ণ media staging পরিষ্কার করা যায়নি।")
            }
            return Outcome.Rejected(check.problem ?: "ব্যাকআপ ফাইলটি ঠিক নয়।")
        }

        val stagedMedia = File(filesDir, MEDIA_PENDING_DIR)
        val replaceMedia = stagedMedia.isDirectory
        val liveMedia = File(filesDir, "media")
        val livePaperMedia = File(filesDir, "paper_media")
        val replacedMedia = File(filesDir, "media$REPLACED_SUFFIX")
        val replacedPaperMedia = File(filesDir, "paper_media$REPLACED_SUFFIX")
        val marker = File(filesDir, MARKER)

        return try {
            if (replaceMedia) {
                require(File(stagedMedia, "media/type_cq").isDirectory &&
                    File(stagedMedia, "media/chapter_cq").isDirectory &&
                    File(stagedMedia, "paper_media").isDirectory) { "রিস্টোরের media staging অসম্পূর্ণ" }
            }

            // A previous successful restore may have left one retained safety copy. Remove it only if removal succeeds.
            SIDES.forEach { side -> deleteIfExists(File(dbFile.path + REPLACED_SUFFIX + side)) }
            deleteDirectoryIfExists(replacedMedia)
            deleteDirectoryIfExists(replacedPaperMedia)

            // Publish and fsync the marker before moving any live path.
            FileOutputStream(marker).use { output ->
                output.write("restore-started-v2".toByteArray(Charsets.UTF_8))
                output.fd.sync()
            }

            if (replaceMedia) {
                // Preserve even an originally empty namespace so rollback can restore its prior existence.
                check(liveMedia.mkdirs() || liveMedia.isDirectory) { "পুরোনো media directory প্রস্তুত করা যায়নি" }
                check(livePaperMedia.mkdirs() || livePaperMedia.isDirectory) { "পুরোনো paper media directory প্রস্তুত করা যায়নি" }
                check(liveMedia.renameTo(replacedMedia)) { "পুরোনো media সংরক্ষণ করা যায়নি" }
                check(livePaperMedia.renameTo(replacedPaperMedia)) { "পুরোনো paper media সংরক্ষণ করা যায়নি" }
                check(File(stagedMedia, "media").renameTo(liveMedia)) { "নতুন media বসানো যায়নি" }
                check(File(stagedMedia, "paper_media").renameTo(livePaperMedia)) { "নতুন paper media বসানো যায়নি" }
            }

            // Move WAL/SHM before the main database. A crash at any point leaves each moved sidecar identifiable.
            for (side in MOVE_ORDER) {
                val from = File(dbFile.path + side)
                if (from.exists()) {
                    check(from.renameTo(File(dbFile.path + REPLACED_SUFFIX + side))) { "পুরোনো database সরানো যায়নি: ${from.name}" }
                }
            }
            check(pending.renameTo(dbFile)) { "নতুন database বসানো যায়নি" }
            if (stagedMedia.exists()) check(stagedMedia.deleteRecursively()) { "Media staging পরিষ্কার করা যায়নি" }
            deleteIfExists(marker)
            Outcome.Applied
        } catch (e: Exception) {
            val recovered = recoverInterrupted(dbFile, filesDir)
            Outcome.Failed(
                "রিস্টোরের ফাইল বদলানো যায়নি। ${if (recovered) "আগের ডাটা ফিরিয়ে আনা হয়েছে।" else "পুরোনো ডাটা সংরক্ষিত আছে; rollback সম্পূর্ণ হয়নি, তাই database খোলা বন্ধ রাখতে হবে।"} ${e.message ?: ""}",
                recoveryRequired = !recovered,
            )
        }
    }

    /**
     * Replays a partially completed swap using the existence of .replaced paths as the journal.
     * A failed rename/delete keeps the marker and all remaining safety copies for the next startup.
     */
    private fun recoverInterrupted(dbFile: File, filesDir: File): Boolean {
        val marker = File(filesDir, MARKER)
        if (!marker.exists()) return true

        return try {
            // Restore the main database only when its preserved old copy exists.
            val replacedDb = File(dbFile.path + REPLACED_SUFFIX)
            if (replacedDb.exists()) {
                deleteIfExists(dbFile)
                check(replacedDb.renameTo(dbFile)) { "পুরোনো database ফেরত আনা যায়নি" }
            }

            // Restore only sidecars that were actually moved. This also handles a crash between sidecar moves.
            SIDES.filter { it.isNotEmpty() }.forEach { side ->
                val old = File(dbFile.path + REPLACED_SUFFIX + side)
                if (old.exists()) {
                    val live = File(dbFile.path + side)
                    deleteIfExists(live)
                    check(old.renameTo(live)) { "পুরোনো database sidecar ফেরত আনা যায়নি: ${old.name}" }
                }
            }

            restoreDirectory(File(filesDir, "media"), File(filesDir, "media$REPLACED_SUFFIX"))
            restoreDirectory(File(filesDir, "paper_media"), File(filesDir, "paper_media$REPLACED_SUFFIX"))

            deleteIfExists(pendingFile(dbFile))
            BackupInspector.deleteSidecars(pendingFile(dbFile))
            val stagedMedia = File(filesDir, MEDIA_PENDING_DIR)
            if (stagedMedia.exists()) check(stagedMedia.deleteRecursively()) { "অসম্পূর্ণ media staging পরিষ্কার করা যায়নি" }
            deleteIfExists(marker)
            true
        } catch (_: Exception) {
            false
        }
    }

    private fun restoreDirectory(live: File, replaced: File) {
        if (!replaced.exists()) return
        if (live.exists()) check(live.deleteRecursively()) { "বর্তমান ${live.name} directory সরানো যায়নি" }
        check(replaced.renameTo(live)) { "পুরোনো ${live.name} directory ফেরত আনা যায়নি" }
    }

    private fun deleteIfExists(file: File) {
        if (file.exists()) check(file.delete()) { "ফাইল মুছে ফেলা যায়নি: ${file.name}" }
    }

    private fun deleteDirectoryIfExists(directory: File) {
        if (directory.exists()) check(directory.deleteRecursively()) { "Directory মুছে ফেলা যায়নি: ${directory.name}" }
    }
}
