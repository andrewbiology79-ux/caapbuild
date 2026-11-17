# GitHub Actions diagnostic report

Every workflow run now uploads a `QuestionBank-ci-report` artifact, including when Gradle fails.

The artifact contains:

- `CI_REPORT.md` — run metadata and build outcome.
- `gradle-build.log` — complete Gradle output with `--stacktrace --info` (look here for the first Kotlin `e:` diagnostic, KAPT processor error, or `Caused by:` section).
- `gradle-exit-code.txt` — Gradle process exit code, if the build command started.
- Any generated Gradle reports and JUnit XML test results under `app/build/`.

## Download from GitHub

1. Open the repository on GitHub.
2. Select **Actions** and open the failed or completed workflow run.
3. Scroll to the **Artifacts** section near the bottom of the run summary.
4. Download **QuestionBank-ci-report** and extract the ZIP.
5. Open `CI_REPORT.md` first, then `gradle-build.log` for the full failure details.

The debug APK is uploaded separately as `QuestionBank-debug-apk` only when the workflow succeeds.
