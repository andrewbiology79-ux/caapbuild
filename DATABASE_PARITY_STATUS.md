# Database parity status — first updated package

## Canonical inventory

- 35 ordinary application tables (Room entity target).
- 2 FTS5 virtual tables (installed outside Room `@Entity`).
- 10 SQLite-managed FTS5 shadow tables (never register as Room entities).
- 17 canonical triggers (11 business-integrity + 6 FTS synchronization).
- 48 CHECK clauses in the canonical SQL.

## Changes in this update

1. Added `CanonicalDatabaseObjects.kt`, generated from the canonical schema v1.1.
2. Runtime callback now installs both FTS virtual tables and all 17 canonical triggers, rather than only the six FTS triggers.
3. The canonical system paper category seed is installed idempotently.
4. Added source-contract assertions for the table, FTS, trigger, and CHECK inventory and for runtime trigger coverage.
5. Kept the single-file database architecture documented in `SINGLE_DATABASE_ARCHITECTURE.md`.

## Verification limits

The JVM canonical SQL contract test is included and can be run with `gradle --no-daemon :app:testDebugUnitTest`. This environment did not execute an Android Gradle build, Room KAPT compilation, instrumentation tests, or device tests. Do not treat this package as compile-verified until CI completes successfully.

Field-by-field Room parity is not yet certified: Room entity columns, defaults, nullability, indices, foreign keys, and all 48 CHECK clauses still require a complete parity matrix and database-level tests. The runtime installer covers the canonical non-entity FTS objects and triggers; it does not by itself prove the rest of Room parity.
