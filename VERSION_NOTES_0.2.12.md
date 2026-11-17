# Version 0.2.12 - Room schema JSON committed

CI run 14 (package v0.2.11, --no-build-cache): BUILD SUCCESSFUL in 43s, exit code 0,
"Using: sh ./gradlew". kspDebugKotlin, compileDebugKotlin and testDebugUnitTest actually
executed (not FROM-CACHE). 5 tests / 0 failures / 0 errors / 0 skipped, debug APK assembled.

Room schema export (1.json): formatVersion 1, database version 1,
identityHash dc6ce2b13fcffb4fd74692f2390af33e, 35 entities, 36 indices, 39 foreign keys.
FTS5 tables are not Room entities (created by the database callback), so they are not in 1.json.

Changes in v0.2.12:
- Added app/schemas/com.questionbank.app.data.local.QuestionBankDatabase/1.json.
- versionName 0.2.12-schema-json-committed. No application source changes.

Next: androidTest on the real Room database and a schema parity test.
