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
    this.allTimedLines = [];
    this.activeGlobalLineIndex = -1;
    this.teleprompterFontSize = 56;
    // Lead advance time in milliseconds (0 - 2000ms in 100ms increments)
    this.leadAdvanceMs = 0;
    try {
      if (typeof localStorage !== "undefined") {
        const savedLead = localStorage.getItem("uecfi_song_lead_advance_ms");
        if (savedLead !== null && !isNaN(parseInt(savedLead, 10))) {
          this.leadAdvanceMs = Math.max(0, Math.min(2000, Math.round(parseInt(savedLead, 10) / 100) * 100));
        }
      }
    } catch (e) {}
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
      this.countdownActive = false;
      this.lastCountdownStep = -1;
      this.broadcastCountdown({ active: false });
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
  parseLyricsIntoTimedSlides(lyricsText, slidesArray) {
    let rawParts = [];
    if (Array.isArray(slidesArray) && slidesArray.length > 0) {
      // Check if slidesArray contains timestamps or if lyricsText has them
      const hasTsInSlides = slidesArray.some(s => /\[\s*\d{1,2}:\d{2}/.test(String(s)));
      if (hasTsInSlides || !lyricsText || typeof lyricsText !== "string") {
        rawParts = slidesArray;
      }
    }

    if (rawParts.length === 0 && lyricsText && typeof lyricsText === "string") {
      if (lyricsText.includes("<slide>")) {
        rawParts = lyricsText.split(/<slide>/gi).map(p => p.trim()).filter(p => p.length > 0);
      } else {
        rawParts = lyricsText.split(/\n\s*\n/).map(p => p.trim()).filter(p => p.length > 0);
      }
    }

    return rawParts.map((part, slideIdx) => {
      const normalized = String(part)
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
          cleanText = tsMatch[2] ? tsMatch[2].replace(/^(\[\s*\d{1,2}:\d{2}(?:[.:]\d{1,3})?\s*\]\s*)+/, "").trim() : "";
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

    const hasAudio = !!(songObj.audio && String(songObj.audio).trim() !== "");
    const fileName = hasAudio ? String(songObj.audio).trim() : "";

    // If audio is ALREADY playing for this exact audio file, NEVER reload, re-seek, or restart it!
    // Seamlessly update currentSong and notify slide change without stuttering audio.
    if (hasAudio && this.isPlaying && this.audio && !this.audio.paused && this.audio.getAttribute("data-current-src") === fileName) {
      this.currentSong = songObj;
      const targetIdx = (typeof slideIndex === "number" && slideIndex >= 0) ? slideIndex : this.currentSlideIndex;
      this.onSlideChanged(targetIdx);
      return;
    }

    this.currentSong = songObj;
    this.currentSlideIndex = (typeof slideIndex === "number" && slideIndex >= 0) ? slideIndex : 0;
    this.activeLineIndex = -1;
    this._isAdvancing = false;

    // Parse lyrics for timestamps
    const rawLyrics = songObj.lyrics || (Array.isArray(songObj.slides) ? songObj.slides.join("<slide>") : "");
    this.timedSlides = this.parseLyricsIntoTimedSlides(rawLyrics, songObj.slides);

    // Build flattened list of all timed lines for continuous 5-line scrolling teleprompter mode
    this.allTimedLines = [];
    if (Array.isArray(this.timedSlides)) {
      this.timedSlides.forEach((slide) => {
        if (slide && Array.isArray(slide.lines)) {
          slide.lines.forEach((l) => {
            this.allTimedLines.push({
              globalIndex: this.allTimedLines.length,
              slideIndex: slide.slideIndex,
              time: l.time,
              cleanText: l.cleanText,
              rawText: l.rawText
            });
          });
        }
      });
    }
    this.activeGlobalLineIndex = -1;

    // First timed line for visual countdown dots at beginning of song
    const firstTimed = this.allTimedLines ? this.allTimedLines.find(l => typeof l.time === "number" && l.time > 0) : null;
    this.firstLineTime = firstTimed ? firstTimed.time : (this.timedSlides && this.timedSlides[0] && typeof this.timedSlides[0].firstLineTime === "number" ? this.timedSlides[0].firstLineTime : null);
    this.countdownActive = false;
    this.lastCountdownStep = -1;

    // Resolve per-song teleprompter font size (defaults to 56px, or restored from song storage)
    const rawName = String(songObj.name || songObj.title || "").trim();
    const songKey = rawName.toLowerCase();
    let savedFS = null;
    if (typeof localStorage !== "undefined") {
      try {
        if (songObj.id != null) savedFS = localStorage.getItem("uecfi_song_fontsize_id_" + songObj.id);
        if (!savedFS && songKey) savedFS = localStorage.getItem("uecfi_song_fontsize_" + songKey);
        if (!savedFS && rawName) savedFS = localStorage.getItem("uecfi_song_fontsize_" + rawName);
      } catch (e) {}
    }
    if (!savedFS && songObj.teleprompterFontSize) {
      savedFS = songObj.teleprompterFontSize;
    }
    this.teleprompterFontSize = savedFS ? Math.max(24, Math.min(140, Number(savedFS))) : 56;
    this.updateFontSizeUI();

    // Resolve lead advance time (0 - 2000ms in 100ms increments)
    let savedLead = null;
    if (typeof localStorage !== "undefined") {
      try {
        if (songObj.id != null) savedLead = localStorage.getItem("uecfi_song_lead_id_" + songObj.id);
        if (!savedLead && songKey) savedLead = localStorage.getItem("uecfi_song_lead_" + songKey);
        if (!savedLead && rawName) savedLead = localStorage.getItem("uecfi_song_lead_" + rawName);
        if (!savedLead) savedLead = localStorage.getItem("uecfi_song_lead_advance_ms");
      } catch (e) {}
    }
    if (!savedLead && songObj.leadAdvanceMs != null) {
      savedLead = songObj.leadAdvanceMs;
    }
    if (savedLead != null && !isNaN(parseInt(savedLead, 10))) {
      this.leadAdvanceMs = Math.max(0, Math.min(2000, Math.round(parseInt(savedLead, 10) / 100) * 100));
    }

    const barEl = (typeof document !== "undefined") ? document.getElementById("songAudioBar") : null;

    if (hasAudio) {
      if (barEl) barEl.style.display = "flex";
      this._updateSongTitleUI(songObj.name || songObj.title || "");

      // Resolve audio URL
      const fileName = String(songObj.audio).trim();
      let audioSrc = fileName;
      if (!fileName.startsWith("./") && !fileName.startsWith("/") && !fileName.startsWith("http:") && !fileName.startsWith("https:") && !fileName.startsWith("file:")) {
        audioSrc = `./audio/${encodeURIComponent(fileName)}`;
      }

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
   * Seek audio and teleprompter to the first line of a specific slide
   */
  seekToSlide(slideIndex) {
    if (!this.allTimedLines || this.allTimedLines.length === 0) return;
    const targetLine = this.allTimedLines.find(l => l.slideIndex === slideIndex && l.time !== null);
    if (targetLine && targetLine.time !== null && this.audio) {
      this.audio.currentTime = Math.max(0, targetLine.time);
      this.activeGlobalLineIndex = targetLine.globalIndex;
      this.activeLineIndex = targetLine.globalIndex;
      this.currentSlideIndex = slideIndex;
      this.broadcastHighlight(this.activeGlobalLineIndex);
    }
  }

  /**
   * Slide changed externally (e.g. manual Next/Prev or slide click)
   */
  onSlideChanged(newSlideIndex) {
    this.currentSlideIndex = newSlideIndex;
    if (this.allTimedLines && this.allTimedLines.length > 0) {
      this.seekToSlide(newSlideIndex);
      return;
    }
    this.activeLineIndex = -1;

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
    this.activeGlobalLineIndex = -1;
    this.countdownActive = false;
    this.lastCountdownStep = -1;
    this.allTimedLines = [];
    this.currentSong = null;
    this.timedSlides = [];
    this.broadcastCountdown({ active: false });
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
    this.activeGlobalLineIndex = -1;
    this.countdownActive = false;
    this.lastCountdownStep = -1;
    this.broadcastCountdown({ active: false });
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

  /**
   * Adjust teleprompter font size relative to current value (e.g. +4 or -4)
   * This is a control for the main projection screen; remote displays scale automatically.
   */
  adjustFontSize(delta) {
    const current = this.teleprompterFontSize || 56;
    this.setFontSize(current + delta);
  }

  /**
   * Set and persist teleprompter font size for the active song (clamped between 24px and 140px)
   */
  setFontSize(newSize) {
    const clamped = Math.max(24, Math.min(140, Math.round(Number(newSize) || 56)));
    this.teleprompterFontSize = clamped;

    // Persist per song (by normalized title and by id)
    if (this.currentSong && (this.currentSong.name || this.currentSong.title)) {
      const rawName = String(this.currentSong.name || this.currentSong.title).trim();
      const songKey = rawName.toLowerCase();
      if (typeof localStorage !== "undefined") {
        try {
          if (songKey) localStorage.setItem("uecfi_song_fontsize_" + songKey, String(clamped));
          if (rawName) localStorage.setItem("uecfi_song_fontsize_" + rawName, String(clamped));
          if (this.currentSong.id != null) localStorage.setItem("uecfi_song_fontsize_id_" + this.currentSong.id, String(clamped));
        } catch (e) {}
      }
      this.currentSong.teleprompterFontSize = clamped;
    }

    this.updateFontSizeUI();
    this.broadcastTeleprompterFontSize(clamped);
  }

  /**
   * Get active lead advance time in milliseconds (0 - 2000ms)
   */
  getLeadAdvanceMs() {
    return this.leadAdvanceMs || 0;
  }

  /**
   * Set and persist lead advance time in milliseconds (0 - 2000ms, in increments of 100ms)
   */
  setLeadAdvanceMs(ms) {
    const parsed = parseInt(ms, 10);
    const valid = !isNaN(parsed) ? parsed : 0;
    const clamped = Math.max(0, Math.min(2000, Math.round(valid / 100) * 100));
    this.leadAdvanceMs = clamped;

    if (typeof localStorage !== "undefined") {
      try {
        localStorage.setItem("uecfi_song_lead_advance_ms", String(clamped));
        if (this.currentSong && (this.currentSong.name || this.currentSong.title)) {
          const rawName = String(this.currentSong.name || this.currentSong.title).trim();
          const songKey = rawName.toLowerCase();
          if (songKey) localStorage.setItem("uecfi_song_lead_" + songKey, String(clamped));
          if (rawName) localStorage.setItem("uecfi_song_lead_" + rawName, String(clamped));
          if (this.currentSong.id != null) localStorage.setItem("uecfi_song_lead_id_" + this.currentSong.id, String(clamped));
        }
      } catch (e) {}
    }

    if (this.currentSong) {
      this.currentSong.leadAdvanceMs = clamped;
    }

    return this.leadAdvanceMs;
  }

  /**
   * Update the font size indicator on the floating Song Audio bar
   */
  updateFontSizeUI() {
    const disp = (typeof document !== "undefined") ? document.getElementById("songAudioFontSizeDisplay") : null;
    if (disp) {
      disp.textContent = `${this.teleprompterFontSize || 56}px`;
    }
  }

  /**
   * Broadcast teleprompter font size change to projector window, preview monitor, and remote displays
   */
  broadcastTeleprompterFontSize(fontSize) {
    // 1. Direct window calls (Projector)
    if (typeof newWindow !== "undefined" && newWindow && newWindow.window && !newWindow.window.closed) {
      try {
        const win = newWindow.window;
        win.p_teleprompter_font_size = fontSize;
        if (typeof win.renderTeleprompter === "function" && win.p_teleprompter_mode && win.p_teleprompter_lines) {
          win.renderTeleprompter(win.p_teleprompter_lines, win.p_sync_active_line_index, fontSize);
        }
      } catch (e) {}
    }

    // 2. Local Sidebar Preview Frame
    const previewFrame = (typeof document !== "undefined") ? (document.getElementById("livePreviewFrame") || document.getElementById("p_previewFrame") || document.getElementById("sidebarPreviewFrame")) : null;
    if (previewFrame && previewFrame.contentWindow) {
      try {
        const cw = previewFrame.contentWindow;
        cw.p_teleprompter_font_size = fontSize;
        if (typeof cw.renderTeleprompter === "function" && cw.p_teleprompter_mode && cw.p_teleprompter_lines) {
          cw.renderTeleprompter(cw.p_teleprompter_lines, cw.p_sync_active_line_index, fontSize);
        }
      } catch (e) {}
    }

    // 3. Cross-window HTML5 BroadcastChannel
    if (typeof BroadcastChannel !== "undefined") {
      try {
        if (!this._bc) this._bc = new BroadcastChannel("uecfi_presentation_channel");
        this._bc.postMessage({
          type: "SET_TELEPROMPTER_FONT_SIZE",
          payload: { fontSize: fontSize }
        });
      } catch (e) {}
    }
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
    // Lead advance offset in seconds (e.g. 500ms -> 0.5s) to advance lines ahead of singing
    const advanceSec = (this.leadAdvanceMs || 0) / 1000.0;
    const effectiveTime = curTime + advanceSec;

    // 1. Continuous 5-line scrolling teleprompter mode for audio-synced songs:
    // Instead of jumping across disjoint slides, the lines glide up smoothly and continuously,
    // keeping the active singing line dead-center in the 5-line window with zero audio stutter!
    if (this.allTimedLines && this.allTimedLines.length > 0) {
      let matchedIdx = -1;
      for (let i = 0; i < this.allTimedLines.length; i++) {
        const line = this.allTimedLines[i];
        if (line.time !== null && effectiveTime >= line.time) {
          matchedIdx = i;
        }
      }

      // Check visual countdown dots at the beginning of timed songs
      if (matchedIdx < 0 && typeof this.firstLineTime === "number" && this.firstLineTime > 0.4) {
        const remaining = this.firstLineTime - effectiveTime;
        if (remaining > 0) {
          const countdownWindow = Math.min(4.0, this.firstLineTime);
          let step = 0;
          if (remaining <= countdownWindow) {
            const elapsed = countdownWindow - remaining;
            const progress = elapsed / countdownWindow; // 0.0 to 1.0
            step = Math.min(4, Math.floor(progress * 4) + 1);
          }
          if (step !== this.lastCountdownStep || !this.countdownActive) {
            this.countdownActive = true;
            this.lastCountdownStep = step;
            const remainingDots = (step === 0) ? 4 : Math.max(1, 5 - step);
            this.broadcastCountdown({
              active: true,
              step: step,
              remainingDots: remainingDots,
              total: 4,
              remaining: remaining
            });
          }
        }
      } else if (this.countdownActive) {
        this.countdownActive = false;
        this.lastCountdownStep = -1;
        this.broadcastCountdown({ active: false, step: 0, total: 4 });
      }

      if (matchedIdx !== this.activeGlobalLineIndex) {
        this.activeGlobalLineIndex = matchedIdx;
        this.activeLineIndex = matchedIdx;
        this.broadcastHighlight(this.activeGlobalLineIndex);

        // Keep the controller slide card highlighted based on which slide this line belongs to
        if (matchedIdx >= 0 && this.allTimedLines[matchedIdx]) {
          const sIdx = this.allTimedLines[matchedIdx].slideIndex;
          if (sIdx !== this.currentSlideIndex) {
            this.currentSlideIndex = sIdx;
            if (typeof window !== "undefined") {
              window.presentedSlideIdx = sIdx;
              if (window.liveSongState) window.liveSongState.index = sIdx;
              if (typeof window.updateSongSlideHighlight === "function") {
                window.updateSongSlideHighlight();
              }
            }
          }
        }
      }
      return;
    }

    const curSlide = this.timedSlides[this.currentSlideIndex];
    const nextSlide = this.timedSlides[this.currentSlideIndex + 1];

    // 1. Check if we should auto-advance to next slide
    let shouldAdvance = false;
    if (nextSlide && !this._isAdvancing) {
      if (nextSlide.firstLineTime !== null && effectiveTime >= nextSlide.firstLineTime) {
        shouldAdvance = true;
      } else if (nextSlide.firstLineTime === null) {
        // If the immediate next slide has no timestamps (e.g. instrumental or title slide),
        // check if any future slide timestamp has arrived
        for (let i = this.currentSlideIndex + 2; i < this.timedSlides.length; i++) {
          const futureSlide = this.timedSlides[i];
          if (futureSlide && futureSlide.firstLineTime !== null && effectiveTime >= futureSlide.firstLineTime) {
            shouldAdvance = true;
            break;
          }
        }
        // Or if current slide had timestamps and finished more than 3.5 seconds ago
        if (!shouldAdvance && curSlide && curSlide.lastLineTime !== null && curTime >= (curSlide.lastLineTime + 3.5)) {
          shouldAdvance = true;
        }
      }
    }

    if (shouldAdvance && !this._isAdvancing) {
      this._isAdvancing = true;
      const targetSlideIndex = this.currentSlideIndex + 1;

      // Trigger slide transition on presenter
      let stepped = false;

      // A. Check if live Program item is active
      if (typeof window !== "undefined" && window.liveProgramActive && window.programManager && typeof window.programManager.nextSlide === "function") {
        try {
          window.programManager.nextSlide();
          stepped = true;
        } catch (e) {
          console.warn("[SongAudioEngine] programManager.nextSlide failed:", e);
        }
      }

      // B. Songs tab / Live monitor presentation
      if (!stepped) {
        if (typeof call_nextSlide === "function") {
          try {
            stepped = call_nextSlide();
          } catch (e) {}
        }
        if (!stepped && typeof stepLiveSong === "function") {
          try {
            stepped = stepLiveSong(1);
          } catch (e) {}
        }
        if (!stepped && typeof stepLiveMonitor === "function") {
          try {
            stepped = stepLiveMonitor(1);
          } catch (e) {}
        }
      }

      // Ensure engine slide index is updated if presenter haven't synced it yet
      if (this.currentSlideIndex < targetSlideIndex) {
        this.currentSlideIndex = targetSlideIndex;
      }

      // Line highlighting for the new slide
      const newSlide = this.timedSlides[this.currentSlideIndex];
      let newActiveLineIdx = -1;
      if (newSlide && newSlide.lines && newSlide.lines.length > 0) {
        newSlide.lines.forEach((l, idx) => {
          if (l.time !== null && effectiveTime >= l.time) {
            newActiveLineIdx = idx;
          }
        });
      }
      if (this.activeLineIndex !== newActiveLineIdx) {
        this.activeLineIndex = newActiveLineIdx;
        this.broadcastHighlight(this.activeLineIndex);
      }

      setTimeout(() => {
        this._isAdvancing = false;
      }, 300);
      return;
    }

    // 2. Check line highlighting on current slide
    if (curSlide && curSlide.lines && curSlide.lines.length > 0) {
      const firstTime = curSlide.lines[0].time;

      // RULE: The first line of the slide should NOT be automatically highlighted.
      // It should only highlight when its timestamp is reached!
      if (firstTime !== null && effectiveTime < firstTime) {
        if (this.currentSlideIndex === 0 && firstTime > 0.4) {
          const remaining = firstTime - effectiveTime;
          const countdownWindow = Math.min(4.0, firstTime);
          let step = 0;
          if (remaining <= countdownWindow && remaining > 0) {
            const elapsed = countdownWindow - remaining;
            const progress = elapsed / countdownWindow;
            step = Math.min(4, Math.floor(progress * 4) + 1);
          }
          if (step !== this.lastCountdownStep || !this.countdownActive) {
            this.countdownActive = true;
            this.lastCountdownStep = step;
            const remainingDots = (step === 0) ? 4 : Math.max(1, 5 - step);
            this.broadcastCountdown({
              active: true,
              step: step,
              remainingDots: remainingDots,
              total: 4,
              remaining: remaining
            });
          }
        }
        if (this.activeLineIndex !== -1) {
          this.activeLineIndex = -1;
          this.broadcastHighlight(-1);
        }
        return;
      } else if (this.countdownActive) {
        this.countdownActive = false;
        this.lastCountdownStep = -1;
        this.broadcastCountdown({ active: false, step: 0, total: 4 });
      }

      // Find active line on current slide
      let matchedLineIdx = -1;
      for (let i = 0; i < curSlide.lines.length; i++) {
        const line = curSlide.lines[i];
        if (line.time !== null && effectiveTime >= line.time) {
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
    let theme = null;
    if (typeof window !== "undefined" && window.themeManager) {
      if (typeof window.themeManager.getStyleBundle === "function") {
        theme = window.themeManager.getStyleBundle("songs");
      } else if (typeof window.themeManager.getStyleForContext === "function") {
        theme = window.themeManager.getStyleForContext("songs");
      }
    }
    const activeColor = (theme && theme.syncActiveColor) || "#F59E0B";
    const inactiveColor = (theme && theme.syncInactiveColor) || "#94A3B8";

    const curSong = this.currentSong;
    const songNameKey = (curSong && curSong.name) ? curSong.name.trim().toLowerCase() : "";
    const activeOutlineEnabled = Boolean(
      (curSong && curSong.activeOutlineEnabled) ||
      (theme && theme.syncActiveOutlineEnabled) ||
      (typeof localStorage !== "undefined" && songNameKey && localStorage.getItem("uecfi_song_outline_enabled_" + songNameKey) === "true")
    );
    const activeOutlineColor = (curSong && curSong.activeOutlineEnabled && curSong.activeOutlineColor)
      || (theme && theme.syncActiveOutlineColor)
      || (typeof localStorage !== "undefined" && songNameKey ? localStorage.getItem("uecfi_song_outline_color_" + songNameKey) : null)
      || (curSong && curSong.activeOutlineColor)
      || "#000000";
    const activeOutlineThickness = (curSong && curSong.activeOutlineEnabled && typeof curSong.activeOutlineThickness === "number")
      ? curSong.activeOutlineThickness
      : ((theme && typeof theme.syncActiveOutlineThickness === "number")
        ? theme.syncActiveOutlineThickness
        : (typeof localStorage !== "undefined" && songNameKey && localStorage.getItem("uecfi_song_outline_thick_" + songNameKey) ? Number(localStorage.getItem("uecfi_song_outline_thick_" + songNameKey)) : 2));

    // 1. Local Electron popup window direct call
    if (typeof newWindow !== "undefined" && newWindow && newWindow.window && !newWindow.window.closed) {
      try {
        const win = newWindow.window;
        win.p_sync_enabled = this.syncEnabled;
        win.p_sync_active_line_index = lineIndex;
        win.p_sync_active_color = activeColor;
        win.p_sync_inactive_color = inactiveColor;
        win.p_sync_active_outline_enabled = activeOutlineEnabled;
        win.p_sync_active_outline_color = activeOutlineColor;
        win.p_sync_active_outline_thickness = activeOutlineThickness;
        if (win.p_teleprompter_mode && typeof win.updateTeleprompterActiveLine === "function") {
          win.updateTeleprompterActiveLine(lineIndex);
        } else if (typeof win.applySongLineHighlight === "function") {
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
            inactiveColor: inactiveColor,
            activeOutlineEnabled: activeOutlineEnabled,
            activeOutlineColor: activeOutlineColor,
            activeOutlineThickness: activeOutlineThickness
          }
        });
      } catch (e) {}
    }

    // 3. Local Sidebar Preview
    const previewFrame = (typeof document !== "undefined") ? (document.getElementById("livePreviewFrame") || document.getElementById("p_previewFrame") || document.getElementById("sidebarPreviewFrame")) : null;
    if (previewFrame && previewFrame.contentWindow) {
      try {
        const cw = previewFrame.contentWindow;
        cw.p_sync_enabled = this.syncEnabled;
        cw.p_sync_active_line_index = lineIndex;
        cw.p_sync_active_color = activeColor;
        cw.p_sync_inactive_color = inactiveColor;
        cw.p_sync_active_outline_enabled = activeOutlineEnabled;
        cw.p_sync_active_outline_color = activeOutlineColor;
        cw.p_sync_active_outline_thickness = activeOutlineThickness;
        if (cw.p_teleprompter_mode && typeof cw.updateTeleprompterActiveLine === "function") {
          cw.updateTeleprompterActiveLine(lineIndex);
        } else if (typeof cw.applySongLineHighlight === "function") {
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

  /**
   * Broadcast visual countdown dots to projection window, preview frame, and remote displays
   */
  broadcastCountdown(info) {
    let theme = null;
    if (typeof window !== "undefined" && window.themeManager) {
      if (typeof window.themeManager.getStyleBundle === "function") {
        theme = window.themeManager.getStyleBundle("songs");
      } else if (typeof window.themeManager.getStyleForContext === "function") {
        theme = window.themeManager.getStyleForContext("songs");
      }
    }
    const activeColor = (theme && theme.syncActiveColor) || "#F59E0B";
    const inactiveColor = (theme && theme.syncInactiveColor) || "#94A3B8";

    const payload = {
      active: !!info.active,
      step: typeof info.step === "number" ? info.step : 0,
      total: 4,
      remaining: typeof info.remaining === "number" ? info.remaining : 0,
      activeColor: activeColor,
      inactiveColor: inactiveColor
    };

    // 1. Local Electron popup window direct call
    if (typeof newWindow !== "undefined" && newWindow && newWindow.window && !newWindow.window.closed) {
      try {
        const win = newWindow.window;
        if (typeof win.updateSongCountdown === "function") {
          win.updateSongCountdown(payload);
        }
      } catch (e) {}
    }

    // 2. Cross-window HTML5 BroadcastChannel
    if (typeof BroadcastChannel !== "undefined") {
      try {
        if (!this._bc) this._bc = new BroadcastChannel("uecfi_presentation_channel");
        this._bc.postMessage({
          type: "COUNTDOWN_UPDATE",
          payload: payload
        });
      } catch (e) {}
    }

    // 3. Local Sidebar Preview Frame
    const previewFrame = (typeof document !== "undefined")
      ? (document.getElementById("livePreviewFrame") || document.getElementById("p_previewFrame") || document.getElementById("sidebarPreviewFrame"))
      : null;
    if (previewFrame && previewFrame.contentWindow) {
      try {
        const cw = previewFrame.contentWindow;
        if (typeof cw.updateSongCountdown === "function") {
          cw.updateSongCountdown(payload);
        }
      } catch (e) {}
    }

    // 4. Update operator control bar countdown dots
    this._updateAudioBarCountdown(payload);
  }

  /**
   * Returns current countdown state for webserver remote state API
   */
  getCountdownState() {
    const step = this.lastCountdownStep >= 0 ? this.lastCountdownStep : 0;
    return {
      active: !!this.countdownActive,
      step: step,
      remainingDots: (step === 0) ? 4 : Math.max(1, 5 - step),
      total: 4
    };
  }

  /**
   * Update visual countdown dots on operator song transport bar
   * Dots disappear one at a time from right to left
   */
  _updateAudioBarCountdown(payload) {
    if (typeof document === "undefined") return;
    const barDotsContainer = document.getElementById("songAudioCountdownDots");
    if (!barDotsContainer) return;

    if (!payload || !payload.active) {
      barDotsContainer.style.display = "none";
      return;
    }

    barDotsContainer.style.display = "flex";
    const dots = barDotsContainer.querySelectorAll("[data-bar-dot]");
    const step = payload.step || 0;
    const remainingDots = (typeof payload.remainingDots === "number")
      ? payload.remainingDots
      : (step === 0 ? 4 : Math.max(1, 5 - step));

    dots.forEach((dot, idx) => {
      if (idx < remainingDots) {
        // Dot is still visible (right-to-left countdown)
        dot.className = (idx === remainingDots - 1 && step > 0)
          ? "w-2 h-2 rounded-full bg-amber-400 shadow-sm scale-125 transition-all duration-150"
          : "w-2 h-2 rounded-full bg-amber-400 shadow-sm scale-100 transition-all duration-150";
        dot.style.opacity = (step === 0) ? "0.65" : "1";
        dot.style.visibility = "visible";
      } else {
        // Dot has disappeared from right to left
        dot.className = "w-2 h-2 rounded-full bg-slate-600 scale-50 transition-all duration-150";
        dot.style.opacity = "0";
        dot.style.visibility = "hidden";
      }
    });
  }

  _updateUIState() {
    if (typeof document === "undefined") return;
    // Play/Pause icon
    const playIcon = document.getElementById("songAudioPlayIcon");
    if (playIcon) {
      playIcon.className = this.isPlaying ? "fa-solid fa-pause" : "fa-solid fa-play";
    }

    // Quick toggle buttons (both song preview panel and floating audio bar)
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

    // Song Preview Panel sync button (beside the Present button in song preview)
    const previewToggleBtn = document.getElementById("btnSongPreviewSync");
    const previewToggleText = document.getElementById("songPreviewSyncText");
    if (previewToggleBtn && previewToggleText) {
      if (this.syncEnabled) {
        previewToggleText.textContent = "Sync ON";
        previewToggleBtn.className = "px-3 py-1.5 text-xs font-bold text-emerald-700 bg-emerald-50 hover:bg-emerald-100 border border-emerald-300 rounded-lg transition flex items-center gap-1.5 cursor-pointer shadow-2xs";
      } else {
        previewToggleText.textContent = "Sync OFF";
        previewToggleBtn.className = "px-3 py-1.5 text-xs font-semibold text-slate-500 bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-lg transition flex items-center gap-1.5 cursor-pointer shadow-2xs";
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
