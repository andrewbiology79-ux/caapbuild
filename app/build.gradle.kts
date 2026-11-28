plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
    id("com.google.devtools.ksp")
    id("org.jetbrains.kotlin.plugin.compose")
}

android {
    namespace = "com.questionbank.app"
    compileSdk = 36

    defaultConfig {
        applicationId = "com.questionbank.app"
        minSdk = 26
        targetSdk = 36
        versionCode = 54
        versionName = "0.2.49-card-ui-fix"
        testInstrumentationRunner = "androidx.test.runner.AndroidJUnitRunner"
    }

    // v0.2.23: one fixed debug key, committed on purpose (a debug key is not a secret). Without it every CI run
    // signs the APK with a new random key, Android refuses to update the installed app, and the only way to install
    // is to uninstall first, which deletes every question on the phone. Release signing is decided in Phase 17.
    signingConfigs {
        getByName("debug") {
            storeFile = file("debug.keystore")
            storePassword = "android"
            keyAlias = "androiddebugkey"
            keyPassword = "android"
        }
    }

    buildTypes {
        release {
            // Unsigned, not minified yet (v0.2.19). Signing and R8 are decided in Phase 17.
            isMinifyEnabled = false
        }
    }

    buildFeatures {
        compose = true
    }

    sourceSets {
        getByName("test") { resources.srcDir("../database") }
        // Review fix (Finding 7): RoomMigration1To2Test builds the version-1 database from the exported Room schema 1.json (test APK assets).
        getByName("androidTest") { assets.srcDir("$projectDir/schemas") }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
}

kotlin {
    compilerOptions {
        jvmTarget.set(org.jetbrains.kotlin.gradle.dsl.JvmTarget.JVM_17)
    }
}

ksp {
    arg("room.schemaLocation", "$projectDir/schemas")
    arg("room.incremental", "true")
}

dependencies {
    val roomVersion = "2.8.5"
    implementation("androidx.room:room-runtime:$roomVersion")
    implementation("androidx.room:room-ktx:$roomVersion")
    implementation("androidx.sqlite:sqlite-bundled:2.7.1")
    ksp("androidx.room:room-compiler:$roomVersion")

    // v0.2.20 (ADR-002): Compose UI, Navigation Compose, Paging 3. Versions are pinned one by one, not through the
    // Compose BOM, because Compose 1.12+ needs compileSdk 37 and AGP 9.2; this project stays on AGP 8.13.2 / compileSdk 36.
    // See docs/Dependency_Version_Freeze.md before changing any line.
    val composeVersion = "1.11.4"
    implementation("androidx.compose.ui:ui:$composeVersion")
    implementation("androidx.compose.foundation:foundation:$composeVersion")
    implementation("androidx.compose.material3:material3:1.4.0")
    implementation("androidx.compose.ui:ui-tooling-preview:$composeVersion")
    debugImplementation("androidx.compose.ui:ui-tooling:$composeVersion")
    implementation("androidx.activity:activity-compose:1.12.3")
    implementation("androidx.navigation:navigation-compose:2.9.8")
    implementation("androidx.paging:paging-compose:3.4.2")
    implementation("androidx.lifecycle:lifecycle-viewmodel-compose:2.10.0")
    implementation("androidx.work:work-runtime-ktx:2.12.0")

    // Native offline LaTeX rendering, compatible with the KaTeX math syntax used by the legacy editor.
    implementation("io.github.erweixin:ratex-android:0.1.15")

    testImplementation("junit:junit:4.13.2")
    testImplementation("org.xerial:sqlite-jdbc:3.50.2.0")
    testImplementation("com.google.code.gson:gson:2.11.0")

    androidTestImplementation("androidx.test:core:1.6.1")
    androidTestImplementation("androidx.test:runner:1.6.2")
    androidTestImplementation("androidx.test.ext:junit:1.2.1")
}
