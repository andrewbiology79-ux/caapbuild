# Image Lifecycle Design — v1.70

## Storage decisions
- New question-scope imports/transforms: JPEG, maximum edge 2048 px, quality 88. Export: PNG.
- Existing readable JPEG/PNG/WebP remain supported.
- Question image roots: `media/type_cq` and `media/chapter_cq`; temporary import staging: `media/.pending`.
- Paper-owned copied assets: `paper_media`; never pass this root to question-scope orphan cleanup.

## Responsibilities
- `ImageIntegrityChecker`: compare expected hash/status.
- `ImageReferenceResolver`: resolve use counts and safe delete checks across the owning scope.
- `OrphanMediaCollector`: collect only known managed question roots/pending files.
- `ImageRecoveryWorker`/`ImagePipeline.runStartupRecovery`: replay operation journal and reconcile media before normal mutation.

## Lock order
Every media mutation/export awaits `recoveryGate` before acquiring `MediaSnapshotCoordinator`. Startup recovery obtains the coordinator, repairs journal/files, then completes the gate. No mutation may wait on the gate while holding the coordinator lock.

## Paper ownership
Paper assets are copied, hashed and represented by paper image metadata/placement rows. Untracked `paper_media` files use a 24-hour grace period before cleanup to cover the file-copy/Room-row commit window.

## Remaining
Camera capture/interactive crop, all image replacement retention and failure paths, process-death and concurrency acceptance, multi-process exclusion and full memory/performance review remain unverified/open.
