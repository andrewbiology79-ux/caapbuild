plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
    id("org.jetbrains.kotlin.kapt")
}

android {
    namespace = "com.questionbank.app"
    compileSdk = 36

    defaultConfig {
        applicationId = "com.questionbank.app"
        minSdk = 26
        targetSdk = 36
        versionCode = 1
        versionName = "0.2.3-database-foundation"
        testInstrumentationRunner = "androidx.test.runner.AndroidJUnitRunner"
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

kapt {
    correctErrorTypes = true
    arguments {
        arg("room.schemaLocation", "$projectDir/schemas")
        arg("room.incremental", "true")
    }
}

dependencies {
    val roomVersion = "2.8.5"
    implementation("androidx.room:room-runtime:$roomVersion")
    implementation("androidx.room:room-ktx:$roomVersion")
    implementation("androidx.sqlite:sqlite-bundled:2.7.1")
    kapt("androidx.room:room-compiler:$roomVersion")
    // Room 2.8.5's processor dependency graph may select an older metadata reader.
    // Align the KAPT processor classpath with Kotlin 2.4.21 so it can read 2.4.x metadata.
    kapt("org.jetbrains.kotlin:kotlin-metadata-jvm:2.4.21")

    testImplementation("junit:junit:4.13.2")
    testImplementation("org.xerial:sqlite-jdbc:3.50.2.0")
}
