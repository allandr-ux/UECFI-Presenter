package org.uecfi.presenter.network

import android.os.Build
import android.webkit.WebResourceResponse
import java.io.File
import java.net.URI
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.intOrNull
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.longOrNull
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.Response
import okhttp3.WebSocket
import okhttp3.WebSocketListener
import org.uecfi.presenter.data.CacheStats
import org.uecfi.presenter.data.ProgramSyncCache
import org.uecfi.presenter.model.LiveState
import org.uecfi.presenter.model.LiveStateEnvelope
import org.uecfi.presenter.model.RemoteCommandPayload
import java.util.concurrent.TimeUnit

enum class ConnectionStatus {
  Disconnected,
  Connecting,
  Connected,
  Error,
}

/**
 * Lightweight 10Hz audio playback clock update emitted during timed lyrics so the UI
 * and WebView bridge never re-serialize or re-parse the full LiveState JSON on time ticks.
 */
data class AudioTimeSync(
  val timeSec: Double?,
  val activeBlockIndex: Int?,
)

/**
 * Manages the LAN WebSocket connection to the desktop UECFI Presenter server,
 * with URL normalization, automatic reconnect, and remote command dispatch.
 */
class PresenterWsClient(syncCacheDir: File? = null) {
  private val json = Json {
    ignoreUnknownKeys = true
    isLenient = true
    coerceInputValues = true
    encodeDefaults = true
  }

  private val syncCache: ProgramSyncCache? = syncCacheDir?.let { ProgramSyncCache(it, json) }
  private val fallbackCacheStats = MutableStateFlow(CacheStats())
  val cacheStats: StateFlow<CacheStats> = syncCache?.cacheStats ?: fallbackCacheStats.asStateFlow()

  @Volatile
  private var currentHttpBaseUrl: String? = null

  fun openCachedMedia(requestUrl: String): WebResourceResponse? =
    syncCache?.openCachedMedia(requestUrl)

  fun clearCache() {
    val cache = syncCache ?: return
    scope.launch { cache.clearCache() }
  }

  fun resyncCache() {
    val cache = syncCache ?: return
    val baseUrl = currentHttpBaseUrl ?: return
    scope.launch {
      cache.syncFromServer(baseUrl, targetVersion = 0, client = client)
      refreshActiveItemFromCache()
    }
  }

  private fun refreshActiveItemFromCache() {
    val cache = syncCache ?: return
    val cur = _liveState.value ?: return
    val activeId = cur.activeItemId ?: return
    val cachedModel = cache.resolveCachedItemModel(activeId) ?: return
    val cachedJson = cache.resolveCachedItemJson(activeId) ?: return
    val nextState = cur.copy(
      activeItem = cachedModel,
      lyricsMode = cachedModel.lyricsMode ?: cur.lyricsMode,
      bibleLayout = cachedModel.bibleLayout ?: cur.bibleLayout,
      verseMaxFontSize = cachedModel.verseMaxFontSize ?: cur.verseMaxFontSize,
    )
    _liveState.value = nextState
    val baseObj = lastDesktopPayloadObj
    if (baseObj != null) {
      val patched = JsonObject(
        baseObj.toMutableMap().apply {
          put("activeItem", cachedJson)
          put("lyricsMode", JsonPrimitive(nextState.lyricsMode))
          put("bibleLayout", JsonPrimitive(nextState.bibleLayout))
          nextState.verseMaxFontSize?.let { put("verseMaxFontSize", JsonPrimitive(it)) }
        },
      )
      lastDesktopPayloadObj = patched
      _liveStateJson.value = patched.toString()
    } else {
      _liveStateJson.value = json.encodeToString(nextState)
    }
  }

  private val client = OkHttpClient.Builder()
    .pingInterval(4, TimeUnit.SECONDS)
    .connectTimeout(5, TimeUnit.SECONDS)
    .readTimeout(0, TimeUnit.MILLISECONDS)
    .build()

  private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)

  private val _status = MutableStateFlow(ConnectionStatus.Disconnected)
  val status: StateFlow<ConnectionStatus> = _status.asStateFlow()

  private val _statusMessage = MutableStateFlow<String?>(null)
  val statusMessage: StateFlow<String?> = _statusMessage.asStateFlow()

  private val _liveState = MutableStateFlow<LiveState?>(null)
  val liveState: StateFlow<LiveState?> = _liveState.asStateFlow()

  private val _liveStateJson = MutableStateFlow<String?>(null)
  val liveStateJson: StateFlow<String?> = _liveStateJson.asStateFlow()

  private val _audioTimeSync = MutableStateFlow<AudioTimeSync?>(null)
  val audioTimeSync: StateFlow<AudioTimeSync?> = _audioTimeSync.asStateFlow()

  private val _resolvedWsUrl = MutableStateFlow<String?>(null)
  val resolvedWsUrl: StateFlow<String?> = _resolvedWsUrl.asStateFlow()

  private val _mirrorHttpUrl = MutableStateFlow<String?>(null)
  val mirrorHttpUrl: StateFlow<String?> = _mirrorHttpUrl.asStateFlow()

  private val _authRequired = MutableStateFlow(false)
  val authRequired: StateFlow<Boolean> = _authRequired.asStateFlow()

  private val _authError = MutableStateFlow<String?>(null)
  val authError: StateFlow<String?> = _authError.asStateFlow()

  private val _deviceToken = MutableStateFlow<String?>(null)
  val deviceToken: StateFlow<String?> = _deviceToken.asStateFlow()

  private var webSocket: WebSocket? = null
  private var reconnectJob: Job? = null
  private var shouldReconnect = false
  private var activeTargetUrl: String? = null
  private var activePin: String? = null
  private var activeDeviceToken: String? = null
  private var reconnectAttempt = 0
  @Volatile
  private var lastOptimisticAtMs = 0L
  @Volatile
  private var lastOptimisticServerUpdatedAt = -1L
  @Volatile
  private var lastDesktopPayloadObj: JsonObject? = null

  /**
   * Normalizes user input such as:
   * - `192.168.1.10` -> `ws://192.168.1.10:4850`
   * - `192.168.1.10:4850` -> `ws://192.168.1.10:4850`
   * - `ws://192.168.1.10:4850` -> `ws://192.168.1.10:4850`
   * - `http://192.168.1.10:5173/?view=remote&wsPort=4850` -> `ws://192.168.1.10:4850`
   */
  fun normalizeWsUrl(rawInput: String): String? {
    val trimmed = rawInput.trim()
    if (trimmed.isEmpty()) return null

    if (trimmed.startsWith("http://", ignoreCase = true) ||
      trimmed.startsWith("https://", ignoreCase = true)
    ) {
      val uri = runCatching { URI(trimmed) }.getOrNull() ?: return null
      val host = uri.host ?: return null
      val wsPort = uri.rawQuery
        ?.split("&")
        ?.firstOrNull { it.startsWith("wsPort=") }
        ?.substringAfter("wsPort=")
        ?.toIntOrNull()
        ?: uri.port.takeIf { it > 0 }
        ?: DEFAULT_WS_PORT
      val scheme = if (trimmed.startsWith("https://", ignoreCase = true)) "wss" else "ws"
      return "$scheme://$host:$wsPort"
    }

    if (trimmed.startsWith("ws://", ignoreCase = true) ||
      trimmed.startsWith("wss://", ignoreCase = true)
    ) {
      val uri = runCatching { URI(trimmed) }.getOrNull() ?: return null
      val host = uri.host ?: return null
      val port = uri.port.takeIf { it > 0 } ?: DEFAULT_WS_PORT
      val scheme = uri.scheme?.lowercase() ?: "ws"
      return "$scheme://$host:$port"
    }

    // Bare host or host:port
    val withoutSlash = trimmed.substringBefore("/")
    return if (withoutSlash.contains(":")) {
      "ws://$withoutSlash"
    } else {
      "ws://$withoutSlash:$DEFAULT_WS_PORT"
    }
  }

  private fun deviceLabel(): String {
    val model = Build.MODEL?.trim().orEmpty()
    return if (model.isNotEmpty()) "Android ($model)" else "Android Remote"
  }

  fun connect(rawInput: String, pin: String? = null, deviceToken: String? = null) {
    val normalized = normalizeWsUrl(rawInput)
    if (normalized == null) {
      _status.value = ConnectionStatus.Error
      _statusMessage.value = "Enter a valid IP, host:port, or remote URL"
      return
    }

    val urlPin = runCatching { URI(rawInput.trim()).rawQuery }
      .getOrNull()
      ?.split("&")
      ?.firstOrNull { it.startsWith("pin=") }
      ?.substringAfter("pin=")
      ?.trim()
      ?.takeIf { it.isNotEmpty() }

    activePin = urlPin ?: pin?.trim()?.takeIf { it.isNotEmpty() }
    activeDeviceToken = deviceToken?.trim()?.takeIf { it.isNotEmpty() }
    _deviceToken.value = activeDeviceToken
    _authError.value = null
    reconnectAttempt = 0
    reconnectJob?.cancel()
    shouldReconnect = true
    activeTargetUrl = normalized
    _resolvedWsUrl.value = normalized
    val mirrorUrl = buildMirrorHttpUrl(normalized)
    _mirrorHttpUrl.value = mirrorUrl
    currentHttpBaseUrl = mirrorUrl?.let { raw ->
      runCatching {
        val u = URI(raw)
        if (u.port > 0) "${u.scheme}://${u.host}:${u.port}" else "${u.scheme}://${u.host}"
      }.getOrNull()
    }
    openSocket(normalized)
  }

  fun submitPin(pin: String) {
    val cleaned = pin.trim()
    activePin = cleaned.takeIf { it.isNotEmpty() }
    _authError.value = null
    val socket = webSocket ?: return
    if (cleaned.isNotEmpty()) {
      socket.send(
        JsonObject(
          mapOf(
            "type" to JsonPrimitive("AUTH"),
            "pin" to JsonPrimitive(cleaned),
            "rememberDevice" to JsonPrimitive(true),
            "deviceName" to JsonPrimitive(deviceLabel()),
          ),
        ).toString(),
      )
    }
  }

  private fun buildMirrorHttpUrl(wsUrl: String): String? {
    val uri = runCatching { URI(wsUrl) }.getOrNull() ?: return null
    val host = uri.host ?: return null
    val port = uri.port.takeIf { it > 0 } ?: DEFAULT_WS_PORT
    val httpScheme = if (uri.scheme.equals("wss", ignoreCase = true)) "https" else "http"
    return "$httpScheme://$host:$port/?view=remote&chromeless=1&viewMode=mainScreen&noWs=1&static=1"
  }

  fun disconnect() {
    shouldReconnect = false
    reconnectJob?.cancel()
    activeTargetUrl = null
    webSocket?.close(1000, "User disconnected")
    webSocket = null
    _status.value = ConnectionStatus.Disconnected
    _statusMessage.value = null
  }

  /**
   * Immediately triggers a reconnect attempt if auto-reconnect is enabled and not currently connected.
   */
  fun reconnectIfNeeded() {
    val target = activeTargetUrl ?: return
    if (!shouldReconnect) return
    if (_status.value == ConnectionStatus.Connected || _status.value == ConnectionStatus.Connecting) {
      return
    }
    reconnectAttempt = 0
    reconnectJob?.cancel()
    openSocket(target)
  }

  fun shutdown() {
    disconnect()
    scope.cancel()
  }

  fun sendCommand(
    action: String,
    blockIndex: Int? = null,
    itemId: String? = null,
    volume: Float? = null,
  ): Boolean {
    val socket = webSocket ?: return false
    applyOptimisticUpdate(action, blockIndex, itemId)
    val payload = json.encodeToString(
      RemoteCommandPayload(
        action = action,
        blockIndex = blockIndex,
        itemId = itemId,
        volume = volume,
        pin = activePin,
      ),
    )
    return socket.send(payload)
  }

  /**
   * Updates local LiveState immediately so UI transitions happen in <1ms without waiting for
   * the desktop round-trip, while tagging the current server timestamp to avoid stale flicker.
   */
  private fun applyOptimisticUpdate(action: String, blockIndex: Int?, itemId: String? = null) {
    val current = _liveState.value ?: return
    val blocksCount = current.activeItem?.blocks?.size ?: 0
    val updated = when (action) {
      "NEXT" -> if (current.activeBlockIndex + 1 < blocksCount) {
        current.copy(activeBlockIndex = current.activeBlockIndex + 1, override = "none")
      } else {
        current
      }
      "PREV" -> if (current.activeBlockIndex > 0) {
        current.copy(activeBlockIndex = current.activeBlockIndex - 1, override = "none")
      } else {
        current
      }
      "SELECT_BLOCK" -> if (blockIndex != null && blockIndex in 0 until blocksCount) {
        current.copy(activeBlockIndex = blockIndex, override = "none")
      } else {
        current
      }
      "SELECT_ITEM" -> {
        val cachedItem = itemId?.let { syncCache?.resolveCachedItemModel(it) }
        if (cachedItem != null) {
          current.copy(
            activeItemId = cachedItem.id,
            activeItem = cachedItem,
            activeBlockIndex = 0,
            override = "none",
            lyricsMode = cachedItem.lyricsMode ?: "slide",
            bibleLayout = cachedItem.bibleLayout ?: "stacked",
            verseMaxFontSize = cachedItem.verseMaxFontSize ?: 72,
          )
        } else {
          current
        }
      }
      "TOGGLE_BLACKOUT" -> current.copy(
        override = if (current.override == "blackout") "none" else "blackout",
      )
      "TOGGLE_CLEAR_TEXT" -> current.copy(
        override = if (current.override == "clearText") "none" else "clearText",
      )
      "TOGGLE_LOGO" -> current.copy(
        override = if (current.override == "showLogo") "none" else "showLogo",
      )
      "CLEAR_OVERRIDE" -> current.copy(override = "none")
      "TOGGLE_RETURN_AUDIO" -> current.copy(returnAudioMuted = !current.returnAudioMuted)
      else -> current
    }
    if (updated != current) {
      lastOptimisticAtMs = System.currentTimeMillis()
      lastOptimisticServerUpdatedAt = current.updatedAt
      _liveState.value = updated
      val baseObj = lastDesktopPayloadObj
      if (baseObj != null) {
        val cachedItemJson = if (action == "SELECT_ITEM" && itemId != null) {
          syncCache?.resolveCachedItemJson(itemId)
        } else {
          null
        }
        val patched = JsonObject(
          baseObj.toMutableMap().apply {
            put("activeBlockIndex", JsonPrimitive(updated.activeBlockIndex))
            put("override", JsonPrimitive(updated.override))
            if (cachedItemJson != null && updated.activeItemId != null) {
              put("activeItemId", JsonPrimitive(updated.activeItemId))
              put("activeItem", cachedItemJson)
              put("lyricsMode", JsonPrimitive(updated.lyricsMode))
              put("bibleLayout", JsonPrimitive(updated.bibleLayout))
              updated.verseMaxFontSize?.let { put("verseMaxFontSize", JsonPrimitive(it)) }
            }
          },
        )
        lastDesktopPayloadObj = patched
        _liveStateJson.value = patched.toString()
      } else {
        _liveStateJson.value = json.encodeToString(updated)
      }
    }
  }

  /**
   * Strips fields that are not needed by the WebView mirror (such as programItems and
   * desktop-only audioUrl tracks) so cached JSON payloads stay compact in memory.
   */
  private fun sanitizeMirrorPayload(payloadObj: JsonObject): JsonObject {
    val rootMap = payloadObj.toMutableMap()
    rootMap.remove("programItems")
    val activeItemObj = rootMap["activeItem"] as? JsonObject
    if (activeItemObj != null && (activeItemObj.containsKey("audioUrl") || activeItemObj.containsKey("audioFileName"))) {
      rootMap["activeItem"] = JsonObject(
        activeItemObj.toMutableMap().apply {
          remove("audioUrl")
          remove("audioFileName")
        },
      )
    }
    return JsonObject(rootMap)
  }

  private fun openSocket(url: String) {
    webSocket?.cancel()
    _status.value = ConnectionStatus.Connecting
    _statusMessage.value = "Connecting to $url..."

    val request = Request.Builder().url(url).build()
    webSocket = client.newWebSocket(
      request,
      object : WebSocketListener() {
        override fun onOpen(webSocket: WebSocket, response: Response) {
          if (this@PresenterWsClient.webSocket !== webSocket) return
          reconnectAttempt = 0
          _status.value = ConnectionStatus.Connected
          _statusMessage.value = "Connected to $url"
          webSocket.send(
            JsonObject(
              mapOf(
                "type" to JsonPrimitive("CLIENT_CAPS"),
                "supportsShowCue" to JsonPrimitive(true),
              ),
            ).toString(),
          )
          val token = activeDeviceToken
          if (!token.isNullOrBlank()) {
            webSocket.send(
              JsonObject(
                mapOf(
                  "type" to JsonPrimitive("AUTH"),
                  "token" to JsonPrimitive(token),
                  "deviceName" to JsonPrimitive(deviceLabel()),
                ),
              ).toString(),
            )
            return
          }
          val pin = activePin
          if (!pin.isNullOrBlank()) {
            webSocket.send(
              JsonObject(
                mapOf(
                  "type" to JsonPrimitive("AUTH"),
                  "pin" to JsonPrimitive(pin),
                  "rememberDevice" to JsonPrimitive(true),
                  "deviceName" to JsonPrimitive(deviceLabel()),
                ),
              ).toString(),
            )
          }
        }

        override fun onMessage(webSocket: WebSocket, text: String) {
          if (this@PresenterWsClient.webSocket !== webSocket) return
          runCatching {
            val rootObj = json.parseToJsonElement(text).jsonObject
            val type = (rootObj["type"] as? JsonPrimitive)?.content
            if (type == "AUTH_RESULT") {
              val ok = (rootObj["ok"] as? JsonPrimitive)?.content?.toBooleanStrictOrNull() ?: false
              val revoked = (rootObj["revoked"] as? JsonPrimitive)?.content?.toBooleanStrictOrNull() ?: false
              val err = (rootObj["error"] as? JsonPrimitive)?.content
              val issuedToken = (rootObj["deviceToken"] as? JsonPrimitive)?.content
              if (ok) {
                _authRequired.value = false
                _authError.value = null
                if (!issuedToken.isNullOrBlank()) {
                  activeDeviceToken = issuedToken
                  _deviceToken.value = issuedToken
                }
              } else {
                if (revoked) {
                  activeDeviceToken = null
                  _deviceToken.value = null
                }
                if (!err.isNullOrBlank()) {
                  _authRequired.value = true
                  _authError.value = err
                }
              }
              return
            }
            if (type == "AUTH_REQUIRED") {
              val revoked = (rootObj["revoked"] as? JsonPrimitive)?.content?.toBooleanStrictOrNull() ?: false
              val err = (rootObj["error"] as? JsonPrimitive)?.content
              if (revoked) {
                activeDeviceToken = null
                _deviceToken.value = null
              }
              _authRequired.value = true
              _authError.value = err ?: "Enter presenter PIN to control"
              return
            }
            if (type == "SYNC_BUNDLE_AVAILABLE") {
              val version = (rootObj["version"] as? JsonPrimitive)?.content?.toIntOrNull() ?: 0
              val baseUrl = currentHttpBaseUrl
              val cache = syncCache
              if (baseUrl != null && cache != null) {
                scope.launch {
                  cache.syncFromServer(baseUrl, version, client)
                  refreshActiveItemFromCache()
                }
              }
              return
            }
            if (type == "SHOW_CUE") {
              val curState = _liveState.value ?: return
              val updatedAt = (rootObj["updatedAt"] as? JsonPrimitive)?.longOrNull ?: System.currentTimeMillis()
              val now = System.currentTimeMillis()
              if (now - lastOptimisticAtMs < 350L && updatedAt <= lastOptimisticServerUpdatedAt) {
                return
              }
              val version = (rootObj["version"] as? JsonPrimitive)?.intOrNull ?: 0
              val activeItemId = (rootObj["activeItemId"] as? JsonPrimitive)?.content
              val activeBlockIndex = (rootObj["activeBlockIndex"] as? JsonPrimitive)?.intOrNull ?: 0
              val overrideMode = (rootObj["override"] as? JsonPrimitive)?.content ?: "none"
              val lyricsMode = (rootObj["lyricsMode"] as? JsonPrimitive)?.content ?: curState.lyricsMode
              val bibleLayout = (rootObj["bibleLayout"] as? JsonPrimitive)?.content ?: curState.bibleLayout
              val verseMaxFontSize = (rootObj["verseMaxFontSize"] as? JsonPrimitive)?.intOrNull ?: curState.verseMaxFontSize
              val nextItemTitle = (rootObj["nextItemTitle"] as? JsonPrimitive)?.content

              val cachedItem = activeItemId?.let { syncCache?.resolveCachedItemModel(it) }
              val cachedItemJson = activeItemId?.let { syncCache?.resolveCachedItemJson(it) }
              if (activeItemId != null && (cachedItem == null || cachedItemJson == null)) {
                val baseUrl = currentHttpBaseUrl
                val cache = syncCache
                if (baseUrl != null && cache != null) {
                  scope.launch { cache.syncFromServer(baseUrl, version, client) }
                }
                return
              }

              val nextState = curState.copy(
                activeItemId = activeItemId,
                activeItem = cachedItem,
                activeBlockIndex = activeBlockIndex,
                override = overrideMode,
                lyricsMode = lyricsMode,
                bibleLayout = bibleLayout,
                verseMaxFontSize = verseMaxFontSize,
                nextItemTitle = nextItemTitle,
                updatedAt = updatedAt,
              )
              _liveState.value = nextState
              val baseObj = lastDesktopPayloadObj
              if (baseObj != null) {
                val patched = JsonObject(
                  baseObj.toMutableMap().apply {
                    put("activeItemId", activeItemId?.let { JsonPrimitive(it) } ?: JsonNull)
                    put("activeItem", cachedItemJson ?: JsonNull)
                    put("activeBlockIndex", JsonPrimitive(activeBlockIndex))
                    put("override", JsonPrimitive(overrideMode))
                    put("lyricsMode", JsonPrimitive(lyricsMode))
                    put("bibleLayout", JsonPrimitive(bibleLayout))
                    verseMaxFontSize?.let { put("verseMaxFontSize", JsonPrimitive(it)) }
                    put("nextItemTitle", nextItemTitle?.let { JsonPrimitive(it) } ?: JsonNull)
                    put("updatedAt", JsonPrimitive(updatedAt))
                  },
                )
                lastDesktopPayloadObj = patched
                _liveStateJson.value = patched.toString()
              } else {
                _liveStateJson.value = json.encodeToString(nextState)
              }
              _audioTimeSync.value = AudioTimeSync(
                timeSec = nextState.audioCurrentTimeSec,
                activeBlockIndex = activeBlockIndex,
              )
              return
            }
            if (type == "TIME_SYNC") {
              val timeEl = rootObj["audioCurrentTimeSec"]
              val timeSec = (timeEl as? JsonPrimitive)?.content?.toDoubleOrNull()
              val blockEl = rootObj["activeBlockIndex"]
              val blockIdx = (blockEl as? JsonPrimitive)?.content?.toIntOrNull()

              // Emit only the lightweight AudioTimeSync tick instead of cloning and
              // serializing the entire LiveState JSON string at 10Hz (which caused
              // Large Object Space GC thrashing and WebView renderer OOM crashes).
              val currentBlockIdx = blockIdx ?: _liveState.value?.activeBlockIndex
              _audioTimeSync.value = AudioTimeSync(
                timeSec = timeSec,
                activeBlockIndex = currentBlockIdx,
              )

              // Only mutate _liveState when activeBlockIndex actually advances so optimistic
              // NEXT/PREV commands know the current block without triggering 10Hz root Compose recompositions.
              val curState = _liveState.value
              if (curState != null && blockIdx != null && blockIdx != curState.activeBlockIndex) {
                _liveState.value = curState.copy(
                  activeBlockIndex = blockIdx,
                  audioCurrentTimeSec = timeSec,
                )
              }
              return
            }
            val payloadObj = rootObj["payload"] as? JsonObject ?: return
            if (type == "LIVE_STATE") {
              val incoming = json.decodeFromJsonElement(LiveState.serializer(), payloadObj)
              val now = System.currentTimeMillis()
              // Ignore an older in-flight state emitted before our optimistic tap.
              if (now - lastOptimisticAtMs < 350L && incoming.updatedAt <= lastOptimisticServerUpdatedAt) {
                return
              }
              val sanitized = sanitizeMirrorPayload(payloadObj)
              lastDesktopPayloadObj = sanitized
              _liveState.value = incoming
              _liveStateJson.value = sanitized.toString()
              _audioTimeSync.value = AudioTimeSync(
                timeSec = incoming.audioCurrentTimeSec,
                activeBlockIndex = incoming.activeBlockIndex,
              )
            }
          }
        }

        override fun onClosing(webSocket: WebSocket, code: Int, reason: String) {
          webSocket.close(1000, null)
          if (this@PresenterWsClient.webSocket === webSocket) {
            this@PresenterWsClient.webSocket = null
            _status.value = ConnectionStatus.Disconnected
            _statusMessage.value = "Reconnecting..."
            scheduleReconnect()
          }
        }

        override fun onClosed(webSocket: WebSocket, code: Int, reason: String) {
          if (this@PresenterWsClient.webSocket !== webSocket) return
          this@PresenterWsClient.webSocket = null
          _status.value = ConnectionStatus.Disconnected
          _statusMessage.value = reason.ifBlank { "Disconnected" }
          scheduleReconnect()
        }

        override fun onFailure(webSocket: WebSocket, t: Throwable, response: Response?) {
          if (this@PresenterWsClient.webSocket !== webSocket) return
          this@PresenterWsClient.webSocket = null
          _status.value = ConnectionStatus.Error
          _statusMessage.value = t.localizedMessage ?: "Connection failed"
          scheduleReconnect()
        }
      },
    )
  }

  private fun scheduleReconnect() {
    val target = activeTargetUrl ?: return
    if (!shouldReconnect) return
    reconnectJob?.cancel()
    val shift = reconnectAttempt.coerceAtMost(4)
    val delayMs = (RECONNECT_BASE_DELAY_MS shl shift).coerceAtMost(RECONNECT_MAX_DELAY_MS)
    reconnectAttempt += 1
    reconnectJob = scope.launch {
      delay(delayMs)
      if (shouldReconnect && activeTargetUrl == target) {
        openSocket(target)
      }
    }
  }

  companion object {
    const val DEFAULT_WS_PORT = 4850
    private const val RECONNECT_BASE_DELAY_MS = 1200L
    private const val RECONNECT_MAX_DELAY_MS = 15000L
  }
}
