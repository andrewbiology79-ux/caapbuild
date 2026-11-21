# Question Bank v0.2.33 — Image Editor ও Storage Permission Recheck Report

## সারসংক্ষেপ

`QuestionBank_CI82_COMPILEFIX.zip` (base source version `0.2.31-phase5-wip2`, versionCode 36) এবং পুরোনো React অ্যাপ `caapbuild-updated-34.zip`-এর image-related implementation মিলিয়ে আগের `0.2.32` update আবার পরীক্ষা করা হয়েছে। পুনঃপরীক্ষায় পাওয়া কয়েকটি race condition ও legacy-ordering mismatch ঠিক করা হয়েছে। বর্তমান source version:

- **versionName:** `0.2.33-image-tools-rechecked`
- **versionCode:** `38`

## ১. Editor Text Area

- Stimulus, Question, Solution, Short Answer-সহ `EdTextArea`-তে লেখার content-এর বাম ও ডান পাশে **8dp padding** রাখা হয়েছে।
- নিচের resize-grip-এর জন্য আগের **26dp vertical reserve** রাখা হয়েছে।
- Text Area-র minimum height/এক লাইন দৃশ্যমান থাকার নিয়ম এবং Settings-নির্ধারিত content font size পরিবর্তন করা হয়নি।

## ২. ছবি যোগ, অবস্থান ও একাধিক ছবি

Type CQ Create, Type CQ Edit এবং Chapter CQ—তিনটি পথেই একই image helper/pipeline ব্যবহার করা হয়েছে।

- Stimulus-এর শিরোনামের পাশের বিদ্যমান বোতাম দিয়ে **লেখার আগে (TOP)** একাধিক ছবি যোগ করা যায়।
- Stimulus text-এর পরে **BOTTOM**-এ আলাদা একাধিক ছবি যোগ করা যায়।
- নতুন TOP ছবি পুরোনো TOP ছবির আগে বসে এবং BOTTOM ছবি পুরোনো BOTTOM ছবির শেষে বসে—পুরোনো React implementation-এর ordering অনুসারে।
- প্রতিটি stimulus image-কে TOP/BOTTOM-এ সরানো এবং একই strip-এর মধ্যে আগে/পরে সাজানোর সুবিধা রাখা হয়েছে।
- Solution-এর শুরুতে বা শেষে একসঙ্গে একাধিক ছবি যোগ করা যায়। Solution text ও image একই ordered parts list-এ থাকে; তাই মাঝখানের image সরানো/প্রতিস্থাপন/এডিট করলেও বাকি text-image sequence পুনর্বিন্যাস হয়ে হারিয়ে যায় না।
- Add-এ multiple document picker এবং Replace-এ single-image picker ব্যবহার করা হয়েছে।

## ৩. Full Editor-এর ছবির নিচে Edit বোতাম

Full Editor-এ stimulus ও solution—প্রতিটি ছবির নিচে আগে থেকে থাকা Replace/Export/Preview কন্ট্রোলের পাশে **এডিট** বোতাম যুক্ত হয়েছে। Stimulus strip-এর নিজস্ব placement/reorder controls-ও রাখা হয়েছে। Minimum Editor-এ Full-only Edit/Export/large-preview action দেখানো হয় না।

Edit dialog-এ আছে:

1. ৯০° করে বামে/ডানে Rotate;
2. উপর, নিচ, বাম, ডান—চার পাশ থেকে Crop;
3. Original, পরিষ্কার Grayscale এবং Black/White Scan mode;
4. পরিবর্তিত ছবির preview;
5. Save অথবা Cancel।

Crop-এ দুই বিপরীত পাশের সম্মিলিত কাট ৯০%-এর বেশি হতে পারে না; ফলে width এবং height—দুই দিকেই অন্তত ১০% অবশিষ্ট থাকে। Grayscale-এ পুরোনো কোডের ২%–৯৮% histogram stretch এবং Black/White-এ Otsu threshold algorithm অনুসরণ করা হয়েছে।

**Original image নিরাপদ রাখা:** Save করলে image pipeline-এ নতুন image ID/asset তৈরি হয়। বর্তমান original ফাইল overwrite করা হয় না। Cancel করলে draft-এর পুরোনো image ID-ই থাকে। কোনো পরিবর্তন না করে Save চাপলে অকারণে JPEG পুনরায় encode না করে dialog বন্ধ হয়।

Full preview-তে pinch zoom, double-tap zoom এবং একাধিক ছবির previous/next navigation আছে। Export-এর গন্তব্য `Pictures/QuestionBank`।

## ৪. Recheck-এ পাওয়া এবং সংশোধিত সমস্যা

আগের update আবার পরীক্ষা করার সময় নিচের বিষয়গুলো ধরা পড়ে এবং সংশোধন করা হয়েছে:

- **Preview/Save race:** Crop/Rotate/Scan বদলানোর সঙ্গে সঙ্গে পুরোনো preview Save হয়ে যাওয়ার ঝুঁকি ছিল। এখন বর্তমান control values-এর সঙ্গে preview key না মিললে Save নিষ্ক্রিয় থাকে; matching preview তৈরি হওয়ার পরই Save সক্রিয় হয়।
- **Duplicate concurrent picker/import:** Stimulus-এর TOP/BOTTOM এবং Solution-এর START/END adder আলাদা helper হলেও একই Editor-এ এক সময়ে একটির বেশি image operation শুরু হতে পারে এমন ঝুঁকি ছিল। এখন shared `ImageImportTracker.tryStart()` operation lock এবং shared busy state দিয়ে অন্য picker/action বন্ধ থাকে।
- **Save during import:** picker খোলা থাকা বা image import চলার সময় Type CQ Create, Type CQ Edit ও Chapter CQ—তিনটিতেই Save button নিষ্ক্রিয়; save callback-এও synchronous guard আছে।
- **Legacy TOP ordering:** আগে TOP image নতুন ছবি existing TOP ছবির পরে বসতে পারত। এখন নতুন TOP image existing TOP-এর আগে বসে; BOTTOM আগের মতো শেষে যুক্ত হয়।
- **No-op image edit:** কিছু না বদলালেও preview-কে নতুন JPEG asset করা হতো। এখন কোনো পরিবর্তন না থাকলে original asset অক্ষত রেখে dialog বন্ধ হয়।

## ৫. Storage Permission

Manifest-এ permission এবং `MainActivity`-তে startup check/prompt যুক্ত হয়েছে। Android version অনুযায়ী আচরণ আলাদা:

- **Android 11 (API 30) এবং নতুন:** startup-এ All files access সম্পর্কে Bengali rationale দেখায়। “অনুমতি দিন” চাপলে Android-এর বিশেষ App All Files Access Settings খোলে; ব্যবহারকারীকে নিজে toggle করতে হয়। অ্যাপ নিজে এই বিশেষ অনুমতি grant করতে পারে না।
- **Android 9 ও পুরোনো (API 28 ও নিচে):** READ/WRITE External Storage runtime permission চাওয়া হয়। Manifest declaration API 28 পর্যন্ত সীমিত।
- **Android 10 (API 29):** Scoped Storage ও MediaStore ব্যবহার করা হয়; সাধারণ ছবি নির্বাচন (SAF) ও Export-এর জন্য broad storage permission চাওয়া হয় না।
- অনুমতি না দিলেও অ্যাপের ভেতরের ডেটা ব্যবহার, SAF দিয়ে ছবি বাছাই এবং MediaStore-ভিত্তিক Export চালু থাকে; বিস্তৃত ফাইল-অ্যাক্সেস ছাড়া কাজ করা যায় এমন restricted mode রাখা হয়েছে।

`MANAGE_EXTERNAL_STORAGE` একটি বিশেষ ও বিস্তৃত অনুমতি। Play Store-এ না দিলেও Android-এর Settings-এ ব্যবহারকারীর সম্মতি প্রয়োজন থাকে।

## ৬. পরিবর্তিত ফাইল

| ফাইল | পরিবর্তন |
|---|---|
| `app/build.gradle.kts` | versionCode 38, versionName 0.2.33 |
| `app/src/main/AndroidManifest.xml` | Android version অনুযায়ী storage permission declarations |
| `app/src/main/java/com/questionbank/app/MainActivity.kt` | startup storage access check ও permission prompt |
| `app/src/main/java/com/questionbank/app/media/ImagePipeline.kt` | নতুন asset হিসেবে edited bitmap সংরক্ষণ এবং public Pictures export |
| `app/src/main/java/com/questionbank/app/ui/question/EditorDesign.kt` | Text Area horizontal padding, multiple-image helpers, operation lock, Full image controls |
| `app/src/main/java/com/questionbank/app/ui/question/ImageEditDialog.kt` | নতুন rotate/crop/scan editor |
| `app/src/main/java/com/questionbank/app/ui/question/ImagePreviewDialog.kt` | নতুন zoom ও previous/next preview |
| `app/src/main/java/com/questionbank/app/ui/question/QuestionEditorScreen.kt` | Type CQ Create image integration ও save guard |
| `app/src/main/java/com/questionbank/app/ui/question/QuestionEditScreen.kt` | Type CQ Edit image integration ও save guard |
| `app/src/main/java/com/questionbank/app/ui/question/ChapterCqWorkspaceScreen.kt` | Chapter CQ image integration ও save guard |

## ৭. যাচাইয়ের ফলাফল

### সম্পন্ন

- Android Manifest XML parse: **PASS**
- Type CQ Create/Edit এবং Chapter CQ-তে সব `rememberStimulusImageAdder`/`rememberSolutionImageAdder` call-এ tracker ও unique key আছে কি না: **PASS**
- তিন Editor-এর Save action ও synchronous save-path-এ image-operation guard আছে কি না: **PASS**
- Full image action wiring (image edit/preview/export callbacks) তিন Editor path-এ আছে কি না: source inspection সম্পন্ন
- Kotlin compiler invocation-এ syntax-ধরনের diagnostic (`expecting`, `unexpected tokens`, unclosed construct ইত্যাদি): **কোনোটি পাওয়া যায়নি**
- Source ZIP integrity (`unzip -t`): **PASS** — সব archive entry পরীক্ষা হয়েছে; `No errors detected in compressed data`

### এখনো যাচাই করা যায়নি

এই runtime-এ Android SDK নেই এবং Gradle 8.14.3 wrapper distribution local cache-এ নেই। `./gradlew :app:compileDebugKotlin --no-daemon --offline` চালালে wrapper `services.gradle.org` থেকে Gradle নামাতে গিয়ে `UnknownHostException` পেয়েছে। Android/Compose dependencies-ও এখানে resolve করা যায়নি। Standalone `kotlinc` দিয়ে syntax scan-এ 2,904টি unresolved Android/Compose/project reference এসেছে; সেগুলো full project compile result নয়।

অতএব **Android Gradle compile, APK build, emulator/device runtime test সফল হয়েছে—এমন দাবি করা হচ্ছে না**। ZIP হলো updated source package; build verification বাকি।

## ৮. গুরুত্বপূর্ণ সীমা/ব্যাখ্যা

পুরোনো React অ্যাপে ছবি নির্বাচন করার পর সঙ্গে সঙ্গে ImageEditQueue দেখানোর Settings toggle ছিল। এই নতুন native flow-তে ব্যবহারকারীর চাওয়া অনুযায়ী ছবি যোগ হওয়ার পরে ছবির নিচে manual **Edit** বোতাম রাখা হয়েছে; ওই auto-open toggle-এর behavior স্থানান্তর করা হয়নি। Edit feature Full Editor-এ সবসময় পাওয়া যায়।
