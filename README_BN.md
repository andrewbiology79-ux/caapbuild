# Question Bank — Android Build Foundation v0.2.22

এটি সম্পূর্ণ অ্যাপ নয়; এটি Android/Room build foundation-এর ধাপে ধাপে আপডেট।

- Type_CQ, Chapter_CQ এবং Paper workflow একই `QuestionBank.db` ব্যবহার করবে।
- দুই CQ system-এর table family ও repository boundary আলাদা থাকবে।
- Room ৩৫টি entity পরিচালনা করে; FTS5-এর ২টি virtual table ও trigger Room callback থেকে install হয়।
- v0.2.18 যাচাই হয়েছে: CI (১১/১১ ইউনিট টেস্ট) ও এমুলেটর (৩,০০,০০০ প্রশ্নে ১১/১১ টেস্ট) সবুজ। FTS rowid (F-1) ও বাংলা NFC (F-2) নিশ্চিত।
- v0.2.19 যাচাই হয়েছে: CI run 27 সবুজ (১১/১১ টেস্ট, release variant সহ)। এমুলেটরে ৩,০০,০০০ প্রশ্নে ১১/১১ টেস্ট সবুজ।
- v0.2.20 ফোনে ইনস্টল করে যাচাই হয়েছে: হোম স্ক্রিন ও বাংলা লেখা ঠিক দেখায়।
- v0.2.21 এমুলেটরে চালিয়ে বাগ ধরা পড়েছে: নাম পরিষ্কার করার regex Android-এ চলে না। v0.2.22-এ ঠিক করা হয়েছে (এখনো compile করা হয়নি)। v0.2.21-এর APK ব্যবহার করবেন না।
- বিস্তারিত: `BUILD_STATUS.txt`, `VERSION_NOTES_0.2.22.md`, `docs/`, `PROJECT_PLAN_v1_24_UPDATED.txt`।
