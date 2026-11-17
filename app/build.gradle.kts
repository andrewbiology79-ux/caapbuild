plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
    id("com.google.devtools.ksp")
    id("com.google.dagger.hilt.android")
}

android {
    namespace = "com.questionbank.app"
    compileSdk = 36

    defaultConfig {
        applicationId = "com.questionbank.app"
        minSdk = 26
        targetSdk = 36
        versionCode = 1
        versionName = "0.2.19.1-hilt"
        testInstrumentationRunner = "androidx.test.runner.AndroidJUnitRunner"
    }

    sourceSets {
        getByName("test") { resources.srcDir("../database") }
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

    // v0.2.19 (ADR-002): Hilt via KSP only (no KAPT). Compose and Navigation come in v0.2.20.
    // v0.2.19.1: 2.58 is the last Dagger release whose Hilt Gradle plugin works with AGP 8.x.
    // Dagger 2.59+ requires AGP 9.0+ and Gradle 9.1+ (CI run 25). Must equal the plugin version in the root build.gradle.kts.
    val hiltVersion = "2.58"
    implementation("com.google.dagger:hilt-android:$hiltVersion")
    ksp("com.google.dagger:hilt-compiler:$hiltVersion")
    implementation("androidx.activity:activity:1.10.1") // ComponentActivity, required by @AndroidEntryPoint

    testImplementation("junit:junit:4.13.2")
    testImplementation("org.xerial:sqlite-jdbc:3.50.2.0")
    testImplementation("com.google.code.gson:gson:2.11.0")

    androidTestImplementation("androidx.test:core:1.6.1")
    androidTestImplementation("androidx.test:runner:1.6.2")
    androidTestImplementation("androidx.test.ext:junit:1.2.1")
}
