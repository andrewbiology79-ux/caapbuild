# Version notes — Phase 10–12 source candidate v1.65 rechecked

- Carries forward the v1.64 private image library/media operation pipeline, question deletion paths and Type_CQ in-topic filters.
- Restricts orphan collection to Type_CQ and Chapter_CQ media folders so other namespaces (including future Paper assets) are not swept.
- Limits recovery to image operation types and preserves active journal-owned files during reconciliation.
- Adds explicit confirmation before media deletion.
- Captures the Type_CQ/Chapter_CQ import scope at image-picker launch.
- Gates media actions until media recovery/reconciliation succeeds on library entry.
- Corrects the Type_CQ card deletion warning so filtered search results still clearly disclose that the full group is deleted.
- No APK is included. No build or test was run. Phase 9–12 remain PARTIAL / WRITTEN / UNVERIFIED.
- See `PROJECT_PLAN_v1_65_RECHECKED.txt`, `PHASE10_12_IMPLEMENTATION_STATUS_v1_65_RECHECKED.md` and `STATIC_RECHECK_REPORT_v1_65.txt`.
