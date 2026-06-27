package com.manhwa.engine.web

import android.annotation.SuppressLint
import android.app.Activity
import android.graphics.Color
import android.net.Uri
import android.os.Bundle
import android.view.Gravity
import android.view.View
import android.view.ViewGroup
import android.webkit.CookieManager
import android.webkit.WebChromeClient
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.LinearLayout
import android.widget.ProgressBar
import android.widget.TextView

/**
 * A minimal in-app browser used to clear Cloudflare challenges manually.
 *
 * It shares the process-wide [CookieManager] with the engine's OkHttp cookie jar
 * ([eu.kanade.tachiyomi.network.AndroidCookieJar]), so once the user solves the
 * challenge the resulting `cf_clearance` cookie is immediately usable by the
 * source's HTTP client. The WebView UA is forced to match the network client's
 * UA (passed via intent) so the cleared cookie stays valid for OkHttp requests.
 */
class SourceWebViewActivity : Activity() {

    private var webView: WebView? = null

    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        val url = intent.getStringExtra(EXTRA_URL)
        if (url.isNullOrBlank()) {
            finish()
            return
        }
        val ua = intent.getStringExtra(EXTRA_UA)

        val root = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setBackgroundColor(BG)
        }

        val bar = LinearLayout(this).apply {
            orientation = LinearLayout.HORIZONTAL
            gravity = Gravity.CENTER_VERTICAL
            setBackgroundColor(BAR)
            setPadding(dp(14), dp(10), dp(8), dp(10))
        }
        val title = TextView(this).apply {
            text = hostOf(url)
            setTextColor(Color.WHITE)
            textSize = 15f
            maxLines = 1
            layoutParams = LinearLayout.LayoutParams(0, WRAP, 1f)
        }
        val reload = barButton("Reload") { webView?.reload() }
        val done = barButton("Done") { closeAndFlush() }
        bar.addView(title)
        bar.addView(reload)
        bar.addView(done)

        val progress = ProgressBar(this, null, android.R.attr.progressBarStyleHorizontal).apply {
            max = 100
            layoutParams = LinearLayout.LayoutParams(MATCH, dp(3))
            visibility = View.GONE
        }

        val view = WebView(this).apply {
            layoutParams = LinearLayout.LayoutParams(MATCH, 0, 1f)
        }
        webView = view
        configure(view, ua)
        view.webChromeClient = object : WebChromeClient() {
            override fun onProgressChanged(v: WebView, newProgress: Int) {
                progress.progress = newProgress
                progress.visibility = if (newProgress in 1..99) View.VISIBLE else View.GONE
            }
        }
        // Default client keeps navigation (including the Cloudflare challenge
        // redirect chain) inside this WebView.
        view.webViewClient = WebViewClient()

        root.addView(bar)
        root.addView(progress)
        root.addView(view)
        setContentView(root)

        view.loadUrl(url)
    }

    @SuppressLint("SetJavaScriptEnabled")
    private fun configure(view: WebView, ua: String?) {
        CookieManager.getInstance().apply {
            setAcceptCookie(true)
            setAcceptThirdPartyCookies(view, true)
        }
        view.settings.apply {
            javaScriptEnabled = true
            domStorageEnabled = true
            useWideViewPort = true
            loadWithOverviewMode = true
            if (!ua.isNullOrBlank()) userAgentString = ua
        }
    }

    private fun barButton(label: String, onClick: () -> Unit): TextView = TextView(this).apply {
        text = label
        setTextColor(ACCENT)
        textSize = 14f
        setTypeface(typeface, android.graphics.Typeface.BOLD)
        setPadding(dp(12), dp(8), dp(12), dp(8))
        isClickable = true
        setOnClickListener { onClick() }
    }

    private fun closeAndFlush() {
        CookieManager.getInstance().flush()
        finish()
    }

    @Deprecated("Deprecated in Java")
    override fun onBackPressed() {
        val view = webView
        if (view != null && view.canGoBack()) {
            view.goBack()
        } else {
            closeAndFlush()
        }
    }

    override fun onDestroy() {
        webView?.run {
            stopLoading()
            destroy()
        }
        webView = null
        CookieManager.getInstance().flush()
        super.onDestroy()
    }

    private fun dp(value: Int): Int = (value * resources.displayMetrics.density).toInt()

    companion object {
        const val EXTRA_URL = "url"
        const val EXTRA_UA = "ua"

        private const val BG = 0xFF0E0E11.toInt()
        private const val BAR = 0xFF17171C.toInt()
        private const val ACCENT = 0xFF2FD3B6.toInt()
        private const val MATCH = ViewGroup.LayoutParams.MATCH_PARENT
        private const val WRAP = ViewGroup.LayoutParams.WRAP_CONTENT

        private fun hostOf(url: String): String = try {
            Uri.parse(url).host ?: url
        } catch (_: Throwable) {
            url
        }
    }
}
