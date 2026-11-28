# Database Migration Plan — v1.70

## Current state
Database version is 1. No migration was needed for v1.69/v1.70 because canonical SQL and Room schema export are unchanged. Existing project records say the complete Migration-object chain and migration fixtures remain open.

## Required before the next schema version
1. Make an ADR describing the schema change and compatibility intent.
2. Update canonical SQL and Room Entities/DAOs in one reviewed change.
3. Implement explicit Room `Migration(old,new)` steps; do not use destructive fallback for user data.
4. Export the new Room schema and compare SQL/Room inventory, columns, nullability, defaults, indexes, FKs, CHECK semantics and triggers.
5. Prepare representative v1 databases with data in both scopes, categories, paper snapshots, operation journal and media references.
6. Define interrupted-migration recovery and backup/restore compatibility.
7. Obtain explicit authorization before any migration test/build; this package did not run any.

## No-change rule
Until a migration is implemented and reviewed, keep DB version 1 and preserve the current canonical SQL/Room export identity.
