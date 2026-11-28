# Screen and Navigation Inventory — v1.69 source review

| Navigation area | Screen / route | Source entry point | Purpose and integration |
|---|---|---|---|
| Create tab | Create home / Paper Builder | `AppNavHost`, `PaperBuilderScreen` | Create and manage paper categories, papers, sections, snapshots, overrides, marks, validation and PDF export. |
| Type_CQ tab | Subject list, Chapter list, Topic list, question workspace/detail/editor | `AppNavHost`, hierarchy and question screens | Type_CQ-only Subject → Chapter → Topic structure and question lifecycle. |
| Chapter_CQ tab | Subject list, Chapter list, question workspace/detail/editor | `AppNavHost`, `ChapterCqWorkspaceScreen` and question screens | Chapter_CQ structure with no Topic layer. |
| Filter tab | Global Search | `GlobalSearchScreen` | Cross-scope search, filters, highlight preference and detail navigation. |
| Profile tab | Profile / Settings | `ProfileScreen` | Theme, text size, default editor mode, highlight, high contrast, media policy and app info. |
| Profile tab | Media Library | `ImageLibraryScreen` | Scope-aware media inspection and image actions through ImagePipeline. |
| Profile tab | Backup & Restore | `BackupScreen`, `BackupViewModel` | Manual backup export, automatic private backup policy, restore preview/confirm and restart flow. |

## Shared infrastructure
- `AppContainer`: lazy database plus repositories and services.
- `QuestionBankApp`: applies staged restore before DB use, reconciles backup schedule, schedules post-swap inspection and image recovery.
- `ImagePipeline`: question media and paper asset operations, recovery gate and integrity helpers.
- `MediaSnapshotCoordinator`: process-local exclusion for media mutations and backup snapshots.

## Limitations
This is an inventory of source routes, not a device-confirmed navigation audit. The original 146-item matrix and full screen-by-screen acceptance checklist remain absent. Back stack, small/large screen behavior, keyboard focus and TalkBack semantics remain unverified.
