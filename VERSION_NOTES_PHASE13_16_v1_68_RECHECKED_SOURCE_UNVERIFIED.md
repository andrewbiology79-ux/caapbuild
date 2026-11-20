# Version Notes — QuestionBank Phase 13–16 v1.67 Source Candidate

- Base: `QuestionBank_PHASE10_12_v1_66_SOURCE_UNVERIFIED.zip`
- New package: `QuestionBank_PHASE13_16_v1_67_SOURCE_UNVERIFIED.zip`
- Plan: `PROJECT_PLAN_v1_67_PHASE13_16_SOURCE_UNVERIFIED.txt`
- Status: `PHASE13_16_IMPLEMENTATION_STATUS_v1_67_SOURCE_UNVERIFIED.md`
- Review: `PHASE13_16_STATIC_INTEGRATION_REVIEW_v1_67.md`

### Source changes

- Paper Builder UI and immutable schema-versioned snapshots from both question scopes.
- Paper media copy ownership under `paper_media`, item order/marks/removal, validation and preview.
- `.qbbak` manual ZIP backup including database and question/paper media, manifest size/hash inventory, DB version and Room identity hash.
- Restore staging and startup DB/media swap with rollback marker; old raw `.db` input remains supported.
- JPEG 2048 px / quality 88 policy and PNG export decision; separate image integrity/reference/orphan helpers and WorkManager startup recovery.
- Profile settings for default editor mode and search highlighting; cascading Subject → Chapter → Topic global search filters remain integrated.
- Phase 13–16 plan/ADR/status documents updated.

### Intentionally not verified

No Gradle build or compilation, test, emulator/device validation, APK assembly or release build was run. Phase 13–15 are SOURCE UPDATED / PARTIAL / UNVERIFIED. Phase 16 is SOURCE INTEGRATION REVIEW ONLY / TESTS NOT RUN / NOT COMPLETE. Phase 17 is NOT STARTED.

### Preserved metadata

Database schema version 1, Room identity hash `786b471dfa14c9ae4739bb81479bab25`, versionCode 36 and versionName `0.2.31-phase5-wip2` remain unchanged by intent. No DB schema/migration change is included.


## v1.68 careful recheck hotfix (source-only)
- Corrected RestoreSwap rollback handling: sidecars moved first, rollback operations checked, recovery marker retained on incomplete rollback, and startup fails closed rather than opening Room during incomplete recovery.
- No canonical SQL, Room schema, database version, app versionCode or versionName change.
- Remaining high-priority gap: backup media snapshot does not yet share one lock with every image mutation and the finished archive is not self-validated before export reports success.
- BackupWorker/RestoreWorker and automatic backup policy remain unimplemented.
- No build, compile, test, APK assembly, emulator or device run.
