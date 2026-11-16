# Version 0.2.8 - CI run 10 fix

CI evidence (gradle-build_1.log): KSP and main compile now pass (v0.2.7 index fix worked).
Failed task: :app:compileDebugUnitTestKotlin - "Unresolved reference 'CanonicalDatabaseObjects'"
in CanonicalSqlContractTest.kt (lines 41, 43, 59, 127).

Cause: the test (package com.questionbank.app) uses CanonicalDatabaseObjects (package
com.questionbank.app.data.local) without an import. The missing import was already in v0.2.5;
it was never compiled before.
Fix: added `import com.questionbank.app.data.local.CanonicalDatabaseObjects`.

Not verified: test execution results (testDebugUnitTest) and assembleDebug - run CI again.
Room warns (not errors) that 11 foreign-key columns have no covering index; see plan section 20.
