/**
 * Desktop <-> Android Speaker Remote Chat Controller
 * Provides a floating operator chat drawer wired to `window.remoteChatApi` in webserver.js.
 */
(function () {
  let isOpen = false;
  let unreadCount = 0;
  let pulseListenersAttached = false;

  function ensurePulseStyles() {
    if (typeof document === "undefined" || document.getElementById("desktopChatPulseStyle")) return;
    const style = document.createElement("style");
    style.id = "desktopChatPulseStyle";
    style.textContent =
      "@keyframes desktopChatPulseGlow {" +
      "  0%, 100% { box-shadow: 0 0 0 2px rgba(34,211,238,0.45), 0 18px 40px rgba(2,6,23,0.35); }" +
      "  50% { box-shadow: 0 0 0 5px rgba(34,211,238,0.95), 0 18px 44px rgba(6,182,212,0.45); }" +
      "}" +
      "#desktopChatDrawer.chat-pulse-active {" +
      "  animation: desktopChatPulseGlow 1.25s ease-in-out infinite;" +
      "}";
    (document.head || document.documentElement).appendChild(style);
  }

  function stopDrawerPulse() {
    const drawer = document.getElementById("desktopChatDrawer");
    const header = drawer ? drawer.firstElementChild : null;
    const pill = document.getElementById("desktopChatNewPill");
    if (drawer) drawer.classList.remove("chat-pulse-active");
    if (header) header.style.backgroundColor = "";
    if (pill) pill.style.display = "none";
  }

  function startDrawerPulse() {
    const drawer = document.getElementById("desktopChatDrawer");
    const header = drawer ? drawer.firstElementChild : null;
    const pill = document.getElementById("desktopChatNewPill");
    if (!drawer) return;

    ensurePulseStyles();
    if (!pulseListenersAttached) {
      pulseListenersAttached = true;
      drawer.addEventListener("pointerdown", stopDrawerPulse);
      drawer.addEventListener("focusin", stopDrawerPulse);
    }

    drawer.classList.add("chat-pulse-active");
    if (header) {
      header.style.transition = "background-color 0.25s ease";
      header.style.backgroundColor = "#0e7490";
    }
    if (pill) pill.style.display = "inline-block";
  }

  function formatTime(ts) {
    try {
      const d = new Date(ts);
      return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    } catch (e) {
      return "";
    }
  }

  function escapeHtml(str) {
    return String(str || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function updateBadge() {
    const badge = document.getElementById("chatUnreadBadge");
    if (!badge) return;
    if (unreadCount > 0) {
      badge.textContent = unreadCount > 99 ? "99+" : String(unreadCount);
      badge.classList.remove("hidden");
    } else {
      badge.classList.add("hidden");
    }
  }

  function renderMessages() {
    const listEl = document.getElementById("desktopChatMessages");
    if (!listEl) return;

    const api = window.remoteChatApi;
    const messages = (api && typeof api.getMessages === "function") ? api.getMessages(0).messages : [];

    if (!messages || messages.length === 0) {
      listEl.innerHTML =
        '<div class="h-full flex flex-col items-center justify-center text-center text-slate-400 px-4 py-8">' +
        '<i class="fa-regular fa-comments text-2xl mb-2 text-slate-300"></i>' +
        '<p class="text-xs font-medium text-slate-500">No messages yet</p>' +
        '<p class="text-[11px] text-slate-400 mt-0.5">Send a quick note to the Android speaker remote.</p>' +
        "</div>";
      return;
    }

    listEl.innerHTML = messages
      .map((m) => {
        const isDesktop = m.sender === "desktop";
        const wrapperStyle =
          "display:flex; flex-direction:column; margin-bottom:10px; align-items:" +
          (isDesktop ? "flex-end;" : "flex-start;");
        const bubbleStyle = isDesktop
          ? "max-width:85%; width:fit-content; padding:8px 12px; font-size:12px; line-height:1.45; word-break:break-word; background:#2563eb; color:#ffffff; border-radius:16px 16px 4px 16px; box-shadow:0 1px 2px rgba(15,23,42,0.08);"
          : "max-width:85%; width:fit-content; padding:8px 12px; font-size:12px; line-height:1.45; word-break:break-word; background:#f1f5f9; color:#1e293b; border:1px solid #e2e8f0; border-radius:16px 16px 16px 4px; box-shadow:0 1px 2px rgba(15,23,42,0.05);";
        const metaStyle =
          "font-size:10px; margin-top:2px; padding:0 4px; color:#94a3b8; text-align:" +
          (isDesktop ? "right;" : "left;");
        return (
          '<div style="' + wrapperStyle + '">' +
          '<div style="' + bubbleStyle + '">' +
          escapeHtml(m.text) +
          "</div>" +
          '<span style="' + metaStyle + '">' +
          escapeHtml(m.senderName || (isDesktop ? "Operator" : "Speaker")) +
          " • " +
          escapeHtml(formatTime(m.timestamp)) +
          "</span>" +
          "</div>"
        );
      })
      .join("");

    listEl.scrollTop = listEl.scrollHeight;
  }

  function toggle(forceOpen) {
    const drawer = document.getElementById("desktopChatDrawer");
    if (!drawer) return;
    isOpen = typeof forceOpen === "boolean" ? forceOpen : !isOpen;
    if (isOpen) {
      drawer.style.display = "flex";
      unreadCount = 0;
      updateBadge();
      dismissToast();
      renderMessages();
      const input = document.getElementById("desktopChatInput");
      if (input) setTimeout(() => input.focus(), 40);
    } else {
      drawer.style.display = "none";
    }
  }

  function send(explicitText) {
    const input = document.getElementById("desktopChatInput");
    const text = (typeof explicitText === "string" ? explicitText : (input ? input.value : "")).trim();
    if (!text) return;
    if (!explicitText && input) input.value = "";
    if (window.remoteChatApi && typeof window.remoteChatApi.addMessage === "function") {
      window.remoteChatApi.addMessage({
        sender: "desktop",
        senderName: "Operator",
        text: text
      });
    }
  }

  function clear() {
    if (window.remoteChatApi && typeof window.remoteChatApi.clearMessages === "function") {
      window.remoteChatApi.clearMessages();
    }
  }

  function dismissToast() {
    const existing = document.getElementById("desktopChatToast");
    if (existing) existing.remove();
  }

  function showConsolidatedToast(msg) {
    if (typeof document === "undefined" || !document.body) return;
    let toast = document.getElementById("desktopChatToast");
    if (!toast) {
      toast = document.createElement("div");
      toast.id = "desktopChatToast";
      toast.style.cssText =
        "position:fixed;left:16px;bottom:16px;z-index:9998;width:320px;max-width:calc(100vw - 32px);" +
        "background:#0f172a;color:#f8fafc;border:1px solid rgba(34,211,238,0.45);border-radius:14px;" +
        "box-shadow:0 12px 32px rgba(2,6,23,0.4);padding:12px 14px;cursor:pointer;" +
        "font-family:Inter,Arial,sans-serif;transition:opacity 0.2s ease, transform 0.2s ease;";
      toast.onclick = function (e) {
        if (e && e.target && e.target.closest && e.target.closest("[data-chat-toast-close]")) return;
        toggle(true);
      };
      document.body.appendChild(toast);
    }

    const sender = escapeHtml((msg && msg.senderName) || "Speaker");
    const countLabel = unreadCount > 1 ? unreadCount + " new messages from " + sender : "New message from " + sender;
    const preview = escapeHtml((msg && msg.text) || "");

    toast.innerHTML =
      '<div style="display:flex;align-items:flex-start;gap:10px;">' +
      '<div style="width:32px;height:32px;flex:none;border-radius:10px;background:rgba(6,182,212,0.18);border:1px solid rgba(34,211,238,0.4);display:flex;align-items:center;justify-content:center;color:#22d3ee;font-size:14px;">' +
      '<i class="fa-solid fa-comments"></i>' +
      "</div>" +
      '<div style="min-width:0;flex:1;">' +
      '<div style="display:flex;align-items:center;justify-content:space-between;gap:8px;">' +
      '<span style="font-size:12px;font-weight:700;color:#22d3ee;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">' + countLabel + "</span>" +
      '<button type="button" data-chat-toast-close="1" title="Dismiss" style="background:none;border:0;color:#94a3b8;cursor:pointer;padding:2px 4px;line-height:1;font-size:12px;">' +
      '<i class="fa-solid fa-xmark"></i>' +
      "</button>" +
      "</div>" +
      '<div style="font-size:12px;color:#e2e8f0;margin-top:3px;line-height:1.35;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;word-break:break-word;">' +
      preview +
      "</div>" +
      "</div>" +
      "</div>";

    const closeBtn = toast.querySelector("[data-chat-toast-close]");
    if (closeBtn) {
      closeBtn.onclick = function (e) {
        if (e) e.stopPropagation();
        dismissToast();
      };
    }
  }

  function onMessageReceived(msg) {
    renderMessages();
    if (msg && msg.sender === "remote") {
      if (!isOpen) {
        unreadCount++;
        updateBadge();
        showConsolidatedToast(msg);
      } else {
        startDrawerPulse();
      }
    }
  }

  function onCleared() {
    unreadCount = 0;
    updateBadge();
    dismissToast();
    stopDrawerPulse();
    renderMessages();
  }

  window.desktopChat = {
    toggle,
    send,
    clear,
    dismissToast,
    onMessageReceived,
    onCleared,
    renderMessages
  };
})();
