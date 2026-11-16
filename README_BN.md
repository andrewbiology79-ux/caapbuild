# Question Bank — Android Build Foundation v0.2.0

এটি সম্পূর্ণ অ্যাপ নয়; এটি Android/Room build foundation-এর প্রথম আপডেট।

- Type_CQ, Chapter_CQ এবং Paper workflow একই `QuestionBank.db` ব্যবহার করবে।
- দুই CQ system-এর table family ও repository boundary আলাদা থাকবে।
- Room 35টি ordinary application entity পরিচালনা করবে।
- FTS5-এর 2টি virtual table এবং canonical schema-এর 17টি trigger Room callback থেকে install হবে।
- FTS-এর 10টি shadow table SQLite নিজে তৈরি/পরিচালনা করবে; এগুলো Room Entity নয়।
- Canonical schema-এ 48টি CHECK clause রয়েছে; সম্পূর্ণ Room parity এখনো যাচাইাধীন।

v0.2.2-তে Kotlin 2.4.21-এর সঙ্গে সামঞ্জস্য রাখতে KAPT processor classpath-এ `kotlin-metadata-jvm:2.4.21` যোগ করা হয়েছে। এটি CI-তে এখনো যাচাই করা হয়নি। Android Gradle/Room compile ও device test-এর authoritative ফল এখনো পাওয়া যায়নি। GitHub Actions সফল না হওয়া পর্যন্ত ZIP-টিকে compile-verified বলা যাবে না। বিস্তারিত: `BUILD_STATUS.txt`, `DATABASE_PARITY_STATUS.md`, `SINGLE_DATABASE_ARCHITECTURE.md`।
