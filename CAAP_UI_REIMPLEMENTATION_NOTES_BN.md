# CAAP UI রেফারেন্স অনুসারে QuestionBank UI আপডেট — v1.74

তারিখ: ২০ নভেম্বর ২০২৬

## লক্ষ্য

`caapbuild-updated-34.zip` এবং ব্যবহারকারীর দেওয়া প্রশ্ন কার্ড ও Minimum/Full Editor-এর স্ক্রিনশট অনুসরণ করে নতুন Android QuestionBank অ্যাপের Type_CQ UI-কে যতটা সম্ভব কাছাকাছি করা হয়েছে। পুনর্নির্মাণটি native Jetpack Compose-এ; CAAP-এর React/TypeScript runtime কপি বা যোগ করা হয়নি।

## প্রশ্ন কার্ড ও তালিকা

- গোলাকার নীল বর্ডারযুক্ত কার্ড, নীল হেডার রিবন, প্রশ্ন নম্বর, selection checkbox, হলুদ পাঁচ-তারকা rating badge এবং overflow action।
- হালকা board/year strip, বড় Bengali question typography, stimulus/image area, question divider এবং bordered সমাধান দেখাও/লুকাও control।
- Card menu-তে বর্তমান অ্যাপে কার্যকর Edit, Reference, Copy ও Delete (confirmation-সহ) action রাখা হয়েছে।
- Question-list app bar-এ Select all, clear selection এবং bulk delete; নীল Add question action; bottom navigation-এ custom outline icons।

## Minimum ও Full Editor

- X, Undo, Redo ও circular Save/Check-সহ নীল editor header; segmented Minimum / Full Editor bar।
- Stimulus ও question toolbar-এ inline board selector, removable board/year chips, preview, rating ও compact image attachment control।
- বড় bordered text-entry area, reference input, question type/marks controls, solution preview/image controls এবং Full mode-এর math toolbar।
- Math toolbar-এ inline math, block math, fraction, exponent, root, vector, hat, sigma, integral এবং কিছু প্রচলিত symbol insertion।
- Existing draft, undo/redo, validation, image pipeline এবং save/update ViewModel path ব্যবহার করা হয়েছে।

## পরিবর্তিত সোর্স

- `app/src/main/java/com/questionbank/app/ui/components/AppHeader.kt`
- `app/src/main/java/com/questionbank/app/ui/navigation/AppNavHost.kt`
- `app/src/main/java/com/questionbank/app/ui/question/BoardTagsEditor.kt`
- `app/src/main/java/com/questionbank/app/ui/question/EditorControls.kt`
- `app/src/main/java/com/questionbank/app/ui/question/EditorDesign.kt`
- `app/src/main/java/com/questionbank/app/ui/question/EditorImageAttachments.kt`
- `app/src/main/java/com/questionbank/app/ui/question/QuestionCard.kt`
- `app/src/main/java/com/questionbank/app/ui/question/QuestionEditScreen.kt`
- `app/src/main/java/com/questionbank/app/ui/question/QuestionEditorScreen.kt`
- `app/src/main/java/com/questionbank/app/ui/question/QuestionListLogic.kt`
- `app/src/main/java/com/questionbank/app/ui/question/QuestionListScreen.kt`
- `app/src/test/java/com/questionbank/app/QuestionListLogicTest.kt`

## ইচ্ছাকৃতভাবে না-যোগ করা অংশ

- Cut/Paste/Paste before/Paste after এবং JSON/Folder import-export menu item নিষ্ক্রিয়ভাবে যোগ করা হয়নি; বর্তমান প্রশ্ন-তালিকায় এগুলোর সম্পূর্ণ action path নেই।
- Full Editor-এর screenshot-এ থাকা subject/chapter/topic selector নতুন editor-এর ভিতরে duplicate করা হয়নি, কারণ target app-এ hierarchy নির্বাচন editor-এ প্রবেশের আগেই হয় এবং editor topic-scoped।
- Compose rendering browser UI-এর pixel-perfect অনুলিপি নয়। Math preview এখনও plain text; পূর্ণ KaTeX/MathJax এবং cursor-aware equation editing এই আপডেটের অংশ নয়।

## অপরিবর্তিত

- Room/SQLite schema, entities, DAOs, repositories এবং ViewModel save/update flow-তে ইচ্ছাকৃত পরিবর্তন নেই।
- React, Dexie বা IndexedDB runtime dependency যোগ করা হয়নি।
- App versionCode/versionName পরিবর্তন করা হয়নি; project plan-এর version policy item P-56 এখনো open।

## বিল্ড ও পরীক্ষার অবস্থা

`./gradlew :app:testDebugUnitTest :app:compileDebugKotlin --offline --no-daemon` চেষ্টা করা হয়েছিল। Wrapper-এ প্রয়োজনীয় Gradle 8.14.3 আগে থেকে cache-এ ছিল না এবং `services.gradle.org` DNS/network failure (`UnknownHostException`) হওয়ায় Gradle project task শুরু হওয়ার আগেই থেমেছে। তাই এই ZIP compile-tested, KSP/Room-generated, unit-tested, emulator-tested বা APK-built বলা যাচ্ছে না। v1.72-এর পুরোনো CI/emulator evidence এই নতুন source যাচাই করে না।

## পরবর্তী বাধ্যতামূলক যাচাই

1. এই exact source CI-তে push করে compile, KSP/Room generation, unit tests এবং release assemble চালাতে হবে।
2. একই commit-এ emulator/instrumentation tests চালাতে হবে।
3. বাস্তব ফোনে add/edit, card menu, selection, board/year tag, rating, image, solution toggle, undo/redo, save, dark theme এবং keyboard/scroll যাচাই করতে হবে।
4. ফোনের screenshot দেখে CAAP reference-এর সঙ্গে spacing/size পুনরায় tune করতে হবে।
