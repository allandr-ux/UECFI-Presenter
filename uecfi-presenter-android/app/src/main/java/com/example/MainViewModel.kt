package com.example

import android.app.Application
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import kotlinx.coroutines.Job
import kotlinx.coroutines.channels.Channel
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch
import kotlinx.coroutines.withTimeoutOrNull

enum class ConnectionStatus {
    SEARCHING,
    CONNECTED,
    RECONNECTING
}

data class ProjectionUiState(
    val status: ConnectionStatus = ConnectionStatus.SEARCHING,
    val activeHost: String? = null,
    val activePort: Int = PresenterApiClient.DEFAULT_PRESENTER_PORT,
    val presenterState: PresenterState? = null,
    val showManualFallback: Boolean = false,
    val manualHostInput: String = "192.168.1.",
    val manualPortInput: String = PresenterApiClient.DEFAULT_PRESENTER_PORT.toString(),
    val isManualConnecting: Boolean = false,
    val isNavigating: Boolean = false,
    val customButtons: List<CustomRemoteButton> = emptyList(),
    val isLoadingButtons: Boolean = false,
    val manualErrorHost: String? = null,
    val manualErrorPort: Int? = null,
    val webViewSyncVersion: Int = 0
)

/**
 * Coordinates continuous server auto-discovery, live 400ms `/api/state` polling,
 * 3-strike disconnection detection, non-stop background auto-reconnection
 * (Last-IP ping + mDNS + Semaphore(48) `/24` subnet sweep), and 400ms-throttled slide commands.
 */
class MainViewModel(application: Application) : AndroidViewModel(application) {

    val apiClient = PresenterApiClient()
    val discoveryManager = MdnsDiscoveryManager(application.applicationContext, apiClient)

    val isTvDevice: Boolean by lazy {
        val uiModeManager = application.getSystemService(android.content.Context.UI_MODE_SERVICE) as? android.app.UiModeManager
        val isTvMode = uiModeManager?.currentModeType == android.content.res.Configuration.UI_MODE_TYPE_TELEVISION
        val hasLeanback = application.packageManager.hasSystemFeature(android.content.pm.PackageManager.FEATURE_LEANBACK)
        isTvMode || hasLeanback
    }

    private val _uiState = MutableStateFlow(
        ProjectionUiState(
            manualHostInput = discoveryManager.getDefaultIpOrSubnetPrefix(),
            manualPortInput = discoveryManager.getSavedPort().toString()
        )
    )
    val uiState: StateFlow<ProjectionUiState> = _uiState.asStateFlow()

    private var connectionLoopJob: Job? = null
    private var livePollingJob: Job? = null
    private var manualFallbackTimerJob: Job? = null

    private val immediatePollChannel = Channel<Unit>(Channel.CONFLATED)

    companion object {
        const val LIVE_POLL_INTERVAL_MS = 400L
        const val MAX_CONSECUTIVE_POLL_FAILURES = 3
        const val MANUAL_FALLBACK_DELAY_MS = 4000L
        const val RECONNECT_RETRY_DELAY_MS = 1500L
    }

    init {
        // Listen continuously for any endpoint discovered asynchronously by mDNS or Subnet Sweep
        viewModelScope.launch {
            discoveryManager.discoveredEndpoints.collect { endpoint ->
                val current = _uiState.value
                if (current.status != ConnectionStatus.CONNECTED ||
                    current.activeHost != endpoint.host ||
                    current.activePort != endpoint.port
                ) {
                    onServerConnected(endpoint.host, endpoint.port)
                }
            }
        }

        // Start initial connection & continuous auto-discovery loop
        startContinuousReconnectionLoop(initialLaunch = true)
    }

    fun updateManualHostInput(value: String) {
        _uiState.update {
            it.copy(
                manualHostInput = value,
                manualErrorHost = null,
                manualErrorPort = null
            )
        }
    }

    fun updateManualPortInput(value: String) {
        val digitsOnly = value.filter { ch -> ch.isDigit() }.take(5)
        _uiState.update {
            it.copy(
                manualPortInput = digitsOnly,
                manualErrorHost = null,
                manualErrorPort = null
            )
        }
    }

    /**
     * Triggered when the user taps "Connect" in the manual IP/port fallback overlay.
     * Note: The background continuous reconnection loop stays active while this runs.
     */
    fun connectManually() {
        val state = _uiState.value
        val cleanHost = state.manualHostInput.trim()
        val parsedPort = state.manualPortInput.trim().toIntOrNull()
            ?: PresenterApiClient.DEFAULT_PRESENTER_PORT

        if (cleanHost.isEmpty() || parsedPort !in 1..65535) {
            _uiState.update {
                it.copy(
                    manualErrorHost = cleanHost.ifEmpty { "?" },
                    manualErrorPort = parsedPort
                )
            }
            return
        }

        _uiState.update {
            it.copy(
                isManualConnecting = true,
                manualErrorHost = null,
                manualErrorPort = null
            )
        }

        viewModelScope.launch {
            val reachable = apiClient.probeServer(cleanHost, parsedPort, timeoutMs = 1500L)
            if (reachable) {
                onServerConnected(cleanHost, parsedPort)
            } else {
                _uiState.update {
                    it.copy(
                        isManualConnecting = false,
                        manualErrorHost = cleanHost,
                        manualErrorPort = parsedPort
                    )
                }
            }
        }
    }

    /**
     * Triggered when the user taps "Retry Auto-Detect": hides the manual dialog for a fresh
     * 4-second window and immediately restarts the continuous discovery cycle.
     */
    fun retryAutoDetect() {
        _uiState.update {
            it.copy(
                status = ConnectionStatus.SEARCHING,
                showManualFallback = false,
                isManualConnecting = false,
                manualErrorHost = null,
                manualErrorPort = null,
                manualHostInput = discoveryManager.getDefaultIpOrSubnetPrefix(),
                manualPortInput = discoveryManager.getSavedPort().toString()
            )
        }
        discoveryManager.restartMdnsDiscovery()
        startContinuousReconnectionLoop(initialLaunch = true)
    }

    /**
     * Opens the manual IP/port connection overlay (e.g. via TV remote Menu/Settings key)
     * so users can inspect or switch the server address while connected.
     */
    fun openManualConnection() {
        _uiState.update {
            it.copy(
                showManualFallback = true,
                manualErrorHost = null,
                manualErrorPort = null
            )
        }
    }

    /**
     * Dismisses the manual IP/port connection overlay when already connected.
     */
    fun dismissManualConnection() {
        if (_uiState.value.status == ConnectionStatus.CONNECTED) {
            _uiState.update {
                it.copy(
                    showManualFallback = false,
                    isManualConnecting = false,
                    manualErrorHost = null,
                    manualErrorPort = null
                )
            }
        }
    }

    /**
     * Sends a Next or Previous slide command (`command=2` or `command=3`) and immediately
     * triggers an out-of-band `/api/state` refresh.
     */
    fun sendSlideSwipeCommand(command: SlideCommand) {
        val current = _uiState.value
        if (current.status != ConnectionStatus.CONNECTED || current.isNavigating) return
        val host = current.activeHost ?: return
        val port = current.activePort
        val st = current.presenterState

        if (command == SlideCommand.NEXT && st != null && !st.canNext) return
        if (command == SlideCommand.PREVIOUS && st != null && !st.canPrev) return

        _uiState.update { it.copy(isNavigating = true) }
        viewModelScope.launch {
            try {
                val sent = apiClient.sendSlideCommand(host, port, command)
                if (sent) {
                    val refreshed = apiClient.fetchState(host, port, isTvDevice = isTvDevice)
                    if (refreshed != null) {
                        _uiState.update { it.copy(presenterState = refreshed) }
                    }
                    immediatePollChannel.trySend(Unit)
                }
            } finally {
                _uiState.update { it.copy(isNavigating = false) }
            }
        }
    }

    /**
     * Sends a Next Verse or Previous Verse command (`command=20` or `command=21`)
     * specifically for Bible scripture navigation, and immediately triggers an
     * out-of-band `/api/state` refresh. Ignores repeated taps until the updated
     * state is loaded.
     */
    fun sendVerseCommand(command: VerseCommand) {
        val current = _uiState.value
        if (current.status != ConnectionStatus.CONNECTED || current.isNavigating) return
        val host = current.activeHost ?: return
        val port = current.activePort
        val st = current.presenterState

        if (command == VerseCommand.NEXT && st != null && !st.canNext) return
        if (command == VerseCommand.PREVIOUS && st != null && !st.canPrev) return

        _uiState.update { it.copy(isNavigating = true) }
        viewModelScope.launch {
            try {
                val sent = apiClient.sendVerseCommand(host, port, command)
                if (sent) {
                    val refreshed = apiClient.fetchState(host, port, isTvDevice = isTvDevice)
                    if (refreshed != null) {
                        _uiState.update { it.copy(presenterState = refreshed) }
                    }
                    immediatePollChannel.trySend(Unit)
                }
            } finally {
                _uiState.update { it.copy(isNavigating = false) }
            }
        }
    }

    /**
     * Refreshes the list of custom speaker remote buttons from `GET /api/buttons`.
     */
    fun refreshCustomButtons() {
        val current = _uiState.value
        val host = current.activeHost ?: return
        val port = current.activePort
        if (current.status != ConnectionStatus.CONNECTED) return

        _uiState.update { it.copy(isLoadingButtons = true) }
        viewModelScope.launch {
            try {
                val buttons = apiClient.fetchCustomButtons(host, port)
                _uiState.update { it.copy(customButtons = buttons) }
            } finally {
                _uiState.update { it.copy(isLoadingButtons = false) }
            }
        }
    }

    /**
     * Triggers a custom speaker remote button (`command` + `value`) and immediately
     * refreshes `/api/state` so any multi-slide item updates navigation controls right away.
     */
    fun sendCustomButtonCommand(button: CustomRemoteButton) {
        val current = _uiState.value
        if (current.status != ConnectionStatus.CONNECTED || current.isNavigating) return
        val host = current.activeHost ?: return
        val port = current.activePort

        _uiState.update { it.copy(isNavigating = true) }
        viewModelScope.launch {
            try {
                val sent = apiClient.sendCustomCommand(host, port, button.command, button.value)
                if (sent) {
                    val refreshed = apiClient.fetchState(host, port, isTvDevice = isTvDevice)
                    if (refreshed != null) {
                        _uiState.update { it.copy(presenterState = refreshed) }
                    }
                    immediatePollChannel.trySend(Unit)
                }
            } finally {
                _uiState.update { it.copy(isNavigating = false) }
            }
        }
    }

    /**
     * Transitions the app into the connected state, automatically dismisses the manual
     * input overlay if visible, increments `webViewSyncVersion` so the WebView reloads/re-syncs
     * `presentation.htm`, and starts the 400ms live state polling loop.
     */
    private fun onServerConnected(host: String, port: Int) {
        val cleanHost = host.trim()
        discoveryManager.saveLastWorkingServer(cleanHost, port)

        // Cancel reconnection and 4-second manual fallback timer jobs
        connectionLoopJob?.cancel()
        connectionLoopJob = null
        manualFallbackTimerJob?.cancel()
        manualFallbackTimerJob = null

        _uiState.update { prev ->
            prev.copy(
                status = ConnectionStatus.CONNECTED,
                activeHost = cleanHost,
                activePort = port,
                showManualFallback = false,
                isManualConnecting = false,
                isNavigating = false,
                manualErrorHost = null,
                manualErrorPort = null,
                manualHostInput = cleanHost,
                manualPortInput = port.toString(),
                webViewSyncVersion = prev.webViewSyncVersion + 1
            )
        }

        startLiveStatePolling(cleanHost, port)
        refreshCustomButtons()
    }

    /**
     * Polls `GET http://<host>:<port>/api/state` every 400ms.
     * - Absorbs 1–2 transient poll failures silently without flickering the screen.
     * - After 3 consecutive poll failures (~1.2 seconds), marks state as `RECONNECTING`
     *   and starts the Continuous Reconnection Loop.
     */
    private fun startLiveStatePolling(host: String, port: Int) {
        livePollingJob?.cancel()
        livePollingJob = viewModelScope.launch {
            var consecutiveFailures = 0

            while (isActive) {
                val state = apiClient.fetchState(host, port, isTvDevice = isTvDevice)
                if (state != null) {
                    consecutiveFailures = 0
                    _uiState.update { prev ->
                        prev.copy(
                            status = ConnectionStatus.CONNECTED,
                            presenterState = state,
                            showManualFallback = false
                        )
                    }
                } else {
                    consecutiveFailures++
                    if (consecutiveFailures >= MAX_CONSECUTIVE_POLL_FAILURES) {
                        // 3 consecutive failures (~1.2s): transition to Reconnecting and start
                        // the non-stop Continuous Reconnection Loop
                        _uiState.update { prev ->
                            prev.copy(status = ConnectionStatus.RECONNECTING)
                        }
                        startContinuousReconnectionLoop(initialLaunch = false)
                        break
                    }
                }

                // Wait 400ms or wake immediately after a swipe command
                withTimeoutOrNull(LIVE_POLL_INTERVAL_MS) {
                    immediatePollChannel.receive()
                }
            }
        }
    }

    /**
     * Runs non-stop until connected (`while (isActive && status != CONNECTED)`):
     * - Starts a 4-second timer to display the non-blocking manual input overlay if still
     *   searching/reconnecting after 4 seconds.
     * - Step A: Probe last known `host:port` (800ms timeout) for <100ms instant reconnect.
     * - Step B: Ensure mDNS discovery (`NsdManager` + `MulticastLock`) is active.
     * - Step C: Run the parallel `Semaphore(48)` `/24` subnet sweep on port 50000 (and custom port).
     * - Step D: Wait 1500ms and repeat from Step A indefinitely—even while the manual input
     *   dialog is visible!
     */
    private fun startContinuousReconnectionLoop(initialLaunch: Boolean) {
        livePollingJob?.cancel()
        livePollingJob = null

        // Schedule the 4-second non-blocking manual fallback overlay if not already visible
        manualFallbackTimerJob?.cancel()
        manualFallbackTimerJob = viewModelScope.launch {
            delay(MANUAL_FALLBACK_DELAY_MS)
            if (_uiState.value.status != ConnectionStatus.CONNECTED) {
                _uiState.update { prev ->
                    prev.copy(
                        showManualFallback = true,
                        manualHostInput = prev.activeHost ?: discoveryManager.getDefaultIpOrSubnetPrefix(),
                        manualPortInput = prev.activePort.toString()
                    )
                }
            }
        }

        if (!initialLaunch) {
            _uiState.update { prev ->
                if (prev.status == ConnectionStatus.CONNECTED) {
                    prev.copy(status = ConnectionStatus.RECONNECTING)
                } else {
                    prev
                }
            }
        }

        connectionLoopJob?.cancel()
        connectionLoopJob = viewModelScope.launch {
            while (isActive && _uiState.value.status != ConnectionStatus.CONNECTED) {
                val current = _uiState.value

                // Step B (early start): Ensure mDNS discovery + MulticastLock is running in parallel
                discoveryManager.ensureMdnsDiscoveryActive()

                // Step A: Instant Last-Known Server Probe (800ms timeout)
                val savedResult = discoveryManager.probeSavedServer(
                    overrideHost = current.activeHost,
                    overridePort = current.activePort
                )
                if (savedResult != null || _uiState.value.status == ConnectionStatus.CONNECTED) {
                    if (savedResult != null && _uiState.value.status != ConnectionStatus.CONNECTED) {
                        onServerConnected(savedResult.host, savedResult.port)
                    }
                    break
                }

                // Step C: Fast Parallel /24 Subnet Sweep (Semaphore(48), 500ms timeout)
                val subnetResult = discoveryManager.scanLocalSubnet()
                if (subnetResult != null || _uiState.value.status == ConnectionStatus.CONNECTED) {
                    if (subnetResult != null && _uiState.value.status != ConnectionStatus.CONNECTED) {
                        onServerConnected(subnetResult.host, subnetResult.port)
                    }
                    break
                }

                // Step D: Wait 1500ms and repeat from Step A indefinitely
                delay(RECONNECT_RETRY_DELAY_MS)
            }
        }
    }

    override fun onCleared() {
        super.onCleared()
        connectionLoopJob?.cancel()
        livePollingJob?.cancel()
        manualFallbackTimerJob?.cancel()
        discoveryManager.stopAll()
    }
}
