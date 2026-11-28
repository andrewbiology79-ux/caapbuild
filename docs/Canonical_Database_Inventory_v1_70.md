# Canonical Database Inventory — v1.70

## Authority
`database/QuestionBank_SQLite_Schema_v1_1.sql` is the canonical SQL source. The committed Room export is `app/schemas/com.questionbank.app.data.local.QuestionBankDatabase/1.json`. The project plan records 35 ordinary application tables, 2 FTS5 virtual tables, 10 SQLite-generated FTS shadow tables (47 sqlite_master table entries when FTS objects exist), 17 canonical triggers and 48 CHECK clauses.

## Scope boundary
- One physical database file: `QuestionBank.db`.
- Type_CQ and Chapter_CQ use distinct table families, DAO/repository boundaries and domain workflows.
- Shared board/category/paper/operation journal data stays in the same database only where defined by canonical SQL. Category semantics must not be merged.
- Paper items may refer to both source scopes through scope-specific references/snapshot fields.

## v1.70 static comparison
Canonical SQL and Room schema JSON are byte-identical to v1.68. Room database version remains 1. This proves only no file delta in those two artifacts; no new Room export, migration run or runtime parity check was performed.

## Open review items
Field-by-field parity, CHECK emulation, trigger behavior, migration compatibility and foreign-key behavior must be re-evidenced if source/schema changes. No such tests were run for v1.70.
