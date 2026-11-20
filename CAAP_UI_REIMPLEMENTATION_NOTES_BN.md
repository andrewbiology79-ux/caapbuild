# CAAP প্রশ্ন কার্ড ও এডিটর UI — পুনর্নির্মাণ নোট

তারিখ: ২০ নভেম্বর ২০২৬

## লক্ষ্য

`caapbuild-updated-34.zip`-এর React/TypeScript UI-কে সরাসরি কপি না করে, তার প্রশ্ন কার্ড ও প্রশ্ন এডিটরের দৃশ্যমান বিন্যাস Android Jetpack Compose-এ পুনর্নির্মাণ করা হয়েছে। লক্ষ্য অ্যাপের Kotlin/Compose + Room/SQLite আর্কিটেকচার অপরিবর্তিত রাখা হয়েছে।

## করা UI পরিবর্তন

### প্রশ্ন কার্ড
- নীল শিরোনাম-রিবনে প্রশ্ন নম্বর, সিলেকশন চেকবক্স, হলুদ রেটিং ব্যাজ ও kebab menu একই সারিতে।
- রিবনের পর হালকা ব্যাকগ্রাউন্ডে বোর্ড-সাল চিপের সারি। উদ্দীপক-ভিত্তিক কার্ডে উদ্দীপকের ট্যাগ, একক প্রশ্নের কার্ডে প্রশ্নের ট্যাগ দেখায়।
- উদ্দীপকের ছবি/লেখা ও প্রশ্নের অংশ আলাদা বিন্যাসে।
- প্রতিটি উপ-প্রশ্নে ছোট bordered সমাধান খোলা/বন্ধ control; খুললে নরম ব্যাকগ্রাউন্ডে সমাধানের লেখা/ছবি।
- প্রশ্নভিত্তিক বোর্ড-সাল ট্যাগ সংশ্লিষ্ট সমাধান-কন্ট্রোলের পাশে।

### প্রশ্ন যোগ ও সম্পাদনা
- নীল AppHeader-এর ডান পাশে Undo, Redo ও Save action।
- Minimum / Full Editor segmented control হেডারের ঠিক নিচে স্থির থাকে।
- Full Editor-এ প্রশ্নের ধরন ও নম্বরের ইনপুট কমপ্যাক্ট এক সারিতে।
- বোর্ড-সাল ট্যাগগুলো প্রশ্ন/উদ্দীপকের লেখা ইনপুটের আগে; ছোট চিপে ট্যাপ করে সরানো যায়, পাশের বোতামে নতুন বোর্ড-সাল যোগ করা যায়।
- Eye preview, rating, image attachments, answer ও solution-এর বিদ্যমান আচরণ রাখা হয়েছে।

## পরিবর্তিত সোর্স ফাইল
- `app/src/main/java/com/questionbank/app/ui/question/QuestionCard.kt`
- `app/src/main/java/com/questionbank/app/ui/question/BoardTagsEditor.kt`
- `app/src/main/java/com/questionbank/app/ui/question/EditorDesign.kt`
- `app/src/main/java/com/questionbank/app/ui/question/QuestionEditorScreen.kt`
- `app/src/main/java/com/questionbank/app/ui/question/QuestionEditScreen.kt`

## অপরিবর্তিত
- Room/SQLite ডেটাবেস, entity/DAO কাঠামো ও ViewModel-ভিত্তিক সংরক্ষণ আচরণ।
- React, Dexie বা IndexedDB-এর কোনো runtime dependency যোগ করা হয়নি।

## সীমাবদ্ধতা ও যাচাই
- এটি CAAP সোর্স থেকে নেটিভ Compose-এ UI পুনর্নির্মাণ; React component সরাসরি কপি নয়। তাই Android control rendering-এ pixel-to-pixel অভিন্নতা দাবি করা হচ্ছে না।
- লক্ষ্য অ্যাপে পূর্ণ KaTeX/MathJax renderer নেই; বিদ্যমান Math symbol insertion ও plain-text preview বজায় আছে।
- Gradle build সম্পন্ন করা যায়নি। Wrapper-এ Gradle 8.14.3 ডাউনলোড দরকার হলেও `services.gradle.org`-এ DNS/network access না থাকায় ডাউনলোড ব্যর্থ হয়েছে। তাই এই ZIP compile-tested বা emulator-tested নয়।
- Android/Compose dependency classpath ছাড়া Kotlin parser attempt করা হয়েছে; এটি build verification নয়।

## পরবর্তী যাচাই

Gradle 8.14.3 উপলভ্য নেটওয়ার্ক পরিবেশে `./gradlew :app:assembleDebug` চালিয়ে compile যাচাই করতে হবে। এরপর Android emulator/ডিভাইসে প্রশ্ন যোগ, সম্পাদনা, কার্ড তালিকা, ট্যাগ যোগ/সরানো, সমাধান খোলা/বন্ধ এবং dark theme পরীক্ষা করতে হবে।
