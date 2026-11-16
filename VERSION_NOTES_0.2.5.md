# Version 0.2.5 — Room entity class-literal correction

This package responds to CI run 8. KSP loaded the Room processor, but Room reported that the database annotation did not provide a list of entities.

## Root cause identified
`QuestionBankDatabase.kt` listed the entity identifiers without Kotlin class literals. Room expects entries such as `TypeCqSubjectsEntity::class`.

## Changes
- Corrects all 35 `@Database(entities = [...])` entries to `EntityName::class`.
- Replaces the wildcard entity import with explicit imports for all 35 entities.
- Retains KSP 2.3.12, Kotlin 2.4.21 and Room 2.8.5.
- Aligns Android `versionName` to `0.2.5-room-entity-class-literals`.
- Includes `PROJECT_PLAN_v1_5_UPDATED.txt` with CI run 8 diagnosis and updated phase status.
- Preserves the one-physical-database design, canonical schema, Room entity source files, and GitHub Actions diagnostic workflow.

## Verification boundary
A source-level check confirms that exactly 35 expected entity class literals appear in the database annotation in canonical order. The ZIP integrity is checked. No Gradle build was run in this environment. The next CI run must verify Room KSP generation, unit tests, and APK assembly.
