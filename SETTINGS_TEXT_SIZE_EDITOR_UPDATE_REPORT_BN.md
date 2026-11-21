# Settings Text Size — Editor Update Report (বাংলা)

## ব্যবহারকারীর চাহিদা
এডিটরের বাটন, টুলবার, সেকশন শিরোনাম, বোর্ড/সাল, রেটিং এবং অন্যান্য কন্ট্রোলের লেখা আগের ডিজাইন-সাইজে থাকবে। শুধু উদ্দীপক, প্রশ্ন, সংক্ষিপ্ত উত্তর ও সমাধানের মূল লেখা Settings-এ নির্বাচিত সাইজ অনুসরণ করবে।

## কী পরিবর্তন করা হয়েছে

1. **Settings-এর সাইজের সীমা অপরিবর্তিত:** ১২–২৮ sp, ডিফল্ট ১৬। নির্বাচিত মানটি এখন মূল কনটেন্টের সরাসরি font size হিসেবে প্রয়োগ হয়; যেমন Settings-এ ২০ থাকলে প্রশ্ন/উদ্দীপক/সমাধানের লেখা ২০ sp হবে।
2. **কন্ট্রোলের টাইপোগ্রাফি আলাদা করা হয়েছে:** Theme থেকে অ্যাপ-ব্যাপী `Density.fontScale` পরিবর্তন সরানো হয়েছে। ফলে বাটন, টুলবার, লেবেল, সেকশন হেডিং, বোর্ড/সাল ও অন্যান্য UI লেখা Settings-এর সাইজের কারণে বড়/ছোট হবে না। ডিভাইসের নিজস্ব Accessibility font scale আগের মতো কাজ করবে।
3. **এডিটরের লেখার ঘর:** Type CQ ও Chapter CQ-র `EdTextArea`-তে টাইপ করা মূল লেখা Settings-এর সাইজ অনুসরণ করে। Placeholder, math toolbar, resize control এবং অন্যান্য কন্ট্রোলের টেক্সট নির্দিষ্ট UI-সাইজেই থাকে।
4. **প্রিভিউ ও সংরক্ষিত কনটেন্ট:** KaTeX/RaTeX preview, প্রশ্ন/উদ্দীপক/সমাধান/সংক্ষিপ্ত উত্তরের কার্ড, বিস্তারিত স্ক্রিন, Chapter CQ ডায়ালগ এবং Global Search-এর মূল প্রশ্নের লেখা একই Settings সাইজ ব্যবহার করে।
5. **অতিরিক্ত রেন্ডারিং সংশোধন:** `RichLatexText`-এ Compose থেকে পাওয়া pixel মানকে Android `TextView`-তে আবার SP হিসেবে সেট করা হচ্ছিল। সেটি `TypedValue.COMPLEX_UNIT_PX` দিয়ে নির্ধারণ করা হয়েছে, যাতে একই সাইজ দ্বিতীয়বার scale না হয়।
6. **Settings-এর ব্যাখ্যা আপডেট:** সেটিংস পেজে এখন স্পষ্ট করা আছে যে এই সাইজ মূল প্রশ্ন/উদ্দীপক/উত্তর/সমাধানের লেখায় প্রযোজ্য; বাটন ও লেবেলে নয়।
7. **ইউনিট টেস্ট:** Settings-এর ১২, ১৬, ২৪ ও ২৮ মান এবং সীমার বাইরে clamp হওয়ার জন্য `TextSizePolicyTest` আপডেট করা হয়েছে।

## পরিবর্তিত প্রধান ফাইল

- `app/src/main/java/com/questionbank/app/ui/theme/Theme.kt`
- `app/src/main/java/com/questionbank/app/ui/settings/TextSizePolicy.kt`
- `app/src/main/java/com/questionbank/app/ui/profile/ProfileScreen.kt`
- `app/src/main/java/com/questionbank/app/ui/question/EditorDesign.kt`
- `app/src/main/java/com/questionbank/app/ui/question/RichLatexText.kt`
- `app/src/main/java/com/questionbank/app/ui/question/QuestionCard.kt`
- `app/src/main/java/com/questionbank/app/ui/question/ChapterCqQuestionGroupCard.kt`
- `app/src/main/java/com/questionbank/app/ui/question/QuestionDetailScreen.kt`
- `app/src/main/java/com/questionbank/app/ui/question/ChapterCqQuestionDetailDialog.kt`
- `app/src/main/java/com/questionbank/app/ui/question/GlobalSearchScreen.kt`
- `app/src/test/java/com/questionbank/app/TextSizePolicyTest.kt`

## যাচাইয়ের অবস্থা

- ZIP-এর source structure এবং পরিবর্তিত call-site-গুলো staticভাবে পরীক্ষা করা হয়েছে।
- `RichLatexText` call-site থেকে আগের hard-coded ১৪/১৬/১৮ sp override সরানো হয়েছে, যাতে Settings-এর নির্বাচিত মাপ ব্যবহার হয়।
- Theme-এ Settings-এর font scale আর UI-জুড়ে ছড়ানো নেই।
- **Gradle unit test/build চালানো যায়নি:** Gradle Wrapper-এর Gradle 8.14.3 distribution ডাউনলোডের সময় `services.gradle.org`-এর DNS/network access ব্যর্থ হয়েছে (`UnknownHostException`)। তাই build বা device screenshot verification সম্পন্ন হয়েছে বলে দাবি করা হচ্ছে না। Android Studio বা GitHub Actions-এ build/test চালিয়ে runtime যাচাই করতে হবে।

## প্রত্যাশিত ফল
Settings-এর মান ১৬ হলে মূল প্রশ্ন/উদ্দীপক/সমাধানের লেখা ১৬ sp, ২০ হলে ২০ sp, ২৪ হলে ২৪ sp হবে। বাটন, লেবেল ও কন্ট্রোলের নকশার মাপ Settings-এর মান বদলালেও অপরিবর্তিত থাকবে।
