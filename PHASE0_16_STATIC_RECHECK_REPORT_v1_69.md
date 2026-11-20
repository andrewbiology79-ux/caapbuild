# Static Recheck Report — v1.69

## Baseline and scope
The v1.68 archive was used as the source baseline. The v1.69 working tree was compared and inspected without running Gradle, compilers, tests or Android runtime.

## Source corrections in this pass
1. Paper item/section reorder DAO transactions now compare the complete current ID set against the requested reorder set before writing; item reorder is scoped to one section.
2. Paper Builder up/down buttons now enable based on position inside the current section, not the global paper list. A rejected reorder produces a status message.
3. Paper Repository exposes ordered `paper_item_images` links as well as copied image assets. Snapshot codec splits stimulus/question/solution rendering; the PDF source uses stored placement values and verifies paper-media path ownership and SHA-256 before drawing.
4. Backup waits for image recovery; timeout becomes a visible failed export result instead of an unhandled cancellation path.
5. Backup archive enumeration rejects symlinked managed roots and unsafe `.`/`..` path segments to reduce duplicate canonical path aliases.
6. Automatic backup preference writes report persistence failure rather than claiming the preference was applied.
7. If WorkManager cannot enqueue startup media recovery, Application starts a bounded-lifetime app-scope fallback; media operations remain gated until recovery succeeds.
8. Existing v1.68 RestoreSwap fail-closed rollback correction is retained.
9. Backup archive generation now flushes the ZIP and calls `FileDescriptor.sync()` before returning a completed archive.
10. Restore post-swap inspection worker omits a null expected-hash input rather than storing a null WorkManager Data value.

## Data and compatibility comparisons
- Canonical SQL `database/QuestionBank_SQLite_Schema_v1_1.sql`: byte-identical to v1.68.
- Room exported schema `app/schemas/com.questionbank.app.data.local.QuestionBankDatabase/1.json`: byte-identical to v1.68.
- `QuestionBankDatabase` version: 1, unchanged.
- App `versionCode`: 36, unchanged.
- App `versionName`: `0.2.31-phase5-wip2`, unchanged.
- App version metadata was intentionally not incremented by this source-only package.

## Navigation review
`AppNavHost` source contains PaperBuilderScreen in Create and BackupScreen/ProfileScreen/MediaLibrary routes in Profile. This is static wiring only.

## Known static limitations / unresolved
- WorkManager 2.12.0 dependency is explicitly UNCONFIRMED.
- Paper Builder preview dialog remains text-focused; PDF rendering and Bengali glyph output depend on Android typeface/viewer and are unverified.
- Paper empty sections may not render as standalone PDF section headings when they have no items.
- Snapshot migration beyond `schemaVersion=1` is not implemented.
- Automatic backups are private app storage, not off-device/cloud/encrypted backups.
- `RestoreWorker` performs a read-only post-swap inspection; the actual safe swap remains a cold-start Application operation before Room opens.
- `MediaSnapshotCoordinator` is process-local, not a cross-process lock.
- Phase 0 146-item matrix is missing. Phase 16 test and audit exit criteria are unmet.

## Verification boundary
Only source reading, project diff checks, schema/version comparisons and final ZIP integrity/checksum are allowed in this update. None of those are Android build, test or runtime evidence.
