package com.example

import android.os.SystemClock
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import okhttp3.ConnectionPool
import okhttp3.Dispatcher
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import org.json.JSONArray
import org.json.JSONObject
import java.net.URLEncoder
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicLong

/**
 * Represents a discovered or manually configured UECFI Presenter server endpoint.
 */
data class ServerEndpoint(
    val host: String,
    val port: Int,
    val source: String = "auto"
)

/**
 * Program item configured in the desktop app (`GET /api/program`).
 */
data class ProgramRemoteItem(
    val id: String,
    val title: String,
    val type: String = ""
)

/**
 * Chat message exchanged between the desktop operator and Android speaker remote.
 */
data class ChatMessage(
    val id: Int,
    val sender: String,
    val senderName: String,
    val text: String,
    val timestamp: Long
)

/**
 * Represents the parsed projection state from `GET /api/state` along with the
 * constant 1920x1080 (16:9) normalized JSON string ready for injection into `presentation.htm`.
 */
data class PresenterState(
    val live: Boolean,
    val winX: Int,
    val winY: Int,
    val forcedW: Int,
    val forcedH: Int,
    val index: Int,
    val last: Int,
    val title: String,
    val status: String,
    val canPrev: Boolean,
    val canNext: Boolean,
    val isVerse: Boolean = false,
    val outputMode: String,
    val logoMode: Boolean,
    val attentionActive: Boolean = false,
    val stageLayout: String? = null,
    val stageStreamId: String? = null,
    val stageSourceType: String? = null,
    val bibleDisplayMode: String = "dual",
    val chatLatestId: Int = 0,
    val rawJson: String,
    val forced16x9Json: String
)

enum class AppMode {
    SPEAKER_REMOTE, // Speaker pulpit control: full-screen slides, touch controls, no video feeds, unaffected by stage layout
    VIEWER_ONLY     // Clean viewer display: zero controls, supports stage layouts (Split/Lower-Third) and live video feeds
}

enum class SlideCommand(val code: Int) {
    NEXT(2),
    PREVIOUS(3)
}

enum class VerseCommand(val code: Int) {
    NEXT(20),
    PREVIOUS(21)
}

/**
 * HTTP client for communicating with the UECFI Presenter desktop server on the LAN.
 * - Provides a dedicated 500ms-timeout high-concurrency client for `/24` subnet scanning
 * - Provides an 800ms-timeout client for fast last-known IP probing
 * - Polls `GET http://<host>:<presenterPort>/api/state` every 400ms
 * - Normalizes `winX` and `winY` unconditionally to a constant `1920 x 1080` virtual 16:9 stage
 * - Sends slide navigation commands `GET http://<host>:<presenterPort>/test.txt?command=2|3&value=0`
 * - Enforces the server's 400ms command throttle (`canProcessCommand` in `webserver.js`).
 */
class PresenterApiClient {

    // High-concurrency, ultra-short timeout client for Semaphore(48) parallel subnet scanning
    private val subnetSweepClient: OkHttpClient = OkHttpClient.Builder()
        .dispatcher(
            Dispatcher().apply {
                maxRequests = 128
                maxRequestsPerHost = 6
            }
        )
        .connectionPool(ConnectionPool(32, 30, TimeUnit.SECONDS))
        .connectTimeout(500, TimeUnit.MILLISECONDS)
        .readTimeout(500, TimeUnit.MILLISECONDS)
        .writeTimeout(500, TimeUnit.MILLISECONDS)
        .retryOnConnectionFailure(false)
        .build()

    // Fast 800ms client for last-known host probe and mDNS verification
    private val fastProbeClient: OkHttpClient = OkHttpClient.Builder()
        .connectTimeout(800, TimeUnit.MILLISECONDS)
        .readTimeout(800, TimeUnit.MILLISECONDS)
        .writeTimeout(800, TimeUnit.MILLISECONDS)
        .retryOnConnectionFailure(false)
        .build()

    // Standard client for 400ms live state polling and slide commands
    private val pollClient: OkHttpClient = OkHttpClient.Builder()
        .connectTimeout(1200, TimeUnit.MILLISECONDS)
        .readTimeout(1200, TimeUnit.MILLISECONDS)
        .writeTimeout(1200, TimeUnit.MILLISECONDS)
        .retryOnConnectionFailure(false)
        .build()

    private val lastCommandTimestampMs = AtomicLong(0L)

    companion object {
        const val COMMAND_THROTTLE_MS = 400L
        const val DEFAULT_PRESENTER_PORT = 50000
        const val DEFAULT_AUDIENCE_PORT = 50001

        // Constant fixed 16:9 virtual resolution so font sizing, margins, and line wrapping
        // NEVER change when the desktop monitor/projector resolution changes.
        const val VIRTUAL_W = 1920
        const val VIRTUAL_H = 1080
    }

    /**
     * Ultra-fast 500ms probe used by the parallel `/24` subnet scanner.
     * Validates HTTP 200 and a JSON body containing `"live"`.
     */
    suspend fun probeSubnetHost(
        host: String,
        port: Int
    ): Boolean = withContext(Dispatchers.IO) {
        val cleanHost = host.trim()
        if (cleanHost.isEmpty() || port !in 1..65535) return@withContext false

        val request = Request.Builder()
            .url("http://$cleanHost:$port/api/state")
            .header("Accept", "application/json")
            .header("Connection", "close")
            .get()
            .build()

        try {
            subnetSweepClient.newCall(request).execute().use { response ->
                if (!response.isSuccessful) return@withContext false
                val body = response.body?.string() ?: return@withContext false
                val json = JSONObject(body)
                json.has("live")
            }
        } catch (_: Exception) {
            false
        }
    }

    /**
     * Reachability probe for `GET http://<host>:<port>/api/state`.
     * Defaults to 800ms timeout for instant last-known host checks.
     * Returns true if the server responds with HTTP 200 and a valid JSON object containing `"live"`.
     */
    suspend fun probeServer(
        host: String,
        port: Int,
        timeoutMs: Long = 800L
    ): Boolean = withContext(Dispatchers.IO) {
        val cleanHost = host.trim()
        if (cleanHost.isEmpty() || port !in 1..65535) return@withContext false

        val client = when (timeoutMs) {
            500L -> subnetSweepClient
            800L -> fastProbeClient
            else -> fastProbeClient.newBuilder()
                .connectTimeout(timeoutMs, TimeUnit.MILLISECONDS)
                .readTimeout(timeoutMs, TimeUnit.MILLISECONDS)
                .build()
        }

        val request = Request.Builder()
            .url("http://$cleanHost:$port/api/state")
            .header("Accept", "application/json")
            .header("Cache-Control", "no-cache")
            .get()
            .build()

        try {
            client.newCall(request).execute().use { response ->
                if (!response.isSuccessful) return@withContext false
                val body = response.body?.string() ?: return@withContext false
                val json = JSONObject(body)
                json.has("live") || json.has("text1") || json.has("winX")
            }
        } catch (_: Exception) {
            false
        }
    }

    /**
     * Fetches the current `/api/state` from the UECFI Presenter server and normalizes
     * the virtual resolution to a constant `1920 x 1080` (16:9).
     */
    suspend fun fetchState(
        host: String,
        port: Int,
        isTvDevice: Boolean = false,
        appMode: AppMode = AppMode.VIEWER_ONLY
    ): PresenterState? = withContext(Dispatchers.IO) {
        val cleanHost = host.trim()
        if (cleanHost.isEmpty() || port !in 1..65535) return@withContext null

        val isViewer = (appMode == AppMode.VIEWER_ONLY)
        val url = if (isViewer) "http://$cleanHost:$port/api/state?client=tv" else "http://$cleanHost:$port/api/state"
        val request = Request.Builder()
            .url(url)
            .header("Accept", "application/json")
            .header("Cache-Control", "no-cache")
            .header("X-Client-Device", if (isViewer) "tv" else "speaker")
            .get()
            .build()

        try {
            pollClient.newCall(request).execute().use { response ->
                if (!response.isSuccessful) return@withContext null
                val body = response.body?.string() ?: return@withContext null
                parsePresenterState(body, isTvDevice = isTvDevice, appMode = appMode)
            }
        } catch (_: Exception) {
            null
        }
    }

    /**
     * Parses the raw JSON from `/api/state` and unconditionally overwrites `winX = 1920`
     * and `winY = 1080` so that:
     * 1. `presentation.js` always lays out text, font sizes, margins, and line wrapping on a
     *    constant `1920 x 1080` stage regardless of the physical monitor/projector resolution.
     * 2. Changes solely to `st.winX` / `st.winY` on the desktop produce an identical
     *    `forced16x9Json` and never trigger an unnecessary re-layout.
     * 3. When in SPEAKER_REMOTE mode, strips stageLayout and stageStreamId so slides on the
     *    speaker tablet are ALWAYS pure full screen 16:9 and never show video feeds.
     */
    fun parsePresenterState(
        rawBody: String,
        isTvDevice: Boolean = false,
        appMode: AppMode = AppMode.VIEWER_ONLY
    ): PresenterState? {
        return try {
            val json = JSONObject(rawBody)
            if (!json.has("live") && !json.has("text1") && !json.has("winX")) {
                return null
            }

            val live = json.optBoolean("live", false)

            // Unconditionally lock virtual dimensions to 1920 x 1080
            val forcedW = VIRTUAL_W
            val forcedH = VIRTUAL_H

            val index = json.optInt("index", 0)
            val last = json.optInt("last", 0)
            val title = json.optString("title", "")
            val status = json.optString("status", "")
            val outputMode = json.optString("outputMode", "live")
            val logoMode = json.optBoolean("logoMode", false)
            val attentionMode = json.optBoolean("attentionMode", false)
            val attentionSpeakerShow = json.optBoolean("attentionSpeakerShow", false)
            val attentionActive = outputMode == "attention" || attentionMode || json.optBoolean("attentionActive", false)

            // When attention screen is active on the centro projector, speaker remote keeps the current slide visible.
            // On viewer devices (TV or viewer tablet), attention screen always shows when active.
            val overrideAttentionForSpeaker = (appMode == AppMode.SPEAKER_REMOTE) && attentionActive && !attentionSpeakerShow
            if (overrideAttentionForSpeaker) {
                json.put("outputMode", "live")
                json.put("attentionMode", false)
            }

            val navObj = json.optJSONObject("nav")
            val canPrev = navObj?.optBoolean("canPrev", true) ?: true
            val canNext = navObj?.optBoolean("canNext", true) ?: true

            val explicitIsVerse = json.optBoolean("isVerse", false)
            val projType = json.optString("projectionType", "")
            val themeObj = json.optJSONObject("theme")
            val themeContext = themeObj?.optString("context", "") ?: ""
            val themeId = themeObj?.optString("id", "") ?: ""
            val isVerse = explicitIsVerse ||
                projType == "verses" ||
                themeContext == "verses" ||
                themeId == "verses" ||
                status.contains("Verse", ignoreCase = true)

            // In Speaker Remote mode: strip stageLayout, stageStreamId, stageSourceType so the speaker
            // tablet is 100% full-screen slides only, unaffected by stage layouts, with no video feeds.
            // Furthermore, for speaker mode, Bible verses must ALWAYS be dual mode.
            if (appMode == AppMode.SPEAKER_REMOTE) {
                json.put("stageLayout", JSONObject.NULL)
                json.put("stageStreamId", JSONObject.NULL)
                json.put("stageSourceType", JSONObject.NULL)
                if (isVerse) {
                    json.put("bibleDisplayMode", "dual")
                }
            }

            // Overwrite winX and winY to 1920x1080 before serializing forced16x9Json
            json.put("winX", VIRTUAL_W)
            json.put("winY", VIRTUAL_H)
            val forced16x9Json = json.toString()

            val stageLayout = if (appMode == AppMode.SPEAKER_REMOTE) null else json.optString("stageLayout", "").takeIf { it.isNotEmpty() }
            val stageStreamId = if (appMode == AppMode.SPEAKER_REMOTE) null else json.optString("stageStreamId", "").takeIf { it.isNotEmpty() }
            val stageSourceType = if (appMode == AppMode.SPEAKER_REMOTE) null else json.optString("stageSourceType", "").takeIf { it.isNotEmpty() }
            val bibleDisplayMode = if (appMode == AppMode.SPEAKER_REMOTE && isVerse) "dual" else json.optString("bibleDisplayMode", "dual")

            PresenterState(
                live = live,
                winX = VIRTUAL_W,
                winY = VIRTUAL_H,
                forcedW = forcedW,
                forcedH = forcedH,
                index = index,
                last = last,
                title = title,
                status = status,
                canPrev = canPrev,
                canNext = canNext,
                isVerse = isVerse,
                outputMode = if (overrideAttentionForSpeaker) "live" else outputMode,
                logoMode = logoMode,
                attentionActive = attentionActive,
                stageLayout = stageLayout,
                stageStreamId = stageStreamId,
                stageSourceType = stageSourceType,
                bibleDisplayMode = bibleDisplayMode,
                chatLatestId = json.optInt("chatLatestId", 0),
                rawJson = rawBody,
                forced16x9Json = forced16x9Json
            )
        } catch (_: Exception) {
            null
        }
    }

    /**
     * Sends a slide navigation command (`command=2` for Next, `command=3` for Previous)
     * to `http://<host>:<presenterPort>/test.txt?command=<cmd>&value=0`.
     *
     * Respects the 400ms throttle required by the desktop server's `canProcessCommand`.
     * Returns true if the command was sent and acknowledged with HTTP 200.
     */
    suspend fun sendSlideCommand(
        host: String,
        port: Int,
        command: SlideCommand
    ): Boolean = sendCommandInternal(host, port, command.code.toString(), "0")

    /**
     * Sends a verse-specific navigation command (`command=20` for Next Verse, `command=21` for Previous Verse)
     * to `http://<host>:<presenterPort>/test.txt?command=<cmd>&value=0`.
     *
     * Respects the 400ms throttle required by the desktop server's `canProcessCommand`.
     * Returns true if the command was sent and acknowledged with HTTP 200.
     */
    suspend fun sendVerseCommand(
        host: String,
        port: Int,
        command: VerseCommand
    ): Boolean = sendCommandInternal(host, port, command.code.toString(), "0")

    /**
     * Sends an arbitrary custom button command (`command=<cmd>&value=<val>`)
     * to `http://<host>:<presenterPort>/test.txt`.
     */
    suspend fun sendCustomCommand(
        host: String,
        port: Int,
        command: String,
        value: String
    ): Boolean = sendCommandInternal(host, port, command, value)

    /**
     * Fetches the list of program items from `GET http://<host>:<port>/api/program`.
     */
    suspend fun fetchProgramItems(host: String, port: Int): List<ProgramRemoteItem> = withContext(Dispatchers.IO) {
        val cleanHost = host.trim()
        if (cleanHost.isEmpty() || port !in 1..65535) return@withContext emptyList()

        val request = Request.Builder()
            .url("http://$cleanHost:$port/api/program")
            .header("Accept", "application/json")
            .header("Cache-Control", "no-cache")
            .get()
            .build()

        try {
            pollClient.newCall(request).execute().use { response ->
                if (!response.isSuccessful) return@withContext emptyList()
                val body = response.body?.string() ?: return@withContext emptyList()
                val arr = JSONArray(body)
                val items = ArrayList<ProgramRemoteItem>(arr.length())
                for (i in 0 until arr.length()) {
                    val obj = arr.optJSONObject(i) ?: continue
                    val id = obj.optString("id", "").trim()
                    val title = obj.optString("title", "").trim()
                    val type = obj.optString("type", "").trim()
                    if (id.isNotEmpty() && title.isNotEmpty()) {
                        items.add(ProgramRemoteItem(id = id, title = title, type = type))
                    }
                }
                items
            }
        } catch (_: Exception) {
            emptyList()
        }
    }

    /**
     * Fetches chat messages from `GET http://<host>:<port>/api/chat`.
     */
    suspend fun fetchChatMessages(host: String, port: Int, sinceId: Int = 0): List<ChatMessage> = withContext(Dispatchers.IO) {
        val cleanHost = host.trim()
        if (cleanHost.isEmpty() || port !in 1..65535) return@withContext emptyList()

        val url = if (sinceId > 0) {
            "http://$cleanHost:$port/api/chat?since=$sinceId"
        } else {
            "http://$cleanHost:$port/api/chat"
        }
        val request = Request.Builder()
            .url(url)
            .header("Accept", "application/json")
            .header("Cache-Control", "no-cache")
            .get()
            .build()

        try {
            pollClient.newCall(request).execute().use { response ->
                if (!response.isSuccessful) return@withContext emptyList()
                val body = response.body?.string() ?: return@withContext emptyList()
                val obj = JSONObject(body)
                val arr = obj.optJSONArray("messages") ?: return@withContext emptyList()
                val list = ArrayList<ChatMessage>(arr.length())
                for (i in 0 until arr.length()) {
                    val m = arr.optJSONObject(i) ?: continue
                    val id = m.optInt("id", 0)
                    val text = m.optString("text", "").trim()
                    if (id > 0 && text.isNotEmpty()) {
                        list.add(
                            ChatMessage(
                                id = id,
                                sender = m.optString("sender", "remote"),
                                senderName = m.optString("senderName", "Operator"),
                                text = text,
                                timestamp = m.optLong("timestamp", System.currentTimeMillis())
                            )
                        )
                    }
                }
                list
            }
        } catch (_: Exception) {
            emptyList()
        }
    }

    /**
     * Sends a chat message to the desktop app via `POST http://<host>:<port>/api/chat`.
     */
    suspend fun sendChatMessage(
        host: String,
        port: Int,
        text: String,
        senderName: String = "Speaker"
    ): ChatMessage? = withContext(Dispatchers.IO) {
        val cleanHost = host.trim()
        val cleanText = text.trim()
        if (cleanHost.isEmpty() || port !in 1..65535 || cleanText.isEmpty()) return@withContext null

        val payload = JSONObject().apply {
            put("sender", "remote")
            put("senderName", senderName)
            put("text", cleanText.take(500))
        }
        val body = payload.toString().toRequestBody("application/json; charset=utf-8".toMediaType())
        val request = Request.Builder()
            .url("http://$cleanHost:$port/api/chat")
            .header("Accept", "application/json")
            .post(body)
            .build()

        try {
            pollClient.newCall(request).execute().use { response ->
                if (!response.isSuccessful) return@withContext null
                val respStr = response.body?.string() ?: return@withContext null
                val respObj = JSONObject(respStr)
                val m = respObj.optJSONObject("message") ?: return@withContext null
                ChatMessage(
                    id = m.optInt("id", 0),
                    sender = m.optString("sender", "remote"),
                    senderName = m.optString("senderName", senderName),
                    text = m.optString("text", cleanText),
                    timestamp = m.optLong("timestamp", System.currentTimeMillis())
                )
            }
        } catch (_: Exception) {
            null
        }
    }

    private suspend fun sendCommandInternal(
        host: String,
        port: Int,
        command: String,
        value: String
    ): Boolean = withContext(Dispatchers.IO) {
        val now = SystemClock.elapsedRealtime()
        val prev = lastCommandTimestampMs.get()
        if (now - prev < COMMAND_THROTTLE_MS) {
            return@withContext false
        }
        if (!lastCommandTimestampMs.compareAndSet(prev, now)) {
            return@withContext false
        }

        val cleanHost = host.trim()
        val cleanCmd = command.trim()
        if (cleanHost.isEmpty() || port !in 1..65535 || cleanCmd.isEmpty()) return@withContext false

        val encodedCmd = URLEncoder.encode(cleanCmd, "UTF-8")
        val encodedVal = URLEncoder.encode(value, "UTF-8")
        val request = Request.Builder()
            .url("http://$cleanHost:$port/test.txt?command=$encodedCmd&value=$encodedVal")
            .header("Cache-Control", "no-cache")
            .get()
            .build()

        try {
            pollClient.newCall(request).execute().use { response ->
                response.isSuccessful
            }
        } catch (_: Exception) {
            false
        }
    }
}
