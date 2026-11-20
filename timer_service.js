/**
 * UECFI Presenter — Service & Sermon Timers Engine
 * 
 * Provides:
 * 1. Pre-Service Countdown Timer:
 *    - Count down to service start (e.g. 5:00 min, 10:00 min, or target clock time)
 *    - Optional full-screen or banner overlay on the Main Centro Projector
 *    - Automatic post-countdown greeting ("Welcome to UECFI! Service has begun.")
 * 
 * 2. Sermon & Preacher Stage Timer:
 *    - Preaching duration countdown (e.g. 35 mins) or count-up stopwatch
 *    - Displayed prominently on the Confidence Monitor / Speaker Remote (pulpit tablet)
 *    - Real-time color alerts: Green (> 5 min), Amber (2–5 min), Red (< 2 min)
 *    - Overtime tracking with pulsing red clock (+01:23)
 *    - Quick adjustments (+1 min, +5 min) from sound booth or pulpit
 * 
 * Multi-environment safe: operates in Electron, Node, and Web (cPanel/NGINX/Apache)
 */

class TimerManager {
  constructor() {
    this.serviceCountdown = {
      active: false,
      paused: false,
      totalSeconds: 300,
      remainingSeconds: 300,
      targetTimestamp: 0,
      title: "Service Begins In",
      subMessage: "Union Espiritista Cristiana de Filipinas, Inc.",
      showOnProjection: true,
      showOnStage: true
    };

    this.sermonTimer = {
      active: false,
      paused: false,
      totalSeconds: 2100, // 35 minutes default
      remainingSeconds: 2100,
      elapsedSeconds: 0,
      targetTimestamp: 0,
      warningSeconds: 300, // 5 min warning
      dangerSeconds: 120,  // 2 min warning
      isOvertime: false,
      title: "Preaching & Sermon Time",
      showOnStage: true,
      showOnProjection: false
    };

    this.timerInterval = null;
    this.init();
  }

  init() {
    // Load persisted timer config if available
    try {
      const stored = localStorage.getItem("uecfi_timer_state");
      if (stored) {
        const parsed = JSON.parse(stored);
        if (parsed.serviceCountdown) {
          this.serviceCountdown.title = parsed.serviceCountdown.title || this.serviceCountdown.title;
          let sub = parsed.serviceCountdown.subMessage || this.serviceCountdown.subMessage;
          if (!sub || /United Evangelical/i.test(sub)) {
            sub = "Union Espiritista Cristiana de Filipinas, Inc.";
          }
          this.serviceCountdown.subMessage = sub;
          this.serviceCountdown.totalSeconds = parsed.serviceCountdown.totalSeconds || 300;
          this.serviceCountdown.remainingSeconds = this.serviceCountdown.totalSeconds;
          this.serviceCountdown.showOnProjection = parsed.serviceCountdown.showOnProjection !== false;
          this.serviceCountdown.showOnStage = parsed.serviceCountdown.showOnStage !== false;
        }
        if (parsed.sermonTimer) {
          this.sermonTimer.totalSeconds = parsed.sermonTimer.totalSeconds || 2100;
          this.sermonTimer.remainingSeconds = this.sermonTimer.totalSeconds;
          this.sermonTimer.showOnStage = parsed.sermonTimer.showOnStage !== false;
        }
      }
    } catch (e) {
      console.warn("[TIMER] Error loading timer state:", e);
    }

    if (!this.serviceCountdown.subMessage || /United Evangelical/i.test(this.serviceCountdown.subMessage)) {
      this.serviceCountdown.subMessage = "Union Espiritista Cristiana de Filipinas, Inc.";
    }
    this.syncState();

    // Start background tick loop
    this.timerInterval = setInterval(() => {
      this.tick();
    }, 500);

    // Cross-window sync listener
    if (typeof window !== "undefined") {
      window.addEventListener("storage", (e) => {
        if (e.key === "uecfi_timer_cmd" && e.newValue) {
          try {
            const cmd = JSON.parse(e.newValue);
            this.handleRemoteCommand(cmd);
          } catch(err) {}
        }
      });
    }
  }

  // --- SERVICE COUNTDOWN METHODS ---
  startServiceCountdown(minutesOrSeconds, title, showOnProjection, showOnStage) {
    const sec = (typeof minutesOrSeconds === "number" && minutesOrSeconds < 60)
      ? Math.round(minutesOrSeconds * 60)
      : (typeof minutesOrSeconds === "number" ? minutesOrSeconds : this.serviceCountdown.totalSeconds);

    this.serviceCountdown.totalSeconds = sec;
    this.serviceCountdown.remainingSeconds = sec;
    this.serviceCountdown.targetTimestamp = Date.now() + (sec * 1000);
    this.serviceCountdown.active = true;
    this.serviceCountdown.paused = false;

    if (title) this.serviceCountdown.title = title;
    if (typeof showOnProjection === "boolean") this.serviceCountdown.showOnProjection = showOnProjection;
    if (typeof showOnStage === "boolean") this.serviceCountdown.showOnStage = showOnStage;

    this.syncState();
    this.updateModalUI();
    this.updateToolbarBadge();
  }

  pauseServiceCountdown() {
    if (!this.serviceCountdown.active) return;
    this.serviceCountdown.paused = !this.serviceCountdown.paused;
    if (!this.serviceCountdown.paused) {
      this.serviceCountdown.targetTimestamp = Date.now() + (this.serviceCountdown.remainingSeconds * 1000);
    }
    this.syncState();
    this.updateModalUI();
    this.updateToolbarBadge();
  }

  resetServiceCountdown() {
    this.serviceCountdown.remainingSeconds = this.serviceCountdown.totalSeconds;
    this.serviceCountdown.targetTimestamp = Date.now() + (this.serviceCountdown.totalSeconds * 1000);
    this.serviceCountdown.paused = true;
    this.syncState();
    this.updateModalUI();
    this.updateToolbarBadge();
  }

  stopServiceCountdown() {
    this.serviceCountdown.active = false;
    this.serviceCountdown.paused = false;
    this.syncState();
    this.updateModalUI();
    this.updateToolbarBadge();
  }

  // --- SERMON PREACHER TIMER METHODS ---
  startSermonTimer(minutes, showOnStage) {
    const sec = (typeof minutes === "number") ? Math.round(minutes * 60) : this.sermonTimer.totalSeconds;
    this.sermonTimer.totalSeconds = sec;
    this.sermonTimer.remainingSeconds = sec;
    this.sermonTimer.elapsedSeconds = 0;
    this.sermonTimer.targetTimestamp = Date.now() + (sec * 1000);
    this.sermonTimer.active = true;
    this.sermonTimer.paused = false;
    this.sermonTimer.isOvertime = false;

    if (typeof showOnStage === "boolean") this.sermonTimer.showOnStage = showOnStage;

    this.syncState();
    this.updateModalUI();
    this.updateToolbarBadge();
  }

  pauseSermonTimer() {
    if (!this.sermonTimer.active) return;
    this.sermonTimer.paused = !this.sermonTimer.paused;
    if (!this.sermonTimer.paused) {
      this.sermonTimer.targetTimestamp = Date.now() + (this.sermonTimer.remainingSeconds * 1000);
    }
    this.syncState();
    this.updateModalUI();
    this.updateToolbarBadge();
  }

  adjustSermonTimer(deltaSeconds) {
    if (!this.sermonTimer.active) {
      // If inactive, adjust baseline duration
      this.sermonTimer.totalSeconds = Math.max(60, this.sermonTimer.totalSeconds + deltaSeconds);
      this.sermonTimer.remainingSeconds = this.sermonTimer.totalSeconds;
    } else {
      this.sermonTimer.remainingSeconds += deltaSeconds;
      this.sermonTimer.targetTimestamp += (deltaSeconds * 1000);
      if (this.sermonTimer.remainingSeconds > 0) {
        this.sermonTimer.isOvertime = false;
      }
    }
    this.syncState();
    this.updateModalUI();
    this.updateToolbarBadge();
  }

  resetSermonTimer() {
    this.sermonTimer.remainingSeconds = this.sermonTimer.totalSeconds;
    this.sermonTimer.elapsedSeconds = 0;
    this.sermonTimer.targetTimestamp = Date.now() + (this.sermonTimer.totalSeconds * 1000);
    this.sermonTimer.isOvertime = false;
    this.sermonTimer.paused = true;
    this.syncState();
    this.updateModalUI();
    this.updateToolbarBadge();
  }

  stopSermonTimer() {
    this.sermonTimer.active = false;
    this.sermonTimer.paused = false;
    this.sermonTimer.isOvertime = false;
    this.syncState();
    this.updateModalUI();
    this.updateToolbarBadge();
  }

  // --- TICK LOOP & SYNC ---
  tick() {
    const now = Date.now();
    let stateChanged = false;

    // 1. Tick Service Countdown
    if (this.serviceCountdown.active && !this.serviceCountdown.paused) {
      const diff = Math.round((this.serviceCountdown.targetTimestamp - now) / 1000);
      if (diff !== this.serviceCountdown.remainingSeconds) {
        this.serviceCountdown.remainingSeconds = Math.max(0, diff);
        stateChanged = true;
      }
    }

    // 2. Tick Sermon Timer
    if (this.sermonTimer.active && !this.sermonTimer.paused) {
      const diff = Math.round((this.sermonTimer.targetTimestamp - now) / 1000);
      if (diff <= 0) {
        this.sermonTimer.isOvertime = true;
        this.sermonTimer.remainingSeconds = diff; // negative indicates overtime
      } else {
        this.sermonTimer.isOvertime = false;
        this.sermonTimer.remainingSeconds = diff;
      }
      this.sermonTimer.elapsedSeconds = this.sermonTimer.totalSeconds - diff;
      stateChanged = true;
    }

    if (stateChanged) {
      this.syncState();
      this.updateModalUI();
      this.updateToolbarBadge();
    }
  }

  syncState() {
    const state = this.getState();
    if (typeof window !== "undefined") {
      window.p_timer_state = state;
      try {
        localStorage.setItem("uecfi_timer_state", JSON.stringify(state));
      } catch(e) {}

      // Refresh projector and preview if projection countdown changed
      if (this.serviceCountdown.showOnProjection && typeof refreshProjectorEngine === "function") {
        try { refreshProjectorEngine(); } catch(e) {}
      }
    }
  }

  getState() {
    return {
      serviceCountdown: { ...this.serviceCountdown },
      sermonTimer: { ...this.sermonTimer }
    };
  }

  formatTime(totalSec) {
    const isNeg = totalSec < 0;
    const absSec = Math.abs(totalSec);
    const m = Math.floor(absSec / 60);
    const s = absSec % 60;
    const mm = String(m).padStart(2, "0");
    const ss = String(s).padStart(2, "0");
    return (isNeg ? "+" : "") + `${mm}:${ss}`;
  }

  getSermonColor(remainingSeconds) {
    if (remainingSeconds <= 0) return "#dc2626"; // Overtime Red
    if (remainingSeconds <= this.sermonTimer.dangerSeconds) return "#ef4444"; // Urgent Red
    if (remainingSeconds <= this.sermonTimer.warningSeconds) return "#f59e0b"; // Warning Amber
    return "#10b981"; // Safe Green
  }

  handleRemoteCommand(cmd) {
    if (!cmd || !cmd.action) return;
    switch (cmd.action) {
      case "start-service":
        this.startServiceCountdown(cmd.seconds, cmd.title);
        break;
      case "pause-service":
        this.pauseServiceCountdown();
        break;
      case "stop-service":
        this.stopServiceCountdown();
        break;
      case "start-sermon":
        this.startSermonTimer(cmd.minutes);
        break;
      case "pause-sermon":
        this.pauseSermonTimer();
        break;
      case "adjust-sermon":
        this.adjustSermonTimer(Number(cmd.delta || 60));
        break;
      case "stop-sermon":
        this.stopSermonTimer();
        break;
    }
  }

  // --- UI DIALOG & CONTROLS ---
  openModal() {
    let modal = document.getElementById("timerControlModal");
    if (!modal) {
      modal = document.createElement("div");
      modal.id = "timerControlModal";
      modal.style.cssText = "position:fixed;inset:0;z-index:999999;display:flex;align-items:center;justify-content:center;background:rgba(2,6,23,0.78);backdrop-filter:blur(6px);padding:16px;";
      modal.innerHTML = `
        <div style="background:#ffffff;border-radius:16px;border:1px solid #cbd5e1;width:95vw;max-width:880px;max-height:90vh;display:flex;flex-direction:column;overflow:hidden;box-shadow:0 25px 50px -12px rgba(0,0,0,0.35);">
          <!-- Header -->
          <div style="padding:16px 20px;border-bottom:1px solid #e2e8f0;display:flex;align-items:center;justify-content:space-between;background:#f8fafc;">
            <div style="display:flex;align-items:center;gap:10px;">
              <div style="width:36px;height:36px;border-radius:10px;background:#e0e7ff;color:#4f46e5;display:flex;align-items:center;justify-content:center;font-size:18px;">
                <i class="fa-solid fa-stopwatch"></i>
              </div>
              <div>
                <h3 style="margin:0;font-size:15px;font-weight:700;color:#0f172a;">Service Countdowns & Sermon Timers</h3>
                <p style="margin:0;font-size:11px;color:#64748b;">Manage centro start countdowns and preacher confidence monitors</p>
              </div>
            </div>
            <button type="button" onclick="timerManager.closeModal()" style="border:0;background:none;color:#64748b;font-size:18px;cursor:pointer;padding:6px 10px;border-radius:8px;" class="hover:bg-slate-200">
              <i class="fa-solid fa-xmark"></i>
            </button>
          </div>

          <!-- Body with Two Columns -->
          <div style="flex:1;min-height:0;overflow-y:auto;padding:20px;display:grid;grid-template-columns:1fr 1fr;gap:20px;background:#f8fafc;">
            
            <!-- Column 1: Pre-Service Countdown -->
            <div style="background:#ffffff;border:1px solid #e2e8f0;border-radius:14px;padding:16px;display:flex;flex-direction:column;gap:14px;box-shadow:0 1px 3px rgba(0,0,0,0.05);">
              <div style="display:flex;align-items:center;justify-content:space-between;border-bottom:1px solid #f1f5f9;padding-bottom:10px;">
                <div style="display:flex;align-items:center;gap:8px;">
                  <i class="fa-solid fa-hourglass-start text-indigo-600"></i>
                  <span style="font-size:13px;font-weight:700;color:#1e293b;">Pre-Service Countdown</span>
                </div>
                <span id="serviceTimerStatusBadge" style="font-size:10px;font-weight:800;padding:2px 8px;border-radius:6px;background:#f1f5f9;color:#64748b;">OFF</span>
              </div>

              <!-- Live Clock Preview Box -->
              <div style="background:#090d16;border-radius:10px;padding:16px;text-align:center;color:#ffffff;box-shadow:inset 0 2px 4px rgba(0,0,0,0.5);">
                <div id="serviceTimerPreviewTitle" style="font-size:11px;font-weight:600;letter-spacing:1px;color:#94a3b8;text-transform:uppercase;margin-bottom:4px;">SERVICE BEGINS IN</div>
                <div id="serviceTimerClockDisplay" style="font-size:42px;font-weight:900;font-family:monospace;letter-spacing:2px;line-height:1;color:#ffffff;">05:00</div>
              </div>

              <!-- Quick Duration Presets -->
              <div>
                <label style="display:block;font-size:11px;font-weight:700;color:#64748b;margin-bottom:6px;">Quick Presets</label>
                <div style="display:grid;grid-template-columns:repeat(4, 1fr);gap:6px;">
                  <button type="button" onclick="timerManager.startServiceCountdown(3)" style="padding:6px 0;background:#f1f5f9;border:1px solid #e2e8f0;border-radius:6px;font-size:11px;font-weight:700;color:#334155;cursor:pointer;" class="hover:bg-indigo-50 hover:border-indigo-300">3 Min</button>
                  <button type="button" onclick="timerManager.startServiceCountdown(5)" style="padding:6px 0;background:#f1f5f9;border:1px solid #e2e8f0;border-radius:6px;font-size:11px;font-weight:700;color:#334155;cursor:pointer;" class="hover:bg-indigo-50 hover:border-indigo-300">5 Min</button>
                  <button type="button" onclick="timerManager.startServiceCountdown(10)" style="padding:6px 0;background:#f1f5f9;border:1px solid #e2e8f0;border-radius:6px;font-size:11px;font-weight:700;color:#334155;cursor:pointer;" class="hover:bg-indigo-50 hover:border-indigo-300">10 Min</button>
                  <button type="button" onclick="timerManager.startServiceCountdown(15)" style="padding:6px 0;background:#f1f5f9;border:1px solid #e2e8f0;border-radius:6px;font-size:11px;font-weight:700;color:#334155;cursor:pointer;" class="hover:bg-indigo-50 hover:border-indigo-300">15 Min</button>
                </div>
              </div>

              <!-- Title & Targets -->
              <div style="display:flex;flex-direction:column;gap:8px;">
                <div>
                  <label style="display:block;font-size:11px;font-weight:700;color:#64748b;margin-bottom:4px;">Countdown Title</label>
                  <input type="text" id="serviceTimerTitleInput" value="Service Begins In" 
                         onchange="timerManager.serviceCountdown.title=this.value;timerManager.syncState();"
                         style="width:100%;padding:6px 10px;border:1px solid #cbd5e1;border-radius:8px;font-size:12px;box-sizing:border-box;">
                </div>
                <div>
                  <label style="display:block;font-size:11px;font-weight:700;color:#64748b;margin-bottom:4px;">Subtitle / Centro Name</label>
                  <input type="text" id="serviceTimerSubInput" value="Union Espiritista Cristiana de Filipinas, Inc." 
                         onchange="timerManager.serviceCountdown.subMessage=this.value;timerManager.syncState();"
                         style="width:100%;padding:6px 10px;border:1px solid #cbd5e1;border-radius:8px;font-size:12px;box-sizing:border-box;">
                </div>
                <div style="display:flex;align-items:center;gap:16px;">
                  <label style="font-size:11px;font-weight:600;color:#475569;display:flex;align-items:center;gap:6px;cursor:pointer;">
                    <input type="checkbox" id="scShowProjCheck" checked onchange="timerManager.serviceCountdown.showOnProjection=this.checked;timerManager.syncState();">
                    Centro Projector
                  </label>
                  <label style="font-size:11px;font-weight:600;color:#475569;display:flex;align-items:center;gap:6px;cursor:pointer;">
                    <input type="checkbox" id="scShowStageCheck" checked onchange="timerManager.serviceCountdown.showOnStage=this.checked;timerManager.syncState();">
                    Confidence Screen
                  </label>
                </div>
              </div>

              <!-- Controls -->
              <div style="display:flex;gap:6px;margin-top:auto;">
                <button type="button" onclick="timerManager.startServiceCountdown()" style="flex:1;padding:8px 0;background:#4f46e5;color:#ffffff;border:0;border-radius:8px;font-size:12px;font-weight:700;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:6px;">
                  <i class="fa-solid fa-play"></i> Start
                </button>
                <button type="button" onclick="timerManager.pauseServiceCountdown()" style="flex:1;padding:8px 0;background:#f8fafc;color:#334155;border:1px solid #cbd5e1;border-radius:8px;font-size:12px;font-weight:700;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:6px;">
                  <i class="fa-solid fa-pause"></i> Pause
                </button>
                <button type="button" onclick="timerManager.stopServiceCountdown()" style="padding:8px 14px;background:#fee2e2;color:#ef4444;border:1px solid #fca5a5;border-radius:8px;font-size:12px;font-weight:700;cursor:pointer;" title="Stop & Clear Countdown">
                  <i class="fa-solid fa-stop"></i>
                </button>
              </div>
            </div>

            <!-- Column 2: Sermon & Preacher Timer -->
            <div style="background:#ffffff;border:1px solid #e2e8f0;border-radius:14px;padding:16px;display:flex;flex-direction:column;gap:14px;box-shadow:0 1px 3px rgba(0,0,0,0.05);">
              <div style="display:flex;align-items:center;justify-content:space-between;border-bottom:1px solid #f1f5f9;padding-bottom:10px;">
                <div style="display:flex;align-items:center;gap:8px;">
                  <i class="fa-solid fa-microphone text-emerald-600"></i>
                  <span style="font-size:13px;font-weight:700;color:#1e293b;">Preaching / Sermon Clock</span>
                </div>
                <span id="sermonTimerStatusBadge" style="font-size:10px;font-weight:800;padding:2px 8px;border-radius:6px;background:#f1f5f9;color:#64748b;">OFF</span>
              </div>

              <!-- Live Clock Preview Box -->
              <div id="sermonTimerPreviewBox" style="background:#090d16;border-radius:10px;padding:16px;text-align:center;color:#ffffff;box-shadow:inset 0 2px 4px rgba(0,0,0,0.5);">
                <div style="font-size:11px;font-weight:600;letter-spacing:1px;color:#94a3b8;text-transform:uppercase;margin-bottom:4px;">PULPIT CONFIDENCE TIMER</div>
                <div id="sermonTimerClockDisplay" style="font-size:42px;font-weight:900;font-family:monospace;letter-spacing:2px;line-height:1;color:#10b981;">35:00</div>
              </div>

              <!-- Quick Duration Presets -->
              <div>
                <label style="display:block;font-size:11px;font-weight:700;color:#64748b;margin-bottom:6px;">Preach Time Presets</label>
                <div style="display:grid;grid-template-columns:repeat(4, 1fr);gap:6px;">
                  <button type="button" onclick="timerManager.startSermonTimer(25)" style="padding:6px 0;background:#f1f5f9;border:1px solid #e2e8f0;border-radius:6px;font-size:11px;font-weight:700;color:#334155;cursor:pointer;" class="hover:bg-emerald-50 hover:border-emerald-300">25 Min</button>
                  <button type="button" onclick="timerManager.startSermonTimer(35)" style="padding:6px 0;background:#f1f5f9;border:1px solid #e2e8f0;border-radius:6px;font-size:11px;font-weight:700;color:#334155;cursor:pointer;" class="hover:bg-emerald-50 hover:border-emerald-300">35 Min</button>
                  <button type="button" onclick="timerManager.startSermonTimer(45)" style="padding:6px 0;background:#f1f5f9;border:1px solid #e2e8f0;border-radius:6px;font-size:11px;font-weight:700;color:#334155;cursor:pointer;" class="hover:bg-emerald-50 hover:border-emerald-300">45 Min</button>
                  <button type="button" onclick="timerManager.startSermonTimer(60)" style="padding:6px 0;background:#f1f5f9;border:1px solid #e2e8f0;border-radius:6px;font-size:11px;font-weight:700;color:#334155;cursor:pointer;" class="hover:bg-emerald-50 hover:border-emerald-300">60 Min</button>
                </div>
              </div>

              <!-- Color Alerts Threshold Explanation -->
              <div style="background:#f1f5f9;padding:8px 10px;border-radius:8px;font-size:10px;color:#64748b;display:flex;align-items:center;justify-content:space-between;">
                <span style="color:#10b981;font-weight:700;"><i class="fa-solid fa-circle text-[8px]"></i> > 5m Safe</span>
                <span style="color:#f59e0b;font-weight:700;"><i class="fa-solid fa-circle text-[8px]"></i> 2–5m Wrap Up</span>
                <span style="color:#ef4444;font-weight:700;"><i class="fa-solid fa-circle text-[8px]"></i> < 2m Conclude</span>
                <span style="color:#dc2626;font-weight:800;"><i class="fa-solid fa-bell text-[9px]"></i> Overtime (+00:00)</span>
              </div>

              <!-- Quick Time Adjustments -->
              <div>
                <label style="display:block;font-size:11px;font-weight:700;color:#64748b;margin-bottom:6px;">Live Adjustments</label>
                <div style="display:grid;grid-template-columns:1fr 1fr;gap:6px;">
                  <button type="button" onclick="timerManager.adjustSermonTimer(60)" style="padding:6px 0;background:#f8fafc;border:1px solid #cbd5e1;border-radius:6px;font-size:11px;font-weight:700;color:#334155;cursor:pointer;">+ 1 Minute</button>
                  <button type="button" onclick="timerManager.adjustSermonTimer(300)" style="padding:6px 0;background:#f8fafc;border:1px solid #cbd5e1;border-radius:6px;font-size:11px;font-weight:700;color:#334155;cursor:pointer;">+ 5 Minutes</button>
                </div>
              </div>

              <!-- Controls -->
              <div style="display:flex;gap:6px;margin-top:auto;">
                <button type="button" onclick="timerManager.startSermonTimer()" style="flex:1;padding:8px 0;background:#059669;color:#ffffff;border:0;border-radius:8px;font-size:12px;font-weight:700;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:6px;">
                  <i class="fa-solid fa-play"></i> Start
                </button>
                <button type="button" onclick="timerManager.pauseSermonTimer()" style="flex:1;padding:8px 0;background:#f8fafc;color:#334155;border:1px solid #cbd5e1;border-radius:8px;font-size:12px;font-weight:700;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:6px;">
                  <i class="fa-solid fa-pause"></i> Pause
                </button>
                <button type="button" onclick="timerManager.stopSermonTimer()" style="padding:8px 14px;background:#fee2e2;color:#ef4444;border:1px solid #fca5a5;border-radius:8px;font-size:12px;font-weight:700;cursor:pointer;" title="Stop Sermon Clock">
                  <i class="fa-solid fa-stop"></i>
                </button>
              </div>
            </div>

          </div>

          <!-- Footer -->
          <div style="padding:12px 20px;border-top:1px solid #e2e8f0;background:#ffffff;display:flex;align-items:center;justify-content:space-between;font-size:11px;color:#64748b;">
            <span>Timers automatically synchronize to speaker tablets, confidence TVs, and the centro projector</span>
            <button type="button" onclick="timerManager.closeModal()" style="padding:6px 14px;border:1px solid #cbd5e1;background:#ffffff;border-radius:8px;font-size:11px;font-weight:600;cursor:pointer;">Close</button>
          </div>
        </div>
      `;
      document.body.appendChild(modal);
    }
    modal.style.display = "flex";
    const scTitleIn = document.getElementById("serviceTimerTitleInput");
    if (scTitleIn) scTitleIn.value = this.serviceCountdown.title || "Service Begins In";
    const scSubIn = document.getElementById("serviceTimerSubInput");
    if (scSubIn) scSubIn.value = this.serviceCountdown.subMessage || "Union Espiritista Cristiana de Filipinas, Inc.";
    this.updateModalUI();
  }

  closeModal() {
    const modal = document.getElementById("timerControlModal");
    if (modal) modal.style.display = "none";
  }

  updateModalUI() {
    // 1. Update Service Countdown Display
    const scClock = document.getElementById("serviceTimerClockDisplay");
    const scBadge = document.getElementById("serviceTimerStatusBadge");
    const scTitle = document.getElementById("serviceTimerPreviewTitle");
    if (scClock) scClock.innerText = this.formatTime(this.serviceCountdown.remainingSeconds);
    if (scTitle) scTitle.innerText = this.serviceCountdown.title.toUpperCase();
    if (scBadge) {
      if (this.serviceCountdown.active) {
        scBadge.style.background = this.serviceCountdown.paused ? "#fef3c7" : "#e0e7ff";
        scBadge.style.color = this.serviceCountdown.paused ? "#b45309" : "#4338ca";
        scBadge.innerText = this.serviceCountdown.paused ? "PAUSED" : "LIVE";
      } else {
        scBadge.style.background = "#f1f5f9";
        scBadge.style.color = "#64748b";
        scBadge.innerText = "OFF";
      }
    }

    // 2. Update Sermon Preaching Timer Display
    const smClock = document.getElementById("sermonTimerClockDisplay");
    const smBadge = document.getElementById("sermonTimerStatusBadge");
    if (smClock) {
      smClock.innerText = this.formatTime(this.sermonTimer.remainingSeconds);
      smClock.style.color = this.getSermonColor(this.sermonTimer.remainingSeconds);
    }
    if (smBadge) {
      if (this.sermonTimer.active) {
        smBadge.style.background = this.sermonTimer.paused ? "#fef3c7" : (this.sermonTimer.isOvertime ? "#fee2e2" : "#d1fae5");
        smBadge.style.color = this.sermonTimer.paused ? "#b45309" : (this.sermonTimer.isOvertime ? "#dc2626" : "#047857");
        smBadge.innerText = this.sermonTimer.paused ? "PAUSED" : (this.sermonTimer.isOvertime ? "OVERTIME" : "PREACHING");
      } else {
        smBadge.style.background = "#f1f5f9";
        smBadge.style.color = "#64748b";
        smBadge.innerText = "OFF";
      }
    }
  }

  updateToolbarBadge() {
    const badge = document.getElementById("timerActiveBadge");
    const txt = document.getElementById("txtToolbarTimer");
    if (!badge) return;

    if (this.serviceCountdown.active) {
      badge.classList.remove("hidden");
      badge.style.display = "inline-block";
      badge.innerText = this.formatTime(this.serviceCountdown.remainingSeconds);
      badge.style.background = "#4f46e5";
    } else if (this.sermonTimer.active) {
      badge.classList.remove("hidden");
      badge.style.display = "inline-block";
      badge.innerText = this.formatTime(this.sermonTimer.remainingSeconds);
      badge.style.background = this.getSermonColor(this.sermonTimer.remainingSeconds);
    } else {
      badge.classList.add("hidden");
      badge.style.display = "none";
    }
  }
}

// Global instance
window.timerManager = new TimerManager();
