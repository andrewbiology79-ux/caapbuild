# Feature Traceability Status — v1.70

**Important:** The plan refers to a 146-item numbered Editor behavior / Feature-to-Schema Audit Matrix, but that original matrix was not present in the supplied project archive or files available for this update. The table below is phase-level traceability only. It does not recreate or invent the missing 146 numbered requirements.

| Project area | Source entry points | Current source status | Verification / open evidence |
|---|---|---|---|
| Database & schema | `database/QuestionBank_SQLite_Schema_v1_1.sql`, `QuestionBankDatabase`, `app/schemas/.../1.json` | Unchanged from v1.68 | Byte-for-byte static comparison only; no new Room build/parity run. |
| Hierarchy | hierarchy repositories/screens, `AppNavHost` | Existing source; partial coverage | No current UI acceptance. |
| Editor / drafts | Editor screens, draft codec/repository | Existing source; partial | Full 146 behaviors not mapped; Undo/Redo and all mode/state interactions not verified. |
| Media | `ImagePipeline`, recovery helpers/workers | Expanded source; partial | No image import/edit/delete/corruption/process-death tests. |
| Question management | question detail, list, batch operations | Existing source; partial | Chapter_CQ multi-block/cut-paste/paging gaps. |
| Search | `GlobalSearchScreen`, `GlobalQuestionSearchRepositoryImpl` | Filters/highlight source-wired; partial | Unicode equivalence and large-data performance not verified. |
| Paper | `PaperBuilderScreen`, `PaperRepositoryImpl`, `PaperSnapshotCodec`, `PaperPdfExporter` | Expanded source; partial | No snapshot deletion/reload/PDF runtime checks; snapshot migrations beyond v1 remain open. |
| Backup/restore | `BackupService`, `BackupArchive`, `RestoreSwap`, Workers | Expanded source; partial | No corruption/fault/process-death restore testing; WorkManager dependency unconfirmed. |
| Accessibility | `ProfileScreen`, `Theme`, `AppSettings` | Expanded preferences; partial | No screen-reader, keyboard, focus, touch-target or responsive audit. |
| System integration | `AppNavHost`, `AppContainer`, `QuestionBankApp` | Static integration review only | No regression suite, 146-item audit or RC build. |

## Required owner input to close traceability
Supply the original 146-item matrix (including item IDs and exact expected behaviors). It must then be mapped without renumbering to implementation files and either executable tests or an explicitly approved UI-only acceptance criterion. No such mapping is claimed here.
