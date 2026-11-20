package com.questionbank.app.media.recovery

import java.io.File

/** Collects files only within an explicitly supplied question-scope managed directory. */
class OrphanMediaCollector {
    fun collect(managedRoot: File, filesRoot: File, knownRelativePaths: Set<String>, activeOperationImageIds: Set<String>) {
        if (!managedRoot.exists()) return
        managedRoot.walkTopDown().filter { it.isFile }.forEach { file ->
            val relative = file.relativeTo(filesRoot).invariantSeparatorsPath
            val active = activeOperationImageIds.any { id -> file.name.startsWith("$id.") }
            if (relative !in knownRelativePaths && !active) file.delete()
        }
        managedRoot.walkBottomUp().filter { it.isDirectory && it != managedRoot }.forEach { dir ->
            if (dir.list()?.isEmpty() == true) dir.delete()
        }
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
}
