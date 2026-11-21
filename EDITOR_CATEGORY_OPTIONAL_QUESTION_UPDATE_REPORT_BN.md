# Minimum ও Full Editor — পুনরায় যাচাই রিপোর্ট

## কোন সোর্স পরীক্ষা করা হয়েছে

- যাচাইয়ের জন্য খোলা সর্বশেষ Android সোর্স: `QuestionBank_Editor_Category_Optional_Question_Update.zip`
- আগের আপডেটের ভিত্তি সোর্স: `QuestionBank_Editor_Minimum_Full_Update.zip`
- পুরোনো UI Reference: `caapbuild-updated-34.zip` — বিশেষ করে `src/components/QuestionFormModal.tsx` এবং `src/components/LatexEditor.tsx`

এই রিপোর্টে আগের আপডেটের দাবিগুলো শুধু পুনরায় লেখা হয়নি; সংশ্লিষ্ট Kotlin/Compose screen, ViewModel, save rules, repository এবং পুরোনো React UI মিলিয়ে দেখা হয়েছে।

## পুনরায় যাচাইয়ে পাওয়া ও সংশোধন করা বিষয়

### ১. সমাধানের ঘর Delete করলে Text/Image-এর ক্রম নষ্ট হওয়ার ত্রুটি

আগের implementation-এ কোনো Text Box মুছলে বাকি Text Box-গুলোকে ক্রমানুসারে আগের Text slot-এ বসানো হচ্ছিল। মাঝখানে Image থাকলে এতে লেখা ও ছবির আপেক্ষিক ক্রম বদলে যেতে পারত।

এটি তিন জায়গায় সংশোধন করা হয়েছে:

- Type CQ নতুন প্রশ্ন তৈরি (`QuestionEditorViewModel`)
- Type CQ পুরোনো প্রশ্ন সম্পাদনা (`QuestionEditViewModel`)
- Chapter CQ Editor (`ChapterCqWorkspaceScreen`)

এখন যে Text Box-টি মুছতে বলা হয়, তার নির্দিষ্ট `partId` সরানো হয়। অবশিষ্ট Text ও Image অংশের ক্রম অক্ষত রেখে শুধু `position` নতুন করে সাজানো হয়। অন্তত একটি Text Box রেখে দেওয়ার নিয়মও আছে।

### ২. পুরোনো Type CQ গ্রুপ Edit করার সময় Minimum-এ G/Gh কার্ড

আগে থেকে থাকা কোনো উদ্দীপক-গ্রুপে G অথবা Gh-এর একটি না থাকলে Minimum Editor-এ শুধু থাকা কার্ডটি দেখা যেতে পারত। এখন Minimum মোডে G ও Gh—দুটি ডিফল্ট কার্ডই দেখানো হয়; Full Editor-এ থাকা অতিরিক্ত K/Kh আগের মতোই থাকবে। Full-এ কোনো প্রশ্ন স্পষ্টভাবে Delete করা থাকলে সেটি Minimum-এ পুনরায় দেখানো হয় না। ফাঁকা নতুন কার্ড Save-এ আলাদা প্রশ্ন হিসেবে লেখা হয় না।

### ৩. Solution Reorder-এর পুরোনো অব্যবহৃত UI সরানো

সক্রিয় Create/Edit screen-গুলোতে Solution Text Box-এর Reorder control ছিল না; তবে `EditorImageAttachments.kt`-এ একটি পুরোনো, আর ব্যবহার না হওয়া Solution component-এ ←/→ control রয়ে গিয়েছিল। সেটি এবং তার `moveSolutionPart` helper সরানো হয়েছে। Stimulus image-এর নিজস্ব ক্রম পরিবর্তনের সুবিধা এতে পরিবর্তিত হয়নি।

### ৪. অব্যবহৃত প্রশ্ন-ধরন Editor selector সরানো

Type CQ Create/Edit-এর দৃশ্যমান Question Type selector আগেই সরানো ছিল। পুনরায় যাচাইয়ে shared UI-তে অব্যবহৃত `EdTypePill` selector component-ও পাওয়া যায়; সেটিও সরানো হয়েছে। পুরোনো প্রশ্নের `question_type_id` ও ডাটাবেসের সামঞ্জস্য রক্ষাকারী internal field মুছে ফেলা হয়নি। নতুন প্রশ্নে স্থির label অনুযায়ী default internal value ব্যবহৃত হয়।

## বর্তমান সোর্সে যাচাই করা আচরণ

1. Reference field 36dp উচ্চতা এবং Type CQ Create/Edit ও Chapter CQ Editor-এ একই shared component ব্যবহার করে। পুরোনো React input-এ CSS height 36px ছিল; Android dp-কে pixel-এর সঙ্গে এক-এক করে সমান বলা হচ্ছে না।
2. ক/খ/গ/ঘ প্রশ্ন কার্ডের নিচে Category multi-select dropdown আছে। Category নির্বাচন Draft-এ রাখা হয় এবং Type CQ Create/Edit ও Chapter CQ save path-এ পাঠানো হয়। নতুন Category যোগ করার ডায়ালগও আছে।
3. Solution Text Box-এর X একাধিক Text Box থাকলেই দেখা যায়; একটি থাকলে দেখা যায় না।
4. Solution-এ নতুন Text Box যোগ করার ক্রম রাখা হয়; Reorder control নেই। Image/Text-এর মিশ্র ক্রমও নির্দিষ্ট Text Box মুছলে অক্ষত থাকে।
5. Full Editor-এ K/Kh যোগ করা ঐচ্ছিক; তৈরি ও Edit—দুই screen-এই Add K, Add Kh ও Sort control আছে।
6. নতুন প্রশ্নের Save Rules-এ খালি Question এবং খালি Short Answer থাকলে সেই ঐচ্ছিক slot বাদ যায়। খালি Question-এর সঙ্গে Short Answer লেখা থাকলে Save আটকে Missing Text জানায়।
7. পুরোনো Group Edit-এ সংরক্ষিত G/Gh-এর একটি Delete করে অন্যটি রেখে Save করা যায়; সর্বশেষ সংরক্ষিত প্রশ্নটিও Delete করে গ্রুপ খালি করা যায় না।
8. Question slot-গুলো K/Kh/G/Gh fixed label slot হওয়ায় একই label-এর duplicate card তৈরি করা যায় না। Sort button কার্ডের দৃশ্যমান ক্রম K→Kh→G→Gh করে; এটি label বা প্রশ্নের পরিচয় বদলায় না।
9. LaTeX ribbon button height 36dp এবং vertical padding 4dp করা আছে।
10. Short Answer-এর Text Area minimum height 52dp; Create, Edit ও Chapter CQ screen-এ এই মাপ ব্যবহৃত।
11. Type CQ Create/Edit Editor-এ দৃশ্যমান cognitive Question Type selector নেই। `question_type_id` কেবল পুরোনো ডেটা ও schema-র সামঞ্জস্যের জন্য অভ্যন্তরীণভাবে রয়ে গেছে।

## পুরোনো অ্যাপের সঙ্গে তুলনা

- পুরোনো `QuestionFormModal.tsx`-এ Reference input height 36px ছিল।
- পুরোনো Solution UI-তে একাধিক Text Box থাকলেই X ছিল; শুরুতে Eye/Preview ও ImagePlus এবং শেষে ImagePlus ও SquarePlus ছিল। Android-এ একই control intent ও কাছাকাছি icon glyph ব্যবহার করা হয়েছে।
- পুরোনো React সোর্সে per-question Category dropdown ছিল না। এটি বর্তমান Android Category catalog/Room storage ব্যবহার করে নতুন নির্দেশনা অনুযায়ী যোগ করা হয়েছে।
- Android-এর আইকনগুলো Compose `EdIcon` glyph হিসেবে আঁকা; পুরোনো Lucide SVG asset byte-for-byte কপি করা হয়নি।

## এখনও যে সীমাবদ্ধতা রয়েছে

1. Chapter CQ Editor এখনও একবারে একটি active প্রশ্ন সম্পাদনা করে; একই উদ্দীপকের অধীনে G/Gh-এর একাধিক card এক স্ক্রিনে Type CQ-এর মতো দেখানো ও একসঙ্গে edit করার Multi-question Workspace এই আপডেটে তৈরি করা হয়নি।
2. Sort control বর্তমান Android-এর label-fixed model-এ card-এর display order সাজায়; user-visible label K/Kh/G/Gh বদলায় না এবং আলাদা order metadata হিসেবে save হয় না।
3. `প্রশ্নের ধরন` নামে global Question List-এর Filter/Sort UI (`QuestionFilterBar`, `QuestionListScreen`, Chapter CQ list sorting) এখনো আছে। এটি Editor-এর selector নয়; এই অনুরোধে Editor selector সরানো হয়েছে, global list filtering/sorting সরানো হয়নি। অ্যাপের সব জায়গা থেকেও ওই ফিচার মুছে ফেলতে চাইলে সেটি আলাদা scope-এর পরিবর্তন হবে।
4. পূর্ণ Android Build এবং বাস্তব ডিভাইস/Emulator UI পরীক্ষা সম্পন্ন করা যায়নি।

## যাচাইয়ের ফল

- Targeted static source checks: **17/17 PASS**। এগুলো নির্দিষ্ট source contract/structure check; formal unit test suite নয়।
- ZIP integrity: পুনরায় পরীক্ষা করা হয়েছে।
- Kotlin syntax scan: Kotlin 1.9 compiler দিয়ে Compose/Android dependency ছাড়া parse চেষ্টা করা হয়েছে। `expecting`, `unexpected tokens`, `redeclaration` ধরনের syntax diagnostic পাওয়া যায়নি; তবে AndroidX/Compose ও project dependencies অনুপস্থিত থাকায় এটি compilation নয়।
- Android Gradle compile: **ব্লকড**। `./gradlew --offline :app:compileDebugKotlin` চালাতেও wrapper Gradle 8.14.3 distribution আনতে `services.gradle.org`-এ সংযোগ করতে চেয়েছে এবং `UnknownHostException` হয়েছে।
- APK install/device UI test: **চালানো হয়নি**।

## উপসংহার

আগের ZIP-এর পুনরায় যাচাইয়ে Solution Text Box মুছলে mixed Text/Image order নষ্ট হওয়ার একটি বাস্তব ত্রুটি পাওয়া গেছে এবং Create, Edit ও Chapter CQ—তিন path-এ সংশোধন করা হয়েছে। পুরোনো Group Edit-এর Minimum view-তেও G/Gh default card আচরণ সমান করা হয়েছে এবং অব্যবহৃত Solution reorder UI সরানো হয়েছে। ZIP তৈরি ও integrity check পাস করেছে; তবে Build/device verification না হওয়ায় একে build-verified বা pixel-perfect বলা যাবে না।
