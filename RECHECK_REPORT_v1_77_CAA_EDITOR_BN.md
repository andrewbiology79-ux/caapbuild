# v1.77 CAA Editor — পুনঃযাচাই প্রতিবেদন

তারিখ: ২১ নভেম্বর ২০২৬  
বেসলাইন: `QuestionBank_v1_76_CAA_EDITOR_PARITY.zip`  
নতুন প্যাকেজ: `QuestionBank_v1_77_CAA_EDITOR_PARITY.zip`  
আচরণগত রেফারেন্স: `CAA_EDITOR_FEATURES_Minimum_Full.txt`

## ১. এই সংশোধনের উদ্দেশ্য

v1.76 পুনঃযাচাইয়ে Edit-mode-এ একটি নির্দিষ্ট edge case পাওয়া যায়: আগে থেকে সংরক্ষিত কোনো ক/খ/গ/ঘ প্রশ্ন মুছে ফেলার জন্য চিহ্নিত থাকলেও তার database row Save transaction সম্পন্ন না হওয়া পর্যন্ত থাকে। পুরোনো Add handler ওই label-কে খালি slot মনে করে আবার ব্যবহার করার চেষ্টা করত। ফলে ViewModel state বদলালেও `editableLabels`-এ নতুন ব্লক দেখা নাও যেতে পারত।

দ্বিতীয় সমস্যা ছিল, নতুন করে যোগ করা কিন্তু এখনো ফাঁকা প্রশ্ন ব্লক persisted প্রশ্ন মুছতে পারার গণনায় ধরা হতো না। ফলে পর্দায় দ্বিতীয় ব্লক দৃশ্যমান থাকা সত্ত্বেও একটি persisted ব্লক মোছা অপ্রয়োজনীয়ভাবে নিষ্ক্রিয় হতে পারত।

## ২. v1.77-তে যা সংশোধন হয়েছে

- নতুন pure-domain helper `QuestionEditBlockRules` যোগ হয়েছে।
- Addable label নির্ধারণে বর্তমান দৃশ্যমান label-এর পাশাপাশি সব persisted label-কে occupied ধরা হয়। Persisted row deletion-এর জন্য চিহ্নিত হলেও Save commit না হওয়া পর্যন্ত সেটি occupied থাকবে।
- `prepareQuestionBlock()`-এ একই নিয়ম পুনরায় যাচাই করা হয়; UI handler একমাত্র প্রতিরক্ষা নয়।
- Full Edit screen-এর Add action এখন প্রকৃতপক্ষে নতুন row হিসেবে যোগ করা যায় এমন label-ই ব্যবহার করে। যোগ করার মতো label না থাকলে action disabled থাকে এবং বর্তমান one-row-per-label সীমা দেখায়।
- Persisted block delete eligibility-তে দৃশ্যমান pending নতুন ব্লকও গণনা হয়, তার প্রশ্নের লেখা ফাঁকা হলেও। Save-এর সময় প্রয়োজনীয় প্রশ্ন-লেখা যাচাই অপরিবর্তিত থাকে।
- চারটি JUnit regression test যোগ হয়েছে। Isolated Kotlin harness-এ helper-এর পাঁচটি assertion চালিয়ে PASS পাওয়া গেছে।

## ৩. ফাইল পরিবর্তন

পরিবর্তিত:
- `app/src/main/java/com/questionbank/app/ui/question/QuestionEditViewModel.kt`
- `app/src/main/java/com/questionbank/app/ui/question/QuestionEditScreen.kt`

নতুন:
- `app/src/main/java/com/questionbank/app/domain/question/QuestionEditBlockRules.kt`
- `app/src/test/java/com/questionbank/app/QuestionEditBlockRulesTest.kt`
- `CAA_EDITOR_IMPLEMENTATION_STATUS_v1_77.md`
- `VERSION_NOTES_CAA_EDITOR_PARITY_v1_77.md`
- `BUILD_STATUS_CAA_EDITOR_v1_77.txt`
- `PROJECT_PLAN_v1_77_CAA_EDITOR_PARITY.txt`
- `RECHECK_REPORT_v1_77_CAA_EDITOR_BN.md`

## ৪. সামঞ্জস্য ও ডেটা সুরক্ষা

- v1.76-এর অন্য সোর্স ও ঐতিহাসিক প্রকল্প নথি অপরিবর্তিত রাখা হয়েছে।
- এই increment-এ SQL schema, Room Entity/DAO, migration, database version, dependency, Gradle plugin, app `versionCode` বা `versionName` পরিবর্তন করা হয়নি।
- Persisted row মুছে ফেলার কাজ এখনো বিদ্যমান transactional save/update path-এ হয়; নতুন UI path সরাসরি database row মুছে না।
- বর্তমান ডেটা মডেলে একই label-এর একাধিক প্রশ্ন নেই। তাই সদ্য deletion-এর জন্য চিহ্নিত persisted label একই edit session-এ পুনরায় যোগ করার চেষ্টা করা হয় না; অন্য genuinely unpersisted label থাকলে সেটি যোগ করা যায়।

## ৫. যাচাইয়ের ফলাফল

| যাচাই | ফলাফল |
|---|---|
| পরিবর্তিত সোর্স diff ও নিয়ম পর্যালোচনা | সম্পন্ন |
| Isolated Kotlin helper compile/run | PASS — ৫টি assertion |
| JUnit regression test file যোগ | সম্পন্ন; Gradle-এ চালানো হয়নি |
| Android Gradle build | NOT VERIFIED |
| Gradle unit-test suite | NOT VERIFIED |
| KSP / Room generation | NOT VERIFIED |
| androidTest compile / instrumentation | NOT VERIFIED |
| Debug / Release APK assembly | NOT VERIFIED |
| Emulator / physical-device test | NOT VERIFIED |

Gradle command চেষ্টা করা হয়েছে:

```text
./gradlew :app:compileDebugKotlin :app:testDebugUnitTest --offline --no-daemon
```

Gradle wrapper Gradle 8.14.3 distribution ডাউনলোড করতে গিয়ে `services.gradle.org` DNS `UnknownHostException`-এ থেমেছে। কোনো project Gradle task শুরু হয়নি। তাই isolated Kotlin harness-এর PASS-কে Android app compilation বা JUnit pass বলা যাবে না।

## ৬. অবশিষ্ট সীমাবদ্ধতা

CAA parity এখনো PARTIAL। একই label-এর একাধিক ব্লক, arbitrary ordering, persisted label reassignment, shared Chapter_CQ grouped Minimum/Full editor, পূর্ণ hierarchy picker/error navigation, KaTeX, cursor-aware math toolbar, পূর্ণ image edit queue/viewer, CAA solution marker import/export এবং ২৭টি বিভাগের পূর্ণ UI/device acceptance এখনও বাস্তবায়ন/যাচাই বাকি।

## ৭. সিদ্ধান্ত

v1.77-তে v1.76 পুনঃযাচাইয়ে চিহ্নিত Add-after-delete edge case-এর source correction এবং তার regression test যুক্ত হয়েছে। সোর্স-স্তরের helper পরীক্ষা পাস করেছে, কিন্তু Android build gate নেটওয়ার্ক/DNS বাধায় চালানো যায়নি। v1.77-কে source candidate হিসেবে গণ্য করতে হবে; build-verified APK বা সম্পূর্ণ CAA implementation হিসেবে নয়।

পরবর্তী আবশ্যক gate হলো GitHub CI-তে একই v1.77 source build/test করা এবং এরপর emulator/phone-এ delete → add → save → reopen ও failure/discard flow যাচাই করা।
