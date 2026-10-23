package com.manhwa.engine.web

import android.app.Activity
import android.content.Intent
import android.webkit.CookieManager
import androidx.test.core.app.ActivityScenario
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import mockwebserver3.Dispatcher
import mockwebserver3.MockResponse
import mockwebserver3.MockWebServer
import mockwebserver3.RecordedRequest
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith

/**
 * The WebView reports, on close, whether the user came back with a new
 * Cloudflare clearance; screens retry only then. A local server stands in for
 * the site: its page sets `cf_clearance` (as passing a challenge would) or not.
 */
@RunWith(AndroidJUnit4::class)
class SourceWebViewActivityTest {

    private lateinit var server: MockWebServer

    @Before
    fun setUp() {
        CookieManager.getInstance().removeAllCookies(null)
        CookieManager.getInstance().flush()
        server = MockWebServer()
        server.start()
    }

    @After
    fun tearDown() {
        server.close()
    }

    private fun serve(setCookie: String?) {
        server.dispatcher = object : Dispatcher() {
            override fun dispatch(request: RecordedRequest): MockResponse {
                val builder = MockResponse.Builder()
                    .code(200)
                    .addHeader("Content-Type", "text/html")
                    .body("<html><body>site</body></html>")
                if (setCookie != null) builder.addHeader("Set-Cookie", setCookie)
                return builder.build()
            }
        }
    }

    /** Opens the page, waits until it has loaded, closes it, returns the reported result. */
    private fun openAndClose(url: String, loaded: () -> Boolean): Boolean {
        val context = InstrumentationRegistry.getInstrumentation().targetContext
        val intent = Intent(context, SourceWebViewActivity::class.java)
            .putExtra(SourceWebViewActivity.EXTRA_URL, url)
        val scenario = ActivityScenario.launchActivityForResult<SourceWebViewActivity>(intent)
        val deadline = System.currentTimeMillis() + 10_000
        while (!loaded() && System.currentTimeMillis() < deadline) Thread.sleep(100)
        scenario.onActivity { it.finish() }
        val result = scenario.result
        assertEquals(Activity.RESULT_OK, result.resultCode)
        assertNotNull(result.resultData)
        return result.resultData.getBooleanExtra(SourceWebViewActivity.RESULT_CLEARED, false)
    }

    @Test
    fun reportsANewClearance() {
        serve("cf_clearance=passed; Path=/")
        val url = server.url("/manga/1").toString()
        val cleared = openAndClose(url) { SourceWebViewActivity.clearanceFor(url) != null }
        assertEquals(true, cleared)
    }

    @Test
    fun reportsNothingWhenNoClearanceAppears() {
        serve(null)
        val url = server.url("/manga/1").toString()
        val cleared = openAndClose(url) { server.requestCount > 0 }
        assertEquals(false, cleared)
    }

    @Test
    fun anUnchangedClearanceIsNotNew() {
        val url = server.url("/manga/1").toString()
        CookieManager.getInstance().setCookie(url, "cf_clearance=old; Path=/")
        CookieManager.getInstance().flush()
        serve(null)
        val cleared = openAndClose(url) { server.requestCount > 0 }
        assertEquals(false, cleared)
    }
}
