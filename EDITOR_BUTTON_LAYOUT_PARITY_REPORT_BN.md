# Editor Button Layout Parity — বাংলা রিপোর্ট

তারিখ: ২১ নভেম্বর ২০২৬

## লক্ষ্য

পুরোনো React/TypeScript Editor-এর Button Size, বাম-থেকে-ডানে ক্রম, একই Row-তে অবস্থান, gap, রং ও control density নতুন Kotlin/Jetpack Compose Editor-এ যতটা সম্ভব একই করা। এটি শুধু button সাজানো নয়; কোনো কার্যকর action বাদ না দিয়ে বিদ্যমান callback-ই রাখা হয়েছে।

## প্রয়োগ করা মাপ

| কন্ট্রোল | পুরোনো সোর্সের মাপ | নতুন Native Editor-এ |
|---|---:|---:|
| Header Close | 44 × 44 px | 44 × 44 dp |
| Header Undo | 36 × 36 px | 36 × 36 dp |
| Header Redo | 36 × 36 px | 36 × 36 dp |
| Header Save | 36 × 36 px | 36 × 36 dp |
| Board selector | 54 × 32 px | 54 × 32 dp |
| Preview/Eye | 32 × 32 px | 32 × 32 dp |
| Rating selector | 32 px high | 32 dp high |
| Add Image | 32 × 32 px | 32 × 32 dp |
| Delete | 32 × 32 px | 32 × 32 dp |
| Marks input | 36 px wide × 32 px high | 36 × 32 dp |
| Minimum/Full tab | 26 px high | 26 dp high |
| LaTeX toolbar buttons | 44 px high | 44 dp high |
| Year Grid item | 44 px minimum | 44 dp |

Android dp ও Web CSS px একেবারে একই rendering unit নয়; তাই মাপগুলো source-এর numeric dimension অনুসারে মেলানো হয়েছে। ডিভাইসে চোখে দেখা তুলনা এখনও প্রয়োজন।

## Row Order

### Header

বাম থেকে ডানে: **Close → Editor Title → Unsaved Badge → Undo → Redo → Save**।

### উদ্দীপক Controls

বাম পাশে উদ্দীপকের শিরোনাম; ডান পাশে: **Board → Preview → Rating → Add Image**।

### Full Editor Question Controls

বাম পাশে: **ক/খ/গ/ঘ Label → Marks**। ডান পাশে: **Board → Preview → Rating → Delete**।

### Minimum Editor Question Controls

বাম পাশে: **ক/খ/গ/ঘ Label → Marks text**। ডান পাশে: **Board → Preview → Rating**।

### Solution Controls

বাম পাশে Solution title; ডান পাশে: **Preview → Add Image**। Type CQ Edit এবং Chapter CQ Workspace-এর Solution header-এ এই ক্রম রাখা হয়েছে।

### LaTeX Toolbar

পুরোনো সোর্সের ক্রম রাখা হয়েছে: **Inline → Block → Fraction → Square Root → Power → Subscript → Summation → Integral → Greek Symbols**।

## কোন পরিবর্তন হয়েছে

- `EditorDesign.kt`: shared icon buttons 32dp, compact pill 32dp, 36dp marks field, 26dp mode tab; header 44/36dp button geometry; LaTeX control row compacted to source spacing.
- `QuestionEditorScreen.kt`: stimulus এবং question control-গুলো non-wrapping `Row`-তে রাখা হয়েছে; Board/Eye/Rating/Image এবং Board/Eye/Rating/Delete-এর পুরোনো ক্রম রাখা হয়েছে।
- `QuestionEditScreen.kt`: বিদ্যমান প্রশ্ন সম্পাদনার Header control row একই মাপে আনা হয়েছে; Full Editor-এ label/marks আলাদা লাইনে না রেখে একই row-তে আনা হয়েছে; Solution Preview-এর পাশে Add Image icon রাখা হয়েছে।
- `ChapterCqWorkspaceScreen.kt`: question control row-এর মাপ shared component থেকে নেওয়া; Solution-এর Eye ও Add Image একই row-তে আনা হয়েছে।
- `BoardTagsEditor.kt`: Board selector 54×32dp; Year Picker-এর তালিকায় ২০১০ সালও যোগ করা হয়েছে।
- `EditorImageAttachments.kt`: Solution image control একই header row-তে ব্যবহার করার জন্য add-button visibility option যোগ করা হয়েছে।

## গুরুত্বপূর্ণ সীমাবদ্ধতা

1. Chapter CQ Workspace-এর বর্তমান form-state/save contract-এ Stimulus Board/Year edit ও persist করার পূর্ণ flow নেই। তাই সেখানে কার্যকর নয় এমন Board button কেবল দেখানোর জন্য যোগ করা হয়নি। এই স্ক্রিনের Stimulus row-এ বর্তমানে **Preview → Rating → Add Image** আছে; সম্পূর্ণ পুরোনো parity পেতে stimulus-board persistence adapter দরকার।
2. বিদ্যমান Type CQ Edit screen-এ question label (ক/খ/গ/ঘ) পরিবর্তনের ViewModel action নেই। তাই সেখানে label chip-টি সঠিক মাপে আছে, কিন্তু label বদলানোর dropdown সক্রিয় করা হয়নি। নতুন প্রশ্ন তৈরি/গ্রুপ edit flow-তে label move callback আগের মতো রাখা আছে।
3. নতুন Native app-এর অতিরিক্ত question-category/type control আলাদা row-তে রাখা হয়েছে; পুরোনো primary button row-তে মেশানো হয়নি, যাতে বোতামের ক্রম ও একই-row বিন্যাস না ভাঙে।
4. Button rows-এ wrapping `FlowRow` ব্যবহার করা হয়নি। তবে ছোট স্ক্রিন, ফন্ট scale এবং বাস্তব Android density-তে runtime screenshot QA এখনও প্রয়োজন।

## যাচাইয়ের অবস্থা

- Changed Kotlin source files-এ parser-oriented syntax scan চালানো হয়েছে; `expecting`, `unexpected tokens`, redeclaration বা unclosed construct ধরনের syntax diagnostic পাওয়া যায়নি।
- এটি Android compile-এর বিকল্প নয়; AndroidX/Compose classpath ছাড়া `kotlinc`-এর পূর্ণ compile সম্ভব নয়।
- Gradle Build চালানোর চেষ্টা করা হয়েছে, কিন্তু Gradle 8.14.3 distribution ডাউনলোডে `services.gradle.org` DNS/network failure (`UnknownHostException`) হওয়ায় Build সম্পন্ন হয়নি।
- তাই APK compile success বা real-device visual parity নিশ্চিত বলে দাবি করা হচ্ছে না।
