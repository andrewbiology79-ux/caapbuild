package com.questionbank.app.data.backup

import java.io.File
import java.io.FileInputStream
import java.io.FileOutputStream
import java.security.MessageDigest
import java.util.zip.ZipEntry
import java.util.zip.ZipInputStream
import java.util.zip.ZipOutputStream
import org.json.JSONArray
import org.json.JSONObject

/** ZIP container for a consistent database snapshot plus every committed private image asset. */
internal object BackupArchive {
    private const val FORMAT_VERSION = 1
    private const val MAX_ENTRY_BYTES = 1_500L * 1024L * 1024L
    private const val MAX_TOTAL_BYTES = 4L * 1024L * 1024L * 1024L

    data class Extraction(
        val databaseFile: File,
        val mediaRoot: File,
        val mediaFileCount: Int,
        val isArchive: Boolean,
        val databaseVersion: Int,
        val identityHash: String,
    )

    private data class EntryRecord(val relativePath: String, val file: File, val bytes: Long, val hash: String)

    fun write(
        dbFile: File,
        filesDir: File,
        destination: File,
        appVersion: String,
        appVersionCode: Long,
        databaseVersion: Int,
        identityHash: String,
    ): Int {
        require(databaseVersion > 0 && identityHash.matches(Regex("[0-9a-f]{32}"))) { "Invalid database schema metadata" }
        require(dbFile.isFile) { "Database snapshot is missing" }
        val assets = mutableListOf<EntryRecord>()
        val filesRoot = filesDir.canonicalFile
        listOf("media/type_cq", "media/chapter_cq", "paper_media").forEach { relativeRoot ->
            val root = File(filesRoot, relativeRoot)
            if (!root.exists()) return@forEach
            val canonicalRoot = root.canonicalFile
            require(root.absoluteFile.path == canonicalRoot.path) { "Managed media root must not be a symlink" }
            require(canonicalRoot.path.startsWith(filesRoot.path + File.separator)) { "Media root escaped app-private storage" }
            canonicalRoot.walkTopDown().filter { it.isFile && it.extension.lowercase() in setOf("jpg", "jpeg", "png", "webp") }.forEach { file ->
                val canonicalFile = file.canonicalFile
                // Reject symlinks entirely: even an in-root alias would change the DB relative path on restore.
                require(file.absoluteFile.path == canonicalFile.path) { "Media symlink is not permitted in a backup source" }
                require(canonicalFile.path.startsWith(canonicalRoot.path + File.separator)) { "Media symlink escaped its managed root" }
                val relative = canonicalFile.relativeTo(filesRoot).invariantSeparatorsPath
                require(relative.startsWith("media/type_cq/") || relative.startsWith("media/chapter_cq/") || relative.startsWith("paper_media/"))
                require(canonicalFile.length() > 0L) { "Media asset is empty: $relative" }
                assets += EntryRecord(relative, canonicalFile, canonicalFile.length(), sha256(canonicalFile))
            }
        }
        require(assets.map { it.relativePath }.toSet().size == assets.size) { "Duplicate media paths were found" }
        val dbRecord = EntryRecord("database/QuestionBank.db", dbFile, dbFile.length(), sha256(dbFile))
        val manifest = JSONObject()
            .put("formatVersion", FORMAT_VERSION)
            .put("createdAt", System.currentTimeMillis())
            .put("applicationVersion", appVersion)
            .put("applicationVersionCode", appVersionCode)
            .put("databaseVersion", databaseVersion)
            .put("roomIdentityHash", identityHash)
            .put("database", JSONObject().put("path", dbRecord.relativePath).put("bytes", dbRecord.bytes).put("sha256", dbRecord.hash))
            .put("mediaFiles", JSONArray().apply {
                assets.forEach { put(JSONObject().put("path", it.relativePath).put("bytes", it.bytes).put("sha256", it.hash)) }
            })
        destination.parentFile?.mkdirs()
        val rawOutput = FileOutputStream(destination)
        val zip = ZipOutputStream(rawOutput.buffered())
        try {
            zip.putNextEntry(ZipEntry("manifest.json"))
            zip.write(manifest.toString().toByteArray(Charsets.UTF_8))
            zip.closeEntry()
            (listOf(dbRecord) + assets).forEach { row ->
                zip.putNextEntry(ZipEntry(row.relativePath))
                FileInputStream(row.file).use { it.copyTo(zip) }
                zip.closeEntry()
            }
            zip.finish()
            zip.flush()
            rawOutput.fd.sync()
        } finally {
            zip.close()
        }
        return assets.size
    }

    fun extract(archive: File, destination: File): Extraction {
        destination.deleteRecursively()
        require(destination.mkdirs() || destination.isDirectory) { "Restore staging directory could not be created" }
        val records = linkedMapOf<String, Pair<Long, String>>()
        val seen = mutableSetOf<String>()
        var totalBytes = 0L
        ZipInputStream(FileInputStream(archive).buffered()).use { zip ->
            while (true) {
                val entry = zip.nextEntry ?: break
                val name = entry.name
                require(!entry.isDirectory) { "Directory entries are not accepted" }
                require(isAllowedPath(name)) { "Archive contains a disallowed path" }
                require(seen.add(name)) { "Archive contains a duplicate path" }
                val output = File(destination, name).canonicalFile
                val root = destination.canonicalFile
                require(output.path.startsWith(root.path + File.separator)) { "Archive path escapes the staging directory" }
                output.parentFile?.mkdirs()
                var bytes = 0L
                val digest = MessageDigest.getInstance("SHA-256")
                FileOutputStream(output).use { out ->
                    val buffer = ByteArray(64 * 1024)
                    while (true) {
                        val count = zip.read(buffer)
                        if (count < 0) break
                        bytes += count
                        totalBytes += count
                        if (name == "manifest.json") {
                            require(bytes <= 8L * 1024L * 1024L) { "Backup manifest is unexpectedly large" }
                        }
                        require(bytes <= MAX_ENTRY_BYTES && totalBytes <= MAX_TOTAL_BYTES) { "Backup archive is larger than the restore safety limit" }
                        digest.update(buffer, 0, count)
                        out.write(buffer, 0, count)
                    }
                    out.fd.sync()
                }
                records[name] = bytes to digest.digest().hexLower()
                zip.closeEntry()
            }
        }
        val manifestFile = File(destination, "manifest.json")
        require(manifestFile.isFile && records.containsKey("manifest.json")) { "Backup manifest is missing" }
        require(manifestFile.length() <= 8L * 1024L * 1024L) { "Backup manifest is unexpectedly large" }
        val manifest = JSONObject(manifestFile.readText(Charsets.UTF_8))
        require(manifest.getInt("formatVersion") == FORMAT_VERSION) { "Unsupported backup format version" }
        val databaseVersion = manifest.getInt("databaseVersion")
        require(databaseVersion > 0) { "Invalid database version in manifest" }
        val identityHash = manifest.getString("roomIdentityHash")
        require(identityHash.matches(Regex("[0-9a-f]{32}"))) { "Invalid Room identity hash in manifest" }
        val db = manifest.getJSONObject("database")
        val dbPath = db.getString("path")
        require(dbPath == "database/QuestionBank.db") { "Invalid database path in manifest" }
        val expectedDb = db.getLong("bytes") to db.getString("sha256")
        require(records[dbPath] == expectedDb) { "Database hash or length does not match the manifest" }

        val expectedAssets = linkedMapOf<String, Pair<Long, String>>()
        val array = manifest.getJSONArray("mediaFiles")
        for (index in 0 until array.length()) {
            val item = array.getJSONObject(index)
            val path = item.getString("path")
            require(isMediaPath(path)) { "Manifest contains an invalid media path" }
            require(expectedAssets.put(path, item.getLong("bytes") to item.getString("sha256")) == null) { "Duplicate media entry in manifest" }
        }
        require(records.filterKeys { isMediaPath(it) } == expectedAssets) { "Media files do not match the manifest" }
        require(records.keys == (setOf("manifest.json", dbPath) + expectedAssets.keys)) { "Archive has unlisted content" }

        val mediaRoot = File(destination, "restore-media").apply { mkdirs() }
        listOf("media/type_cq", "media/chapter_cq", "paper_media").forEach { relative ->
            File(mediaRoot, relative).mkdirs()
        }
        expectedAssets.keys.forEach { relative ->
            val source = File(destination, relative)
            val target = File(mediaRoot, relative)
            target.parentFile?.mkdirs()
            source.copyTo(target, overwrite = true)
        }
        val databaseFile = File(destination, dbPath)
        require(databaseFile.isFile) { "Backup database is missing" }
        return Extraction(databaseFile, mediaRoot, expectedAssets.size, true, databaseVersion, identityHash)
    }

    private fun isAllowedPath(path: String): Boolean =
        path == "manifest.json" || path == "database/QuestionBank.db" || isMediaPath(path)

    private fun isMediaPath(path: String): Boolean =
        !path.contains('\\') && !path.startsWith('/') && !path.split('/').any { it == ".." || it == "." || it.isBlank() } &&
            (path.startsWith("media/type_cq/") || path.startsWith("media/chapter_cq/") || path.startsWith("paper_media/"))

    private fun sha256(file: File): String = FileInputStream(file).use { input ->
        val digest = MessageDigest.getInstance("SHA-256")
        val buffer = ByteArray(64 * 1024)
        while (true) {
            val n = input.read(buffer)
            if (n < 0) break
            digest.update(buffer, 0, n)
        }
        digest.digest().hexLower()
    }

    private fun ByteArray.hexLower(): String = joinToString("") { "%02x".format(it) }
}
