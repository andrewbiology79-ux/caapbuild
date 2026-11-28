# Developer Handover — Draft v1.69 (Not a Release)

## Package
`QuestionBank_PHASE0_16_v1_69_SOURCE_UNVERIFIED.zip`

## State
Source/documentation candidate. Phase 17 is intentionally not started. No APK/AAB is included.

## Start here
1. Read `PROJECT_PLAN_v1_69_PHASE0_16_SOURCE_UNVERIFIED.txt`.
2. Read `docs/Architecture_Decision_Records.md` and `docs/Dependency_Version_Freeze.md`.
3. Read `docs/PHASE0_16_IMPLEMENTATION_STATUS_v1_69_SOURCE_UNVERIFIED.md` and `docs/PHASE0_16_STATIC_RECHECK_REPORT_v1_69.md`.
4. Review `docs/No_Test_Execution_Declaration_v1_69.md` and the risk register before making changes.

## Key boundaries
- One SQLite database, canonical SQL/Room schema unchanged (DB version 1).
- Type_CQ and Chapter_CQ remain separate domain slices.
- New imports/transforms use JPEG max edge 2048 px quality 88; PNG export; legacy formats remain readable.
- Paper snapshots own copied `paper_media` assets; question cleanup must never delete them.
- Backup ZIP covers DB plus the three managed media namespaces; automatic backups are app-private only.
- WorkManager 2.12.0 is unconfirmed until dependency resolution/build is authorized.

## Known blockers / non-claims
- No 146-item matrix was supplied, so exact behavior traceability is not closed.
- Phases 0–15 have mixed partial/source-only status; Phase 16 regression is not complete.
- WorkManager, PDF rendering, DB/media restore, migration, accessibility and performance are unverified.
- Phase 17 signing, release build, installation/upgrade, user-facing release documentation and APK/AAB are not prepared.

## Safety note
Do not distribute or install this package as a release. Keep the prior data backup before any future restore or destructive test. No build or test result is implied by this handover.
