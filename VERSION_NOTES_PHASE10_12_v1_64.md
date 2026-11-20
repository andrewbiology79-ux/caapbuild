# Version notes — Phase 10–12 source candidate v1.64

- Adds `ImagePipeline` for private media import, SHA-256 verification, journalled transform/delete, recovery and reconciliation.
- Adds Profile > media library with Type_CQ/Chapter_CQ scope, picker, preview, fixed crop, rotation, export and delete.
- Adds Type_CQ question-group delete and Chapter_CQ single-question delete flows.
- Adds category, rating and question-type filters to Type_CQ in-topic search alongside board/year filtering.
- Preserves the existing one-database / canonical schema boundary; no schema or app version metadata change.
- Does not include an APK and does not claim a successful build.
- By owner instruction, no Gradle build, Kotlin/KSP/Room compile, test, emulator run or device run was performed.
- Phase 10, 11 and 12 remain PARTIAL / WRITTEN / UNVERIFIED. Phase 9 remains PARTIAL / WRITTEN / UNVERIFIED.
- See `PROJECT_PLAN_v1_64_UPDATED.txt` and `PHASE10_12_IMPLEMENTATION_STATUS_v1_64.md`.
