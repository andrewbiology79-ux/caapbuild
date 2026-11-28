# উদ্দীপক ক্যাটাগরি Dropdown — Step 3 / B2

তারিখ: ২৮ নভেম্বর ২০২৬  
বেস: `QuestionBank_EditorLog_SaveFix_Full.zip` (versionCode 50 / versionName 0.2.45-profile-categories)  
নতুন source version: `0.2.46-stimulus-categories` (versionCode 51)

## বাস্তবায়নের সারাংশ

- `type_cq_stimulus_category_links` নামে আলাদা Room Entity/SQLite table যোগ হয়েছে। এটি একই `type_cq_question_categories` catalog ব্যবহার করে, কিন্তু আগের `type_cq_question_category_links` (প্রতি দাগের category) অক্ষত রাখে।
- Type CQ card ribbon-এ “উদ্দীপক ক্যাটাগরি” dropdown যোগ হয়েছে। একাধিক active category checkbox দিয়ে বাছা যায়; tap করলেই সংরক্ষণ হয়। বাছা নাম এক লাইনে comma-separated থাকে এবং জায়গা কম হলে horizontal swipe করা যায়; scrollbar দেখানো হয় না। নির্বাচন ফাঁকা হলে placeholder থাকে।
- Archived category নতুন করে যোগ করা যায় না। আগে লিংক থাকলে তা দৃশ্যমান থাকে এবং uncheck করে সরানো যায়।
- উদ্দীপকবিহীন একক প্রশ্নের কার্ডে একই নিয়ন্ত্রণ ওই প্রশ্নের নিজস্ব বিদ্যমান category link-গুলো পরিবর্তন করে; নতুন stimulus-link row তৈরি করে না।
- Editor-এর বিদ্যমান per-question category selector-এর label “দাগের ক্যাটাগরি” করা হয়েছে। Chapter CQ editor-এর selector অপরিবর্তিত।
- `SavedGroup.stimulusCategoryIds`, create/save snapshot এবং repository/ViewModel/Card flow যুক্ত হয়েছে। Topic list-এর সব stimulus-category link এক batch query-তে লোড হয়; প্রতিটি card-এর জন্য আলাদা category query নেই।
- Group duplicate করলে stimulus-এর category links-ও কপি হয়। Stimulus delete হলে FK cascade নতুন link rows মুছে দেয়। Category reassign/archive workflow-এ stimulus links-ও target category-তে স্থানান্তরিত হয়। Backup archive format পরিবর্তন করা হয়নি; এটি database snapshot নেয়, ফলে নতুন table-ও snapshot-এর অংশ হবে।
- rapid repeated taps-এর save request ViewModel-এ serial করা হয়েছে, যাতে database write tap-এর ক্রম অনুসরণ করে।

## Database পরিবর্তন

- Room database version `1 → 2`; `MIGRATION_1_2` নতুন relation table ও index যোগ করে। পুরোনো question links বা অন্য table drop করে না।
- `database/QuestionBank_SQLite_Schema_v1_2.sql` নতুন canonical schema; `database/migrations/1_to_2_stimulus_category_links.sql` migration DDL আলাদাভাবে রাখা হয়েছে। v1.1 schema historical source হিসেবে অক্ষত।
- Room Entity সংখ্যা 35 → 36। `app/schemas/.../2.json` KSP/Room compile থেকে তৈরি হওয়া এখনো বাকি; পুরোনো `1.json` মুছে বা হাতে এডিট করা হয়নি।
- app versionCode/versionName: `51 / 0.2.46-stimulus-categories`।

## যোগ করা/পরিবর্তিত টেস্ট

- Android integration test source যোগ হয়েছে: stimulus category persist + card load + duplicate, single-question category control, archived category retain/reject-new behavior, category reassignment এবং card delete cascade। Domain rule test-এ blank/duplicate stimulus-category ID-ও পরীক্ষা করার case যোগ হয়েছে।
- Canonical SQL inventory/parity test 36 Room entities ও schema version 2 প্রত্যাশা করে।
- টেস্টগুলো source-এ যোগ হয়েছে, কিন্তু এই environment-এ Gradle/KSP চালানো যায়নি; তাই কোনো Kotlin/Room compile, unit test, instrumentation test বা APK build PASS দাবি করা হচ্ছে না।

## সীমাবদ্ধতা ও পরবর্তী যাচাই

- Source review এবং SQLite DDL/migration replay আলাদাভাবে করা হয়েছে; Android runtime verification নয়।
- KSP চালিয়ে `app/schemas/com.questionbank.app.data.local.QuestionBankDatabase/2.json` generate/commit করতে হবে এবং Room schema parity + সম্পূর্ণ unit/instrumentation suite চালাতে হবে।
- ফোনে ribbon width, বহু/দীর্ঘ বাংলা category name, checkbox touch behavior, menu placement, archived chip state, light/dark contrast এবং দ্রুত একাধিক category tap পরীক্ষা করতে হবে।
- বর্তমান restore flow Room identity hash কঠোরভাবে মেলায়। তাই schema v1-এর পুরোনো `.qbbak`/raw DB backup schema v2 app-এ restore গ্রহণ করবে না; নতুন v2 backup তৈরি করতে হবে। আগের installed v1 database স্বয়ংক্রিয় `1 → 2` migration পাবে।
- Step 3-এ E2 category filter, E1 vector search icon, D clipboard/bulk workflow, C Concept feature এবং B10 Concept button করা হয়নি।

**Status: SOURCE IMPLEMENTED — NOT COMPILED / NOT TESTED / NOT DEVICE-VERIFIED.**

## মাইগ্রেশন index-নাম সংশোধন (২৮ নভেম্বর ২০২৬, কোড পর্যালোচনার পর)

- সমস্যা: `type_cq_stimulus_category_links`-এর index entity-তে নামহীন, তাই Room প্রত্যাশা করে `index_type_cq_stimulus_category_links_category_id_stimulus_id`। কিন্তু `MIGRATION_1_2` ও migration SQL তৈরি করছিল `idx_type_cq_stimulus_category_links_category`। Room migration-এর পর index নাম যাচাই করে, তাই v1 থেকে আপগ্রেডে "Migration didn't properly handle" ক্র্যাশ হতো। নতুন ইনস্টলে সমস্যা ছিল না।
- সংশোধন: `QuestionBankDatabase.kt`-এর `MIGRATION_1_2` এবং `database/migrations/1_to_2_stimulus_category_links.sql`-এ নাম এখন Room-এর নামের সমান।
- নতুন JVM টেস্ট `MigrationIndexNameTest`: Kotlin migration ও standalone SQL দুটোতেই Room-নাম আছে এবং পুরোনো `idx_` নাম নেই, তা পরীক্ষা করে। টেস্টটি এখানে চালানো যায়নি (Gradle নেই)।
- SQLite replay (Python): v1 schema + সংশোধিত migration চালিয়ে দেখা হয়েছে, index-টি Room-নামে তৈরি হয়।
- Canonical v1.2 SQL-এর `idx_...` নাম অপরিবর্তিত; fresh install Room-এর নামে টেবিল বানায় এবং parity test শুধু column/unique মেলায়।
- এখনো বাকি: `2.json` generate (KSP/CI), এবং `MigrationTestHelper` দিয়ে সত্যিকারের v1 → v2 migration instrumentation test।

**Status: SOURCE FIXED — NOT COMPILED / NOT TESTED / NOT DEVICE-VERIFIED.**

## CI ও instrumented ফলাফল (২৮ নভেম্বর ২০২৬)

- CI: clean। KSP-জেনারেটেড `2.json` (version 2, ৩৬ entity) এখন সোর্সে আছে; এতে index নাম `index_type_cq_stimulus_category_links_category_id_stimulus_id`, যা migration সংশোধনের সাথে মেলে।
- Instrumented: ১১৮ টেস্টের ১টি ফেল — `RoomRuntimeTest.installedObjectsMatchInstaller` (expected 35, actual 36)। কারণ: টেস্ট পুরোনো ৩৫ টেবিল ধরে ছিল; Step 3-এ ৩৬তম টেবিল যোগ হয়েছে, তাই ৩৬ সঠিক।
- সংশোধন: assertion `36L` করা হয়েছে; production code অপরিবর্তিত। সংশোধনের পর আবার চালানো হয়নি।

**Status: CI CLEAN — INSTRUMENTED 117/118 → TEST FIXED, RERUN PENDING — NOT DEVICE-VERIFIED.**

## তৃতীয় Deep Static Review অনুযায়ী সংশোধন (২৮ নভেম্বর ২০২৬) — 0.2.47-stimulus-categories-review-fix (versionCode 52)

রিপোর্ট: `docs/QuestionBank_Step3_B2_Third_Deep_Static_Review_BN.txt`

- **Finding 1 (P1, data-loss)**: `CategoryDataDao.reassignAndArchiveType()` এখন link সরানোর আগে ওই category-র প্রশ্ন ও উদ্দীপকের `updated_at` touch করে (একই transaction)। এর সঙ্গে (রিপোর্টের বিকল্প B) `observeGroups()` এখন প্রশ্ন-category link ও উদ্দীপক-category link table-ও সরাসরি observe করে (`observeCategoryLinksOfTopic`, `observeStimulusCategoryLinksOfTopic`), তাই শুধু link বদলালেও কার্ড নতুন category ID পায়। `sort_order` অপরিবর্তিত, তাই তালিকার ক্রম বদলায় না।
- **Finding 2**: নতুন instrumented test — `liveGroupsFlowReloadsStimulusCategoryIdsAfterReassign`, `liveGroupsFlowReloadsSingleQuestionCategoryIdsAfterReassign`, `reassignTouchesParentRowsButKeepsTheListOrderAndLinks`। collector চালু রেখে A→B reassign করে একই Flow থেকে B আসে কি না দেখে।
- **Finding 3**: `BackupRestoreTest.stimulusCategoryLinksSurviveSnapshotAndRestore` — snapshot ফাইল (plain driver) ও restore-এর পর (Room) stimulus_id/category_id/assigned_at সারি হুবহু মেলে কি না পরীক্ষা করে।
- **Finding 4/5**: canonical `QuestionBank_SQLite_Schema_v1_2.sql`-এ index নাম এখন Room-এর নামের সমান (`index_type_cq_stimulus_category_links_category_id_stimulus_id`)। `MigrationIndexNameTest`-এ canonical SQL ও `2.json` নামের test যোগ।
- **Finding 6**: `2.json` আগের ধাপেই KSP থেকে তৈরি হয়ে সোর্সে আছে — এই ZIP-এ উপস্থিত (খোলা blocker নেই)।
- **Finding 7**: নতুন `RoomMigration1To2Test` (`MigrationTestHelper`): v1 Room DB-তে নমুনা data → বাস্তব `MIGRATION_1_2` → Room validation against `2.json` → পুরোনো সারি অক্ষত, নতুন table/index/FK/cascade ঠিক। এজন্য `app/build.gradle.kts`-এ `androidx.room:room-testing` ও `androidTest` assets-এ `schemas/` যোগ হয়েছে।
- **Finding 8 (নীতি)**: v1 backup স্বয়ংক্রিয়ভাবে v2-তে migrate করা হয়নি (সিদ্ধান্ত মালিকের)। আপাতত restore বাতিল থাকে, তবে বার্তায় এখন backup-এর schema সংস্করণ ও "নতুন ব্যাকআপ তৈরি করুন" নির্দেশ আছে।
- Version: versionCode 51 → 52, versionName `0.2.47-stimulus-categories-review-fix`।

**Status: SOURCE FIXED — NOT COMPILED / NOT TESTED (CI ও instrumented rerun বাকি) / NOT DEVICE-VERIFIED.**

### CI/instrumented rerun (२८ नভেম্বর ২০২৬): ১২৩ টেস্টের ১টি ফেল
- CI clean। Instrumented: ১২২ পাস (নতুন live-Flow ও backup round-trip টেস্টসহ), ১ ফেল — `RoomMigration1To2Test`: `AbstractMethodError ... GeneratedSerializer.typeParametersSerializers()`।
- কারণ: `room-testing` dependency kotlinx-serialization 1.7.3-এর সঙ্গে runtime-এ সংঘর্ষ করেছে; production code বা migration ভুল ছিল না।
- সংশোধন: `room-testing` সরানো হয়েছে। টেস্ট এখন `1.json` থেকে (createSql, indices, setupQueries, v1 identity hash, user_version 1) version-1 database বানিয়ে `Room.databaseBuilder + MIGRATION_1_2` দিয়ে খোলে; Room নিজেই migration-পরবর্তী schema validate করে। পুরোনো সারি, নতুন table/index/cascade assert করা আছে।
- Status: rerun বাকি।
