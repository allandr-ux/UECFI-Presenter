package org.uecfi.presenter.network

import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.Json
import java.net.DatagramPacket
import java.net.DatagramSocket
import java.net.InetAddress
import java.net.NetworkInterface
import java.net.SocketTimeoutException

@Serializable
data class DiscoveryResponsePayload(
  val type: String = "",
  val name: String = "",
  val ip: String = "",
  val wsPort: Int = PresenterWsClient.DEFAULT_WS_PORT,
  val wsUrl: String = "",
)

data class DiscoveredServer(
  val name: String,
  val host: String,
  val wsPort: Int,
  val wsUrl: String,
)

/**
 * Broadcasts a UDP discovery probe on LAN (port 4851) to find running UECFI Presenter desktops.
 */
object ServerDiscovery {
  private const val DISCOVERY_PORT = 4851
  private const val DISCOVERY_REQUEST = "UECFI_PRESENTER_DISCOVER"
  private val json = Json {
    ignoreUnknownKeys = true
    isLenient = true
  }

  suspend fun discoverServers(timeoutMs: Long = 2200L): List<DiscoveredServer> =
    withContext(Dispatchers.IO) {
      val found = linkedMapOf<String, DiscoveredServer>()
      var socket: DatagramSocket? = null
      try {
        socket = DatagramSocket().apply {
          broadcast = true
          soTimeout = 350
        }

        val probeBytes = DISCOVERY_REQUEST.toByteArray(Charsets.UTF_8)
        val targets = collectBroadcastAddresses()
        for (target in targets) {
          runCatching {
            socket.send(DatagramPacket(probeBytes, probeBytes.size, target, DISCOVERY_PORT))
          }
        }

        val deadline = System.currentTimeMillis() + timeoutMs
        val buffer = ByteArray(2048)
        while (System.currentTimeMillis() < deadline) {
          val packet = DatagramPacket(buffer, buffer.size)
          try {
            socket.receive(packet)
            val raw = String(packet.data, 0, packet.length, Charsets.UTF_8).trim()
            val parsed = runCatching {
              json.decodeFromString<DiscoveryResponsePayload>(raw)
            }.getOrNull() ?: continue

            if (parsed.type != "UECFI_PRESENTER_HERE") continue
            // Prefer the actual packet source address if valid on LAN, falling back to payload ip.
            val senderIp = packet.address?.hostAddress?.takeIf {
              it.isNotBlank() && it != "127.0.0.1"
            } ?: parsed.ip.takeIf { it.isNotBlank() } ?: continue

            val port = parsed.wsPort.takeIf { it > 0 } ?: PresenterWsClient.DEFAULT_WS_PORT
            val wsUrl = "ws://$senderIp:$port"
            found[wsUrl] = DiscoveredServer(
              name = parsed.name.ifBlank { "UECFI Presenter" },
              host = senderIp,
              wsPort = port,
              wsUrl = wsUrl,
            )
          } catch (_: SocketTimeoutException) {
            // Keep polling until deadline
          }
        }
      } catch (_: Exception) {
        // Discovery is best-effort
      } finally {
        runCatching { socket?.close() }
      }
      found.values.toList()
    }

  private fun collectBroadcastAddresses(): List<InetAddress> {
    val addresses = linkedSetOf<InetAddress>()
    runCatching { addresses.add(InetAddress.getByName("255.255.255.255")) }

    runCatching {
      val interfaces = NetworkInterface.getNetworkInterfaces() ?: return@runCatching
      while (interfaces.hasMoreElements()) {
        val iface = interfaces.nextElement()
        if (!iface.isUp || iface.isLoopback) continue
        for (ifaceAddr in iface.interfaceAddresses) {
          ifaceAddr.broadcast?.let { addresses.add(it) }
        }
      }
    }
    return addresses.toList()
  }
}
