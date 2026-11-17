# Version 0.2.15 - androidTest on the real Room database + scale benchmark (written, NOT yet run)

Context: plan section 29 (v1.17) put "androidTest + scale benchmark" first. The owner plans several
hundred thousand questions with solutions and images.

CI run 18 (package v0.2.14): BUILD SUCCESSFUL, 7/7 unit tests. No main-source change in this package.

Added (androidTest sources; NOT compiled and NOT run anywhere yet):
- app/src/androidTest/.../TestDb.kt: builds the production configuration (bundled driver, WAL, canonical
  callback) and small SQL helpers.
- RoomRuntimeTest.kt (8 tests) on the real Room database:
  walJournalModeIsActive, foreignKeysAreEnabledAndEnforced, installedObjectsMatchInstaller (63 triggers,
  2 FTS tables, 35 ordinary tables), checkEmulationRejectsInvalidRows, topicMismatchTriggerRejectsStimulusOfAnotherTopic,
  ftsStaysInSyncWithInsertUpdateDelete, banglaWordsAndPrefixesAreSearchable, banglaNormalizationReport (informational).
- ScaleBenchmarkTest.kt: imports N questions (+2 solution parts each) with ALL triggers active, then logs
  (tag QB_BENCH): import speed per batch, db/wal size, checkpoint time, FTS optimize time, search latency
  (common word, ranked, count, rare word, prefix, join with topic), paging, edit/delete cost, and an experiment
  comparing FTS delete by UNINDEXED question_id against a rowid-keyed FTS table.
- .github/workflows/android-instrumented.yml (manual, emulator, API 34, inputs benchmark_rows/api_level) and
  .github/scripts/run-instrumented.sh. Artifact: QuestionBank-instrumented-report
  (qb-bench-logcat.txt = the benchmark numbers, gradle-instrumented.log, androidTests reports).
- Normal workflow: new NON-BLOCKING step compiles the androidTest sources
  (build-report/androidtest-compile.log), so compile errors appear before any emulator run.
- Dependencies: androidx.test core/runner/ext-junit, kotlinx-coroutines-android (androidTest only).
- versionName 0.2.15-androidtest-benchmark. Database version stays 1.

Uncertain APIs (written from memory of Room 2.8 driver API, not compiled): useWriterConnection,
useReaderConnection, Transactor.withTransaction, PooledConnection.usePrepared, SQLiteStatement.reset/isNull.
If compileDebugAndroidTestKotlin fails, send build-report/androidtest-compile.log.

Offline prototype (Python sqlite3, same SQL, same trigger statements extracted from the Kotlin files; NOT a device result):
- 63 triggers load; CHECK emulation, topic-match and FK rejections behave as designed; FTS insert/update/delete sync works.
- Bangla words with conjuncts and vowel signs (বিদ্যুৎ, কর্মক্ষমতা, প্রতিক্রিয়া ...) tokenize as whole words; prefix queries work.
- FINDING F-1: FTS delete/update by `question_id UNINDEXED` scans the whole FTS table.
  50,000 rows: 18.3 ms per row (vs 0.019 ms by rowid). Cost grows linearly with rows -> at 300,000 rows roughly 6x worse,
  and a bulk delete/edit of thousands of questions becomes very slow. Needs a design decision after the device benchmark.
- FINDING F-2: Unicode normalization. A word indexed with precomposed য় (U+09DF) is NOT found by the decomposed
  form (U+09AF U+09BC) and vice versa. Normalize text (NFC plus য়/ড়/ঢ় folding) on write and on query.
- Import speed with all triggers: about 16,600 questions/s on the sandbox CPU (only questions, no solutions). A phone will be slower.

Next: run the instrumented workflow (20000 rows first, then 300000), send qb-bench-logcat.txt.
