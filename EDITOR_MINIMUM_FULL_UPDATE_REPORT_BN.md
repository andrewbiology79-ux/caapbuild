# Minimum ও Full Editor — বাস্তবায়ন রিপোর্ট

## ভিত্তি
- পুরোনো Reference Source: `caapbuild-updated-34.zip` (React/TypeScript)
- পরিবর্তিত Android Source: `QuestionBank_Full_CI_Fixed.zip` (Kotlin, Jetpack Compose, Room)
- কাজের ধরন: পুরোনো `QuestionFormModal.tsx`-এর প্রশ্ন কার্ড, Board Chips ও Solution Parts আচরণের সঙ্গে নতুন Editor মিলিয়ে পরিবর্তন। নতুন অ্যাপের Room/Compose architecture অপরিবর্তিত রাখা হয়েছে।

## এই প্যাচে যা পরিবর্তন হয়েছে

### ১. Board/Year Chips
- Shared `EdTagChips` FlowRow এখন ডানদিকে align করা হয়েছে; Chip-গুলোর data order অপরিবর্তিত আছে।
- Chapter CQ প্রশ্ন সম্পাদনায় একাধিক Board/Year Tag নির্বাচন, draft-এ সংরক্ষণ/পুনরুদ্ধার এবং `sortOrder`-সহ database save করা হয়েছে।
- নতুন Chip append হয়; ডানদিকে সারিবদ্ধ হওয়ায় সর্বশেষ যোগ করা Chip ডান প্রান্তে দেখা যায়। Duplicate tag ও পুরোনো tag-এর mapping logic বজায় আছে।

### ২. Text Area Resize
- Shared `EdTextArea`-এ নিচের ডান কোণে drag handle-এর touch target বাড়ানো হয়েছে।
- Drag করে উচ্চতা ৫২dp থেকে ৬২০dp-এর মধ্যে পরিবর্তন করা যায়।
- আগে শুধু minimum height বদলানোর কারণে দীর্ঘ লেখা নির্ধারিত আকারের বাইরে ঘর বাড়িয়ে দিতে পারত; এখন Text Area container ও BasicTextField-এ বর্তমান height নির্দিষ্ট করা হয়েছে।
- Stimulus, Question, Solution ও Short Answer-এর custom EdTextArea-গুলো এই shared resize আচরণ পায়।
- Placeholder text-ও Settings-নির্ধারিত body font size অনুসরণ করে; resize handle-এর accessibility description যোগ করা হয়েছে।

### ৩. Type CQ — Minimum ও Full
- নতুন Type CQ Editor-এর default প্রশ্ন কার্ডের ক্রম এখন গ, ঘ।
- Full Editor-এর `আরও প্রশ্ন যোগ করো` ব্যবহার করে অব্যবহৃত লেবেল ক, খ যোগ করা যায়; প্রথমে ক, পরে খ যোগ হয়।
- Minimum Editor-এ প্রশ্ন তালিকার শিরোনাম ও Add Question control লুকানো থাকে।
- Full-এ প্রশ্ন কার্ডের অতিরিক্ত controls (যেমন Question Type, marks field, delete/reorder/add controls) থাকে; মূল প্রশ্ন ও সমাধান কাঠামো একই রাখার চেষ্টা করা হয়েছে।
- বিদ্যমান group edit screen-এ Minimum mode-এ খালি ক/খ কার্ড লুকানো হয়; আগে থেকে সংরক্ষিত ক/খ-এর তথ্য থাকলে তা আড়াল করে ফেলা হয় না।

### ৪. Solution Parts
- Solution section-এর header-এ Preview/Eye ও শুরুতে ছবি যোগ করার control রাখা হয়েছে।
- Solution-এর ordered text/image parts ধারাবাহিকভাবে দেখানো হয়।
- নিচের ডান পাশে শেষে ছবি যোগ ও আরেকটি solution text box যোগ করার control আছে।
- কেবল ছবি থাকলে অন্তত একটি খালি text part তৈরি/দেখানো হয়, যাতে solution-এ text লেখার ঘর থাকে।
- Minimum ও Full—দুই মোডেই Solution আছে; Short Answer শুধু Full-এ দেখানো হয়।
- Type CQ create/edit এবং Chapter CQ single-question editor-এ একই মূল solution control arrangement প্রয়োগ করা হয়েছে।

### ৫. Chapter CQ — নিরাপদ সীমিত পরিবর্তন
- Chapter CQ-তে প্রশ্নের Board/Year একাধিক tag হিসেবে ধরে রাখা, draft restore এবং ordered save করা হয়েছে।
- নতুন প্রশ্নের লেবেল বাছাইয়ের ক্রম গ, ঘ, ক, খ; Minimum-এ গ/ঘ দিয়ে শুরু হয় এবং Full mode-এ অব্যবহৃত label বেছে নেওয়া যায়।
- Chapter CQ-তে Solution দুই মোডেই এবং Short Answer শুধু Full-এ রাখা হয়েছে।

## গুরুত্বপূর্ণ অসম্পূর্ণতা / সীমাবদ্ধতা

1. **Chapter CQ এখনো একই Editor Session-এ গ ও ঘ-র একাধিক প্রশ্ন কার্ড একসঙ্গে দেখায় না।** বর্তমান Chapter CQ save flow একটি question record করে। একই উদ্দীপকের অধীনে গ ও ঘ আলাদা সেভ সেশনে যোগ করা যায়; এক স্ক্রিনে একাধিক কার্ড সম্পাদনার জন্য repository/transaction layer-এ আলাদা group-edit workflow দরকার। ডেটা অক্ষত রাখার জন্য এই প্যাচে ঝুঁকিপূর্ণ batch rewrite করা হয়নি।
2. Chapter CQ editor-এ পুরোনো অ্যাপের মতো **Stimulus-এর নিজস্ব Board/Year tag picker** এখনও সম্পূর্ণভাবে যোগ করা হয়নি; এই প্যাচে Chapter CQ-এর question-level tags আপডেট হয়েছে। Type CQ group edit screen-এ Stimulus Board tags বিদ্যমান।
3. Type CQ create screen-এ Full-এর Add Question flow আছে। তবে Type CQ-এর পুরোনো group edit screen-এ ক/খ slot-এর দৃশ্যমানতা এখনও create screen-এর মতো পৃথক Add control-ভিত্তিক নয়; Full mode-এ group-এর চারটি slot দেখানোর বর্তমান আচরণ পুরোপুরি legacy add interaction-এর সমান নয়।
4. চারটি কার্ডের core control parity source-level-এ আংশিক মিলেছে; pixel-perfect parity প্রমাণ করতে দুই অ্যাপ চালিয়ে পাশাপাশি screenshot comparison এখনও করা হয়নি।
5. resize handle touch/drag আচরণ source-এ যোগ করা হয়েছে, কিন্তু real device gesture test এখনও করা হয়নি।

## পরিবর্তিত Kotlin ফাইল
1. `app/src/main/java/com/questionbank/app/ui/question/EditorDesign.kt`
2. `app/src/main/java/com/questionbank/app/ui/question/QuestionEditorScreen.kt`
3. `app/src/main/java/com/questionbank/app/ui/question/QuestionEditScreen.kt`
4. `app/src/main/java/com/questionbank/app/ui/question/QuestionEditViewModel.kt`
5. `app/src/main/java/com/questionbank/app/ui/question/ChapterCqWorkspaceScreen.kt`
6. `app/src/main/java/com/questionbank/app/ui/question/QuestionEditorViewModel.kt`

## যাচাইয়ের ফল
- ZIP integrity: প্যাক করার পর `unzip -t` দিয়ে যাচাই করা হবে।
- Static source assertions: ১৩/১৩ শর্ত পাস করেছে (resize, alignment, Type CQ default order, Full-only add/short answer, solution controls, Chapter CQ tag persistence/label ordering)।
- Kotlin parser scan: Android/Compose dependencies/classpath না থাকায় পূর্ণ compile সম্ভব হয়নি; parser-specific `expecting`/`unexpected tokens`/unclosed-token diagnostics পাওয়া যায়নি। এটি compilation success নয়।
- Android Gradle compile: চালানোর চেষ্টা করা হয়েছে, কিন্তু Gradle 8.14.3 wrapper download-এর সময় `services.gradle.org` DNS/network failure (`UnknownHostException`) হওয়ায় compile থেমেছে।
- Emulator/physical device UI test: করা হয়নি।

## সুপারিশকৃত পরবর্তী কাজ
- Chapter CQ-এর জন্য একই stimulus-এ বহু প্রশ্নের একক group editor এবং atomic multi-question save flow তৈরি করা।
- Chapter CQ Stimulus Board/Year picker পুরোনো UI অনুযায়ী যোগ করা।
- Type CQ edit screen-এ Full mode-এর explicit K/Kh Add flow এবং remove/restore আচরণ create screen-এর সঙ্গে এক করা।
- Build সম্ভব হলে APK build করে দুই অ্যাপের screenshot comparison ও resize drag-এর device test চালানো।
