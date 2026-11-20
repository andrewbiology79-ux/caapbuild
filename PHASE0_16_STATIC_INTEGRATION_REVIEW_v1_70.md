# Static Integration Review — v1.70

## Reviewed integration paths
- Navigation: Create → Paper Builder; Profile → Settings, Backup/Restore and Media Library.
- Container: single lazy `QuestionBankDatabase`, separate Type_CQ / Chapter_CQ repositories, PaperRepository, ImagePipeline and BackupService.
- Startup ordering: apply staged restore before Room opens; initialize container; reconcile automatic backup policy; schedule post-swap read-only inspection and startup media recovery. If recovery scheduling cannot be enqueued, app-scope fallback is attempted while media remains gated.
- Media: dedicated integrity checker, reference resolver and orphan collector; operation journal replay; `paper_media` ownership separated from question-scope cleanup.
- Paper: Type_CQ and Chapter_CQ sources remain scope-specific in the combined picker projection; snapshots store source text; image assets are copied; overrides/marks/order/validation/PDF use persisted paper snapshots and paper-owned images.
- Backup: recovery readiness precedes shared snapshot lock; DB snapshot and media archive happen under process-local lock; manifest and paths/hashes are validated; restore is staged and applied before Room opens.

## Lock ordering review
The v1.70 correction places `recoveryGate.await()` before `MediaSnapshotCoordinator` acquisition on every ImagePipeline mutation/export path. Startup recovery takes the coordinator lock and only completes the gate after recovery. This is source-level ordering review, not concurrency proof.

## Schema/version invariants
Canonical SQL and Room schema JSON unchanged from v1.68; DB version 1; Android versionCode 36 and versionName `0.2.31-phase5-wip2`.

## Remaining integration gaps
- WorkManager dependency/runtime and all workers unverified.
- Restore rollback and media snapshot coordination not fault tested; coordinator is process-local only.
- No full UI acceptance, talkback/keyboard audit, PDF visual review or large-dataset profile.
- Phase 16 regression and original 146-item audit absent.
- No release variant build, signing or APK/AAB.
