#!/usr/bin/env bash
# Runs inside the Android emulator started by reactivecircus/android-emulator-runner.
set +e
mkdir -p build-report
ROWS="${BENCHMARK_ROWS:-20000}"
echo "benchmarkRows=$ROWS runBenchmark=${RUN_BENCHMARK:-false}" | tee build-report/instrumented-run.txt

# ScaleBenchmarkTest imports $ROWS questions and can take 30+ minutes. Skip it unless asked for,
# and give every ordinary test a 2-minute limit so one stuck test fails instead of blocking the job.
EXTRA_ARGS=()
if [ "${RUN_BENCHMARK:-false}" = "true" ]; then
  echo "benchmark ENABLED"
else
  EXTRA_ARGS+=(-Pandroid.testInstrumentationRunnerArguments.notClass=com.questionbank.app.ScaleBenchmarkTest)
  EXTRA_ARGS+=(-Pandroid.testInstrumentationRunnerArguments.timeout_msec=120000)
fi

adb logcat -c
sh ./gradlew --no-daemon --no-build-cache connectedDebugAndroidTest \
  -Pandroid.testInstrumentationRunnerArguments.benchmarkRows="$ROWS" \
  "${EXTRA_ARGS[@]}" \
  --stacktrace --info 2>&1 | tee build-report/gradle-instrumented.log
code=${PIPESTATUS[0]}
echo "$code" > build-report/gradle-exit-code.txt
adb logcat -d -s QB_BENCH:I > build-report/qb-bench-logcat.txt
adb logcat -d -t 3000 > build-report/logcat-tail.txt
exit "$code"
