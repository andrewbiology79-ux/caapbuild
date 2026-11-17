# Version 0.2.19 - Hilt (Step B, part 1) and ADR-002

SUPERSEDED by 0.2.19.1: CI run 25 failed at configuration because Hilt plugin 2.60 requires AGP 9.0+ (project uses 8.13.2). See VERSION_NOTES_0.2.19.1.md.

STATUS: written, NOT compiled, NOT run. UNCONFIRMED.
Based on v0.2.18, which the owner reports as confirmed (CI successful, emulator run passed). Benchmark figures for v0.2.18 are not recorded in this package yet.

Changes
- docs/ADR-002_UI_Toolkit_and_DI.md: Compose + Hilt + Navigation Compose accepted, staged.
- Hilt 2.60 via KSP: root plugin, app plugin, hilt-android, hilt-compiler, androidx.activity 1.10.1.
- QuestionBankApp (@HiltAndroidApp); manifest android:name added.
- di/DatabaseModule: QuestionBankDatabase singleton via QuestionBankDatabase.create(context). No DAO provided.
- MainActivity: ComponentActivity + @AndroidEntryPoint, database injected as Lazy and not opened. Still a TextView.
- DEPENDENCY_FREEZE.md (draft). versionName 0.2.19-hilt.
Not changed: Room entities, schema, triggers, tests, workflows.

Expected CI result if everything works: same tests as v0.2.18 (7 + 4 = 11 unit tests), assembleDebug succeeds,
kspDebugKotlin runs both Room and Hilt processors, and app/schemas/.../1.json is regenerated for the v0.2.18 schema.

Since v0.2.18 is already confirmed, any CI failure on v0.2.19 is attributable to the Hilt changes alone.
