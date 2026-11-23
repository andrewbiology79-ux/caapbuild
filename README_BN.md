# সর্বশেষ প্রজেক্ট আপডেট — Type CQ Card Category / Concept / Compact UI (২৩ নভেম্বর ২০২৬)

এই সোর্স প্যাকেজে Type CQ কার্ড-স্তরের একক Category selector, Minimum ও Full—দুই Editor-এ Reference-এর নিচে Category, Full-screen Concept preview/editor, TEXT/IMAGE Concept draft/save recovery, Filter-এর মধ্যে Board/Year/Category/Rating/Question Type ও Sorting, নতুন Search/Filter icon, compact header/tab, card display cleanup এবং code + full year newest-first Board chips অন্তর্ভুক্ত। Paper Category আলাদা রাখা হয়েছে; Reference/Short Answer-এর সংরক্ষিত ডেটা মুছে ফেলা হয়নি। নতুন card-category field পুরোনো per-question category link থেকে আলাদা এবং শুরুতে NULL থাকে; পুরোনো category data অক্ষত থাকে। Room Database version 4 (3→4 additive migration)। Version: **0.2.50-typecq-card-category (code 55)**। Build এখনো Gradle 8.14.3 download DNS সমস্যায় compile হয়নি; syntax parse ও SQLite migration simulation সম্পন্ন। বিস্তারিত `CHANGELOG_TYPE_CQ_BN.md`, `BUILD_STATUS.txt` এবং `PROJECT_PLAN_v1_73_TYPECQ_CARD_CATEGORY_SEPARATION.txt`।

**Build limitation:** Kotlin PSI syntax parse (সব ১৬৮টি app Kotlin ফাইল, ০ syntax error) এবং SQLite Room 3→4 migration simulation PASS। Gradle wrapper 8.14.3 download করতে `services.gradle.org` DNS `UnknownHostException` হওয়ায় Android compile/test/APK/device UI এখনো verified নয়।
---

# সর্বশেষ আপডেট — Profile Category Management (22 Nov 2026)

এই সোর্স প্যাকেজে Profile থেকে প্রশ্নপত্রের ক্যাটাগরি পরিচালনা যোগ করা হয়েছে: ক্যাটাগরি তৈরি/নাম সম্পাদনা/রিঅর্ডার, ক্যাটাগরি ও প্রশ্নপত্রে multi-select এবং delete। ক্যাটাগরি মুছলে তার ভেতরের সব প্রশ্নপত্র ও snapshot data মুছে যায়; মূল Type CQ / Chapter CQ source question অক্ষত থাকে। `অশ্রেণীবদ্ধ` স্থায়ী এবং restore/open-এর সময় duplicate variant merge করে একটিমাত্র system category রাখা হয়। Version: **0.2.45-profile-categories (code 50)**। বিস্তারিত `CHANGELOG_PROFILE_CATEGORIES_BN.md`।

**যাচাই সীমাবদ্ধতা:** SQLite schema/runtime installer, duplicate repair ও delete cascade Python SQLite-এ যাচাই করা হয়েছে। Gradle 8.14.3 ডাউনলোডে `services.gradle.org` DNS/network ব্যর্থ হওয়ায় Android Gradle compile/test/APK build এবং device UI test এই পরিবেশে সম্পন্ন হয়নি।

---

# v1.71: CI compile errors fixed (compilefix2), plan: PROJECT_PLAN_v1_71_COMPILEFIX_CI.txt, not yet re-run.

# সর্বশেষ সোর্স প্রার্থী — v1.70 (Phase 0–16, source-only)

এই প্যাকেজে Phase 0–15-এর source/documentation অগ্রগতি এবং Phase 16-এর static integration review আছে। Phase 0–15-এর একাধিক exit criterion এখনও বাকি; Phase 16 test ও 146-item audit ছাড়া সম্পন্ন বলা যাচ্ছে না। Phase 17 ইচ্ছাকৃতভাবে শুরু করা হয়নি। **কোনো Gradle build/compile/KSP, test, APK/AAB build বা device run করা হয়নি।** বিস্তারিত: `PROJECT_PLAN_v1_70_PHASE0_16_SOURCE_UNVERIFIED.txt`, `PHASE0_16_IMPLEMENTATION_STATUS_v1_70_SOURCE_UNVERIFIED.md`, `PHASE0_16_STATIC_RECHECK_REPORT_v1_70.md`।

---

# ঐতিহাসিক build-foundation নোট — v0.2.30c ও তার আগের সংস্করণ

এটি সম্পূর্ণ অ্যাপ নয়; এটি Android/Room build foundation-এর ধাপে ধাপে আপডেট।

- Type_CQ, Chapter_CQ এবং Paper workflow একই `QuestionBank.db` ব্যবহার করবে।
- দুই CQ system-এর table family ও repository boundary আলাদা থাকবে।
- Room ৩৫টি entity পরিচালনা করে; FTS5-এর ২টি virtual table ও trigger Room callback থেকে install হয়।
- v0.2.18 যাচাই হয়েছে: CI (১১/১১ ইউনিট টেস্ট) ও এমুলেটর (৩,০০,০০০ প্রশ্নে ১১/১১ টেস্ট) সবুজ। FTS rowid (F-1) ও বাংলা NFC (F-2) নিশ্চিত।
- v0.2.19 যাচাই হয়েছে: CI run 27 সবুজ (১১/১১ টেস্ট, release variant সহ)। এমুলেটরে ৩,০০,০০০ প্রশ্নে ১১/১১ টেস্ট সবুজ।
- v0.2.20 ফোনে ইনস্টল করে যাচাই হয়েছে: হোম স্ক্রিন ও বাংলা লেখা ঠিক দেখায়।
- v0.2.21 এমুলেটরে চালিয়ে বাগ ধরা পড়েছে: নাম পরিষ্কার করার regex Android-এ চলে না। v0.2.22-এ ঠিক করা হয়েছে (এখনো compile করা হয়নি)। v0.2.21-এর APK ব্যবহার করবেন না।
- বিস্তারিত: `BUILD_STATUS.txt`, `VERSION_NOTES_0.2.29.md`, `docs/`, `PROJECT_PLAN_v1_40_UPDATED.txt`।
- v0.2.23: টপিকের ভেতরে প্রশ্ন যোগ (উদ্দীপক + ক-ঘ), সব-অথবা-কিছুই-না সংরক্ষণ, স্বয়ংক্রিয় ড্রাফট, স্থায়ী ডিবাগ সাইনিং কী। এখনো compile/run করা হয়নি। v0.2.22 থেকে আসার সময় একবার আনইনস্টল করতে হবে।
- v0.2.23 ফোনে যাচাই হয়েছে: প্রশ্ন সংরক্ষণ, রিসেন্ট থেকে বন্ধ করে আবার খুললে প্রশ্ন থাকা, এবং না-সংরক্ষিত ড্রাফট ফিরে আসা ঠিক আছে।
- v0.2.24: ব্যাকআপ তৈরি (যাচাইসহ) ও ব্যাকআপ থেকে রিস্টোর (অ্যাপ একবার বন্ধ করে খুলতে হয়; আগের ডাটাবেস ফোনে রাখা থাকে)। ফোনে যাচাই হয়েছে: আনইনস্টল ছাড়া আপডেট, ব্যাকআপ, রিস্টোর ও ভুল ফাইল প্রত্যাখ্যান ঠিক আছে।
- v0.2.25: নতুন ডিজাইনের কাঠামো — নিচে পাঁচটি ট্যাব (Create, Type CQ, Chapter CQ, Filter, Profile), নীল হেডার, Profile-এ লাইট/ডার্ক থিম ও লেখার আকার, বাংলা সংখ্যা। এখনো compile/run করা হয়নি। এরপর: বিষয়/অধ্যায়/টপিক ব্যবস্থাপনা (v0.2.26)।
- v0.2.25 যাচাই হয়েছে (মালিকের রিপোর্ট): CI, এমুলেটর টেস্ট ও ফোনের চেকলিস্ট ঠিক আছে।
- v0.2.26: বিষয়/অধ্যায়/টপিক তালিকায় প্রশ্ন-গণনা, ব্রেডক্রাম্ব, নাম পরিবর্তন, মুছে ফেলা (শুধু খালি আইটেম) ও তীর দিয়ে ক্রম পরিবর্তন। এখনো compile/run করা হয়নি। এরপর: প্রশ্নের কার্ড, খোঁজা ও সম্পাদনা (v0.2.27)।
- ব্যাকআপ ফাইল ফোনের বাইরে (Drive/কম্পিউটার) রাখুন; নইলে আনইনস্টল বা "Clear data"-তে সেটিও যেতে পারে।
- v0.2.26 যাচাই হয়েছে: CI ৫৭টি ইউনিট টেস্ট, এমুলেটর ৫১টি টেস্ট, ফোনের চেকলিস্ট (মালিকের রিপোর্ট)।
- v0.2.27 (পার্ট A): প্রশ্নের নতুন কার্ড ও টপিকের ভেতরে বাংলা খোঁজা। CI, emulator ও ফোন চেক সম্পন্ন (confirmed)।
- v0.2.28 (পার্ট B-১): কার্ডের ⋮ মেনু থেকে "সম্পাদনা", সংরক্ষিত লেখা এডিটরে খোলা, এক লেনদেনে সংরক্ষণ (সব বা কিছুই না)। প্রশ্ন খালি করা যায় না (মুছে ফেলা পরের ধাপ)। এখনো compile/run করা হয়নি। এরপর: v0.2.29 — সম্পাদনার স্বয়ংক্রিয় ড্রাফট।
- v0.2.29 (পার্ট B-২ + হ্যাশট্যাগ সার্চ): সম্পাদনার স্বয়ংক্রিয় ড্রাফট (অ্যাপ বন্ধ হলেও লেখা ফেরে; সংরক্ষণে ড্রাফট একই লেনদেনে মোছে; "ফেলে দিন"-এ মোছে) এবং `#` দিয়ে শুরু হওয়া শব্দ `#` চিহ্নসহ খোঁজা। এখনো compile/run করা হয়নি। এরপর: v0.2.30 — এডিটরের ক্ষেত্র (রেটিং, বোর্ড, সাল, নম্বর)।
- v0.2.29 যাচাই হয়েছে (মালিকের রিপোর্ট): CI, ইনস্ট্রুমেন্টেড টেস্ট ও ফোনের চেকলিস্ট ঠিক আছে।
- v0.2.30a (এডিটরের ক্ষেত্র — ধাপ A-১): প্রশ্ন ও উদ্দীপকের রেটিং (১–৫) সংরক্ষণ, সম্পাদনায় রেটিং বদল, ড্রাফটে রেটিং — শুধু ডেটা ও নিয়মের স্তর, পর্দায় কোনো বদল নেই (অ্যাপ v0.2.29-এর মতোই দেখায়)। এখনো compile/run করা হয়নি। এরপর: v0.2.30b — দুই এডিটর পর্দায় রেটিং বাটন।
- v0.2.30b (এডিটরের ক্ষেত্র — ধাপ A-২): নতুন-প্রশ্ন ও সম্পাদনা পর্দায় উদ্দীপক ও প্রতিটি প্রশ্নের জন্য ১★–৫★ রেটিং বাটন (সহজ, মোটামুটি, মাঝারি, ভালো, চ্যালেঞ্জিং); আবার চাপলে রেটিং মুছে যায়; শুধু রেটিং বদলালেও সংরক্ষণ চালু হয়; ড্রাফটে রেটিং থাকে। কার্ডে রেটিং নিয়ম U-1 অনুযায়ী। a ও b একসাথে পরীক্ষা হবে। এখনো compile/run করা হয়নি। এরপর: v0.2.30c — বোর্ড ও সাল।
- v0.2.30c (এডিটরের ক্ষেত্র — ধাপ C-১): বোর্ড তালিকায় ১১টি বিল্ট-ইন বোর্ড (ঢাকা, রাজশাহী, কুমিল্লা, যশোর, চট্টগ্রাম, বরিশাল, সিলেট, দিনাজপুর, ময়মনসিংহ, মাদ্রাসা, কারিগরি), নিজের বোর্ড যোগ করার নিয়ম, এবং প্রশ্ন ও উদ্দীপকে বোর্ড + সাল (১৯০০–২২০০) সংরক্ষণ, সম্পাদনা ও ফের পড়ে মেলানো — শুধু ডেটা ও নিয়মের স্তর, পর্দায় কোনো বদল নেই। ড্রাফটে বোর্ড এখনো নেই (C-২)। এখনো compile/run করা হয়নি। এরপর: C-২ — বোর্ড বাছাই, সালের উইন্ডো, চিপ, নতুন বোর্ড যুক্ত করুন।

## LaTeX সূত্র স্ক্রলিং
- বড় Inline (`$...$`) ও Block (`$$...$$`) সূত্র আঙুল দিয়ে ডানে-বামে স্ক্রল করা যাবে।
- Horizontal/Vertical scrollbar দেখানো হয় না; formula-র font size fit করানোর জন্য ছোট করা হয় না।
- সূত্র বদলালে নতুন সূত্রের দৃশ্য বাম দিক থেকে শুরু হয়।
- সাধারণ লেখা স্বাভাবিকভাবে লাইনে wrap করে।
- Build সফল হওয়ার পর Type_CQ/Chapter_CQ preview, Saved Question details/cards এবং Search-এ দীর্ঘ inline ও block সূত্র দিয়ে বাস্তবে পরীক্ষা করতে হবে।
- **লাইন ব্রেক চিহ্ন `<br>`:** যেখানে `<br>` লিখবেন, তার পরের অংশ নতুন লাইনে যাবে। যেমন `$v_2 = \frac{a}{n}$ <br> $= \frac{a}{2}$ <br> $= 1.09 \times 10^6$` তিনটি সূত্র একটির নিচে আরেকটি দেখাবে। সূত্রের ভেতরে `<br>` দিলে সূত্রটি দুই লাইনে ভাগ হয়। পরপর দুটি `<br>` দিলে একটি ফাঁকা লাইন হয়। `$$...$$` ব্লকের গায়ে লাগানো `<br>` উপেক্ষা করা হয়। `<br>` না থাকলে আগের মতোই দেখায়; সাধারণ Enter-ও আগের মতো।
- `\\` (aligned/matrix-এর জন্য) ও `\neq`, `\nu`-এর মতো কমান্ড আগের মতোই কাজ করে; এগুলো লাইন ব্রেক নয়।
- **সেটিংস পাতা:** প্রোফাইল > সেটিংস। এখানে চারটি অপশন, প্রতিটিতে − / + / ডিফল্ট; উপরে একটি নমুনা লেখা থাকে যাতে বদল সঙ্গে সঙ্গে দেখা যায়।
  1. **লাইন স্পেসিং** (১০০%–২০০%, ডিফল্ট ১১৮%): সাধারণ লেখার এক লাইন থেকে পরের লাইনের দূরত্ব। এডিটরের টাইপ করার ঘর বদলায় না।
  2. **`<br>` ফাঁক** (০–২৪ dp, ডিফল্ট ৪): `<br>` দিয়ে ভাঙা দুই লাইনের মাঝের ফাঁক।
  3. **`$$...$$` স্পেসিং** (০–২৪ dp, ডিফল্ট ২): ব্লক সূত্র ও তার আগের-পরের লেখার মাঝের দূরত্ব।
  4. **মূল অ্যাপের ফন্ট সাইজ** (১২–২৮, ডিফল্ট ১৬): আগের "লেখার আকার" অপশনটি এখন এখানে; প্রশ্ন, উদ্দীপক, উত্তর ও সমাধানের লেখায় প্রযোজ্য, বাটন-লেবেলে নয়।
- মানগুলো ফোনেই জমা থাকে, ব্যাকআপে যায় না।


PROFILE CATEGORY RECHECK (22 Nov 2026)
- Canonical fixed folder name matches the original SQL/old Caa source exactly: `অশ্রেণিবদ্ধ` (হ্রস্ব ই).
- Restore repair merges both the canonical spelling and the previously introduced long-ঈ spelling, including whitespace variants.
- The fixed folder displays the same row menu, with rename/delete disabled.
- Android Gradle tests remain unrun because Gradle 8.14.3 cannot be downloaded in this environment (DNS unavailable).

## Type CQ Window আপডেট (v0.2.47)
- Type CQ-তে Home → Subject → Chapter → Type breadcrumb, selected/visible/total card count এবং ছোট, semi-transparent Add Question action।
- প্রশ্ন কার্ডে old Caa-ধাঁচের নীল ribbon, serial/checkbox/rating/kebab; Paper Category chip, Board/year tags, uncropped full-width stimulus images এবং expandable solutions।
- পুরো card-এর জন্য Question Category dropdown; Concept প্রতিটি sub-question-এর জন্য আলাদা করে text/image আকারে সংরক্ষিত হয়। Concept editor-এ Minimum/Full mode, mixed text/image parts, Math toolbar ও KaTeX preview রয়েছে।
- Type menu-তে filtered Select All, Deselect, Copy, Cut, Paste, Delete ও সব Concept দেখুন। নতুন প্রশ্ন পুরোনো card order বজায় রেখে নিচে যোগ হয়।
- সম্পূর্ণ পরিবর্তন ও পরীক্ষা-ফল `CHANGELOG_TYPE_CQ_BN.md`-এ লেখা আছে। Android Gradle build এই পরিবেশে চালানো যায়নি, কারণ Gradle 8.14.3 distribution server DNS সংযোগ ব্যর্থ হয়েছে; তাই APK/device UI verified নয়।
