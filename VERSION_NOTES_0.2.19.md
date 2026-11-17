# Version 0.2.19 - Step A closed (F-1 and F-2 CONFIRMED), ADR-002, DI and release variant

Evidence for v0.2.18 (all green):
- CI run 24 (normal workflow): Gradle exit 0, BUILD SUCCESSFUL in 39 s, kspDebugKotlin executed (not from cache),
  unit tests 11 of 11 (BanglaTextTest 4, CanonicalSqlContractTest 5, RoomSchemaParityTest 2).
- Emulator, API 34, 300,000 rows, two runs: 11 of 11 tests, 0 failures, Gradle exit 0 both times.
- The 20,000-row run was not supplied; only 300,000-row runs exist.

Changes in this package
1. app/schemas/.../1.json replaced with the file exported by CI run 24 (identityHash 786b471dfa14c9ae4739bb81479bab25,
   35 entities, 50 indices, 39 foreign keys; was fb40664660a91120f2169864ac13203e with 48 indices). The 2 extra indices
   are the unique fts_id indices.
2. ADR-002 recorded (docs/Architecture_Decision_Records.md): Compose + Material 3 + Navigation Compose, Paging 3,
   manual constructor DI. The assistant proposed it; the owner may overrule it.
3. AppContainer and QuestionBankApp (manual DI, lazy database). Manifest gets android:name=".QuestionBankApp".
4. Release build type (unsigned, not minified) and a non-blocking CI step "Assemble release variant".
5. docs/Dependency_Version_Freeze.md.
6. README_BN.md, BUILD_STATUS.txt and the plan (v1.21, section 33) refreshed.

STATUS of items 3 and 4: written, NOT compiled, NOT run. UNCONFIRMED until the next CI run. Item 3 sits in the main
source set, so a mistake there fails the blocking build; send the CI report if it does. A failure in item 4 only
shows in build-report/release-assemble.log.

No database change; database version stays 1.
Next (v0.2.20): add Compose and Navigation with one screen (home), exact versions verified by CI.
