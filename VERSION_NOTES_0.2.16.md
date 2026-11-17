# Version 0.2.16 - emulator workflow dependency fix

Instrumented run on v0.2.15 (rows=20000): Gradle exit 1 in 20 s, task :app:checkDebugAndroidTestAarMetadata FAILED.
Cause: explicit androidTestImplementation kotlinx-coroutines-android:1.10.2 conflicts with the app's strictly pinned
1.8.1 (consistent resolution from debugRuntimeClasspath). No test compiled or ran; qb-bench-logcat.txt was empty.
Fix: dependency removed from app/build.gradle.kts (runBlocking comes transitively from Room). No other change.
Note: the Kotlin androidTest sources are still uncompiled; further small compile fixes may be needed.
