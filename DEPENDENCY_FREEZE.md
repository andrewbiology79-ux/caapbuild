# Dependency / version freeze (DRAFT, started in v0.2.19)

Rule: a version is "frozen" only after a green non-cached CI run with it. Until then it is a candidate.

| Component | Version | State |
|---|---|---|
| JDK | 17 (Temurin, CI) | in use since early CI runs |
| Gradle | 8.14.3 | in use (wrapper + CI) |
| Android Gradle Plugin | 8.13.2 | in use; main build green on v0.2.16 |
| Kotlin | 2.4.21 | in use; main build green on v0.2.16 |
| KSP | 2.3.12 | in use; main build green on v0.2.16 |
| Room | 2.8.5 | in use; emulator green on v0.2.17 |
| androidx.sqlite bundled | 2.7.1 | in use; emulator green on v0.2.17 |
| compileSdk / targetSdk / minSdk | 36 / 36 / 26 | in use |
| Hilt (plugin, android, compiler) | 2.60 | CANDIDATE, new in v0.2.19, not compiled |
| androidx.activity | 1.10.1 | CANDIDATE, new in v0.2.19, not compiled |
| Compose BOM, Navigation Compose, hilt-navigation-compose | not chosen | planned for v0.2.20 |

Known risks to check first if v0.2.19 fails:
1. Hilt 2.60 annotation processor versus Kotlin 2.4.21 metadata (same class of error as KAPT_METADATA_COMPATIBILITY.md: "metadata version 2.4.0, maximum supported 2.3.0"). Release notes of Dagger 2.60 mention Kotlin 2.3.21.
2. Hilt/activity pulling a newer kotlinx-coroutines than the version resolved today (1.8.1 caused a conflict in v0.2.15). Look at :app:checkDebugAndroidTestAarMetadata and dependency resolution errors.
3. Hilt Gradle plugin with AGP 8.13.2 (bytecode transform task).
Fallback order: try the Hilt patch version suggested by the error; only then consider lowering Kotlin/KSP via a deliberate compatibility evaluation, not stacked overrides.
