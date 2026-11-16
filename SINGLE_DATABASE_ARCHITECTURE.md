# Database architecture decision — ADR-001

Status: ACCEPTED for the first updated project package

The application uses **one physical SQLite database file**, `QuestionBank.db`, for the complete Question Bank application. Do not create separate `type_cq.db`, `chapter_cq.db`, or `category.db` files.

## Logical boundaries

- Type_CQ and Chapter_CQ remain separate logical domains with their own table families, DAOs, repositories, and use cases.
- Paper-building tables remain in the same database because a paper can reference either source domain.
- The canonical schema's category tables remain as defined: `type_cq_question_categories`, `chapter_cq_question_categories`, and `paper_categories`. This decision does **not** merge their semantics or redesign the canonical schema.
- Shared board catalog and global operation journal remain in the same database as defined by the canonical schema.

## Consequences

- Foreign keys and transactional writes can operate within one SQLite database.
- Backup, restore, migration, and integrity checking use one database boundary.
- Type_CQ and Chapter_CQ separation is enforced in architecture and naming, not by separate database files.
- Any future schema change that merges or shares category data requires an explicit reviewed decision and migration plan.

## Implementation boundary

This ZIP remains an initial Android/Room build harness, not a finished app. It registers the 35 ordinary Room entities. FTS5 virtual tables and all 17 canonical triggers are installed by an idempotent Room callback. Full DAO/repository implementation, field-level schema parity, migration coverage, and end-to-end application features remain planned work.
