package com.questionbank.app

import android.content.Context
import androidx.test.core.app.ApplicationProvider
import androidx.test.ext.junit.runners.AndroidJUnit4
import com.questionbank.app.data.settings.AppSettings
import com.questionbank.app.ui.settings.TextSizePolicy
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith

/** Theme and text size settings on the Android runtime (v0.2.25): defaults, persistence across a new instance, limits. */
@RunWith(AndroidJUnit4::class)
class AppSettingsTest {
    private val context: Context = ApplicationProvider.getApplicationContext()

    private fun clearPrefs() {
        context.getSharedPreferences(AppSettings.PREFS_NAME, Context.MODE_PRIVATE).edit().clear().commit()
    }

    @Before
    fun setUp() = clearPrefs()

    @After
    fun tearDown() = clearPrefs()

    @Test
    fun defaultsAreLightThemeAndSize16() {
        val settings = AppSettings(context)
        assertFalse(settings.darkTheme)
        assertEquals(TextSizePolicy.DEFAULT, settings.textSize)
    }

    @Test
    fun choicesSurviveANewInstance() {
        val first = AppSettings(context)
        first.updateDarkTheme(true)
        first.updateTextSize(22)

        val second = AppSettings(context)
        assertTrue(second.darkTheme)
        assertEquals(22, second.textSize)
    }

    @Test
    fun textSizeStaysInsideTheLimits() {
        val settings = AppSettings(context)
        settings.updateTextSize(500)
        assertEquals(TextSizePolicy.MAX, settings.textSize)
        settings.updateTextSize(-3)
        assertEquals(TextSizePolicy.MIN, settings.textSize)
        assertEquals(TextSizePolicy.MIN, AppSettings(context).textSize)
    }
}
