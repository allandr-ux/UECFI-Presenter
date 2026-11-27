package org.uecfi.presenter.ui.main

import android.app.Application
import android.content.Context
import android.net.ConnectivityManager
import android.net.Network
import android.webkit.WebResourceResponse
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import java.io.File
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import org.uecfi.presenter.data.CacheStats
import org.uecfi.presenter.model.LiveState
import org.uecfi.presenter.network.AudioTimeSync
import org.uecfi.presenter.network.ConnectionStatus
import org.uecfi.presenter.network.DiscoveredServer
import org.uecfi.presenter.network.PresenterWsClient
import org.uecfi.presenter.network.ServerDiscovery

class MainScreenViewModel(application: Application) : AndroidViewModel(application) {
  private val prefs = application.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
  private val wsClient = PresenterWsClient(File(application.filesDir, "sync_cache"))

  private val _serverInput = MutableStateFlow(prefs.getString(KEY_SERVER_URL, "") ?: "")
  val serverInput: StateFlow<String> = _serverInput.asStateFlow()

  private val _pinInput = MutableStateFlow(prefs.getString(KEY_REMOTE_PIN, "") ?: "")
  val pinInput: StateFlow<String> = _pinInput.asStateFlow()

  private val _discoveredServers = MutableStateFlow<List<DiscoveredServer>>(emptyList())
  val discoveredServers: StateFlow<List<DiscoveredServer>> = _discoveredServers.asStateFlow()

  private val _isDiscovering = MutableStateFlow(false)
  val isDiscovering: StateFlow<Boolean> = _isDiscovering.asStateFlow()

  val connectionStatus: StateFlow<ConnectionStatus> = wsClient.status
  val statusMessage: StateFlow<String?> = wsClient.statusMessage
  val liveState: StateFlow<LiveState?> = wsClient.liveState
  val liveStateJson: StateFlow<String?> = wsClient.liveStateJson
  val audioTimeSync: StateFlow<AudioTimeSync?> = wsClient.audioTimeSync
  val mirrorHttpUrl: StateFlow<String?> = wsClient.mirrorHttpUrl
  val authRequired: StateFlow<Boolean> = wsClient.authRequired
  val authError: StateFlow<String?> = wsClient.authError
  val cacheStats: StateFlow<CacheStats> = wsClient.cacheStats

  @Volatile
  private var userStopped = false

  private val connectivityManager =
    application.getSystemService(Context.CONNECTIVITY_SERVICE) as? ConnectivityManager

  private val networkCallback = object : ConnectivityManager.NetworkCallback() {
    override fun onAvailable(network: Network) {
      if (!userStopped) {
        wsClient.reconnectIfNeeded()
        discoverServers(autoConnect = true)
      }
    }
  }

  init {
    runCatching {
      connectivityManager?.registerDefaultNetworkCallback(networkCallback)
    }
    viewModelScope.launch {
      wsClient.deviceToken.collect { token ->
        if (token.isNullOrBlank()) {
          prefs.edit().remove(KEY_DEVICE_TOKEN).apply()
        } else {
          prefs.edit().putString(KEY_DEVICE_TOKEN, token).apply()
        }
      }
    }
    val saved = _serverInput.value.trim()
    val savedToken = prefs.getString(KEY_DEVICE_TOKEN, null)
    if (saved.isNotEmpty()) {
      wsClient.connect(saved, _pinInput.value, savedToken)
    }
    startAutoDiscoveryReconnectLoop()
  }

  private fun startAutoDiscoveryReconnectLoop() {
    viewModelScope.launch {
      while (true) {
        if (!userStopped && connectionStatus.value != ConnectionStatus.Connected) {
          wsClient.reconnectIfNeeded()
          performDiscovery(autoConnect = true)
        }
        delay(AUTO_SCAN_INTERVAL_MS)
      }
    }
  }

  fun updateServerInput(value: String) {
    _serverInput.value = value
  }

  fun updatePinInput(value: String) {
    _pinInput.value = value
  }

  fun submitPin(pin: String = _pinInput.value) {
    val cleaned = pin.trim()
    _pinInput.value = cleaned
    prefs.edit().putString(KEY_REMOTE_PIN, cleaned).apply()
    wsClient.submitPin(cleaned)
  }

  fun connect() {
    userStopped = false
    val trimmed = _serverInput.value.trim()
    val pin = _pinInput.value.trim()
    prefs.edit()
      .putString(KEY_SERVER_URL, trimmed)
      .putString(KEY_REMOTE_PIN, pin)
      .apply()
    wsClient.connect(trimmed, pin, prefs.getString(KEY_DEVICE_TOKEN, null))
  }

  fun disconnect() {
    userStopped = true
    wsClient.disconnect()
  }

  fun discoverServers(autoConnect: Boolean = true) {
    if (_isDiscovering.value) return
    userStopped = false
    viewModelScope.launch {
      performDiscovery(autoConnect = autoConnect)
    }
  }

  private suspend fun performDiscovery(autoConnect: Boolean) {
    if (_isDiscovering.value) return
    _isDiscovering.value = true
    try {
      val servers = ServerDiscovery.discoverServers(timeoutMs = 1500L)
      _discoveredServers.value = servers
      if (autoConnect && !userStopped && servers.isNotEmpty() &&
        connectionStatus.value != ConnectionStatus.Connected
      ) {
        val currentInput = _serverInput.value.trim()
        val matching = servers.firstOrNull { "${it.host}:${it.wsPort}" == currentInput }
        val target = matching ?: if (currentInput.isBlank() ||
          connectionStatus.value == ConnectionStatus.Error ||
          connectionStatus.value == ConnectionStatus.Disconnected ||
          servers.size == 1
        ) {
          servers.first()
        } else {
          null
        }
        if (target != null && (matching == null || connectionStatus.value != ConnectionStatus.Connecting)) {
          connectToDiscovered(target)
        }
      }
    } finally {
      _isDiscovering.value = false
    }
  }

  fun connectToDiscovered(server: DiscoveredServer) {
    userStopped = false
    val hostPort = "${server.host}:${server.wsPort}"
    _serverInput.value = hostPort
    prefs.edit().putString(KEY_SERVER_URL, hostPort).apply()
    wsClient.connect(server.wsUrl, _pinInput.value, prefs.getString(KEY_DEVICE_TOKEN, null))
  }

  fun sendPrev() {
    wsClient.sendCommand("PREV")
  }

  fun sendNext() {
    wsClient.sendCommand("NEXT")
  }

  fun selectBlock(index: Int) {
    wsClient.sendCommand("SELECT_BLOCK", blockIndex = index)
  }

  fun selectItem(itemId: String) {
    wsClient.sendCommand("SELECT_ITEM", itemId = itemId)
  }

  fun toggleBlackout() {
    wsClient.sendCommand("TOGGLE_BLACKOUT")
  }

  fun toggleClearText() {
    wsClient.sendCommand("TOGGLE_CLEAR_TEXT")
  }

  fun toggleLogo() {
    wsClient.sendCommand("TOGGLE_LOGO")
  }

  fun clearOverride() {
    wsClient.sendCommand("CLEAR_OVERRIDE")
  }

  fun toggleReturnAudio() {
    wsClient.sendCommand("TOGGLE_RETURN_AUDIO")
  }

  fun openCachedMedia(requestUrl: String): WebResourceResponse? =
    wsClient.openCachedMedia(requestUrl)

  fun clearCache() = wsClient.clearCache()

  fun resyncCache() = wsClient.resyncCache()

  fun toggleAudioPlay() {
    wsClient.sendCommand("AUDIO_TOGGLE_PLAY")
  }

  fun stopAudio() {
    wsClient.sendCommand("AUDIO_STOP")
  }

  fun restartAudio() {
    wsClient.sendCommand("AUDIO_RESTART")
  }

  fun setAudioVolume(volume: Float) {
    wsClient.sendCommand("AUDIO_SET_VOLUME", volume = volume.coerceIn(0f, 1f))
  }

  override fun onCleared() {
    super.onCleared()
    runCatching {
      connectivityManager?.unregisterNetworkCallback(networkCallback)
    }
    wsClient.shutdown()
  }

  companion object {
    private const val PREFS_NAME = "uecfi_presenter_prefs"
    private const val KEY_SERVER_URL = "server_url"
    private const val KEY_REMOTE_PIN = "remote_pin"
    private const val KEY_DEVICE_TOKEN = "device_token"
    private const val AUTO_SCAN_INTERVAL_MS = 3000L
  }
}
