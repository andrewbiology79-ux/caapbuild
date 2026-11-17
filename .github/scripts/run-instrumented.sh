#!/usr/bin/env bash
# Runs inside the Android emulator started by reactivecircus/android-emulator-runner.
set +e
mkdir -p build-report
ROWS="${BENCHMARK_ROWS:-20000}"
echo "benchmarkRows=$ROWS" | tee build-report/instrumented-run.txt
adb logcat -c
sh ./gradlew --no-daemon --no-build-cache connectedDebugAndroidTest \
  -Pandroid.testInstrumentationRunnerArguments.benchmarkRows="$ROWS" \
  --stacktrace --info 2>&1 | tee build-report/gradle-instrumented.log
code=${PIPESTATUS[0]}
echo "$code" > build-report/gradle-exit-code.txt
adb logcat -d -s QB_BENCH:I > build-report/qb-bench-logcat.txt
adb logcat -d -t 3000 > build-report/logcat-tail.txt
exit "$code"
