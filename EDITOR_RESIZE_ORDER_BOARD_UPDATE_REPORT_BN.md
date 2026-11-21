# QuestionBank Editor – Resize, Question Order ও Board-Year Display Update

## ভিত্তি

এই আপডেটটি আগের `QuestionBank_Editor_Category_Optional_Question_Rechecked.zip`-এর উপর তৈরি। আগের Category Dropdown, Solution Box remove, optional K/Kh question এবং অন্যান্য Editor পরিবর্তনগুলো বজায় রেখে এই পর্যায়ের নতুন নির্দেশনাগুলো যোগ/সংশোধন করা হয়েছে।

## এই পর্যায়ে করা পরিবর্তন

### ১. Text Area resize ও দুই পাশের সাদা ফাঁক

- উদ্দীপক, Reference, প্রশ্ন, সংক্ষিপ্ত উত্তর এবং সমাধানের Text Area-গুলো একই `EdTextArea` ব্যবহার করে; তাই পরিবর্তনটি Type CQ ও Chapter CQ-এর সংশ্লিষ্ট ঘরগুলোতেও প্রযোজ্য।
- Text Area-র ভেতরের বাম ও ডান দিকের অতিরিক্ত padding শূন্য করা হয়েছে, যাতে ঘর ছোট করলে দুই পাশে চওড়া সাদা ফাঁক না থাকে।
- নিচের ডান কোণের resize grip-এর জন্য নিচে ২৬dp জায়গা রাখা হয়েছে, যাতে grip লেখার সঙ্গে ধাক্কা না খায়।
- এক লাইনের লেখা দৃশ্যমান রাখার জন্য ন্যূনতম উচ্চতা নির্ধারিত: সাধারণত কমপক্ষে ৫৬dp; Settings-এর font size ও Android system font scale বেশি হলে প্রয়োজন অনুযায়ী ন্যূনতম উচ্চতা আরও বাড়বে।
- Resize-এর সীমা সর্বোচ্চ ৬২০dp। অস্বাভাবিক/invalid drag value এলে ন্যূনতম বৈধ উচ্চতায় ফিরে যাবে।

### ২. Full থেকে Minimum-এ K/Kh কার্ডের দৃশ্যমানতা

- নতুন Type CQ Editor-এ Minimum মোডের প্রাথমিক কার্ড এখনো শুধু গ ও ঘ।
- Full Editor-এ ক যোগ করলে সেটি গ-এর উপরে এবং খ যোগ করলে ক ও গ-এর মাঝে দেখা যায়।
- Full-এ যোগ করা ক/খ কার্ড Minimum-এ ফিরে গেলেও দেখা যাবে। ক যোগ করা থাকলে শুধু ক; ক ও খ দুটো যোগ করা থাকলে দুটোই দেখা যাবে।
- Minimum-এ ওই কার্ডগুলোতে Minimum-এর নিয়ন্ত্রণ/বৈশিষ্ট্যই থাকবে; Full-only Toolbar, Marks editing ও অন্যান্য Full-only control দেখানো হবে না।
- আগে থেকে সংরক্ষিত ক/খ থাকলেও Minimum Edit Screen-এ সেগুলো থাকবে।

### ৩. ক–খ–গ–ঘ ক্রম

- নতুন প্রশ্ন তৈরির Editor, Edit Screen এবং Chapter CQ-এর প্রশ্ন-তালিকার label ordering ক → খ → গ → ঘ করা হয়েছে।
- ক/খ যোগ করার state update বর্তমান mask-এর সঙ্গে merge করে; দ্রুত পরপর ক ও খ যোগ করলেও আগের নির্বাচন হারিয়ে যাওয়ার ঝুঁকি কমানো হয়েছে।
- ছোট ক+/খ+ বাটন এবং icon-only sort control রাখা হয়েছে।

### ৪. একই বোর্ডের একাধিক সাল

- একই boardCode-এর একাধিক বছর এখন একটি visual Chip-এ দেখানো হয়; সালগুলো কমা দিয়ে আলাদা থাকবে, যেমন `DHA '২৩, '২৫`।
- একই বোর্ড-সাল duplicate হলে display-তে duplicate হবে না।
- Chip-এর ভেতরে প্রতিটি সাল আলাদাভাবে সরানো যায়; underlying BoardTag storage আগের মতোই পৃথক board-year record রাখে।
- Editor-এর tag display, editable board tags এবং read-only list chip—সবখানেই grouping helper ব্যবহার করা হয়েছে।

## সংশোধিত সোর্স ফাইল

1. `app/src/main/java/com/questionbank/app/ui/question/EditorDesign.kt`
2. `app/src/main/java/com/questionbank/app/ui/question/EditorTextAreaRules.kt` (নতুন)
3. `app/src/main/java/com/questionbank/app/ui/question/BoardTagsEditor.kt`
4. `app/src/main/java/com/questionbank/app/domain/question/BoardModels.kt`
5. `app/src/main/java/com/questionbank/app/ui/question/QuestionEditorScreen.kt`
6. `app/src/main/java/com/questionbank/app/ui/question/QuestionEditScreen.kt`
7. `app/src/main/java/com/questionbank/app/ui/question/QuestionEditViewModel.kt`
8. `app/src/main/java/com/questionbank/app/ui/question/ChapterCqWorkspaceScreen.kt`

## Test ও যাচাই

### সম্পন্ন

- প্রকৃত Kotlin source থেকে `EditorTextAreaRules`, `BoardModels`, `QuestionModels` ও `BanglaText` compile করে standalone logic checks চালানো হয়েছে। Resize minimum/maximum, system font scale, invalid height fallback, K–Kh–G–Gh ordering এবং duplicate board-year grouping checks পাস করেছে।
- পরিবর্তিত Compose source-এ parser-level scan চালানো হয়েছে; `expecting`, `unexpected tokens`, unclosed comment/string ধরনের syntax diagnostics পাওয়া যায়নি। AndroidX/Compose classpath ছাড়া standalone compiler scan-এ unresolved reference থাকা স্বাভাবিক; এটি পূর্ণ Kotlin compile নয়।
- ১৩টি নির্দিষ্ট static source checks পাস করেছে।
- ZIP packaging-এর পরে `unzip -t` দিয়ে archive integrity পরীক্ষা করা হয়েছে।

### এখনো সম্পন্ন করা যায়নি

- `./gradlew :app:compileDebugKotlin` চালানোর চেষ্টা করা হয়েছে, কিন্তু Gradle Wrapper-এর `gradle-8.14.3` distribution আনতে `services.gradle.org`-এ DNS resolution ব্যর্থ (`UnknownHostException`) হয়েছে। তাই পূর্ণ Android Gradle compile সফল হয়েছে বলা যাচ্ছে না।
- Emulator/বাস্তব Android ডিভাইসে visual test করা হয়নি।

## পরিচিত সীমাবদ্ধতা

- Text Area-র resize behavior সোর্স ও pure Kotlin constraints দিয়ে যাচাই করা হয়েছে; বাস্তব ডিভাইসে drag feel, keyboard interaction ও font rendering এখনো দেখা হয়নি।
- Chapter CQ-এর বর্তমান editor architecture এখনো একটি প্রশ্ন-কার্ড একবারে edit/save করে। এই আপডেটে Chapter CQ list ordering ঠিক করা হয়েছে; একই session-এ একাধিক card edit/save workspace তৈরি করা হয়নি।
- Board chip-এ বোর্ডের code এবং বছর দেখানো হয়; Catalog displayName-কে chip-এর code-এর বদলে দেখানো হয়নি, কারণ বর্তমান editor chip pattern-এ code-ই ব্যবহৃত হচ্ছে।

## Build status

**Source update ও archive তৈরি হয়েছে; Android build এবং device-level UI verification এখনো বাকি।**
