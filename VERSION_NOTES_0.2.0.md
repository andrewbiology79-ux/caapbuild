# Version 0.2.0 — database foundation update

- Retained one physical `QuestionBank.db` for Type_CQ, Chapter_CQ, and paper workflows.
- Added all 17 canonical triggers to the Room database callback.
- Added idempotent creation of both FTS5 virtual tables and the system paper-category seed.
- Added automated canonical inventory checks for 35 ordinary tables, 2 FTS virtual tables, 17 triggers, and 48 CHECK clauses.
- Added architecture and parity-status documentation.

Not included: completed editor UI, full DAO/repository layer, complete schema parity certification, migrations, media pipeline, paper builder UI, backup/restore, or a verified APK.
