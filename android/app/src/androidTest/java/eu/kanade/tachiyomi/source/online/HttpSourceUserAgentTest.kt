package eu.kanade.tachiyomi.source.online

import androidx.test.ext.junit.runners.AndroidJUnit4
import eu.kanade.tachiyomi.network.NetworkHelper
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Test
import org.junit.runner.RunWith
import uy.kohesive.injekt.Injekt
import uy.kohesive.injekt.api.get

/**
 * Sources inherit their User-Agent header from [HttpSource]. It used to be a
 * fixed Chrome 120 string, so most requests went out as an outdated browser
 * whatever the WebView was; it has to be the app's.
 */
@RunWith(AndroidJUnit4::class)
class HttpSourceUserAgentTest {

    private val network: NetworkHelper = Injekt.get()

    private fun source() = object : HttpSource() {
        override val name = "Test"
        override val lang = "en"
        override val baseUrl = "https://example.org"
    }

    @After
    fun tearDown() {
        network.setUserAgent(null)
    }

    @Test
    fun sourceHeadersCarryTheWebViewUserAgent() {
        assertEquals(network.systemUserAgent, source().headers["User-Agent"])
    }

    @Test
    fun aUserAgentSetInTheAppReachesSourcesBuiltAfter() {
        network.setUserAgent("KagariTest/1.0 (Android)")
        assertEquals("KagariTest/1.0 (Android)", source().headers["User-Agent"])
        network.setUserAgent("  ")
        assertEquals(network.systemUserAgent, source().headers["User-Agent"])
    }
}
