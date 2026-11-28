# প্রশ্ন কার্ড ডিজাইন — Step 2 ও দ্বিতীয় যাচাই

তারিখ: ২৮ নভেম্বর ২০২৬
ভিত্তি: `QuestionBank_Step2_Updated_Full.zip`
ডিজাইন রেফারেন্স: `caapbuild-updated-34.zip`-এর `CollectionScreen.tsx` ও `QuestionBoardTags.tsx` — শুধু দৃশ্য/আচরণের রেফারেন্স; React/TypeScript কোড কপি করা হয়নি।

## মালিক-অনুমোদিত Ribbon

- প্রশ্ন নম্বর `প্রশ্ন ১`, `প্রশ্ন ২`…; মালিক শুধু সংখ্যা না রেখে এই লেবেল নির্দিষ্ট করেছেন।
- Header-এ selection checkbox, পাঁচটি filled/empty star ও বাংলা rating name-সহ হলুদ badge এবং ⋮ menu আছে।
- Stimulus-category dropdown-এর জন্য জায়গা রাখা হয়েছে; তার data/link/dropdown B2-তে আলাদা ধাপ।

## Paper-category ও board metadata

- Header-এর ঠিক নিচে একই metadata band: বামে paper-category chips, ডানে board/year chips।
- Paper-category chip `paper_categories.name` থেকে আসে; paper shortName/title দেখায় না।
- একই category-র একাধিক paper থাকলে এক chip; group-এর সব question-এর মধ্যে সর্বশেষ `paper_question_items.created_at` link-টি category order নির্ধারণ করে। সর্বশেষ category বামে।
- Category অংশ এক লাইনের horizontal scroll; overflow হলে সূক্ষ্ম scroll indicator। Category usage না থাকলে category অংশ লুকানো থাকে; board থাকলে board অংশ থাকে। Metadata কিছুই না থাকলে পুরো band লুকানো।
- Board chip বিদ্যমান B4 logic পুনর্ব্যবহার করে: প্রতি (board, year) এক chip, `DHA ২৬` ফরম্যাট, বছর descending, একই বছরে board catalog order, RTL right-aligned wrap।

## Card body ও visual reference

- Stimulus image full-width, uncropped, aspect ratio-preserving pipeline-এ rounded border frame-এ দেখায়; একাধিক image vertical stack হয়।
- Loading ও missing image state framed; missing placeholder medium 96dp height।
- Stimulus/question content-এর আগে বিদ্যমান order বজায়; stimulus label, inline reference control এবং short-answer card view-তে দেখানো হয় না।
- sub-question section-এর শুরুতে একটি subtle divider (প্রতিটি sub-question-এর মাঝে নয়); heading যেমন `ক. · ২ নম্বর`; question text-এর পরে ছোট outlined `সমাধান দেখো` + eye mark এবং ডান পাশে board/year chips। Solution না থাকলে disabled state, থাকলে row-এর নিচে solution panel।
- ⋮ menu-এর `রেফারেন্স দেখুন` ছোট dialog-এ reference text দেখায়; reference data অক্ষত।
- Light/Dark palette tokens `Theme.kt`-এ। Light colors legacy CSS reference-এর রং অনুসরণ করে; Dark tokens contrast-এর জন্য উপযুক্ত করা হয়েছে এবং device display-তে এখনও যাচাই হয়নি।

## দ্বিতীয় recheck-এ পাওয়া bug ও correction

প্রথম implementation-এ Type CQ paper metadata একটি one-shot query হিসেবে `observeGroups()`-এর question rows flow-এর সঙ্গে আবদ্ধ ছিল। ফলে তালিকা খোলা থাকা অবস্থায় paper-question link যোগ/মোছা বা Profile-এ paper category rename হলে category chip stale থাকতে পারত।

সংশোধন:

- `TypeCqQuestionDao.observePaperUsagesForTopic(topicId)` topic-scoped Room `Flow` হিসেবে যোগ হয়েছে। Query `paper_question_items`, `type_cq_questions`, `papers` ও `paper_categories` join করে category id/name ও link timestamp আনে।
- `observeGroups()` এখন question/image/solution enrichment flow এবং paper metadata flow combine করে। তাই link বা category name বদলালে UI metadata refresh পায়।
- Metadata-only emission-এ শুধু `SavedGroup.paperUsages` পুনর্গঠন হয়; সব solution parts ও stimulus images আবার load করা হয় না।
- Android Room integration regression test `paperCategoryMetadataRefreshesWhenPaperLinksAndCategoryNamesChange` যোগ হয়েছে। এটি link যোগ, category rename এবং link মুছে category chip সরার emission পরীক্ষা করে; **test source যোগ হয়েছে, কিন্তু চালানো হয়নি**।
- প্রথম recheck-এ divider প্রতিটি দাগের আগে বসেছিল; legacy Collection source পুনরায় পড়ে এটি শুধরে sub-question section-এর শুরুতে একটিমাত্র top divider রাখা হয়েছে।
- B4-এর single-question top-board rule এবং B7-এর stimulus-subquestion-board rule মিলিয়ে standalone card-এ নিচের solution row-তে একই board chip দ্বিতীয়বার দেখানো বন্ধ করা হয়েছে।

## Tests, সীমা ও সুরক্ষিত অংশ

- `PaperUsageRulesTest`: category dedupe, latest link order এবং invalid category skip।
- `QuestionListLogicTest`: Type CQ star/name badge; Chapter CQ-এর `৩★` unchanged।
- `BoardPickerLogicTest`: board-year order, duplicates এবং `DHA ২৬` format।
- `TypeCqQuestionRepositoryTest`: link addition এবং category rename-এর Room Flow refresh-এর regression test যোগ।
- No Room entity/table/column, schema version, migration, canonical SQL, DB version, backup format or app-version change. Chapter CQ-এর paper-title query/display এবং question ordering/data logic unchanged.
- B2 stimulus-category link/dropdown, concepts, filters, clipboard and later steps remain out of scope.

## যাচাইয়ের অবস্থা

- Edited Kotlin sources/tests ও সংশ্লিষ্ট project usages পুনরায় static review করা হয়েছে।
- Project SQLite schema install, topic-scoped query execution, sample link insertion, category rename এবং `EXPLAIN QUERY PLAN` পরীক্ষা হয়েছে। Rename-এর পরে নতুন category name ফেরে; query plan Type CQ topic ও paper-item question indexes ব্যবহার করে; `PRAGMA foreign_key_check`-এ কোনো row নেই।
- `./gradlew --offline :app:compileDebugKotlin` attempt Kotlin compilation-এর আগে ব্যর্থ হয়েছে: Gradle 8.14.3 distribution local cache-এ নেই এবং `services.gradle.org` DNS resolution `UnknownHostException` দিয়েছে।
- **not compiled / not verified**: Kotlin/KSP/Room compile, unit tests, Android integration tests, APK build, emulator এবং phone UI checks চালানো হয়নি। ZIP integrity check app compilation বা runtime verification নয়।
- ফোনে যাচাই বাকি: সংকীর্ণ প্রস্থ, দীর্ঘ বাংলা category name, category scroll indicator, অনেক board/year chip, RTL wrap, Light/Dark, sub-question divider, solution panel এবং বড় image scroll/memory।


## Recheck-এ আরও স্পষ্ট করা সীমাবদ্ধতা

- Checkbox-এর দৃশ্যমান square 20dp; checkbox ও ⋮ menu-র clickable box এখন 44×36dp। পুরোনো React design-এ দুই control-এর hit target 44×44px ছিল। Ribbon-কে spec-এর 36dp উচ্চতায় রাখার কারণে vertical hit height 44dp নয়। ফোনে এই target-গুলো পরীক্ষা করা দরকার; 44dp vertical target বাধ্যতামূলক হলে Ribbon-কে উঁচু করার সিদ্ধান্ত নিতে হবে।
- এটি আগের “touch area আলাদা রাখা হয়েছে” বক্তব্যের পরিমাপসহ সংশোধন; legacy target-এর সঙ্গে সম্পূর্ণ সমান বলে দাবি করা হচ্ছে না।
