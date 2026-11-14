package com.example

import android.content.Context
import android.net.ConnectivityManager
import android.net.nsd.NsdManager
import android.net.nsd.NsdServiceInfo
import android.net.wifi.WifiManager
import android.os.Build
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.channels.BufferOverflow
import kotlinx.coroutines.channels.Channel
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.SharedFlow
import kotlinx.coroutines.flow.asSharedFlow
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch
import kotlinx.coroutines.supervisorScope
import kotlinx.coroutines.suspendCancellableCoroutine
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.Semaphore
import kotlinx.coroutines.sync.withLock
import kotlinx.coroutines.sync.withPermit
import kotlinx.coroutines.withContext
import kotlinx.coroutines.withTimeoutOrNull
import java.net.Inet4Address
import java.net.InetAddress
import java.net.NetworkInterface
import java.nio.charset.StandardCharsets
import java.util.Collections
import java.util.concurrent.atomic.AtomicBoolean
import kotlin.coroutines.resume
import kotlin.math.abs

/**
 * Manages all server discovery strategies for UECFI Presenter on the local network:
 * 1. Instant Last-Known Host Probe (`SharedPreferences` + 800ms `/api/state` check)
 * 2. mDNS / NSD Auto-Discovery (`_uecfi-presenter._tcp.` with `WifiManager.MulticastLock`,
 *    Mutex-guarded `resolveService`, IPv4 preference, and TXT `"presenter"` port extraction)
 * 3. Fast Parallel `/24` HTTP Subnet Scanner (`Semaphore(48)`, 500ms timeout on `/api/state`)
 *    when routers or firewalls block UDP 5353 mDNS packets.
 */
class MdnsDiscoveryManager(
    context: Context,
    private val apiClient: PresenterApiClient
) {
    private val appContext = context.applicationContext
    private val prefs = appContext.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
    private val nsdManager: NsdManager? =
        appContext.getSystemService(Context.NSD_SERVICE) as? NsdManager
    private val wifiManager: WifiManager? =
        appContext.getSystemService(Context.WIFI_SERVICE) as? WifiManager
    private val connectivityManager: ConnectivityManager? =
        appContext.getSystemService(Context.CONNECTIVITY_SERVICE) as? ConnectivityManager

    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)

    private var multicastLock: WifiManager.MulticastLock? = null
    private var discoveryListener: NsdManager.DiscoveryListener? = null
    private val isNsdDiscovering = AtomicBoolean(false)

    // Mutex and channel to serialize NsdManager.resolveService() calls (prevents FAILURE_ALREADY_ACTIVE)
    private val resolveMutex = Mutex()
    private val resolveChannel = Channel<NsdServiceInfo>(Channel.UNLIMITED)
    private var resolveWorkerJob: Job? = null

    private val _discoveredEndpoints = MutableSharedFlow<ServerEndpoint>(
        replay = 1,
        extraBufferCapacity = 8,
        onBufferOverflow = BufferOverflow.DROP_OLDEST
    )
    val discoveredEndpoints: SharedFlow<ServerEndpoint> = _discoveredEndpoints.asSharedFlow()

    companion object {
        private const val PREFS_NAME = "uecfi_presenter_prefs"
        private const val KEY_LAST_HOST = "last_host"
        private const val KEY_LAST_PORT = "last_port"

        const val SERVICE_TYPE = "_uecfi-presenter._tcp."
        const val SERVICE_TYPE_MATCH = "_uecfi-presenter._tcp"
        const val SERVICE_NAME_KEYWORD = "UECFI Presenter"
        const val SUBNET_SCAN_CONCURRENCY = 48
    }

    fun getSavedHost(): String? =
        prefs.getString(KEY_LAST_HOST, null)?.trim()?.takeIf { it.isNotEmpty() }

    fun getSavedPort(): Int =
        prefs.getInt(KEY_LAST_PORT, PresenterApiClient.DEFAULT_PRESENTER_PORT)
            .takeIf { it in 1..65535 } ?: PresenterApiClient.DEFAULT_PRESENTER_PORT

    fun saveLastWorkingServer(host: String, port: Int) {
        val cleanHost = host.trim()
        if (cleanHost.isEmpty() || port !in 1..65535) return
        prefs.edit()
            .putString(KEY_LAST_HOST, cleanHost)
            .putInt(KEY_LAST_PORT, port)
            .apply()
    }

    /**
     * Returns the saved IP address if available, or detects the device's local Wi-Fi IPv4
     * `/24` subnet prefix (e.g. `"192.168.1."`) to pre-fill the manual IP input field.
     */
    fun getDefaultIpOrSubnetPrefix(): String {
        getSavedHost()?.let { return it }
        val localIp = detectLocalIpv4Addresses().firstOrNull()
        if (localIp != null) {
            val lastDot = localIp.lastIndexOf('.')
            if (lastDot > 0) {
                return localIp.substring(0, lastDot + 1)
            }
        }
        return "192.168.1."
    }

    /**
     * Detects all active non-loopback local IPv4 addresses on the device by inspecting
     * both `ConnectivityManager.getLinkProperties(activeNetwork)` and `NetworkInterface.getNetworkInterfaces()`.
     */
    fun detectLocalIpv4Addresses(): List<String> {
        val result = linkedSetOf<String>()

        // 1. Inspect ConnectivityManager active network linkAddresses
        try {
            val cm = connectivityManager
            val activeNet = cm?.activeNetwork
            val linkProps = if (activeNet != null) cm.getLinkProperties(activeNet) else null
            linkProps?.linkAddresses?.forEach { linkAddr ->
                val addr = linkAddr.address
                if (addr is Inet4Address && !addr.isLoopbackAddress) {
                    val ip = addr.hostAddress
                    if (!ip.isNullOrBlank() && isPrivateOrLanIpv4(ip)) {
                        result.add(ip)
                    }
                }
            }
        } catch (_: Exception) {
        }

        // 2. Fallback / supplement via NetworkInterface enumeration
        try {
            val interfaces = Collections.list(NetworkInterface.getNetworkInterfaces())
            for (intf in interfaces) {
                if (!intf.isUp || intf.isLoopback) continue
                val addresses = Collections.list(intf.inetAddresses)
                for (addr in addresses) {
                    if (addr is Inet4Address && !addr.isLoopbackAddress) {
                        val ip = addr.hostAddress ?: continue
                        if (isPrivateOrLanIpv4(ip)) {
                            result.add(ip)
                        }
                    }
                }
            }
        } catch (_: Exception) {
        }

        return result.toList()
    }

    private fun isPrivateOrLanIpv4(ip: String): Boolean {
        return ip.startsWith("192.168.") ||
            ip.startsWith("10.") ||
            ip.startsWith("172.") ||
            !ip.startsWith("169.254.")
    }

    /**
     * Step A of Continuous Reconnection:
     * Immediately probes the saved `lastHost:lastPort` (and optional current host/port)
     * with an 800ms timeout.
     */
    suspend fun probeSavedServer(
        overrideHost: String? = null,
        overridePort: Int? = null
    ): ServerEndpoint? = withContext(Dispatchers.IO) {
        val candidates = linkedSetOf<Pair<String, Int>>()
        if (!overrideHost.isNullOrBlank() && overridePort != null && overridePort in 1..65535) {
            candidates.add(overrideHost.trim() to overridePort)
        }
        val savedHost = getSavedHost()
        val savedPort = getSavedPort()
        if (!savedHost.isNullOrBlank()) {
            candidates.add(savedHost to savedPort)
            if (savedPort != PresenterApiClient.DEFAULT_PRESENTER_PORT) {
                candidates.add(savedHost to PresenterApiClient.DEFAULT_PRESENTER_PORT)
            }
        }

        for ((host, port) in candidates) {
            if (apiClient.probeServer(host, port, timeoutMs = 800L)) {
                saveLastWorkingServer(host, port)
                val endpoint = ServerEndpoint(host, port, source = "saved")
                _discoveredEndpoints.tryEmit(endpoint)
                return@withContext endpoint
            }
        }
        null
    }

    /**
     * Step B of Continuous Reconnection:
     * Ensures `WifiManager.MulticastLock` is held and `NsdManager` discovery for
     * `_uecfi-presenter._tcp.` is actively running.
     */
    fun ensureMdnsDiscoveryActive() {
        acquireMulticastLock()
        startResolveWorkerIfNeeded()
        if (!isNsdDiscovering.get()) {
            startNsdDiscovery()
        }
    }

    /**
     * Restarts mDNS discovery cleanly (e.g. when user taps Retry Auto-Detect).
     */
    fun restartMdnsDiscovery() {
        stopNsdDiscoveryOnly()
        acquireMulticastLock()
        startResolveWorkerIfNeeded()
        startNsdDiscovery()
    }

    /**
     * Step C of Continuous Reconnection:
     * Fast parallel HTTP `/24` subnet sweep using `Semaphore(48)` and 500ms timeout per host.
     * Scans `.1` through `.254` on port `50000` (and any saved custom port).
     * Cancels remaining probe coroutines immediately as soon as the first valid UECFI Presenter
     * server responds on `GET /api/state`.
     */
    suspend fun scanLocalSubnet(): ServerEndpoint? = withContext(Dispatchers.IO) {
        val localIps = detectLocalIpv4Addresses()
        val savedHost = getSavedHost()

        // Collect unique /24 prefixes (e.g., "192.168.1.")
        val prefixes = linkedSetOf<String>()
        for (ip in localIps) {
            val lastDot = ip.lastIndexOf('.')
            if (lastDot > 0) {
                prefixes.add(ip.substring(0, lastDot + 1))
            }
        }
        if (prefixes.isEmpty() && !savedHost.isNullOrBlank()) {
            val lastDot = savedHost.lastIndexOf('.')
            if (lastDot > 0) {
                prefixes.add(savedHost.substring(0, lastDot + 1))
            }
        }
        if (prefixes.isEmpty()) {
            prefixes.add("192.168.1.")
        }

        // Ports to probe on each IP (always 50000, plus custom saved port if different)
        val portsToScan = linkedSetOf(PresenterApiClient.DEFAULT_PRESENTER_PORT)
        val savedPort = getSavedPort()
        if (savedPort != PresenterApiClient.DEFAULT_PRESENTER_PORT &&
            savedPort != PresenterApiClient.DEFAULT_AUDIENCE_PORT
        ) {
            portsToScan.add(savedPort)
        }

        val selfIpSet = localIps.toSet()
        val ownLastOctet = localIps.firstOrNull()?.substringAfterLast('.')?.toIntOrNull() ?: 100
        val savedLastOctet = savedHost?.substringAfterLast('.')?.toIntOrNull()

        // Order octets 1..254 so the most likely IPs (saved octet, near phone's octet, common DHCP ranges)
        // are probed first while still covering all 1..254
        val orderedOctets = (1..254).sortedWith(
            compareBy<Int> { octet ->
                when {
                    savedLastOctet != null && octet == savedLastOctet -> 0
                    abs(octet - ownLastOctet) <= 15 -> 1 + abs(octet - ownLastOctet)
                    octet in 100..160 -> 20
                    octet in 2..99 -> 30
                    octet in 161..254 -> 40
                    else -> 50
                }
            }
        )

        val semaphore = Semaphore(SUBNET_SCAN_CONCURRENCY)
        val foundDeferred = CompletableDeferred<ServerEndpoint?>()

        supervisorScope {
            val scanParentJob = launch {
                for (prefix in prefixes) {
                    for (port in portsToScan) {
                        for (octet in orderedOctets) {
                            if (!isActive || foundDeferred.isCompleted) break
                            val candidateIp = "$prefix$octet"
                            if (candidateIp in selfIpSet) continue

                            launch {
                                semaphore.withPermit {
                                    if (!isActive || foundDeferred.isCompleted) return@withPermit
                                    if (apiClient.probeSubnetHost(candidateIp, port)) {
                                        val endpoint = ServerEndpoint(
                                            host = candidateIp,
                                            port = port,
                                            source = "subnet"
                                        )
                                        if (foundDeferred.complete(endpoint)) {
                                            saveLastWorkingServer(candidateIp, port)
                                            _discoveredEndpoints.tryEmit(endpoint)
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            }

            // If all child probe jobs finish without finding a server, complete with null
            scanParentJob.invokeOnCompletion {
                if (!foundDeferred.isCompleted) {
                    foundDeferred.complete(null)
                }
            }

            val winner = foundDeferred.await()
            // Cancel any remaining in-flight probe jobs immediately once a server is found
            scanParentJob.cancel()
            winner
        }
    }

    private fun startResolveWorkerIfNeeded() {
        if (resolveWorkerJob?.isActive == true) return
        resolveWorkerJob = scope.launch {
            for (serviceInfo in resolveChannel) {
                if (!isActive) break
                val resolved = resolveMutex.withLock {
                    resolveServiceWithRetry(serviceInfo)
                } ?: continue

                val candidate = extractPresenterEndpoint(resolved) ?: continue
                if (apiClient.probeServer(candidate.host, candidate.port, timeoutMs = 800L)) {
                    saveLastWorkingServer(candidate.host, candidate.port)
                    _discoveredEndpoints.tryEmit(candidate)
                }
            }
        }
    }

    private fun startNsdDiscovery() {
        val manager = nsdManager ?: return
        if (!isNsdDiscovering.compareAndSet(false, true)) return

        val listener = object : NsdManager.DiscoveryListener {
            override fun onDiscoveryStarted(regType: String?) {}

            override fun onServiceFound(service: NsdServiceInfo?) {
                if (service == null) return
                val name = service.serviceName ?: ""
                val type = service.serviceType ?: ""
                val matchesType = type.contains(SERVICE_TYPE_MATCH, ignoreCase = true)
                val matchesName = name.contains(SERVICE_NAME_KEYWORD, ignoreCase = true)
                if (matchesType || matchesName) {
                    resolveChannel.trySend(service)
                }
            }

            override fun onServiceLost(service: NsdServiceInfo?) {}

            override fun onDiscoveryStopped(serviceType: String?) {
                isNsdDiscovering.set(false)
            }

            override fun onStartDiscoveryFailed(serviceType: String?, errorCode: Int) {
                isNsdDiscovering.set(false)
            }

            override fun onStopDiscoveryFailed(serviceType: String?, errorCode: Int) {
                isNsdDiscovering.set(false)
            }
        }

        discoveryListener = listener
        try {
            manager.discoverServices(SERVICE_TYPE, NsdManager.PROTOCOL_DNS_SD, listener)
        } catch (_: Exception) {
            isNsdDiscovering.set(false)
        }
    }

    @Suppress("DEPRECATION")
    private suspend fun resolveServiceWithRetry(serviceInfo: NsdServiceInfo): NsdServiceInfo? {
        val manager = nsdManager ?: return null
        repeat(4) { attempt ->
            var failedAlreadyActive = false
            val resolved = withTimeoutOrNull(2500L) {
                suspendCancellableCoroutine<NsdServiceInfo?> { cont ->
                    val resumed = AtomicBoolean(false)
                    val resolveListener = object : NsdManager.ResolveListener {
                        override fun onResolveFailed(service: NsdServiceInfo?, errorCode: Int) {
                            if (errorCode == NsdManager.FAILURE_ALREADY_ACTIVE) {
                                failedAlreadyActive = true
                            }
                            if (resumed.compareAndSet(false, true)) {
                                cont.resume(null)
                            }
                        }

                        override fun onServiceResolved(resolvedInfo: NsdServiceInfo?) {
                            if (resumed.compareAndSet(false, true)) {
                                cont.resume(resolvedInfo)
                            }
                        }
                    }
                    try {
                        manager.resolveService(serviceInfo, resolveListener)
                    } catch (_: Exception) {
                        if (resumed.compareAndSet(false, true)) {
                            cont.resume(null)
                        }
                    }
                }
            }
            if (resolved != null) return resolved
            delay(if (failedAlreadyActive) 200L * (attempt + 1) else 150L)
        }
        return null
    }

    /**
     * Extracts the IPv4 host address and `presenter` port from the resolved `NsdServiceInfo`:
     * - Prefers IPv4 (`Inet4Address`) when resolving the host address.
     * - Reads the `presenter` port from the TXT record (`serviceInfo.attributes["presenter"]`),
     *   falling back to `serviceInfo.port` (if not the audience port) or `50000`.
     */
    @Suppress("DEPRECATION")
    fun extractPresenterEndpoint(resolvedInfo: NsdServiceInfo): ServerEndpoint? {
        val preferredInetAddress: InetAddress? = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE) {
            val addresses = resolvedInfo.hostAddresses
            addresses.firstOrNull { it is Inet4Address } ?: addresses.firstOrNull()
        } else {
            resolvedInfo.host
        }

        val rawHost = preferredInetAddress?.hostAddress ?: return null
        val cleanHost = rawHost.substringBefore('%').trim()
        if (cleanHost.isEmpty()) return null

        val attributes = resolvedInfo.attributes ?: emptyMap()
        val txtMap = mutableMapOf<String, String>()
        for ((key, bytes) in attributes) {
            if (key != null && bytes != null) {
                txtMap[key.lowercase()] = String(bytes, StandardCharsets.UTF_8).trim()
            }
        }

        val appAttr = txtMap["app"]
        if (appAttr != null && !appAttr.contains("UECFI Presenter", ignoreCase = true)) {
            return null
        }

        val audiencePort = txtMap["audience"]?.toIntOrNull() ?: PresenterApiClient.DEFAULT_AUDIENCE_PORT
        val presenterPortFromTxt = txtMap["presenter"]?.toIntOrNull()
        val resolvedSrvPort = resolvedInfo.port

        val finalPresenterPort = when {
            presenterPortFromTxt != null && presenterPortFromTxt in 1..65535 -> presenterPortFromTxt
            resolvedSrvPort in 1..65535 && resolvedSrvPort != audiencePort -> resolvedSrvPort
            else -> PresenterApiClient.DEFAULT_PRESENTER_PORT
        }

        return ServerEndpoint(
            host = cleanHost,
            port = finalPresenterPort,
            source = "mdns"
        )
    }

    private fun acquireMulticastLock() {
        try {
            if (multicastLock == null) {
                multicastLock = wifiManager?.createMulticastLock("uecfi_mdns_lock")?.apply {
                    setReferenceCounted(false)
                }
            }
            if (multicastLock?.isHeld == false) {
                multicastLock?.acquire()
            }
        } catch (_: Exception) {
        }
    }

    private fun releaseMulticastLock() {
        try {
            if (multicastLock?.isHeld == true) {
                multicastLock?.release()
            }
        } catch (_: Exception) {
        }
    }

    private fun stopNsdDiscoveryOnly() {
        val manager = nsdManager
        val listener = discoveryListener
        if (manager != null && listener != null && isNsdDiscovering.compareAndSet(true, false)) {
            try {
                manager.stopServiceDiscovery(listener)
            } catch (_: Exception) {
            }
        }
        discoveryListener = null
    }

    fun stopAll() {
        stopNsdDiscoveryOnly()
        resolveWorkerJob?.cancel()
        resolveWorkerJob = null
        releaseMulticastLock()
    }
}
