/**
 * UECFI Presenter - Song Audio & Synchronized Lyrics Engine
 * 
 * Handles:
 * 1. Audio playback for songs (MP3, WAV, M4A, OGG)
 * 2. Timestamp parsing (LRC [mm:ss.xx] / [mm:ss] format)
 * 3. Real-time line highlighting (active line vs inactive lines)
 * 4. Automatic slide progression synchronized with the song
 * 5. Quick toggle to enable/disable audio & sync lyrics
 */

class SongAudioEngine {
  constructor() {
    this.audio = (typeof Audio !== "undefined") ? new Audio() : {
      addEventListener: () => {},
      play: () => Promise.resolve(),
      pause: () => {},
      load: () => {},
      getAttribute: () => null,
      setAttribute: () => {}
    };
    if (this.audio.preload) this.audio.preload = "auto";
    this.currentSong = null;
    this.timedSlides = [];
    this.currentSlideIndex = -1;
    this.activeLineIndex = -1;
    this.syncEnabled = true;
    this.isPlaying = false;
    this.volume = 1.0;
    this._rafId = null;
    this._isAdvancing = false;
    this._scrubbing = false;

    this._bindAudioEvents();
  }

  _bindAudioEvents() {
    this.audio.addEventListener("play", () => {
      this.isPlaying = true;
      this._updateUIState();
      this._startTracking();
    });

    this.audio.addEventListener("pause", () => {
      this.isPlaying = false;
      this._updateUIState();
      this._stopTracking();
    });

    this.audio.addEventListener("ended", () => {
      this.isPlaying = false;
      this._updateUIState();
      this._stopTracking();
      this.activeLineIndex = -1;
      this.broadcastHighlight(-1);
    });

    this.audio.addEventListener("error", (e) => {
      console.warn("[SongAudioEngine] Audio playback error:", e);
      this.isPlaying = false;
      this._updateUIState();
      this._stopTracking();
    });

    this.audio.addEventListener("timeupdate", () => {
      if (!this._scrubbing) {
        this._updateTimeDisplay();
      }
    });

    this.audio.addEventListener("loadedmetadata", () => {
      this._updateTimeDisplay();
    });
  }

  /**
   * Parse timestamp string to seconds
   * e.g. "01:23.45" -> 83.45, "00:15" -> 15.0
   */
  parseTimestamp(str) {
    if (!str || typeof str !== "string") return null;
    const match = str.match(/\[?\s*(\d{1,2}):(\d{2})(?:[.:](\d{1,3}))?\s*\]?/);
    if (!match) return null;
    const min = parseInt(match[1], 10);
    const sec = parseInt(match[2], 10);
    const ms = match[3] ? parseFloat("0." + match[3]) : 0;
    return min * 60 + sec + ms;
  }

  /**
   * Format seconds to mm:ss
   */
  formatTime(seconds) {
    if (!isFinite(seconds) || seconds < 0) return "00:00";
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${m < 10 ? "0" : ""}${m}:${s < 10 ? "0" : ""}${s}`;
  }

  /**
   * Parse full lyrics into structured slides and timed lines
   */
  parseLyricsIntoTimedSlides(lyricsText) {
    if (!lyricsText || typeof lyricsText !== "string") return [];

    let rawParts = [];
    if (lyricsText.includes("<slide>")) {
      rawParts = lyricsText.split(/<slide>/gi).map(p => p.trim()).filter(p => p.length > 0);
    } else {
      rawParts = lyricsText.split(/\n\s*\n/).map(p => p.trim()).filter(p => p.length > 0);
    }

    return rawParts.map((part, slideIdx) => {
      const normalized = part
        .replace(/<br\s*\/?>/gi, "\n")
        .replace(/\r\n/g, "\n")
        .replace(/\r/g, "\n");
      const rawLines = normalized.split("\n");
      const lines = [];
      let firstTime = null;
      let lastTime = null;

      rawLines.forEach((rawLine) => {
        const trimmed = rawLine.trim();
        if (trimmed === "" || trimmed === ".") return;

        const tsMatch = trimmed.match(/^\[\s*(\d{1,2}:\d{2}(?:[.:]\d{1,3})?)\s*\]\s*(.*)$/);
        let time = null;
        let cleanText = trimmed;

        if (tsMatch) {
          time = this.parseTimestamp(tsMatch[1]);
          cleanText = tsMatch[2] ? tsMatch[2].trim() : "";
        }

        if (time !== null) {
          if (firstTime === null || time < firstTime) firstTime = time;
          if (lastTime === null || time > lastTime) lastTime = time;
        }

        lines.push({
          lineIndex: lines.length,
          time: time,
          cleanText: cleanText,
          rawText: trimmed
        });
      });

      return {
        slideIndex: slideIdx,
        lines: lines,
        firstLineTime: firstTime,
        lastLineTime: lastTime
      };
    });
  }

  /**
   * Start presenting a song with optional audio and sync lyrics
   */
  startSong(songObj, slideIndex) {
    if (!songObj) return;
    this.currentSong = songObj;
    this.currentSlideIndex = (typeof slideIndex === "number" && slideIndex >= 0) ? slideIndex : 0;
    this.activeLineIndex = -1;
    this._isAdvancing = false;

    // Parse lyrics for timestamps
    const rawLyrics = songObj.lyrics || (Array.isArray(songObj.slides) ? songObj.slides.join("<slide>") : "");
    this.timedSlides = this.parseLyricsIntoTimedSlides(rawLyrics);

    const hasAudio = !!(songObj.audio && String(songObj.audio).trim() !== "");
    const barEl = (typeof document !== "undefined") ? document.getElementById("songAudioBar") : null;

    if (hasAudio) {
      if (barEl) barEl.style.display = "flex";
      this._updateSongTitleUI(songObj.name || songObj.title || "");

      // Resolve audio URL
      const fileName = String(songObj.audio).trim();
      const audioSrc = `./audio/${encodeURIComponent(fileName)}`;

      if (this.audio.getAttribute("data-current-src") !== fileName) {
        this.audio.setAttribute("data-current-src", fileName);
        this.audio.src = audioSrc;
        this.audio.load();
      }

      if (this.syncEnabled) {
        // If starting on a slide > 0, seek audio to that slide's start
        const curSlide = this.timedSlides[this.currentSlideIndex];
        if (this.currentSlideIndex > 0 && curSlide && curSlide.firstLineTime !== null) {
          this.audio.currentTime = Math.max(0, curSlide.firstLineTime - 0.2);
        } else if (this.currentSlideIndex === 0) {
          this.audio.currentTime = 0;
        }

        const playPromise = this.audio.play();
        if (playPromise && typeof playPromise.catch === "function") {
          playPromise.catch((err) => {
            console.warn("[SongAudioEngine] Autoplay prevented or error:", err);
          });
        }
      }
    } else {
      if (barEl) barEl.style.display = "none";
      this.stop();
    }

    this._updateUIState();
    this.broadcastHighlight(this.activeLineIndex);
  }

  /**
   * Slide changed externally (e.g. manual Next/Prev)
   */
  onSlideChanged(newSlideIndex) {
    this.currentSlideIndex = newSlideIndex;
    this.activeLineIndex = -1;
    this._isAdvancing = false;

    // Check if the current audio time is before the first line of the new slide
    const curSlide = this.timedSlides[this.currentSlideIndex];
    if (curSlide && curSlide.lines && curSlide.lines.length > 0) {
      const curTime = this.audio.currentTime;
      if (curSlide.lines[0].time !== null && curTime < curSlide.lines[0].time) {
        this.activeLineIndex = -1;
      } else {
        // Find if any line on this slide matches the current time
        let activeIdx = -1;
        curSlide.lines.forEach((l, idx) => {
          if (l.time !== null && curTime >= l.time) {
            activeIdx = idx;
          }
        });
        this.activeLineIndex = activeIdx;
      }
    }

    this.broadcastHighlight(this.activeLineIndex);
  }

  /**
   * Stop audio playback completely and hide bar
   */
  stop() {
    this._stopTracking();
    try {
      this.audio.pause();
      this.audio.currentTime = 0;
    } catch (e) {}
    this.isPlaying = false;
    this.activeLineIndex = -1;
    this.currentSong = null;
    this.timedSlides = [];
    this.broadcastHighlight(-1);
    this._updateUIState();

    const barEl = (typeof document !== "undefined") ? document.getElementById("songAudioBar") : null;
    if (barEl) barEl.style.display = "none";
  }

  /**
   * Toggle Play / Pause
   */
  togglePlay() {
    if (this.audio.paused) {
      this.audio.play().catch(() => {});
    } else {
      this.audio.pause();
    }
  }

  /**
   * Restart audio from the beginning
   */
  restart() {
    this.audio.currentTime = 0;
    this.currentSlideIndex = 0;
    this.activeLineIndex = -1;
    if (this.audio.paused && this.syncEnabled) {
      this.audio.play().catch(() => {});
    }
    // Advance presenter to first slide
    if (window.programManager && window.programManager.presentedItemIndex >= 0) {
      window.programManager.presentSlide(0);
    } else if (typeof window.presentSong === "function") {
      window.presentSong(0);
    }
    this.broadcastHighlight(-1);
  }

  /**
   * Seek audio via slider scrub
   */
  onScrub(pct) {
    if (!this.audio.duration) return;
    this._scrubbing = true;
    const target = (pct / 100) * this.audio.duration;
    this.audio.currentTime = target;
    this._updateTimeDisplay();
    setTimeout(() => { this._scrubbing = false; }, 200);
  }

  /**
   * Set volume (0.0 to 1.0)
   */
  setVolume(vol) {
    this.volume = Math.min(1, Math.max(0, parseFloat(vol)));
    this.audio.volume = this.volume;
  }

  /**
   * Quick toggle for Backing Track & Sync Lyrics
   */
  toggleSync(override) {
    if (typeof override === "boolean") {
      this.syncEnabled = override;
    } else {
      this.syncEnabled = !this.syncEnabled;
    }

    if (!this.syncEnabled) {
      // Pause audio and clear sync highlight
      try { this.audio.pause(); } catch (e) {}
      this.activeLineIndex = -1;
      this.broadcastHighlight(-1);
    } else {
      // Resume audio if song has audio
      if (this.currentSong && this.currentSong.audio) {
        this.audio.play().catch(() => {});
      }
    }

    this._updateUIState();
    this.broadcastSyncState();
  }

  _startTracking() {
    this._stopTracking();
    const tick = () => {
      this._tick();
      if (this.isPlaying) {
        this._rafId = requestAnimationFrame(tick);
      }
    };
    this._rafId = requestAnimationFrame(tick);
  }

  _stopTracking() {
    if (this._rafId) {
      cancelAnimationFrame(this._rafId);
      this._rafId = null;
    }
  }

  /**
   * Real-time sync check (runs at 60fps while playing)
   */
  _tick() {
    if (!this.syncEnabled || !this.isPlaying || !this.audio || this.audio.paused) return;

    const curTime = this.audio.currentTime;
    const curSlide = this.timedSlides[this.currentSlideIndex];
    const nextSlide = this.timedSlides[this.currentSlideIndex + 1];

    // 1. Check if we should auto-advance to next slide
    if (nextSlide && nextSlide.firstLineTime !== null && !this._isAdvancing) {
      if (curTime >= nextSlide.firstLineTime) {
        this._isAdvancing = true;
        this.currentSlideIndex++;
        this.activeLineIndex = 0; // first line of new slide is now active!

        // Trigger slide transition on presenter
        if (typeof window !== "undefined" && window.programManager && window.programManager.presentedItemIndex >= 0) {
          window.programManager.nextSlide();
        } else if (typeof window !== "undefined" && typeof window.nextSlide === "function") {
          window.nextSlide();
        } else if (typeof window !== "undefined" && typeof window.songnav_next_slide === "function") {
          window.songnav_next_slide();
        }

        this.broadcastHighlight(0);
        setTimeout(() => { this._isAdvancing = false; }, 300);
        return;
      }
    }

    // 2. Check line highlighting on current slide
    if (curSlide && curSlide.lines && curSlide.lines.length > 0) {
      const firstTime = curSlide.lines[0].time;

      // RULE: The first line of the slide should NOT be automatically highlighted.
      // It should only highlight when its timestamp is reached!
      if (firstTime !== null && curTime < firstTime) {
        if (this.activeLineIndex !== -1) {
          this.activeLineIndex = -1;
          this.broadcastHighlight(-1);
        }
        return;
      }

      // Find active line on current slide
      let matchedLineIdx = -1;
      for (let i = 0; i < curSlide.lines.length; i++) {
        const line = curSlide.lines[i];
        if (line.time !== null && curTime >= line.time) {
          matchedLineIdx = i;
        }
      }

      if (matchedLineIdx !== this.activeLineIndex) {
        this.activeLineIndex = matchedLineIdx;
        this.broadcastHighlight(this.activeLineIndex);
      }
    }
  }

  /**
   * Broadcast line highlight to Projection Window, Preview, and Remote
   */
  broadcastHighlight(lineIndex) {
    const theme = (typeof window !== "undefined" && window.themeManager) ? window.themeManager.getStyleBundle("songs") : null;
    const activeColor = (theme && theme.syncActiveColor) || "#F59E0B";
    const inactiveColor = (theme && theme.syncInactiveColor) || "#94A3B8";

    // 1. Local Electron popup window direct call
    if (typeof newWindow !== "undefined" && newWindow && newWindow.window && !newWindow.window.closed) {
      try {
        const win = newWindow.window;
        win.p_sync_enabled = this.syncEnabled;
        win.p_sync_active_line_index = lineIndex;
        win.p_sync_active_color = activeColor;
        win.p_sync_inactive_color = inactiveColor;
        if (typeof win.applySongLineHighlight === "function") {
          win.applySongLineHighlight(lineIndex, this.syncEnabled);
        }
      } catch (e) {}
    }

    // 2. Cross-window HTML5 BroadcastChannel
    if (typeof BroadcastChannel !== "undefined") {
      try {
        if (!this._bc) this._bc = new BroadcastChannel("uecfi_presentation_channel");
        this._bc.postMessage({
          type: "HIGHLIGHT_LINE",
          payload: {
            lineIndex: lineIndex,
            syncEnabled: this.syncEnabled,
            activeColor: activeColor,
            inactiveColor: inactiveColor
          }
        });
      } catch (e) {}
    }

    // 3. Local Sidebar Preview
    const previewFrame = (typeof document !== "undefined") ? (document.getElementById("p_previewFrame") || document.getElementById("sidebarPreviewFrame")) : null;
    if (previewFrame && previewFrame.contentWindow) {
      try {
        const cw = previewFrame.contentWindow;
        cw.p_sync_enabled = this.syncEnabled;
        cw.p_sync_active_line_index = lineIndex;
        if (typeof cw.applySongLineHighlight === "function") {
          cw.applySongLineHighlight(lineIndex, this.syncEnabled);
        }
      } catch (e) {}
    }
  }

  /**
   * Broadcast syncEnabled state change
   */
  broadcastSyncState() {
    this.broadcastHighlight(this.syncEnabled ? this.activeLineIndex : -1);
  }

  _updateUIState() {
    if (typeof document === "undefined") return;
    // Play/Pause icon
    const playIcon = document.getElementById("songAudioPlayIcon");
    if (playIcon) {
      playIcon.className = this.isPlaying ? "fa-solid fa-pause" : "fa-solid fa-play";
    }

    // Quick toggle buttons (both toolbar and audio bar)
    const toggleBtn = document.getElementById("songAudioQuickToggle");
    const toggleLabel = document.getElementById("songAudioQuickToggleLabel");
    if (toggleBtn && toggleLabel) {
      if (this.syncEnabled) {
        toggleBtn.className = "px-2.5 py-1 rounded-lg text-xs font-bold transition flex items-center gap-1.5 bg-emerald-600 text-white hover:bg-emerald-500 cursor-pointer";
        toggleLabel.textContent = "Sync: ON";
      } else {
        toggleBtn.className = "px-2.5 py-1 rounded-lg text-xs font-bold transition flex items-center gap-1.5 bg-slate-600 text-slate-300 hover:bg-slate-500 cursor-pointer";
        toggleLabel.textContent = "Sync: OFF";
      }
    }

    const toolbarToggleText = document.getElementById("toolbarSongSyncText");
    const toolbarToggleBtn = document.getElementById("btnToolbarSongSync");
    if (toolbarToggleText && toolbarToggleBtn) {
      if (this.syncEnabled) {
        toolbarToggleText.textContent = "Sync ON";
        toolbarToggleBtn.className = "px-2.5 py-1.5 text-xs font-bold text-emerald-700 bg-emerald-50 hover:bg-emerald-100 border border-emerald-300 rounded-lg transition flex items-center gap-1.5";
      } else {
        toolbarToggleText.textContent = "Sync OFF";
        toolbarToggleBtn.className = "px-2.5 py-1.5 text-xs font-semibold text-slate-500 bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-lg transition flex items-center gap-1.5";
      }
    }
  }

  _updateTimeDisplay() {
    if (typeof document === "undefined") return;
    const curEl = document.getElementById("songAudioCurrentTime");
    const durEl = document.getElementById("songAudioDuration");
    const scrubEl = document.getElementById("songAudioScrubber");

    const cur = this.audio.currentTime || 0;
    const dur = this.audio.duration || 0;

    if (curEl) curEl.textContent = this.formatTime(cur);
    if (durEl) durEl.textContent = this.formatTime(dur);

    if (scrubEl && dur > 0 && !this._scrubbing) {
      scrubEl.value = (cur / dur) * 100;
    }
  }

  _updateSongTitleUI(title) {
    if (typeof document === "undefined") return;
    const titleEl = document.getElementById("songAudioTitle");
    if (titleEl) {
      titleEl.textContent = title || "Song Audio";
    }
  }
}

// Global Singleton
if (typeof window !== "undefined") {
  window.songAudioEngine = new SongAudioEngine();
}
if (typeof module !== "undefined" && module.exports) {
  module.exports = SongAudioEngine;
}
