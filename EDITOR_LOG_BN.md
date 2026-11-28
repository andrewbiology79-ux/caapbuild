> Step 3 note (28 Nov 2026): the ribbon-level “উদ্দীপক ক্যাটাগরি” selector is a card/repository action, not an editor field. The existing editor dropdown now explicitly says “দাগের ক্যাটাগরি”. No category names or question text are written into the editor diagnostic log by this change.

# এডিটর লগ (Editor log)

শুধু প্রশ্ন **তৈরি** (create) ও **এডিট** (edit) এডিটরের কাজ লেখে। অ্যাপের বাকি ট্যাপ/নেভিগেশন লগ (`activity_log.txt`) আগের মতোই আলাদা থাকে।

- ফাইল: `editor_log.txt` (অ্যাপের files ফোল্ডার ও `Android/data/com.questionbank.app/files/`)। ১ MB ছাড়ালে `editor_log_old.txt`।
- দেখা/কপি/মোছা: Profile → "এডিটর লগ (Editor log)"।
- প্রতিটি লাইনে `[E<সেশন নম্বর> CREATE|EDIT]`; এডিটর খুললে নতুন সেশন।

## কী লেখা হয়
| ট্যাগ | মানে |
|---|---|
| `----` | এডিটর খোলা / বন্ধ |
| `TYPED` | কোন ঘরে লেখা বদলেছে (দৈর্ঘ্য, ফাঁকা, শুরু/শেষের স্পেস, নতুন লাইন, NFC বদল, ZWJ/ZWNJ, হ্যাশ, ছোট প্রিভিউ) |
| `ACTION` | সমাধান বক্স/ছবি, ক্যাটাগরি, আনডু/রিডু, মুছা, মোড বদল, ✓ চাপা |
| `INPUT` / `PARTS` | ✓ চাপলে কী পাঠানো হয়েছে (উদ্দীপক, রেফারেন্স, প্রতি প্রশ্ন, সমাধানের প্রতিটি অংশ) এবং ডাটাবেসে আগে কী ছিল (`STORED`) |
| `RULES` | নিয়ম যাচাইয়ের ফল (কতটি আপডেট/যোগ/মুছা, শুধু-লেখার সমাধান আপডেট কয়টি) |
| `DB-WRITE` | ডাটাবেসে লেখার শুরু |
| `VERIFY PASS/FAIL` | লেখার পর পড়ে মেলানোর প্রতিটি যাচাই। FAIL হলে expected বনাম stored-এর বিবরণ |
| `RESULT` / `ERROR` | শেষ ফল, ব্যতিক্রম হলে স্ট্যাক ট্রেস |

## সীমা
- Type CQ-এর create ও edit এডিটর। Chapter CQ এডিটর এখনো আলাদা করে ধরা হয়নি।
- লেখা পুরো সংরক্ষণ হয় না, তাই লগে প্রশ্নের পূর্ণ পাঠ পাওয়া যাবে না।
- কম্পাইল/টেস্ট চালানো হয়নি।
