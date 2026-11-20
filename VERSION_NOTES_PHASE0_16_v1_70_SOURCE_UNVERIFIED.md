# Version Notes — v1.70 (Phase 0–16 source-only candidate)

**Package:** `QuestionBank_PHASE0_16_v1_70_SOURCE_UNVERIFIED.zip`
**Base:** v1.68 rechecked source + v1.69 coordinated Phase 0–16 source/docs

## v1.70 source corrections
- Changed ImagePipeline lock ordering so every media mutation/export awaits startup recovery before entering the process-wide media snapshot mutex; this removes a statically identified lock-order deadlock cycle.
- Paper total/item marks now reject NaN, infinity and negative values; paper validation reports non-finite values.
- Preserved the one-database schema, Room schema export, database version and Android app version metadata.

## Included from v1.69 source update
- Paper category library, cross-scope keyset picker, versioned snapshots, per-item overrides, marks, validation, paper-owned media, thumbnails and PDF export source.
- Media-inclusive backup ZIP, manifest hashes, staged restore, rollback guard, app-private periodic backup and recovery workers.
- Settings/high contrast preferences and static navigation/container wiring.
- Project requirements, ADR, screen inventory, feature traceability, risk register and handover drafts.

## Explicitly not done
- No Gradle build/compile/KSP/Room generation.
- No tests of any kind, emulator, device or manual UI verification.
- No APK/AAB, signing, release assembly or installation.

## Status
Phases 0–15: source/docs advanced, mixed PARTIAL/UNVERIFIED. Phase 16: static source review only, NOT COMPLETED. Phase 17: NOT STARTED.
