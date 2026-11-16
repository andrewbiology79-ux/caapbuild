# Question Bank — GitHub Auto-Build Harness (v1)

এটি সম্পূর্ণ অ্যাপের UI/feature implementation নয়। এটি canonical SQLite v1.1 schema ও Room Entity mapping-এর জন্য Android compile/build harness।

## মোবাইল থেকে কীভাবে চালাবে
1. ZIP extract করে GitHub repository-তে সব ফাইল upload করো (root-এ `settings.gradle.kts` থাকতে হবে)।
2. `main` branch-এ commit/push করো।
3. GitHub → Actions → **Android Test and APK Build** workflow নিজে থেকেই চলবে। আলাদা কোনো রিপোর্ট/কমান্ড চালাতে হবে না।
4. সফল হলে workflow run-এর Artifacts থেকে `QuestionBank-debug-apk` নামের artifact download করো। এর ভেতরে `app-debug.apk` থাকবে।

## Workflow কী করে
- Kotlin + Android Gradle Plugin দিয়ে Android app compile করে।
- Room 2.8.5 annotation processor দিয়ে Entity/Database mapping compile করে।
- JVM unit test-এ canonical SQLite SQL চালিয়ে integrity, FK ও FTS trigger smoke test করে।
- সব test পাস হলে debug APK তৈরি করে Artifact হিসেবে সংরক্ষণ করে।
- আলাদা report workflow বা report artifact নেই। Failure details GitHub Actions build log-এ থাকবে।

## গুরুত্বপূর্ণ সীমা
- Room draft থেকে FTS5 shadow tables-কে Entity হিসেবে বাদ দেওয়া হয়েছে; FTS virtual tables ও sync triggers Room callback-এ রাখা হয়েছে এবং BundledSQLiteDriver ব্যবহার করা হয়েছে, যাতে FTS5-এর জন্য Android system SQLite-এর build-option-এর ওপর নির্ভর করতে না হয়।
- এটি এখনো পূর্ণ Question Bank app নয়; কেবল build harness / compatibility gate।
- Room-generated schema এবং canonical SQL-এর সম্পূর্ণ parity, CHECK constraint preservation, production migration, DAO/Repository/Editor behavior, image journal, backup/restore এবং device runtime test এখনো বাকি।
- CI green মানে এই harness compile ও অন্তর্ভুক্ত SQL smoke tests pass করেছে; এর মানে পূর্ণ অ্যাপের সব feature ready নয়।
- APK হলো debug APK; Play Store release signing নয়।

## Toolchain
- Android Gradle Plugin 8.13.2
- Kotlin 2.4.21
- Gradle 8.14.3 (GitHub Actions runner-এ auto-install)
- Android compileSdk 36 / minSdk 26
- AndroidX Room 2.8.5 + Bundled SQLite 2.7.1 (FTS5 support)

## Project layout
- `app/src/main/java/.../entity/` — 35 normal Room entity
- `app/src/main/java/.../QuestionBankDatabase.kt` — Room database + FTS callback
- `app/src/test/resources/` — canonical SQL used by CI test
- `database/` — canonical SQL reference copy
- `.github/workflows/android-build.yml` — single automatic test+APK build workflow


## Launcher Icon
নতুন Question Bank আইকন যুক্ত করা হয়েছে। Legacy density launcher PNG এবং Android Adaptive Icon (API 26+) resource অন্তর্ভুক্ত; AndroidManifest-এ icon ও roundIcon সেট করা আছে।
