# Risk Register — v1.70 source candidate

| ID | Risk | Severity | Current mitigation/source state | Remaining evidence/action |
|---|---|---:|---|---|
| R-01 | Missing original 146-item Editor matrix | Critical | Phase-level traceability document added; no invented requirements | Owner must provide matrix; map exact 146 items. |
| R-02 | Latest Kotlin/Compose/WorkManager source may not compile | Critical | Static inspection only; dependency freeze preserves WorkManager 2.12.0 as UNCONFIRMED | Build/compile authorization required. |
| R-03 | Restore swap can fail under filesystem faults/process death | Critical | v1.68 fail-closed rollback with marker and retained old DB/media; v1.70 preserves it | Fault injection and device/process-death testing prohibited/not run. |
| R-04 | Backup archive may omit/mismatch media under concurrent writes | High | Process-local snapshot lock, recovery gate, manifest inventory, SHA-256 and archive self-validation | External process/file mutation and runtime concurrency remain untested. |
| R-05 | WorkManager startup scheduling/retention compatibility | High | Unique workers, private retention, startup fallback source | Dependency/runtime/Doze/storage conditions unverified. |
| R-06 | Private automatic backups disappear on uninstall/Clear data/device loss | High | UI warns; manual SAF off-device export remains | Owner must maintain off-device copy; no cloud sync. |
| R-07 | Paper snapshots become unreadable after future app update | High | Versioned snapshot v1 and validation codec | Migration codec/path beyond v1 not implemented. |
| R-08 | Paper PDF differs by device font/viewer/page layout | High | Snapshot-based PDF, SHA-verified paper images and stored placement | Bengali font embedding and viewer/device rendering unverified. |
| R-09 | Large question datasets may slow source search and paper picker | High | SQL keyset paging for Paper Builder | Query profiling, indexes and large dataset acceptance not run. |
| R-10 | Chapter_CQ editor/management parity is incomplete | High | Existing scope-specific source preserved | Multi-block group editing, cut/paste and list paging remain open. |
| R-11 | Accessibility controls may not satisfy assistive tech | Medium | Text scale, theme, high contrast, Material labels and selected semantics | TalkBack, keyboard/focus, target size and responsive audits absent. |
| R-12 | App-private media/restore has no cross-process lock | Medium | Process-local coordinator prevents in-process media/snapshot races | Cross-process/external editor coordination remains open. |
| R-13 | Migration chain is not complete | High | v1.70 introduces no schema delta | Future schema migration objects/fixtures/tests needed. |
| R-14 | Phase 16 exit criteria not met | Critical | Source wiring and static integration report prepared | Required tests and 146-item audit not run; status remains NOT COMPLETED. |
| R-15 | Recovery gate and media snapshot lock can deadlock if acquired in the wrong order | Critical | v1.70 awaits recovery before taking the process mutex; startup recovery owns the mutex until gate completion | Static lock-order review only; no concurrency or process-death test. |
| R-16 | Non-finite paper marks can invalidate totals/validation | Medium | v1.70 rejects NaN/infinity/negative values at repository write and validation boundaries | No DB CHECK was added; no repository/database test was run. |

No risk is closed solely because source changes were made. Severity reflects potential data loss or inability to use critical project workflows.
