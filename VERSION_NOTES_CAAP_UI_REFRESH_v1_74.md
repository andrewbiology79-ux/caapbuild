# QuestionBank v1.74 — CAAP UI refresh (source candidate)

তারিখ: ২০ নভেম্বর ২০২৬

- CAAP-এর প্রশ্ন কার্ডের নীল ribbon, selection, five-star rating, board/year strip, typography, solution control ও কার্যকর card menu পুনর্বিন্যাস।
- Question list app bar-এ select all / clear / bulk delete menu এবং CAAP-সদৃশ Add question action।
- Minimum/Full editor header, inline board/year chips, eye/rating/image controls, larger text fields, solution image control ও math toolbar উন্নত।
- Bottom navigation-এ custom outline icon drawing।
- Existing Room/SQLite, ViewModel, draft, media/image pipeline ও save/update flow অক্ষত রাখার উদ্দেশ্যে UI layer-এ পরিবর্তন সীমিত।
- Database schema/migration পরিবর্তন করা হয়নি। App version metadata bump করা হয়নি, কারণ project plan-এর version policy P-56 এখনো open।

## Verification

Gradle build command: `./gradlew :app:testDebugUnitTest :app:compileDebugKotlin --offline --no-daemon`

Status: Gradle wrapper could not download Gradle 8.14.3 because `services.gradle.org` DNS/network resolution failed (`UnknownHostException`). Gradle tasks never started. No compile, KSP/Room generation, unit/instrumented tests, APK build, emulator or device test is claimed.

See `PROJECT_PLAN_v1_74_CAAP_UI_REFRESH.txt` section 83 and `CAAP_UI_REIMPLEMENTATION_NOTES_BN.md` for details and remaining gates.
