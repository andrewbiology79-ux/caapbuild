# সর্বশেষ সম্পূর্ণ সংশোধন — Type CQ / Editor / Clipboard / Migration

তারিখ: ২৩ নভেম্বর ২০২৬  
অ্যাপ সংস্করণ: `0.2.48-typecq-window` (versionCode 53)  
ভিত্তি: `QuestionBank_TypeCQ_Updated_Full_RECHECKED.zip`; এর Profile Category, Concept ও আগের Formula/Spacing পরিবর্তন অক্ষত রেখে নিম্নের সংশোধনগুলো একত্র করা হয়েছে।

**এই সর্বশেষ অংশটি নিচের পুরোনো v0.2.47 নোটের বিপরীত কোনো নির্দেশ থাকলে সেটিকে supersede করে।**

## সর্বশেষভাবে সম্পন্ন সোর্স পরিবর্তন

- Breadcrumb, নির্বাচিত কার্ডের সংখ্যা ও দৃশ্যমান/মোট কার্ডের count একই রেখায়; একটি Stimulus ও তার সব উপপ্রশ্ন একটি কার্ড হিসেবে গণনা হয়।
- `+ Add Question` লেখা-সহ compact Extended FAB ফিরিয়ে আনা হয়েছে; primary container alpha 0.75।
- Card ribbon-এ serial-এর পাশে উচ্চ contrast Checkbox এবং ডানদিকে rating ও ⋮ menu।
- Card ⋮ menu-তে Edit, Reference, Copy, Cut, Paste after, Paste before ও Delete; Copy/Cut clipboard ব্যবহার করে, Paste clipboard খালি থাকলে নিষ্ক্রিয়।
- Paper Category chip আগের link-created time অনুযায়ী newest-first horizontal strip-এ থাকে। Board chip-এর প্রথমটি ডান প্রান্তে, বাকি বাম দিকে; wrapped line-ও ডান থেকে শুরু। Stimulus board উপরের strip-এ, sub-question board নিজ নিজ Show Solution button-এর পাশে।
- Stimulus image placement অনুযায়ী TOP image → stimulus → BOTTOM image; full width, uncropped, source aspect ratio অক্ষত এবং একাধিক ছবি পৃথকভাবে vertical stack।
- প্রতিটি sub-question-এর নিজস্ব compact Show Solution button, question category multi-select এবং Concept entry। Question Category Type CQ Reference Data থেকে আসে; Paper Category আলাদা থাকে।
- Concept editor-এ Minimum/Full mode, TEXT/IMAGE block add/remove/reorder, Math toolbar ও KaTeX preview; edit চলাকালে discard confirmation। Save/Discard-এ সদ্য import করা কিন্তু আর ব্যবহৃত নয় এমন image reference-count যাচাই করে পরিষ্কার হয়।
- Type menu-তে Select All (বর্তমান visible/filter result), Deselect, Copy, Cut, Paste, Delete এবং সব Concept দেখুন। Clipboard সম্পূর্ণ card/group, solution ও concept content নিয়ে কাজ করে।
- Folder menu item-এর label `ফোল্ডার থেকে প্রশ্ন যোগ করুন`; বর্তমান scope অনুযায়ী item নিষ্ক্রিয়, নতুন folder-sync feature যোগ করা হয়নি। JSON paste menu item নেই।
- পুরোনো card-এর এককালীন order migration: topic অনুযায়ী oldest card আগে, stimulus group-এর ক/খ/গ/ঘ ক্রম অক্ষত; শুধু `sort_order` বদলায়, existing question/stimulus IDs ও content অপরিবর্তিত। পরবর্তী নতুন card সবসময় নিচে যোগ হয়।
- Concept `part_id` সংঘর্ষের ক্ষেত্রে Solution table নয়, Concept parts table পরীক্ষা করে; collision হলে নতুন UUID ব্যবহার করে।
- Room Migration 1→2 (Concept table create) উভয় SQLite migration API-তে এবং 2→3 (legacy Type CQ ordering) উভয় API-তে সংজ্ঞায়িত; app-এর Bundled SQLite driver-এর জন্য `SQLiteConnection` path রয়েছে।
- Backup Restore এখন backup-এর নিজস্ব manifest/schema identity যাচাই করে candidate-কে বিচ্ছিন্ন database copy-তে production Room migration দিয়ে current schema-তে তোলে; schema hash, table counts, integrity ও FK যাচাই সম্পন্ন না হলে Ready দেয় না।
- Paper Category summary Flow recomposition-এ বারবার নতুন করে তৈরি হয় না; batch enrichment stimulus-image query-র N+1 চাপ কমায়; breadcrumb-এর আগের ধাপে যাওয়ার navigation fallback রয়েছে।
- Minimum/Full Question Editor-এর default Minimum বজায়; Full mode-এর hierarchy controls, optional ক/খ, marks, short-answer, math tools, image replace/export/large preview এবং preview controls অক্ষত। Formula সব screen-এ horizontal scrollable, scrollbar hidden, font size unchanged; `<br>` line breaks ও spacing settings অক্ষত।

## সর্বশেষ যাচাই

- পূর্ণ v2 SQLite schema-এ `2→3` reorder SQL চালিয়ে oldest-first, standalone card, Stimulus group ও ক/গ sub-question order যাচাই: PASS; question/stimulus IDs অক্ষত।
- আপলোড করা চারটি ZIP-এর archive integrity: PASS।
- Gradle `./gradlew --no-daemon testDebugUnitTest assembleDebug` চালানো হয়েছে, কিন্তু Gradle wrapper 8.14.3-এর distribution `services.gradle.org` DNS `UnknownHostException`-এ download হয়নি; compilation শুরুই হয়নি।
- তাই এই ফাইলকে Android type-check/compile, Room KSP schema export, Unit/Instrumented test, APK build বা device UI verified বলা হচ্ছে না। Android build সফল হওয়ার পরে নতুন schema `2.json`/`3.json` KSP export এবং সব Instrumented migration/UI tests চালাতে হবে।

---

# Type CQ Window — বাস্তবায়ন ও যাচাই নোট

তারিখ: ২৩ নভেম্বর ২০২৬  
অ্যাপ সংস্করণ: `0.2.47-typecq-window` (versionCode 52)  
বেস: আগের সম্পূর্ণ আপডেটেড Android প্রজেক্ট; আগের Profile Category পরিবর্তন অক্ষত রাখা হয়েছে।

## বাস্তবায়িত পরিবর্তন

### Type CQ তালিকা ও নেভিগেশন
- Home → Subject → Chapter → বর্তমান Type পর্যন্ত horizontal breadcrumb; আগের ধাপে ট্যাপ করে ফেরা যায়।
- Breadcrumb-এর নিচে নির্বাচিত কার্ডের সংখ্যা বামে এবং দৃশ্যমান/মোট কার্ডের সংখ্যা ডানে।
- দৃশ্যমান ফলাফল ও মোট সংখ্যা `SavedGroup`-এর ভিত্তিতে গণনা হয়; একটি Stimulus-এর অধীনে একাধিক sub-question থাকলেও সেটি একটি কার্ড।
- Add Question floating button ছোট এবং কিছুটা স্বচ্ছ।
- Type CQ menu এখন App Header-এ; Search/Filter অবস্থাতেও একই menu ব্যবহার করা যায়।

### প্রশ্ন কার্ড
- পুরোনো Caa-র নীল Ribbon ও হলুদ rating badge-এর কাছাকাছি রঙিন নকশা।
- Ribbon-এ serial, selection checkbox, rating এবং card kebab; Edit, Details/Reference, full-group duplicate, full-group delete অপশন অক্ষত।
- প্রশ্নপত্রের category chip বাম দিকে horizontal-scrollable; সর্বশেষ ব্যবহৃত category আগে আসে। Board/year chip ডানদিকে wrap করে।
- Stimulus-এর TOP/BOTTOM ছবি যথাক্রমে stimulus text-এর আগে/পরে; একাধিক ছবি আলাদা লাইনে, আসল aspect ratio বজায় রেখে, crop ছাড়া দেখায়। আমদানি করা ছবির সর্বোচ্চ সংরক্ষিত edge 2048 px।
- Stimulus, থাকলে reference, তারপর শুধু উপস্থিত ক/খ/গ/ঘ sub-question দেখায়। প্রতিটি sub-question-এর সমাধান toggle এবং নিজস্ব Board/year tags আছে।
- কার্ডের নিচে একটি Question Category multi-select dropdown ও Concept বাটন। Category ID পুরো কার্ডের সব sub-question-এ একই transaction-এ প্রয়োগ হয়; filtered search-এ লুকানো sub-question-এর category-ও অক্ষত থাকে।

### Concept
- প্রতিটি পৃথক sub-question-এর জন্য আলাদা Concept; একাধিক sub-question-যুক্ত কার্ডে Concept বাটন চাপলে আগে sub-question নির্বাচন করা যায়।
- Room v2-তে `type_cq_concepts` ও `type_cq_concept_parts`; Concept text/image ordered content part হিসেবে সংরক্ষিত।
- Minimum/Full Editor switch; text, image add/remove/reorder; Math toolbar ও KaTeX preview toggle।
- Type CQ menu-র “সব Concept দেখুন” বর্তমান Type-এর সব Concept-এর তালিকা দেখায় এবং সেখান থেকে Concept খোলা যায়।
- Concept image reference count-এ যুক্ত; ব্যবহৃত ছবি reference থাকলে মুছতে দেওয়া হয় না।

### Type CQ Ribbon menu / selection / clipboard
- Select All শুধু বর্তমানে দৃশ্যমান/ফিল্টার-ম্যাচ করা card নির্বাচন করে; Deselect নির্বাচিত card বাদ দেয়।
- Copy, Cut, Paste এবং Delete-এর count card হিসেবে দেখায়। Paste কেবল clipboard-এ card থাকলে দেখায়।
- Clipboard-এ সর্বদা সম্পূর্ণ card রাখা হয়; search result থেকে action দিলেও source-এ পূর্ণ group লোড হয়।
- Copy নতুন question/stimulus ID তৈরি করে এবং Concept/solution/image/tag/category কপি করে। Cut মূল ID বজায় রেখে Type/Topic স্থানান্তর করে, তাই আগে থেকে থাকা Paper Source Link বজায় থাকে।
- Delete selected cards transactional; Concept/solution/question child data cascade হয়। Paper question-এর snapshot অক্ষত থাকে, source link `NULL` হয়।
- “ফোল্ডার থেকে প্রশ্ন যোগ করো” নামের menu item দৃশ্যমান, তবে Android বেসে Folder Sync-এর কোনো Type CQ action ছিল না; অনুরোধ অনুযায়ী এখানে নতুন sync/functionality যোগ করা হয়নি, item নিষ্ক্রিয়।
- Type CQ Android বেসে “JSON paste করে প্রশ্ন যোগ” menu item ছিল না; এটি যোগ করা হয়নি।

### Sort order
- নতুন question `min(sort_order)-1` পায় এবং list `sort_order DESC` অনুসারে সাজে; এতে আগের card order অক্ষত থাকে এবং নতুন card সবার নিচে যায়।

### Backup / Restore
- Concept table database-এর অংশ এবং Concept media `media/type_cq`-এর অংশ। বিদ্যমান backup archive সম্পূর্ণ database ও এই media folder অন্তর্ভুক্ত করে; আলাদা Concept backup format প্রয়োজন হয়নি।

## যাচাই

### সফল পরীক্ষা
- ১৬৮টি Kotlin source file Kotlin PSI parser দিয়ে parse: PASS (এটি syntax parse; Android type-check/compile নয়)।
- Fresh v2 SQLite schema + integrity / foreign-key checks: PASS.
- v1 Room schema-তে থাকা ৩৫টি entity-এর সঙ্গে v1.1 SQL schema-র ordinary table list মিল: PASS; দুটি অতিরিক্ত FTS virtual table canonical objects.
- v1.1 → v2 additive migration এবং Concept insert/read-back SQL: PASS.
- Stimulus-এর অধীনে ২টি sub-question = ১টি card counting query: PASS.
- Card-level category set একাধিক sub-question-এ সমানভাবে প্রয়োগ: PASS.
- Concept TEXT/IMAGE part save, image FK RESTRICT, question delete-এ Concept cascade: PASS.
- Question delete-এর পর Paper snapshot থাকে ও source question link `NULL` হয়: PASS.
- Parent-topic consistency trigger সক্রিয় রেখে cross-topic CUT-এর detach → stimulus move → reattach sequence: PASS; question ID ও Paper Source Link অক্ষত।
- নতুন question insertion: আগের sort order অক্ষত, নতুন প্রশ্ন শেষে: PASS.
- Fresh schema ও migration উভয় ক্ষেত্রেই `PRAGMA integrity_check = ok`, `PRAGMA foreign_key_check`-এ কোনো row নেই: PASS.

### এখনো যাচাই করা যায়নি
- `./gradlew --offline :app:assembleDebug --no-daemon` চালালে Gradle wrapper 8.14.3 download করার চেষ্টা করে; `services.gradle.org` DNS সংযোগে `UnknownHostException` হওয়ায় Gradle compile শুরুই হয়নি।
- তাই Android/KSP/Room annotation processor-এর পূর্ণ type-check, APK build, emulator/device UI test সম্পন্ন হয়নি। Kotlin PSI parser সফল হওয়া পূর্ণ compile-এর বিকল্প নয়।
- বাস্তব UI-তে font scaling, dark theme, large image memory, menu positioning এবং touch behavior ডিভাইসে পরীক্ষা করা বাকি।


## সতর্ক পুনরায় যাচাইয়ের পর সংশোধন (২৩ নভেম্বর ২০২৬)
- আগের candidate ZIP পুনরায় খুলে base Profile Categories প্রজেক্টের সঙ্গে ফাইল-পাথ মিলানো হয়েছে; কোনো base ফাইল বাদ যায়নি।
- পুরোনো Caa `CollectionScreen.tsx`-এর প্রকৃত বিন্যাস মিলিয়ে নিশ্চিত করা হয়েছে: উপরের Board strip-এ কেবল Stimulus-এর board/year থাকে; প্রতিটি sub-question-এর আলাদা board তার নিজের সমাধান বাটনের পাশে থাকে।
- Paper usage query-এর ফল আগে question ID অনুসারে group করা হচ্ছিল; এতে card-এর ভেতরে paper/category-এর global newest-first order হারাতে পারত। এখন একবার global paper-link `created_at DESC, updated_at DESC, paper_id DESC` order-এ rows আনা হয় এবং সেই order অক্ষুণ্ন রেখে card-এ filter করা হয়। Search result-এ শুধু matching sub-question দেখা গেলেও category chip-এর জন্য সম্পূর্ণ Stimulus group-এর সব question ID নেওয়া হয়; তাই filtered card-এ Paper Category বাদ পড়ে না। নতুন Paper Category তাই বামে আসে, পুরোনোটি ডানে সরে যায়।
- Search debounce চলার সময় আগের পুরো topic-কে Select All করে ফেলার race বন্ধ: search/filter criteria বদলালে সঙ্গে সঙ্গে `searchPending` হয়, ফল প্রস্তুত না হওয়া পর্যন্ত visible selection set খালি থাকে এবং loading indicator দেখা যায়।
- Clipboard এখন process-wide Compose-observable state; এক Type থেকে অন্য Type-এ CUT/COPY/PASTE করলে অন্য ViewModel-এর Paste count stale থাকে না।
- Concept-এর ফাঁকা TEXT block editor-এ সংরক্ষণ করা যায়; Copy/Paste ও duplicate path-এ একই blank-but-present TEXT block বৈধ হিসেবে গ্রহণ করা হয়।
- `QuestionCard.kt`-এ পুনরাবৃত্ত Compose imports সরানো হয়েছে। Gradle wrapper script executable permission-সহ রাখা হয়েছে।
- পুনরায় পরীক্ষা: ১৬৮ Kotlin file, ০ PSI syntax error; fresh v2 SQLite schema ও v1.1→v2 migration, Concept image FK, card counting, cross-topic CUT, Paper source/snapshot preservation এবং delete cascade—সব PASS।
- পূর্ণ Gradle compile এখনো করা যায়নি: `services.gradle.org`-এ `UnknownHostException`; Android/KSP type-check, APK ও device test এখনো unverified।

## গুরুত্বপূর্ণ নোট
- `app/schemas/.../1.json` পুরোনো Room schema হিসেবে রাখা হয়েছে; নতুন Room compiler build হলে schema v2 export করবে।
- অ্যাপের Application ID ও debug signing key অপরিবর্তিত; versionCode 52 করা হয়েছে যাতে আগের versionCode 51 ইনস্টলেশনের উপর আপডেট করা যায় (APK build সফল হওয়া সাপেক্ষে)।

- অতিরিক্ত recheck: Concept save path-এ explicit empty TEXT block filter হয়ে যাচ্ছিল; Repository validation এখন `null` ও empty string-কে আলাদা করে, ফলে নতুন blank text block editor-এ শুরু করে সংরক্ষণ/পরে পূরণ করা যায়। Paper Category order-এ Paper row update time নয়, question-to-paper link-এর `created_at` আগে বিবেচিত হয়—নতুন link-এর category বামে থাকে।
- কার্ডের stimulus sequence-এ TOP image → উদ্দীপক → BOTTOM image → optional reference → sub-questions ক্রম রাখা হয়েছে; ফলে নিচের ছবি উদ্দীপকের পরপরই আসে।
