# CI report guide — v0.2.20

The main GitHub Actions workflow must pass: `testDebugUnitTest`, `assembleDebug`, `compileDebugAndroidTestKotlin`, and `assembleRelease`. Inspect `build-report/gradle-build.log`, `androidtest-compile.log`, and `release-assemble.log`. The release APK is unsigned and is not a user-installable release.

The instrumented workflow uploads `instrumented-run.txt` with commit/run/app/emulator/SDK/Java/Gradle provenance, the complete Gradle log, test XML, and benchmark/logcat output. A benchmark report is accepted only when its commit SHA is tied to the CI source revision.
