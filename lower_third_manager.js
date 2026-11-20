/**
 * Lower Third & Speaker Nameplate Broadcast Manager
 * 
 * Manages persistent speaker rosters, broadcast animations (in / stay / out / morph),
 * timing modes (Auto-dismiss, Persistent Stay, Periodic Loop), and synchronization
 * across the main centro projector, live camera studio, and remote/OBS streams.
 */

class LowerThirdManager {
  constructor() {
    this.STORAGE_KEYS = {
      roster: 'uecfi_speaker_roster',
      config: 'uecfi_lower_third_config'
    };

    this.defaultSpeakers = [
      {
        id: "spk_1",
        name: "Ptr. Allan Rodriguez",
        role: "Senior Pastor",
        ministry: "UECFI",
        accentColor: "#2563eb",
        icon: "fa-microphone-lines"
      },
      {
        id: "spk_2",
        name: "Praise & Worship",
        role: "Music Ministry",
        ministry: "UECFI",
        accentColor: "#7c3aed",
        icon: "fa-music"
      },
      {
        id: "spk_3",
        name: "Scripture Reader",
        role: "Word of God",
        ministry: "Liturgy",
        accentColor: "#059669",
        icon: "fa-book-bible"
      },
      {
        id: "spk_4",
        name: "Visiting Minister",
        role: "Guest Speaker",
        ministry: "Guest",
        accentColor: "#d97706",
        icon: "fa-user-tie"
      }
    ];

    this.speakers = [];
    this.activeSpeakerId = "spk_1";
    this.activeState = {
      active: false,
      speaker: null,
      animationState: 'out', // 'in' | 'stay' | 'out'
      mode: 'auto',          // 'auto' | 'stay' | 'loop'
      autoDismissSec: 8,
      loopIntervalMin: 5,
      timestamp: 0
    };

    this._dismissTimer = null;
    this._loopTimer = null;
    this._editingSpeakerId = null;
  }

  init() {
    this.loadRoster();
    this.loadConfig();
    this.updateControllerUI();

    // Mirror to global window object
    if (typeof window !== 'undefined') {
      window.p_speaker_lower_third = this.getBroadcastPayload();
    }
  }

  loadRoster() {
    try {
      const saved = localStorage.getItem(this.STORAGE_KEYS.roster);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) {
          this.speakers = parsed;
          return;
        }
      }
    } catch (e) {
      console.warn("[LOWER-THIRD] Failed to load roster from localStorage:", e);
    }
    this.speakers = JSON.parse(JSON.stringify(this.defaultSpeakers));
    this.saveRoster();
  }

  saveRoster() {
    try {
      localStorage.setItem(this.STORAGE_KEYS.roster, JSON.stringify(this.speakers));
    } catch (e) {
      console.warn("[LOWER-THIRD] Failed to save roster:", e);
    }
  }

  loadConfig() {
    try {
      const saved = localStorage.getItem(this.STORAGE_KEYS.config);
      if (saved) {
        const cfg = JSON.parse(saved);
        if (cfg.mode) this.activeState.mode = cfg.mode;
        if (cfg.autoDismissSec) this.activeState.autoDismissSec = Number(cfg.autoDismissSec) || 8;
        if (cfg.loopIntervalMin) this.activeState.loopIntervalMin = Number(cfg.loopIntervalMin) || 5;
        if (cfg.activeSpeakerId && this.speakers.some(s => s.id === cfg.activeSpeakerId)) {
          this.activeSpeakerId = cfg.activeSpeakerId;
        } else if (this.speakers.length > 0) {
          this.activeSpeakerId = this.speakers[0].id;
        }
      }
    } catch (e) {
      console.warn("[LOWER-THIRD] Failed to load config:", e);
    }
  }

  saveConfig() {
    try {
      const cfg = {
        mode: this.activeState.mode,
        autoDismissSec: this.activeState.autoDismissSec,
        loopIntervalMin: this.activeState.loopIntervalMin,
        activeSpeakerId: this.activeSpeakerId
      };
      localStorage.setItem(this.STORAGE_KEYS.config, JSON.stringify(cfg));
    } catch (e) {}
  }

  getSpeakers() {
    return this.speakers;
  }

  getSpeaker(id) {
    return this.speakers.find(s => s.id === id) || null;
  }

  saveSpeaker(speaker) {
    if (!speaker || !speaker.name) return;
    if (speaker.id) {
      const idx = this.speakers.findIndex(s => s.id === speaker.id);
      if (idx !== -1) {
        this.speakers[idx] = { ...this.speakers[idx], ...speaker };
      } else {
        this.speakers.push(speaker);
      }
    } else {
      speaker.id = 'spk_' + Date.now();
      this.speakers.push(speaker);
    }
    this.saveRoster();
    this.updateControllerUI();
    this.renderRosterList();
  }

  deleteSpeaker(id) {
    this.speakers = this.speakers.filter(s => s.id !== id);
    if (this.speakers.length === 0) {
      this.speakers = JSON.parse(JSON.stringify(this.defaultSpeakers));
    }
    if (this.activeSpeakerId === id) {
      this.activeSpeakerId = this.speakers[0].id;
    }
    this.saveRoster();
    this.updateControllerUI();
    this.renderRosterList();
  }

  selectSpeaker(id) {
    if (this.speakers.some(s => s.id === id)) {
      this.activeSpeakerId = id;
      this.saveConfig();
      this.updateControllerUI();

      // If already live, morph to this new speaker smoothly
      if (this.activeState.active) {
        const spk = this.getSpeaker(id);
        this.show(spk, { isMorph: true });
      }
    }
  }

  /**
   * Broadcasts the lower third live with animations
   */
  show(speakerOrId, options = {}) {
    let speaker = null;
    if (typeof speakerOrId === 'string') {
      speaker = this.getSpeaker(speakerOrId);
      if (speaker) this.activeSpeakerId = speakerOrId;
    } else if (speakerOrId && typeof speakerOrId === 'object') {
      speaker = speakerOrId;
      if (speaker.id) this.activeSpeakerId = speaker.id;
    } else {
      speaker = this.getSpeaker(this.activeSpeakerId) || this.speakers[0];
    }

    if (!speaker) return;

    this.clearTimers();

    const isAlreadyActive = this.activeState.active;
    const isMorph = Boolean(options.isMorph || (isAlreadyActive && this.activeState.speaker && this.activeState.speaker.id !== speaker.id));

    this.activeState.active = true;
    this.activeState.speaker = { ...speaker };
    this.activeState.animationState = isMorph ? 'morph' : 'in';
    this.activeState.timestamp = Date.now();

    this.syncToOutputs();
    this.updateControllerUI();

    // After entry animation (500ms), settle into 'stay'
    setTimeout(() => {
      if (this.activeState.active) {
        this.activeState.animationState = 'stay';
        this.syncToOutputs();
      }
    }, isMorph ? 350 : 550);

    // Timing mode handling
    if (this.activeState.mode === 'auto') {
      const durationMs = (this.activeState.autoDismissSec || 8) * 1000;
      this._dismissTimer = setTimeout(() => {
        this.dismiss();
      }, durationMs);
    } else if (this.activeState.mode === 'loop') {
      const stayMs = (this.activeState.autoDismissSec || 8) * 1000;
      const intervalMs = (this.activeState.loopIntervalMin || 5) * 60 * 1000;

      this._dismissTimer = setTimeout(() => {
        this.dismiss({ fromLoop: true });
        this._loopTimer = setTimeout(() => {
          this.show(this.activeSpeakerId);
        }, intervalMs);
      }, stayMs);
    }
  }

  /**
   * Smoothly animates out and dismisses the lower third
   */
  dismiss(options = {}) {
    if (!this.activeState.active && this.activeState.animationState === 'out') return;

    if (!options.fromLoop) {
      this.clearTimers();
    }

    this.activeState.animationState = 'out';
    this.syncToOutputs();

    // After exit animation finishes (400ms), drop the active state completely
    setTimeout(() => {
      if (this.activeState.animationState === 'out') {
        this.activeState.active = false;
        this.syncToOutputs();
        this.updateControllerUI();
      }
    }, 450);
  }

  toggleActive() {
    if (this.activeState.active && this.activeState.animationState !== 'out') {
      this.dismiss();
    } else {
      this.show(this.activeSpeakerId);
    }
  }

  clearTimers() {
    if (this._dismissTimer) {
      clearTimeout(this._dismissTimer);
      this._dismissTimer = null;
    }
    if (this._loopTimer) {
      clearTimeout(this._loopTimer);
      this._loopTimer = null;
    }
  }

  setMode(mode) {
    if (['auto', 'stay', 'loop'].includes(mode)) {
      this.activeState.mode = mode;
      this.saveConfig();
      this.updateControllerUI();

      // If currently active, adjust timers
      if (this.activeState.active) {
        this.show(this.activeSpeakerId);
      }
    }
  }

  setAutoDismissSec(sec) {
    const val = parseInt(sec, 10);
    if (!isNaN(val) && val >= 3 && val <= 30) {
      this.activeState.autoDismissSec = val;
      this.saveConfig();
      this.updateControllerUI();
    }
  }

  setLoopIntervalMin(min) {
    const val = parseInt(min, 10);
    if (!isNaN(val) && val >= 1 && val <= 60) {
      this.activeState.loopIntervalMin = val;
      this.saveConfig();
      this.updateControllerUI();
    }
  }

  getBroadcastPayload() {
    return {
      active: this.activeState.active,
      animationState: this.activeState.animationState,
      speaker: this.activeState.speaker,
      timestamp: this.activeState.timestamp
    };
  }

  /**
   * Synchronizes payload across all projection, preview, and streaming engines
   */
  syncToOutputs() {
    const payload = this.getBroadcastPayload();
    if (typeof window !== 'undefined') {
      window.p_speaker_lower_third = payload;

      // 1. Physical Projector Window (newWindow.window)
      if (typeof newWindow !== 'undefined' && newWindow && newWindow.window && !newWindow.window.closed) {
        try {
          const win = newWindow.window;
          win.p_speaker_lower_third = payload;
          if (typeof win.updateSpeakerLowerThird === 'function') {
            win.updateSpeakerLowerThird(payload);
          }
        } catch (e) {
          console.warn("[LOWER-THIRD] Projector sync error:", e);
        }
      }

      // 2. Dashboard Sidebar Live Output Preview iframe
      const previewFrame = (typeof document !== 'undefined') ? (document.getElementById('livePreviewFrame') || document.getElementById('sidebarPreviewFrame')) : null;
      if (previewFrame && previewFrame.contentWindow) {
        try {
          const pWin = previewFrame.contentWindow;
          pWin.p_speaker_lower_third = payload;
          if (typeof pWin.updateSpeakerLowerThird === 'function') {
            pWin.updateSpeakerLowerThird(payload);
          }
        } catch (e) {}
      }

      // 3. Live Studio WebRTC Socket (for remote guests & mobile audience)
      if (window.liveStudio && window.liveStudio.socket && window.liveStudio.socket.readyState === WebSocket.OPEN) {
        try {
          window.liveStudio.socket.send(JSON.stringify({
            type: 'speaker_lower_third',
            payload: payload
          }));
        } catch (e) {}
      }

      // 4. HTML5 BroadcastChannel for cross-window, popups, and OBS browser source sync
      if (typeof BroadcastChannel !== 'undefined') {
        try {
          const bc = new BroadcastChannel('uecfi_presentation_channel');
          bc.postMessage({
            type: 'SPEAKER_LOWER_THIRD_UPDATE',
            payload: payload
          });
          bc.close();
        } catch (e) {}
      }
    }
  }

  /**
   * Updates Controller buttons and statuses
   */
  updateControllerUI() {
    if (typeof document === 'undefined') return;
    const btnToggle = document.getElementById('btnToggleLowerThird');
    const txtBtn = document.getElementById('txtLowerThirdBtn');
    const activeSpk = this.getSpeaker(this.activeSpeakerId);

    const isLive = Boolean(this.activeState.active && this.activeState.animationState !== 'out');

    if (btnToggle) {
      if (isLive) {
        btnToggle.className = 'px-2.5 py-1.5 text-xs font-bold transition flex items-center gap-1.5 cursor-pointer rounded-l-lg bg-rose-600 text-white shadow-xs animate-pulse';
        btnToggle.title = 'Lower Third is LIVE on screen. Click to dismiss.';
      } else {
        btnToggle.className = 'px-2.5 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition flex items-center gap-1.5 cursor-pointer rounded-l-lg';
        btnToggle.title = 'Click to show speaker nameplate lower third';
      }
    }

    if (txtBtn) {
      if (isLive && this.activeState.speaker) {
        const shortName = this.activeState.speaker.name.length > 18
          ? this.activeState.speaker.name.substring(0, 16) + '…'
          : this.activeState.speaker.name;
        txtBtn.innerHTML = `<span class="inline-block w-2 h-2 rounded-full bg-white mr-1 animate-ping"></span> LIVE: ${shortName}`;
      } else if (activeSpk) {
        const shortName = activeSpk.name.length > 16 ? activeSpk.name.substring(0, 14) + '…' : activeSpk.name;
        txtBtn.textContent = shortName;
      } else {
        txtBtn.textContent = 'Nameplate';
      }
    }

    // Modal quick-select pills
    const quickList = document.getElementById('ltModalQuickList');
    if (quickList) {
      this.renderQuickSpeakerSelect();
    }
  }

  /* =========================================================
   * Modal & Settings UI Management
   * ========================================================= */

  openModal() {
    const modal = document.getElementById('modalLowerThirdManager');
    if (modal) {
      this.renderRosterList();
      this.renderQuickSpeakerSelect();
      this.updateModalConfigFields();
      this.updateLivePreviewCard();
      modal.classList.remove('hidden');
      modal.style.display = 'flex';
    }
  }

  closeModal() {
    const modal = document.getElementById('modalLowerThirdManager');
    if (modal) {
      modal.classList.add('hidden');
      modal.style.display = 'none';
    }
    this._editingSpeakerId = null;
  }

  updateModalConfigFields() {
    const modeSelect = document.getElementById('ltModeSelect');
    const autoSecInput = document.getElementById('ltAutoDismissInput');
    const loopMinInput = document.getElementById('ltLoopIntervalInput');

    if (modeSelect) modeSelect.value = this.activeState.mode;
    if (autoSecInput) autoSecInput.value = this.activeState.autoDismissSec;
    if (loopMinInput) loopMinInput.value = this.activeState.loopIntervalMin;

    const rowAuto = document.getElementById('ltRowAutoDismiss');
    const rowLoop = document.getElementById('ltRowLoopInterval');
    if (rowAuto) rowAuto.classList.toggle('hidden', this.activeState.mode === 'stay');
    if (rowLoop) rowLoop.classList.toggle('hidden', this.activeState.mode !== 'loop');
  }

  renderQuickSpeakerSelect() {
    if (typeof document === 'undefined') return;
    const container = document.getElementById('ltModalQuickList');
    if (!container) return;

    container.innerHTML = this.speakers.map(s => {
      const isSelected = s.id === this.activeSpeakerId;
      const isLiveNow = this.activeState.active && this.activeState.speaker && this.activeState.speaker.id === s.id;
      
      const borderClass = isLiveNow 
        ? 'border-rose-500 bg-rose-50 text-rose-900 ring-2 ring-rose-400'
        : (isSelected ? 'border-brand-500 bg-brand-50 text-brand-900' : 'border-slate-200 bg-white hover:border-slate-300 text-slate-800');

      return `
        <div onclick="window.lowerThirdManager.selectSpeaker('${s.id}');"
             class="p-2.5 rounded-xl border ${borderClass} transition cursor-pointer flex items-center justify-between group shadow-2xs">
          <div class="flex items-center gap-2.5 min-w-0">
            <div class="w-8 h-8 rounded-lg flex items-center justify-center text-white shrink-0 text-xs shadow-xs"
                 style="background-color: ${s.accentColor || '#2563eb'};">
              <i class="fa-solid ${s.icon || 'fa-user'}"></i>
            </div>
            <div class="truncate">
              <div class="text-xs font-bold leading-tight truncate">${s.name}</div>
              <div class="text-[10px] text-slate-500 leading-tight truncate">${s.role || s.ministry || 'Speaker'}</div>
            </div>
          </div>
          <div class="flex items-center gap-1.5 shrink-0 ml-2">
            ${isLiveNow ? '<span class="px-1.5 py-0.5 rounded-full text-[9px] font-black uppercase bg-rose-600 text-white animate-pulse">ON AIR</span>' : ''}
            <button type="button" onclick="event.stopPropagation(); window.lowerThirdManager.editSpeaker('${s.id}');" 
                    class="w-6 h-6 rounded text-slate-400 hover:text-slate-700 hover:bg-slate-100 flex items-center justify-center transition" title="Edit">
              <i class="fa-solid fa-pen text-[10px]"></i>
            </button>
          </div>
        </div>
      `;
    }).join('');
  }

  renderRosterList() {
    if (typeof document === 'undefined') return;
    const listEl = document.getElementById('ltRosterListTable');
    if (!listEl) return;

    listEl.innerHTML = this.speakers.map(s => `
      <tr class="border-b border-slate-100 hover:bg-slate-50/80 transition">
        <td class="py-2 px-3">
          <div class="flex items-center gap-2">
            <span class="w-3.5 h-3.5 rounded-full shrink-0" style="background-color: ${s.accentColor || '#2563eb'};"></span>
            <span class="font-bold text-xs text-slate-800">${s.name}</span>
          </div>
        </td>
        <td class="py-2 px-3 text-xs text-slate-600">${s.role || '—'}</td>
        <td class="py-2 px-3 text-xs text-slate-400">${s.ministry || '—'}</td>
        <td class="py-2 px-3 text-right">
          <div class="flex items-center justify-end gap-1">
            <button type="button" onclick="window.lowerThirdManager.editSpeaker('${s.id}');" class="p-1.5 text-slate-400 hover:text-brand-600 hover:bg-brand-50 rounded transition">
              <i class="fa-solid fa-pen text-xs"></i>
            </button>
            <button type="button" onclick="window.lowerThirdManager.deleteSpeaker('${s.id}');" class="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded transition">
              <i class="fa-solid fa-trash text-xs"></i>
            </button>
          </div>
        </td>
      </tr>
    `).join('');
  }

  editSpeaker(id) {
    const spk = this.getSpeaker(id);
    if (!spk) return;
    this._editingSpeakerId = id;

    const nameIn = document.getElementById('ltInputName');
    const roleIn = document.getElementById('ltInputRole');
    const minIn = document.getElementById('ltInputMinistry');
    const colorIn = document.getElementById('ltInputColor');
    const modalTitle = document.getElementById('ltSpeakerFormTitle');

    if (nameIn) nameIn.value = spk.name || '';
    if (roleIn) roleIn.value = spk.role || '';
    if (minIn) minIn.value = spk.ministry || '';
    if (colorIn) colorIn.value = spk.accentColor || '#2563eb';
    if (modalTitle) modalTitle.textContent = 'Edit Speaker';

    const formDrawer = document.getElementById('ltSpeakerFormDrawer');
    if (formDrawer) formDrawer.classList.remove('hidden');
  }

  openNewSpeakerForm() {
    this._editingSpeakerId = null;
    const nameIn = document.getElementById('ltInputName');
    const roleIn = document.getElementById('ltInputRole');
    const minIn = document.getElementById('ltInputMinistry');
    const colorIn = document.getElementById('ltInputColor');
    const modalTitle = document.getElementById('ltSpeakerFormTitle');

    if (nameIn) nameIn.value = '';
    if (roleIn) roleIn.value = '';
    if (minIn) minIn.value = '';
    if (colorIn) colorIn.value = '#2563eb';
    if (modalTitle) modalTitle.textContent = 'Add New Speaker';

    const formDrawer = document.getElementById('ltSpeakerFormDrawer');
    if (formDrawer) formDrawer.classList.remove('hidden');
    if (nameIn) setTimeout(() => nameIn.focus(), 100);
  }

  closeSpeakerForm() {
    const formDrawer = document.getElementById('ltSpeakerFormDrawer');
    if (formDrawer) formDrawer.classList.add('hidden');
    this._editingSpeakerId = null;
  }

  saveCurrentSpeakerForm() {
    const nameIn = document.getElementById('ltInputName');
    const roleIn = document.getElementById('ltInputRole');
    const minIn = document.getElementById('ltInputMinistry');
    const colorIn = document.getElementById('ltInputColor');

    const name = nameIn ? nameIn.value.trim() : '';
    if (!name) {
      alert("Please enter a speaker name.");
      return;
    }

    const speakerData = {
      id: this._editingSpeakerId || null,
      name: name,
      role: roleIn ? roleIn.value.trim() : '',
      ministry: minIn ? minIn.value.trim() : '',
      accentColor: colorIn ? colorIn.value : '#2563eb',
      icon: 'fa-user'
    };

    this.saveSpeaker(speakerData);
    this.closeSpeakerForm();
    this.updateLivePreviewCard();
  }

  updateLivePreviewCard() {
    if (typeof document === 'undefined') return;
    const spk = this.getSpeaker(this.activeSpeakerId) || this.speakers[0];
    if (!spk) return;

    const prevName = document.getElementById('ltPreviewName');
    const prevRole = document.getElementById('ltPreviewRole');
    const prevBar = document.getElementById('ltPreviewBar');

    if (prevName) prevName.textContent = spk.name;
    if (prevRole) prevRole.textContent = spk.role || spk.ministry || 'Speaker';
    if (prevBar) prevBar.style.borderLeftColor = spk.accentColor || '#2563eb';
  }
}

// Global initialization
if (typeof window !== 'undefined') {
  window.lowerThirdManager = new LowerThirdManager();
  window.addEventListener('DOMContentLoaded', () => {
    if (window.lowerThirdManager) window.lowerThirdManager.init();
  });
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = LowerThirdManager;
}
