# Question Bank Android — Requirements Specification v1.70 (Source Candidate)

**Status:** Working specification derived from the supplied project plan and current source tree. Not an owner-approved replacement for the missing 146-item Editor matrix.

## Product objective
Build an offline-first Android Question Bank for two independent question domains: Type_CQ and Chapter_CQ. The application uses one physical SQLite database while keeping the domain tables, DAOs, repositories and use cases separate.

## Functional scope
- Type_CQ hierarchy: Subject → Chapter → Topic → question groups/sub-questions.
- Chapter_CQ hierarchy: Subject → Chapter → questions; it has no Topic layer.
- Question creation and editing through Minimum and Full Editor modes using persistent draft state.
- Board/year/category/rating/question-type metadata and management.
- Ordered text/image stimuli and solution parts, mathematical content and scoped image ownership.
- Question cards, selection, duplicate indication, copy, deletion and sorting.
- Cross-scope search with scope-aware filters, including cascading Subject → Chapter → Type_CQ Topic selection.
- Immutable question-paper snapshots sourced from either scope; copied paper media; category/section/item ordering; marks, overrides, validation, preview and PDF export.
- Manual database+media backup, manifest and hashes, restore preview, staged startup swap and rollback; optional app-private automatic backup.
- Owner preferences for theme, text size, editor default, search highlighting and high contrast.

## Architecture invariants
1. One physical database (`QuestionBank.db`); do not split scopes into different database files.
2. Type_CQ and Chapter_CQ retain independent data tables, DAO boundaries and repository boundaries.
3. Canonical SQL and exported Room schema are authoritative. No schema change is permitted without an ADR and migration plan.
4. Paper snapshots are independent of source question text after insertion. Paper-required image files are copied to `paper_media` and must not be deleted by question-scope cleanup.
5. ImagePipeline owns question image import/transform/delete/recovery. Question-scope image roots are exactly `media/type_cq` and `media/chapter_cq`.
6. Backup snapshots serialize media mutation in-process and include every supported managed media namespace.
7. No feature may be called verified solely because a source file exists.

## Media policy
Newly imported/transformed images use JPEG, maximum edge 2048 px, quality 88. Export is PNG. Existing readable JPEG, PNG and WebP files remain supported. This is recorded as ADR-013 and intentionally supersedes the older WebP/800px draft for new imports.

## Data protection
- Paper text is stored in `schemaVersion`-tagged snapshots.
- Paper images are copied and verified with SHA-256.
- Backup manifest contains database/media byte lengths and SHA-256 values, app and DB version metadata, and Room identity hash.
- Restore is staged and applied before Room opens; incomplete rollback must retain its marker and fail closed.
- Automatic local copies are not off-device backup.

## Accessibility and presentation
Light/Dark, text size, default editor mode, search highlighting and high contrast are user preferences. These source features do not prove screen-reader, keyboard, touch-target, responsive-layout or contrast conformance.

## Explicitly unresolved requirements
The original 146-item Editor behavior matrix was not in the supplied project files. Exact numbered requirement traceability, owner sign-off, full acceptance criteria, remaining Editor parity, schema-migration chain, and all runtime/regression evidence remain open. Phase 16 cannot be declared passed without the prohibited test and audit evidence. Phase 17 release work is intentionally excluded from this update.
