# KAPT / Kotlin metadata compatibility note

## Observed failure
GitHub Actions run 6 (commit `478388d46ef740ba74a9fb29c9445c27d6072c07`) failed at `:app:kaptDebugKotlin`. The diagnostic log reports:

`Provided Metadata instance has version 2.4.0, while maximum supported version is 2.3.0.`

The stack trace enters Room's `KmClassContainer` and `KotlinClassMetadata.readStrict`, identifying the Room annotation-processing metadata reader as the component rejecting the class metadata.

## Targeted change in package 0.2.2
The app's KAPT processor classpath now directly includes:

`kapt("org.jetbrains.kotlin:kotlin-metadata-jvm:2.4.21")`

This requests the metadata reader matching the Kotlin 2.4.21 compiler already used by the project. The direct processor dependency is intended to make Gradle resolve a sufficiently recent metadata reader for Room's KAPT processor classpath.

## Required verification
1. Push this package's project contents to the GitHub repository.
2. Run the `Android Test and APK Build` workflow.
3. Confirm `:app:kaptDebugKotlin` completes and the full job passes.
4. If it fails, download `QuestionBank-ci-report` and inspect `gradle-build.log`; the diagnostic artifact is uploaded even on failure.
5. Only mark the build verified after CI succeeds and the expected debug APK artifact is present.

## Limitation
The local preparation environment did not execute Gradle, so dependency resolution and processor-classpath behavior have not been empirically tested here. If the direct dependency does not override the older transitive metadata reader, the next step should be a deliberate Room/Kotlin/KSP compatibility evaluation rather than layering additional unverified overrides.
