# Backup & Restore Design — v1.70

## Archive format
Manual `.qbbak` ZIP contains `manifest.json`, `database/QuestionBank.db`, `media/type_cq`, `media/chapter_cq` and `paper_media`. Manifest includes format timestamp, app version/versionCode, DB version, Room identity hash, and SHA-256/byte length for the database and each managed media asset.

## Export
Wait for startup media recovery before acquiring `MediaSnapshotCoordinator`. Under that process-local lock, create a consistent database snapshot, enumerate media, create ZIP, reopen/extract and validate inventory/hash/database metadata, flush and sync the archive, then copy to the selected SAF URI and compare bytes.

## Restore
Prepare/extract/validate into private staging. User confirmation stages a restore; `QuestionBankApp` applies it at cold start before Room opens. The prior DB and media tree are retained for rollback. A failed incomplete rollback retains a recovery marker and fails closed. `RestoreWorker` performs read-only post-swap inspection; it does not perform the live swap.

## Automatic backup
Periodic WorkManager source writes app-private local archives with retention. These do not protect against uninstall, Clear data, phone loss or storage failure. Manual off-device SAF backup remains required.

## Constraints/open items
WorkManager 2.12.0 is unconfirmed. Coordinator is process-local. No encryption/cloud backup, multi-process coordination, data-transfer across devices, corruption injection or process-death restore acceptance is provided.
