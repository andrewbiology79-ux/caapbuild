# Type CQ ও Chapter CQ Editor Conversion রিপোর্ট

**Base project:** `QuestionBank_v1_73_editor_design.zip`  
**Legacy reference:** `caapbuild-updated-34.zip`  
**Implementation:** Kotlin + Jetpack Compose; existing Room Database/ImagePipeline preserved.

## এই আপডেটে যা পরিবর্তন করা হয়েছে

### 1. Shared Native Editor Design
- নীল Editor Header-এ Close, Title, Unsaved badge, Undo, Redo এবং গোলাকার Save control পুনর্গঠন।
- `Minimum | Full Editor` segmented tabs-কে shared Compose component করা হয়েছে।
- White rounded section cards, bordered controls এবং legacy-style spacing ব্যবহার করা হয়েছে।
- Full Editor-এর horizontal math toolbar-এর ক্রম: inline, block, fraction, square root, power, subscript, summation, integral এবং Greek-symbol dropdown। Greek menu-তে চার-কলামের symbol grid আছে।
- Text editor-এ draggable resize grip, selection-aware formula insertion এবং লেখার ঘরের ঠিক নিচে inline live-preview card যুক্ত হয়েছে; Preview কোনো আলাদা পেজ, নতুন Editor screen বা AlertDialog-এ খোলে না।

### 2. Native LaTeX Rendering
- `RichLatexText.kt` যোগ করা হয়েছে। এটি `$...$` inline formula এবং `$$...$$` display formula আলাদা করে render করে।
- Inline formula-র জন্য `RaTeXSpan` এবং display formula-র জন্য `RaTeXView` ব্যবহার করা হয়েছে। Renderer native/offline; WebView বা CDN লাগবে না।
- Rendering ব্যর্থ হলে সূত্র লাল রঙে raw form-এ দেখানোর fallback আছে।
- Dependency: `io.github.erweixin:ratex-android:0.1.15`। RaTeX KaTeX-compatible renderer; এটি সম্পূর্ণ official KaTeX JavaScript engine নয় এবং সব KaTeX extension/macros-এর শতভাগ সমতা ধরে নেওয়া যাবে না।

### 3. Legacy-style Inline LaTeX Preview ও Board UI (এই সংশোধনী)
- পুরোনো `QuestionFormModal.tsx`-এর `EyeToggle` ও `LivePreview` আচরণ অনুসরণ করা হয়েছে: Eye বাটনটি সংশ্লিষ্ট Stimulus/Question/Solution/Short Answer-এর কন্ট্রোল লাইনে থাকে; চাপলে সেই TextArea-র ঠিক নিচে `লাইভ প্রিভিউ (KaTeX)` কার্ড খোলে।
- Preview একই Editor screen ও scroll content-এর অংশ; আলাদা পেজ, নতুন Editor window, Preview Dialog বা Preview AlertDialog তৈরি হয় না। Preview কার্ডে পুরোনো হালকা নীল/সাদা পটভূমি, বর্ডার, Eye icon, শিরোনাম ও rendered content আছে।
- Preview card-এ খালি লেখা থাকলে পুরোনো অ্যাপের মতো “উপরে লিখলে এখানে প্রিভিউ দেখা যাবে।” বার্তা থাকে।
- Board বাছাইয়ে পুরোনো compact 54dp Board dropdown → Board নির্বাচন → Year Picker overlay ধাপ রাখা হয়েছে। Year Picker-এ চার-কলামের বছর Grid, আগে যোগ করা বছর disabled/চিহ্নিত, এবং নিচে Manual Year + `+ যোগ` control আছে।
- `+ নতুন বোর্ড যুক্ত করুন` নির্বাচন করলে পুরোনো rounded overlay card-এ Code ও Name field পাশাপাশি এবং নিচে সমান Save/Cancel button দেখায়। Board-Year chip ছোট `CODE'YY` স্টাইলে দেখায় এবং tap করলে tag সরানো যায়।
- Manual year input পুরোনো Editor-এর 1990–2099 সীমা অনুসরণ করে; বর্তমান Room domain validation অক্ষত থাকে।

### 4. Type CQ
- নতুন প্রশ্ন তৈরির Editor-এর উদ্দীপক, প্রশ্ন, সমাধান ও সংক্ষিপ্ত উত্তরের Text Area একই shared Native editor component ব্যবহার করে।
- বিদ্যমান প্রশ্ন-গ্রুপ সম্পাদনার Screen-এও stimulus/question/solution/short-answer field-গুলো একই editor component-এ আনা হয়েছে।
- প্রশ্ন, উদ্দীপক, সমাধান ও সংক্ষিপ্ত উত্তরের Preview-তে LaTeX rendering যুক্ত হয়েছে।
- বিদ্যমান image attachments, board/year selection, rating, category, draft, validation এবং Room save logic অক্ষত রেখে UI-কে section-card ভিত্তিক করা হয়েছে।

### 5. Chapter CQ
- Chapter CQ-এর প্রশ্ন Editor-কে সাধারণ AlertDialog থেকে full-screen Native Editor-এ রূপান্তর করা হয়েছে।
- একই Header, Minimum/Full tabs, rounded cards, stimulus/question/solution areas, image picker, rating, board/year question tag, category এবং preview control যুক্ত হয়েছে।
- Chapter CQ question card-এর menu-তে **“এই উদ্দীপকে প্রশ্ন যোগ”** অপশন যুক্ত হয়েছে। এতে একই `stimulusId` ব্যবহার করে একই উদ্দীপক-গ্রুপে পরের প্রশ্ন যোগ করা যায়; ব্যবহৃত ক/খ/গ/ঘ label-এর পরের খালি label স্বয়ংক্রিয়ভাবে বেছে নেওয়া হয়।
- Chapter CQ question group, detail view এবং preview-তেও LaTeX rendering যুক্ত হয়েছে।

### 6. Question Display ও Search
- Type CQ/Chapter CQ cards, detail views এবং global search results-এ সূত্রযুক্ত stimulus/question/answer/solution text render করার ব্যবস্থা যুক্ত হয়েছে।

## Database ও data safety
- কোনো Room schema migration যোগ করা হয়নি।
- বিদ্যমান Type CQ group repository, Chapter CQ repository, Room transaction এবং ImagePipeline-এর মাধ্যমে save/image flow চালু রাখা হয়েছে।
- নতুন আলাদা data storage format বা IndexedDB compatibility layer প্রবর্তন করা হয়নি।

## এখনো অবশিষ্ট/যাচাই-প্রয়োজনীয় বিষয়

1. **Chapter CQ এক-session multi-question editor:** পুরোনো React modal-এ একই উদ্দীপকের অধীনে একাধিক question block একই modal session-এ যোগ/সাজিয়ে একবারে Save করা যেত। বর্তমান Native Chapter CQ Editor এখনো প্রতি Save-এ একটি question block সম্পাদনা করে। একই উদ্দীপক-গ্রুপে ধারাবাহিকভাবে প্রশ্ন যোগ করা যায়, কিন্তু এক modal-এ একাধিক block একসঙ্গে সম্পাদনা করার সমতা এখনো সম্পূর্ণ নয়।
2. **Chapter CQ stimulus board/year edit:** Chapter CQ card-এ stimulus board/year data দেখানো হয়; এই conversion-এ Chapter CQ stimulus-এর board/year tag edit control ও transactional save সম্পূর্ণভাবে আনা হয়নি। Question-এর board/year selection আছে।
3. **Pixel-perfect runtime comparison:** ব্যবহারকারীর দেওয়া তিনটি legacy screenshot-কে layout reference ধরা হয়েছে; কিন্তু নতুন APK চালিয়ে side-by-side screenshot comparison করা যায়নি।
4. **Formula compatibility:** সাধারণ KaTeX-সদৃশ inline/display math-এর জন্য RaTeX ব্যবহৃত হয়েছে। বিশেষ KaTeX extension, chemistry macro বা uncommon command আলাদাভাবে formula test করে নিশ্চিত করতে হবে।
5. **Custom board removal:** নতুন `TypeCqQuestionRepository` ইচ্ছাকৃতভাবে Board delete/archive API দেয় না (comment অনুযায়ী FK RESTRICT ও ব্যবহার হওয়া Board-এর data safety)। তাই পুরোনো Year Picker-এর custom board delete action এই UI-তে দেখানো হয়নি; Board management screen-এর archive workflow আলাদা আছে।
6. **Full Gradle compile:** এই পরিবেশে Gradle 8.14.3 wrapper distribution cache-এ ছিল না। `./gradlew :app:compileDebugKotlin --offline` চালানোর সময় wrapper `services.gradle.org` থেকে distribution আনতে চেয়েছে, কিন্তু DNS/network unavailable (`UnknownHostException`) হওয়ায় build শুরুই হয়নি। তাই এই ZIP-কে compiled/verified বলা হচ্ছে না। GitHub Actions-এ Gradle distribution ও Maven dependency download সম্ভব হলে সেখানে build চালাতে হবে।

## Recommended validation on GitHub Actions

1. `./gradlew :app:compileDebugKotlin`
2. `./gradlew testDebugUnitTest`
3. `./gradlew assembleDebug`
4. APK install করে Type CQ ও Chapter CQ—দুই Editor-এ Minimum/Full switch, inline/display formula, ভুল formula fallback, image add/remove/replace, Undo/Redo, draft recovery এবং Save/Edit round-trip পরীক্ষা।

**সারাংশ:** Editor-এর shared Native UI, পুরোনো অ্যাপের মতো inline LaTeX Preview, compact Board → Year Picker → Add Board flow, LaTeX editor/rendering path এবং দুই CQ flow-এর বেশিরভাগ দৃশ্যমান editing surface-এ কাজ করা হয়েছে। তবে উপরের সীমাবদ্ধতাগুলো বিশেষ করে Chapter CQ multi-block session parity এবং build verification বাকি—এগুলোকে সম্পূর্ণ হয়েছে বলে দাবি করা হচ্ছে না।
