package eu.kanade.tachiyomi.network.interceptor

import android.webkit.CookieManager
import androidx.test.core.app.ActivityScenario
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import com.manhwa.testing.BlankActivity
import eu.kanade.tachiyomi.network.AndroidCookieJar
import mockwebserver3.Dispatcher
import mockwebserver3.MockResponse
import mockwebserver3.MockWebServer
import mockwebserver3.RecordedRequest
import okhttp3.OkHttpClient
import okhttp3.Request
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Assert.fail
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith
import java.util.concurrent.TimeUnit

/**
 * Drives the interceptor's WebView solve against a local server that plays
 * Cloudflare. Sources cannot be made to challenge the emulator on demand, so
 * this is the only repeatable way to exercise each outcome:
 *
 *  - a challenge page that turns interactive → give up at once, distinct error
 *  - a challenge page that hands out `cf_clearance` → retry succeeds
 *  - a plain 403 with no challenge header → no WebView work, plain error
 *  - stale Cloudflare cookies set for the whole site → cleared, solved afresh
 */
@RunWith(AndroidJUnit4::class)
class CloudflareInterceptorTest {

    private lateinit var server: MockWebServer
    private lateinit var scenario: ActivityScenario<BlankActivity>
    private lateinit var client: OkHttpClient
    private val cookieJar = AndroidCookieJar()

    private val ua = "Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 Chrome/120.0.0.0 Mobile Safari/537.36"

    @Before
    fun setUp() {
        // The interceptor attaches its WebView to the live Activity window.
        scenario = ActivityScenario.launch(BlankActivity::class.java)
        scenario.onActivity { WebViewActivityHolder.set(it) }
        CookieManager.getInstance().removeAllCookies(null)
        CookieManager.getInstance().flush()
        server = MockWebServer()
        server.start()
        val context = InstrumentationRegistry.getInstrumentation().targetContext
        client = OkHttpClient.Builder()
            .cookieJar(cookieJar)
            .addInterceptor(UserAgentInterceptor { ua })
            .addInterceptor(CloudflareInterceptor(context, cookieJar) { ua })
            .callTimeout(60, TimeUnit.SECONDS)
            .build()
    }

    @After
    fun tearDown() {
        server.close()
        scenario.close()
    }

    private fun challenge(body: String): MockResponse =
        MockResponse.Builder()
            .code(403)
            .addHeader("Server", "cloudflare")
            .addHeader("cf-mitigated", "challenge")
            .addHeader("Content-Type", "text/html")
            .body(body)
            .build()

    private fun api(path: String): Request = Request.Builder().url(server.url(path)).build()

    @Test
    fun interactiveChallengeFailsFastWithItsOwnError() {
        // Cloudflare's script announces an interactive step by posting this message.
        val page = """
            <html><body><script>
              setTimeout(function () {
                window.postMessage({ source: "cloudflare-challenge", event: "interactiveBegin" }, "*");
              }, 300);
            </script></body></html>
        """.trimIndent()
        server.dispatcher = object : Dispatcher() {
            override fun dispatch(request: RecordedRequest) = challenge(page)
        }

        val started = System.nanoTime()
        try {
            client.newCall(api("/api/list")).execute().close()
            fail("expected the interceptor to give up")
        } catch (e: CloudflareBypassException) {
            assertTrue("should be flagged interactive: ${e.message}", e.interactive)
        }
        val elapsed = TimeUnit.NANOSECONDS.toSeconds(System.nanoTime() - started)
        assertTrue("gave up in ${elapsed}s, should not wait for the timeout", elapsed < 10)
    }

    @Test
    fun challengeThatIssuesClearanceIsRetriedWithTheCookie() {
        // Playing Cloudflare: challenge until the client presents cf_clearance.
        val page = """
            <html><body><script>
              document.cookie = "cf_clearance=solved; path=/";
            </script></body></html>
        """.trimIndent()
        server.dispatcher = object : Dispatcher() {
            override fun dispatch(request: RecordedRequest): MockResponse {
                val cleared = request.headers["Cookie"]?.contains("cf_clearance=solved") == true
                return if (cleared) {
                    MockResponse.Builder().code(200).body("ok").build()
                } else {
                    challenge(page)
                }
            }
        }

        val response = client.newCall(api("/api/list")).execute()
        assertEquals(200, response.code)
        assertEquals("ok", response.body.string())
        response.close()
    }

    @Test
    fun staleCloudflareCookiesAreClearedBeforeSolving() {
        // Left from an earlier session and set for the whole site: a clearance
        // Cloudflare no longer accepts and a flagged bot-management cookie,
        // plus a login cookie that has to survive.
        val root = server.url("/").toString()
        CookieManager.getInstance().apply {
            setCookie(root, "cf_clearance=stale; Path=/")
            setCookie(root, "__cf_bm=flagged; Path=/")
            setCookie(root, "session=keep; Path=/")
            flush()
        }
        // Cloudflare hands back the same value. The solve only sees it arrive
        // if the stale copy really went; otherwise it waits out its timeout.
        val page = """
            <html><body><script>
              setTimeout(function () { document.cookie = "cf_clearance=stale; path=/"; }, 500);
            </script></body></html>
        """.trimIndent()
        server.dispatcher = object : Dispatcher() {
            override fun dispatch(request: RecordedRequest): MockResponse {
                val cookie = request.headers["Cookie"].orEmpty()
                val cleared = "cf_clearance=stale" in cookie && "__cf_bm=flagged" !in cookie
                return if (cleared) MockResponse.Builder().code(200).body(cookie).build() else challenge(page)
            }
        }

        // A deep path: expiring cookies for the request's own path missed these.
        val started = System.nanoTime()
        val response = client.newCall(api("/api/manga/1/chapters")).execute()
        val elapsed = TimeUnit.NANOSECONDS.toSeconds(System.nanoTime() - started)
        assertEquals(200, response.code)
        assertTrue("the login cookie should survive", "session=keep" in response.body.string())
        response.close()
        assertTrue("solved in ${elapsed}s; a missed delete waits out the 20 s timeout", elapsed < 10)
    }

    @Test
    fun plainForbiddenIsNotTreatedAsAChallenge() {
        server.dispatcher = object : Dispatcher() {
            override fun dispatch(request: RecordedRequest) =
                MockResponse.Builder().code(403).addHeader("Server", "cloudflare").body("blocked").build()
        }

        val started = System.nanoTime()
        val response = client.newCall(api("/api/list")).execute()
        val elapsed = TimeUnit.NANOSECONDS.toSeconds(System.nanoTime() - started)
        assertEquals(403, response.code)
        response.close()
        assertTrue("a plain 403 must return immediately, took ${elapsed}s", elapsed < 3)
        assertEquals("no WebView solve should have hit the server again", 1, server.requestCount)
    }

    @Test
    fun rootWithoutChallengeStopsTheSolveEarly() {
        // API path is challenged but the site root loads clean: nothing a WebView
        // can clear, so the solve must bail before the timeout.
        server.dispatcher = object : Dispatcher() {
            override fun dispatch(request: RecordedRequest): MockResponse =
                if (request.url.encodedPath == "/") {
                    MockResponse.Builder().code(200).addHeader("Content-Type", "text/html").body("<html>home</html>").build()
                } else {
                    challenge("<html>never shown</html>")
                }
        }

        val started = System.nanoTime()
        try {
            client.newCall(api("/api/list")).execute().close()
            fail("expected a bypass failure")
        } catch (e: CloudflareBypassException) {
            assertTrue(!e.interactive)
        }
        val elapsed = TimeUnit.NANOSECONDS.toSeconds(System.nanoTime() - started)
        assertTrue("should not wait out the 20s timeout, took ${elapsed}s", elapsed < 15)
    }
}
