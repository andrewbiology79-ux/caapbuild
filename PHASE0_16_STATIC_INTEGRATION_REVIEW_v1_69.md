# Static Integration Review — v1.69

| Integration | Source path | Static status |
|---|---|---|
| Create → Paper Builder | `AppNavHost` → `PaperBuilderScreen` → `PaperRepository` → `PaperRepositoryImpl` → `SharedDataDao` | Wired; compile/runtime unverified. |
| Type_CQ/Chapter_CQ source reads | Separate Type/Chapter DAOs projected by `SharedDataDao.paperSourcePage` | Combined read-only keyset projection; SQL/Room processing unverified. |
| Snapshot image ownership | `PaperRepositoryImpl` → `ImagePipeline.copyImageToPaperStorage` → `paper_media` → paper image tables | Wired source; filesystem/Room consistency untested. |
| PDF export | `PaperBuilderScreen` → `PaperPdfExporter` → snapshot codec + paper image assets | Source path with SHA/path checks and placements; output unverified. |
| Backup | Profile → BackupScreen/ViewModel → BackupService → DatabaseSnapshot/BackupArchive | Manual `.qbbak` and app-private automatic worker source wired; no execution. |
| Restore | BackupService stage → `QuestionBankApp` cold-start `RestoreSwap` → read-only `RestoreWorker` inspection | Source wired; actual failure/recovery untested. |
| Media recovery | `QuestionBankApp` → WorkManager ImageRecoveryWorker → ImagePipeline recovery gate | Unique worker and app-scope fallback source; scheduling unverified. |
| Media snapshot serialization | ImagePipeline/MediaSnapshotCoordinator ↔ BackupService | Process-local mutex boundary wired; external process not coordinated. |
| Settings | ProfileScreen → AppSettings → MainActivity/QuestionBankTheme | Theme/text/default editor/highlight/high contrast source wired; accessibility untested. |
| Search highlight/filter | AppNavHost → GlobalSearchScreen → search repository and preferences | Source wiring present; output accuracy/performance unverified. |

## Result
No static missing call-site identified in the added Paper/Backup method paths during this review. This is not a compiler result. Any Kotlin, Room/KSP, WorkManager API, Compose or Android framework compatibility issue can still surface when build verification is eventually authorized.
