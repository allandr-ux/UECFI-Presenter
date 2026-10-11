/**
 * Network Utilities for UECFI Presenter
 * 
 * Resolves local IP addresses using Electron preload bridge or Node.js 'os' module.
 */
function getLocalIP() {
  const ipList = [];
  try {
    if (window.electronBridge && typeof window.electronBridge.getNetworkInterfaces === "function") {
      const ifaces = window.electronBridge.getNetworkInterfaces();
      for (const name in ifaces) {
        const details = ifaces[name];
        for (let i = 0; i < details.length; i++) {
          const iface = details[i];
          if (iface.family === "IPv4" && !iface.internal) {
            ipList.push(iface.address);
          }
        }
      }
      if (ipList.length > 0) return ipList;
    }
  } catch (err) {
    console.warn("[NETWORK] Could not query network interfaces:", err);
  }
  return ["127.0.0.1"];
}

// Backward-compatible alias used by config.js
function remoteVV_IPList() {
  return getLocalIP();
}