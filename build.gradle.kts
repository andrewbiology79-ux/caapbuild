plugins {
    id("com.android.application") version "8.13.2" apply false
    id("org.jetbrains.kotlin.android") version "2.4.21" apply false
    id("com.google.devtools.ksp") version "2.3.12" apply false
    id("com.google.dagger.hilt.android") version "2.58" apply false // 2.59+ plugin needs AGP 9 (CI run 25); keep equal to hiltVersion in app/build.gradle.kts
}
