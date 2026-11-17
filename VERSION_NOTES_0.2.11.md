# Version 0.2.11 - Gradle wrapper committed

CI run 13 (package v0.2.10): BUILD SUCCESSFUL, exit code 0, "Using: sh ./gradlew",
Gradle 8.14.3, 5 tests / 0 failures. The wrapper helper worked.

Findings from run 13:
- app/schemas/**/1.json was NOT in the report artifact. kspDebugKotlin, compileDebugKotlin
  and testDebugUnitTest were all FROM-CACHE, so Room did not re-export the schema and the
  tests were not actually re-run (the test XML timestamp was from an earlier run).

Changes in v0.2.11:
- gradlew, gradlew.bat and gradle/wrapper/* (from run 13 artifact) are now part of the package.
- Workflow builds with --no-build-cache so KSP re-exports the Room schema JSON and tests run for real.
- versionName 0.2.11-wrapper-committed. No application source changes.

Next: run CI once, download QuestionBank-ci-report, commit
app/schemas/com.questionbank.app.data.local.QuestionBankDatabase/1.json.
