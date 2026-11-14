package com.example

import android.content.Context
import android.net.Uri
import android.util.Log
import android.webkit.WebResourceRequest
import android.webkit.WebResourceResponse
import okhttp3.OkHttpClient
import okhttp3.Request
import java.io.ByteArrayInputStream
import java.io.File
import java.io.FileInputStream
import java.io.InputStream
import java.util.concurrent.TimeUnit

/**
 * Manages high-performance local disk caching and APK asset serving for projection backgrounds
 * and graphics inside the Android WebView.
 *
 * Cache hierarchy:
 * 1. Bundled APK assets (`assets/background/`, `assets/uecfi-logo.png`): 0ms instant load.
 * 2. Persistent disk cache (`context.cacheDir/presenter_images/`): loaded directly from flash memory.
 * 3. Network fetch with disk-persistence: fetched once via OkHttp, saved to disk, and served.
 */
class WebResourceCacheManager(private val context: Context) {

    private val cacheDir: File = File(context.cacheDir, "presenter_images").apply {
        if (!exists()) mkdirs()
    }

    private val httpClient: OkHttpClient = OkHttpClient.Builder()
        .connectTimeout(5, TimeUnit.SECONDS)
        .readTimeout(8, TimeUnit.SECONDS)
        .build()

    companion object {
        private const val TAG = "WebResourceCache"
        private val IMAGE_EXTENSIONS = setOf("png", "jpg", "jpeg", "webp", "gif", "bmp", "svg")
    }

    /**
     * Intercepts static image/background requests from `presentation.htm`.
     * Returns a `WebResourceResponse` if resolved from assets or disk cache, or null to delegate
     * to the standard WebView network stack.
     */
    fun interceptRequest(request: WebResourceRequest?): WebResourceResponse? {
        val uri = request?.url ?: return null
        val path = uri.path ?: return null

        // Only intercept background images, graphics, and image extensions
        val isStaticDir = path.startsWith("/background/") || path.startsWith("/graphics/")
        val isLogo = path == "/uecfi-logo.png"
        val ext = path.substringAfterLast('.', "").lowercase()
        val isImageExt = ext in IMAGE_EXTENSIONS

        if (!isStaticDir && !isLogo && !isImageExt) {
            return null
        }

        val mimeType = getMimeType(ext)

        // 1. Check pre-bundled APK assets
        val assetResponse = tryLoadFromAssets(path, mimeType)
        if (assetResponse != null) {
            Log.d(TAG, "Served from APK assets: $path")
            return assetResponse
        }

        // 2. Check local disk cache
        val cacheKey = buildCacheFileName(uri, path)
        val cachedFile = File(cacheDir, cacheKey)

        if (cachedFile.exists() && cachedFile.length() > 0) {
            try {
                Log.d(TAG, "Served from local disk cache: $path (${cachedFile.length()} bytes)")
                return createResponse(mimeType, FileInputStream(cachedFile))
            } catch (e: Exception) {
                Log.w(TAG, "Failed reading cached file: ${cachedFile.name}", e)
            }
        }

        // 3. Download from network, persist to disk cache, and return stream
        val downloadedResponse = tryDownloadAndCache(uri, cachedFile, mimeType)
        if (downloadedResponse != null) {
            Log.d(TAG, "Downloaded and cached to disk: $path")
            return downloadedResponse
        }

        return null
    }

    private fun tryLoadFromAssets(path: String, mimeType: String): WebResourceResponse? {
        val cleanPath = path.removePrefix("/")
        return try {
            val stream = context.assets.open(cleanPath)
            createResponse(mimeType, stream)
        } catch (_: Exception) {
            null
        }
    }

    private fun tryDownloadAndCache(
        uri: Uri,
        cachedFile: File,
        mimeType: String
    ): WebResourceResponse? {
        return try {
            val request = Request.Builder()
                .url(uri.toString())
                .header("User-Agent", "UECFI-Presenter-Android-Cache/1.0")
                .build()

            httpClient.newCall(request).execute().use { response ->
                if (!response.isSuccessful) return null
                val bytes = response.body?.bytes() ?: return null
                if (bytes.isEmpty()) return null

                // Persist asynchronously / write safely to disk
                try {
                    cachedFile.parentFile?.mkdirs()
                    val tempFile = File(cachedFile.parentFile, "${cachedFile.name}.tmp")
                    tempFile.writeBytes(bytes)
                    tempFile.renameTo(cachedFile)
                } catch (e: Exception) {
                    Log.w(TAG, "Failed writing to cache file: ${cachedFile.name}", e)
                }

                createResponse(mimeType, ByteArrayInputStream(bytes))
            }
        } catch (e: Exception) {
            Log.w(TAG, "Failed downloading image for cache: $uri", e)
            null
        }
    }

    private fun createResponse(mimeType: String, stream: InputStream): WebResourceResponse {
        val headers = mapOf(
            "Cache-Control" to "public, max-age=604800, stale-while-revalidate=86400",
            "Access-Control-Allow-Origin" to "*"
        )
        return WebResourceResponse(mimeType, "utf-8", 200, "OK", headers, stream)
    }

    private fun buildCacheFileName(uri: Uri, path: String): String {
        val clean = path.removePrefix("/").replace('/', '_').replace('\\', '_')
        val host = uri.host?.replace(':', '_') ?: "local"
        return "${host}_$clean"
    }

    private fun getMimeType(ext: String): String {
        return when (ext) {
            "png" -> "image/png"
            "jpg", "jpeg" -> "image/jpeg"
            "webp" -> "image/webp"
            "gif" -> "image/gif"
            "bmp" -> "image/bmp"
            "svg" -> "image/svg+xml"
            else -> "image/png"
        }
    }
}
