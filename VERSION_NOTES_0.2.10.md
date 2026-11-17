# Version 0.2.10 - Gradle wrapper helper

No application source changes. versionName: 0.2.10-gradle-wrapper-helper.

Workflow changes:
- If the repository has no `gradlew`, CI runs `gradle wrapper --gradle-version 8.14.3`
  and uploads the result as artifact `QuestionBank-gradle-wrapper`
  (gradlew, gradlew.bat, gradle/wrapper/gradle-wrapper.jar and .properties).
  This step is non-blocking (continue-on-error).
- The build step uses `sh ./gradlew` when the wrapper exists, otherwise the installed Gradle.
  The log's first line records which one was used.

What to do after the next CI run:
1. Download `QuestionBank-gradle-wrapper` and commit gradlew, gradlew.bat and gradle/wrapper/*
   to the repository root (keep the folder structure).
2. Download `QuestionBank-ci-report`, take
   app/schemas/com.questionbank.app.data.local.QuestionBankDatabase/1.json
   and commit it under app/schemas/ in the same path.
3. The following run should log "Using: sh ./gradlew" and skip wrapper generation.
