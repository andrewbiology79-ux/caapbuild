# Profile Category Management Update

## Added
- Profile থেকে প্রশ্নপত্রের ক্যাটাগরি পরিচালনার নতুন স্ক্রিন।
- ক্যাটাগরি তৈরি, নাম পরিবর্তন, রিঅর্ডার, একক/একাধিক নির্বাচন এবং নির্বাচিত ক্যাটাগরি মুছে ফেলা।
- ক্যাটাগরির ভেতরে প্রশ্নপত্রের তালিকা, একক/একাধিক নির্বাচন এবং bulk delete।
- `অশ্রেণিবদ্ধ` স্থায়ী system category হিসেবে দেখানো হয়েছে; UI, repository এবং SQLite trigger—তিন স্তরেই এটি মুছে ফেলা/নতুন করে তৈরি করা আটকানো হয়েছে।

## Deletion behavior
- ক্যাটাগরি মুছলে তার ভেতরের সব paper, section, snapshot item এবং paper-item image link ডেটাবেস থেকে মুছে যায়।
- অব্যবহৃত paper image metadata ও `paper_media` ফাইল repository orphan cleanup দিয়ে পরিষ্কার হয়।
- মূল Type CQ / Chapter CQ source questions অক্ষত থাকে।

## Restore/import duplicate repair
- প্রতিবার Room database open হওয়ার সময় idempotent repair চলে।
- পুরোনো/ইমপোর্ট করা ডেটায় `অশ্রেণিবদ্ধ` (পুরোনো অ্যাপ ও মূল SQL-এর বানান) অথবা আগের ভুল ভ্যারিয়েন্ট `অশ্রেণীবদ্ধ` অন্য ID-তে থাকলে সেটিকে `system_uncategorized` ID-তে গ্রহণ করা হয়।
- অতিরিক্ত whitespace-ভ্যারিয়েন্ট ও দুই বানানের alias ক্যাটাগরিগুলোর paper স্থায়ী ক্যাটাগরিতে সরিয়ে duplicate category row মুছে ফেলা হয়।
- repair পুনরায় চললেও একটিমাত্র স্থায়ী ক্যাটাগরি থাকে।

## Verification note
- SQLite schema/runtime installer, foreign-key integrity, duplicate-category repair এবং paper/category delete cascade Python SQLite দিয়ে যাচাই করা হয়েছে।
- এই build environment-এ Gradle 8.14.3 ডাউনলোডের সময় `services.gradle.org` DNS/network সংযোগ ব্যর্থ হয়েছে। তাই Android/Compose Gradle build বা instrumented/device UI test এখানে সম্পন্ন/সার্টিফাই করা যায়নি।

## Careful recheck correction
- মূল `database/QuestionBank_SQLite_Schema_v1_1.sql` এবং পুরোনো Caa source দুটিতেই canonical spelling `অশ্রেণিবদ্ধ` (হ্রস্ব ই)। আগের update-এ ভুল দীর্ঘ ঈ-র variant লেখা হয়েছিল, যা import-এর পর দ্বিতীয় সদৃশ row তৈরি করতে পারত।
- এখন canonical name মূল বানানেই রাখা হয়েছে; legacy long-ঈ variant এবং whitespace variant-ও repair-এ শনাক্ত করে একই স্থায়ী category-তে merge করা হয়। নতুন category তৈরি বা rename করেও এই reserved নামগুলোর কোনো variant ব্যবহার করা যাবে না।
- স্থায়ী ক্যাটাগরির row menu-তেও edit/delete দেখা যায়, কিন্তু দুটিই disabled।
