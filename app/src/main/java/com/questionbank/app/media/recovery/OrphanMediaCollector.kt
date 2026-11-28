package com.questionbank.app.media.recovery

import java.io.File

/**
 * Collects files only within an explicitly supplied question-scope managed directory.
 *
 * Safety rules (added after a real data-loss bug):
 *  - Paths are compared in canonical form on BOTH sides. On Android `context.filesDir` is usually
 *    `/data/user/0/<pkg>/files` while a canonical path is `/data/data/<pkg>/files`; comparing the two
 *    forms made every image look like an orphan.
 *  - Nothing is deleted. An unknown file is MOVED to [quarantineRoot] so it can be recovered; only
 *    quarantined files older than [QUARANTINE_MAX_AGE_MS] are removed by [purgeQuarantine].
 *  - If the database knows some files but not one file on disk matches, the whole pass is skipped
 *    (that pattern means the comparison is wrong, not that every file is an orphan).
 */
class OrphanMediaCollector {
    data class Result(val kept: Int, val quarantined: Int, val skippedAsSuspicious: Boolean)

    fun collect(
        managedRoot: File,
        filesRoot: File,
        knownRelativePaths: Set<String>,
        activeOperationImageIds: Set<String>,
        quarantineRoot: File = File(filesRoot.canonicalFile, "media/.quarantine"),
    ): Result {
        if (!managedRoot.exists()) return Result(0, 0, false)
        val canonicalFilesRoot = filesRoot.canonicalFile
        val canonicalManagedRoot = managedRoot.canonicalFile
        val filesPrefix = canonicalFilesRoot.path + File.separator

        var kept = 0
        val orphans = mutableListOf<Pair<File, String>>()
        canonicalManagedRoot.walkTopDown().filter { it.isFile }.toList().forEach { file ->
            val canonicalFile = file.canonicalFile
            // A file that resolves outside app-private storage is never touched.
            if (!canonicalFile.path.startsWith(filesPrefix)) return@forEach
            val relative = canonicalFile.relativeTo(canonicalFilesRoot).invariantSeparatorsPath
            val active = activeOperationImageIds.any { id -> file.name.startsWith("$id.") }
            if (relative in knownRelativePaths || active) kept++ else orphans += canonicalFile to relative
        }

        if (knownRelativePaths.isNotEmpty() && kept == 0 && orphans.isNotEmpty()) {
            return Result(kept = 0, quarantined = 0, skippedAsSuspicious = true)
        }

        var quarantined = 0
        val now = System.currentTimeMillis()
        orphans.forEach { (file, relative) ->
            if (moveToQuarantine(file, File(quarantineRoot, relative), now)) quarantined++
        }

        canonicalManagedRoot.walkBottomUp().filter { it.isDirectory && it != canonicalManagedRoot }.forEach { dir ->
            if (dir.list()?.isEmpty() == true) dir.delete()
        }
        return Result(kept, quarantined, false)
    }

    /** Removes quarantined files that have been there longer than [maxAgeMs]. Returns how many were removed. */
    fun purgeQuarantine(quarantineRoot: File, maxAgeMs: Long = QUARANTINE_MAX_AGE_MS, now: Long = System.currentTimeMillis()): Int {
        if (!quarantineRoot.exists()) return 0
        var removed = 0
        quarantineRoot.walkTopDown().filter { it.isFile }.toList().forEach { file ->
            if (now - file.lastModified() > maxAgeMs && file.delete()) removed++
        }
        quarantineRoot.walkBottomUp().filter { it.isDirectory && it != quarantineRoot }.forEach { dir ->
            if (dir.list()?.isEmpty() == true) dir.delete()
        }
        return removed
    }

    /** Pending files are private to image import/replacement; active journal entries keep their files. */
    fun collectPending(pendingRoot: File, activeOperationImageIds: Set<String>) {
        if (!pendingRoot.exists()) return
        pendingRoot.walkTopDown().filter { it.isFile }.forEach { file ->
            val active = activeOperationImageIds.any { id -> file.name.startsWith("$id.") }
            if (!active) file.delete()
        }
        pendingRoot.walkBottomUp().filter { it.isDirectory && it != pendingRoot }.forEach { dir ->
            if (dir.list()?.isEmpty() == true) dir.delete()
        }
    }

    private fun moveToQuarantine(source: File, wanted: File, now: Long): Boolean {
        return try {
            wanted.parentFile?.mkdirs()
            val target = if (wanted.exists()) File(wanted.parentFile, "${wanted.name}.$now") else wanted
            val moved = source.renameTo(target) || run {
                source.copyTo(target, overwrite = true)
                source.delete()
            }
            if (moved) target.setLastModified(now)
            moved
        } catch (_: Exception) {
            false
        }
    }

    companion object {
        const val QUARANTINE_MAX_AGE_MS = 30L * 24L * 60L * 60L * 1000L
    }
}
