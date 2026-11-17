#!/usr/bin/env bash
# Runs inside the Android emulator started by reactivecircus/android-emulator-runner.
set +e
mkdir -p build-report
ROWS="${BENCHMARK_ROWS:-20000}"
{
  echo "benchmarkRows=$ROWS"
  echo "gitCommit=$(git rev-parse HEAD 2>/dev/null || echo unknown)"
  echo "githubRunId=${GITHUB_RUN_ID:-local}"
  echo "githubRunNumber=${GITHUB_RUN_NUMBER:-local}"
  echo "githubRef=${GITHUB_REF:-local}"
  echo "appVersionName=$(grep -o 'versionName = "[^"]*"' app/build.gradle.kts | head -1 | cut -d'"' -f2)"
  echo "emulatorModel=$(adb shell getprop ro.product.model | tr -d '\r')"
  echo "emulatorDevice=$(adb shell getprop ro.product.device | tr -d '\r')"
  echo "androidApi=$(adb shell getprop ro.build.version.sdk | tr -d '\r')"
  echo "javaVersion=$(java -version 2>&1 | head -1)"
  echo "gradleWrapper=$(grep distributionUrl gradle/wrapper/gradle-wrapper.properties | sed 's/.*gradle-//;s/-bin.zip//')"
} | tee build-report/instrumented-run.txt
adb logcat -c
sh ./gradlew --no-daemon --no-build-cache connectedDebugAndroidTest \
  -Pandroid.testInstrumentationRunnerArguments.benchmarkRows="$ROWS" \
  --stacktrace --info 2>&1 | tee build-report/gradle-instrumented.log
code=${PIPESTATUS[0]}
echo "$code" > build-report/gradle-exit-code.txt
adb logcat -d -s QB_BENCH:I > build-report/qb-bench-logcat.txt
adb logcat -d -t 3000 > build-report/logcat-tail.txt
exit "$code"
