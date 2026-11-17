# Question Bank — Android Build Foundation v0.2.20

এটি সম্পূর্ণ অ্যাপ নয়; এটি Android/Room build foundation-এর ধাপে ধাপে আপডেট।

- Type_CQ, Chapter_CQ এবং Paper workflow একই `QuestionBank.db` ব্যবহার করবে।
- দুই CQ system-এর table family ও repository boundary আলাদা থাকবে।
- Room ৩৫টি entity পরিচালনা করে; FTS5-এর ২টি virtual table ও trigger Room callback থেকে install হয়।
- v0.2.18 যাচাই হয়েছে: CI (১১/১১ ইউনিট টেস্ট) ও এমুলেটর (৩,০০,০০০ প্রশ্নে ১১/১১ টেস্ট) সবুজ। FTS rowid (F-1) ও বাংলা NFC (F-2) নিশ্চিত।
- v0.2.19-এ manual DI (`AppContainer`) ও unsigned release variant যোগ হয়েছে; সরবরাহ করা CI রিপোর্টে release assembly সফল।
- v0.2.20-এ Compose + Material 3 home shell, Navigation Compose, Paging 3 dependency যোগ হয়েছে। এই নতুন প্যাকেজ এখনো CI-তে compile হয়নি; push করে যাচাই করতে হবে।
- বিস্তারিত: `BUILD_STATUS.txt`, `VERSION_NOTES_0.2.20.md`, `docs/`, `PROJECT_PLAN_v1_21_UPDATED.txt`।
