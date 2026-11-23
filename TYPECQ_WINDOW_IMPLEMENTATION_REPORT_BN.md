# Type CQ Window — সংশোধিত বাস্তবায়ন প্রতিবেদন

**সোর্স সংস্করণ:** `0.2.48-typecq-atomic-style`  
**Version code:** `53`  
**তারিখ:** ২৩ নভেম্বর ২০২৬  
**সংশোধনের ভিত্তি:** `QuestionBank_TypeCQ_Window_Fixes_v0.2.47_Source.zip`  
**পুরোনো UI রেফারেন্স:** `caapbuild-updated-34.zip`  
**আচরণগত স্পেসিফিকেশন:** `TypeCQ_Window_Change_List.txt`

## ফলাফল

v0.2.47 পুনরায় পর্যালোচনা করে পাওয়া Concept loading, filter-সহ selection, Concept serial, partial Copy/Move transaction, card-style mismatch এবং Type CQ navigation inset-সংক্রান্ত সোর্স-স্তরের সমস্যাগুলো v0.2.48-এ সংশোধন করা হয়েছে। এর সঙ্গে multi-card Paste-এর retry আচরণও স্পেসিফিকেশনের Copy ও Cut নিয়মের সঙ্গে মিলিয়ে দেওয়া হয়েছে।

**গুরুত্বপূর্ণ সীমা:** Gradle distribution ডাউনলোড ব্যর্থ হওয়ায় পুরো Android project compile, Gradle unit/instrumentation tests, APK build ও ফোনে UI test চালানো যায়নি। তাই প্যাকেজটিকে **source-updated / build-unverified** ধরা হবে; build/device verified বলা হচ্ছে না।

## সংশোধনের বিবরণ

### ১. Concept loading ও data-loss protection
- `ConceptScreen.kt`-এ প্রথম Compose `null`-কে “কনসেপ্ট নেই” হিসেবে ধরা হয় না; DAO Flow-এর প্রথম emission-ই loaded state নির্ধারণ করে।
- Loading ও load error আলাদা; error থাকলে Add/Edit/Save controls disabled থাকে।
- Existing Concept-এর data initial load শেষ হওয়ার আগে empty editor থেকে Save করা সম্ভব নয়।
- Save handler-এও loaded/error guard আছে; শুধু UI button disable-এর ওপর নির্ভর করা হয়নি।

### ২. Filter, selection ও bulk Copy/Cut
- নির্বাচিত group key-গুলো full topic collection থেকে resolve হয়; বর্তমান Search/Filter/Sort view-এর বাইরে থাকা selected card-ও Copy/Cut-এ অন্তর্ভুক্ত হয়।
- Header selection count এবং action-এর source list একই পূর্ণ topic collection থেকে আসে; visible-only `Select All` নিয়ম অপরিবর্তিত।

### ৩. Concept-এর স্থায়ী প্রশ্ন নম্বর
- `topicCardNumber()` stable `QuestionGroupKey` ব্যবহার করে full, unfiltered topic order থেকে card serial নির্ধারণ করে।
- Search/Filter/Sort-এর দৃশ্যমান list index আর Concept screen-এ serial হিসেবে ব্যবহৃত হয় না।
- Search result আগে এলেও full topic collection লোড না হওয়া পর্যন্ত card action দেখানো হয় না; এতে সাময়িকভাবে ভুল `1` নম্বর পাঠানো এড়ানো হয়।
- `QuestionListLogicTest`-এ filtered ও sorted view-এর serial পূর্ণ topic order-এর সঙ্গে মিলিয়ে পরীক্ষা করার test source যোগ হয়েছে।

### ৪. Copy, Cut-Paste ও database atomicity
- `AppContainer` থেকে একই production `QuestionBankDatabase` repository-তে inject করা হয়েছে।
- Card Copy-তে question/stimulus rows, solution/image references, tags, category data, copied Concept/Concept parts এবং final card ordering একটি outer Room `withTransaction`-এর মধ্যে চলে।
- Cross-topic Cut-Paste-তে card-এর topic/order পরিবর্তন, Concept owner-এর topic পরিবর্তন এবং target ordering একই outer transaction-এ হয়।
- Nested DAO write ব্যর্থ বা `false` ফেরালে repository abort exception ছুড়ে outer transaction rollback করায়; partial card/concept/order write commit হয় না।
- `beforeWrite`-এর full-sync pragma transaction-এর আগে চালানো হয়, transaction-এর মধ্যে নয়।
- Transaction database বা Concept DAO সংযোগ না থাকলে repository আংশিকভাবে Copy না করে নিরাপদে failure ফেরায়।
- Copy-র সময় সাধারণ নতুন প্রশ্ন Save-এর মতো Target Topic-এর অসম্পূর্ণ create-draft মুছে ফেলা হয় না; DAO-তে draft-clear key ফাঁকা রাখা হয়। ফলে চলমান প্রশ্ন-লেখার Draft অক্ষত থাকে।
- একই কার্ডকে নিজেরই Paste Before/After anchor করলে সেটি no-op; অপ্রত্যাশিতভাবে তালিকার শেষে সরানো হয় না।

### ৫. Clipboard ও duplicate retry protection
- একসঙ্গে একাধিক Paste শুরু হওয়া process-wide lock দিয়ে আটকানো হয়েছে; অন্য topic screen-ও একই `pasteInProgress` state পায়।
- সব card operation সফল হলে Cut entries ক্লিপবোর্ড থেকে সরে যায়, কিন্তু Copy entries থাকে—তাই একই Copy বারবার Paste করা যায়।
- Multi-card Paste আংশিক ব্যর্থ হলে ইতিমধ্যে সফল হওয়া Copy entries retry-এর সময় সাময়িকভাবে skip হয়; সফল Cut entries সরিয়ে ফেলা হয়; ব্যর্থ entries retry-এর জন্য থাকে। Pending retry শেষ হলে Copy clipboard আবার repeatable হয়।
- প্রতিটি clipboard entry-র পৃথক identity থাকায় পুরোনো in-flight Paste নতুন করে একই card Copy করা clipboard item-কে ভুল করে consume করে না।
- `TypeCqClipboardStateTest`-এ repeatable Copy, Cut consumption, partial retry, retry completion এবং concurrent Paste guard-এর test source যোগ হয়েছে।

### ৬. Card styling ও image fidelity
পুরোনো React card source-এর প্রকৃত class/style এবং Type CQ change specification মিলিয়ে:
- Card outline: brand blue `#3B4FD8`, `1.5dp`; corner radius `16dp`।
- Ribbon: brand blue; dark theme-এর জন্য পৃথক dark-blue token।
- Paper category chip: emerald background/text/border; board chip neutral white/dark surface ও neutral border।
- উদ্দীপকের ছবি: full-width, aspect ratio বজায়, no crop, `12dp` corner এবং neutral border।
- দাগের শিরোনাম, ছোট solution button ও 12dp/1dp-border solution panel-এর রং, padding ও corner update করা হয়েছে।
- Light/Dark color tokens `Theme.kt`-এ Type-CQ scope-এর জন্য রাখা হয়েছে; Chapter CQ shared component-এ styling পরিবর্তন করা হয়নি।
- Missing-solution button grey ও disabled রাখা হয়েছে (ব্যবহারকারীর সিদ্ধান্ত)।

### ৭. Type CQ-only bottom navigation inset
- Compact Type CQ NavigationBar-এ modifier order `navigationBarsPadding().height(54.dp)` করা হয়েছে, যাতে system inset bar-এর 54dp visible height কমিয়ে না দেয়।
- Compact behavior শুধু Type CQ destination-এ প্রযোজ্য; অন্য tab-গুলোর আগের inset behavior অপরিবর্তিত।
- Source-level fix হয়েছে; gesture এবং 3-button navigation-এ physical-device confirmation বাকি।

## নতুন test source

- `QuestionListLogicTest`: filtered/sorted result থেকে Concept serial full topic order-এ থাকে।
- `TypeCqClipboardStateTest`: repeated Copy, successful Cut removal, partial retry duplicate guard, retry completion, concurrent paste guard।
- `TypeCqCopyMoveTransactionTest` (Android instrumentation):
  - Copy-তে card ও Concept-এর পৃথক ID এবং target ordering যাচাই;
  - final reorder trigger দিয়ে Copy transaction rollback;
  - successful cross-topic Move-তে একই question/Concept ID ও target order যাচাই;
  - final reorder ব্যর্থ হলে Move ও Concept ownership rollback যাচাই;
  - Copy-র পর Target Topic-এর অসম্পূর্ণ create-draft অক্ষত থাকে এবং self-anchor Paste ordering বদলায় না—এগুলোর test source যোগ।

## Schema, migration ও backup regression scope

v0.2.48 pass-এ v0.2.47-এর তুলনায় নিচের ফাইল/এলাকা পরিবর্তন করা হয়নি:
- canonical SQLite SQL ও Room exported schema;
- Room migration এবং database entities/DAOs (repository-এর transaction call ছাড়া);
- Backup/Restore implementation ও media archive logic;
- Profile paper-category persistence এবং Type CQ category/filter implementation।

এটি file-diff ভিত্তিক scope check; নতুন migration বা backup runtime test এই pass-এ চালানো হয়নি।

## যাচাইয়ের ফলাফল

| পরীক্ষা | ফলাফল | নোট |
|---|---|---|
| v0.2.47 source-এর সঙ্গে পরিবর্তিত ফাইল diff | সম্পন্ন | পরিবর্তিত ফাইলগুলো আলাদা করে পর্যালোচনা |
| Schema/migration/backup/media file scope comparison | সম্পন্ন | এই pass-এ অপরিবর্তিত |
| Clipboard state standalone Kotlin compilation | PASS | `kotlinc` দিয়ে compile করা হয়েছে |
| Clipboard state JVM test methods | PASS (6/6) | Local minimal Flow/JUnit facade দিয়ে state logic executable check |
| Question-list logic JVM test methods | PASS (4/4) | Full-topic serial, filtered/sorted serial ও count formatting |
| Clipboard state executable smoke checks | PASS | Repeatable Copy, partial retry, Cut consume যাচাই |
| Kotlin PSI syntax parse | PASS (217 files) | Main, unit-test ও Android-test Kotlin source; এটি type-check/Android compile নয় |
| Gradle unit tests | চালানো যায়নি | Wrapper distribution network/DNS ব্যর্থ |
| Android instrumentation tests | চালানো যায়নি | Gradle distribution অনুপলব্ধ |
| Android Kotlin/Compose project compile | অযাচাইকৃত | Compile শুরু হয়নি |
| APK assemble | চালানো যায়নি | Gradle distribution অনুপলব্ধ |
| বাস্তব ফোনে UI / Insets / image rendering | বাকি | এই পরিবেশে device test নেই |

Gradle চালানোর সময় `services.gradle.org`-এ `UnknownHostException` হয়েছে; wrapper `gradle-8.14.3-bin.zip` ডাউনলোড করতে পারেনি। তাই নতুন instrumentation/unit test source যোগ করা হয়েছে, কিন্তু সেগুলো pass করেছে এমন দাবি করা হচ্ছে না।

## পরবর্তী পরিবেশে চালানোর কমান্ড

```bash
./gradlew :app:testDebugUnitTest :app:compileDebugKotlin :app:compileDebugAndroidTestKotlin :app:assembleDebug --no-daemon
```

তারপর অন্তত দুই ধরনের Android navigation (gesture ও 3-button) এবং Light/Dark theme-এ card, Concept load/save, filter-সহ Copy/Cut, partial retry, cross-topic move, backup/restore হাতে যাচাই করতে হবে।
