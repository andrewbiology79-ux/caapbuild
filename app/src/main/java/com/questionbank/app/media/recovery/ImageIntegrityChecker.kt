package com.questionbank.app.media.recovery

import java.io.File
import java.io.FileInputStream
import java.security.MessageDigest

/** File-level integrity check shared by normal reads and the recovery pass. */
class ImageIntegrityChecker {
    enum class Status { READY, MISSING, CORRUPT }

    fun check(file: File, expectedSha256: String): Status = when {
        !file.isFile -> Status.MISSING
        sha256(file) != expectedSha256 -> Status.CORRUPT
        else -> Status.READY
    }

    fun sha256(file: File): String {
        val digest = MessageDigest.getInstance("SHA-256")
        FileInputStream(file).use { input ->
            val buffer = ByteArray(64 * 1024)
            while (true) {
                val count = input.read(buffer)
                if (count < 0) break
                digest.update(buffer, 0, count)
            }
        }
        return digest.digest().joinToString("") { "%02x".format(it) }
    }
}
