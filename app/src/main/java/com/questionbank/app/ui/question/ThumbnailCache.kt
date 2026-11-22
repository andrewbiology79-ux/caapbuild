package com.questionbank.app.ui.question

import android.graphics.Bitmap
import android.util.LruCache
import kotlinx.coroutines.sync.Semaphore
import kotlinx.coroutines.sync.withPermit

/**
 * Process-wide cache of decoded thumbnails plus a limit on parallel decodes, so a list with many pictures
 * shows its text first and fills pictures in without choking the phone (the legacy app did the same:
 * cached URLs, at most three loads at a time).
 *
 * Keys include the file's modified time and length, so a rotated/cropped image (same image id, new bytes)
 * is never served from a stale entry. Cached bitmaps are never recycled: Compose may still be drawing them.
 */
internal object ThumbnailCache {
    private const val MAX_PARALLEL_DECODES = 3

    private val permits = Semaphore(MAX_PARALLEL_DECODES)

    private val cache = object : LruCache<String, Bitmap>(budgetBytes()) {
        override fun sizeOf(key: String, value: Bitmap): Int = value.allocationByteCount
    }

    fun get(key: String): Bitmap? = cache.get(key)

    fun put(key: String, bitmap: Bitmap) {
        cache.put(key, bitmap)
    }

    suspend fun <T> throttled(block: suspend () -> T): T = permits.withPermit { block() }

    private fun budgetBytes(): Int =
        (Runtime.getRuntime().maxMemory() / 16L).coerceIn(4L * 1024L * 1024L, 48L * 1024L * 1024L).toInt()
}
