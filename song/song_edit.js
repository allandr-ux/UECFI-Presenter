function songEditClass() {
  this.init = M;
  this.showEditPanel = j;
  this.setEditPrimaryKey = A;
  this.handleAudioUpload = handleAudioUpload;
  this.toggleAudioPreview = toggleAudioPreview;
  this.removeAudio = removeAudio;
  this.openTapSyncModal = openTapSyncModal;

  var b = false; // edit flag (false = new song, true = update song)
  var o = -1;    // edit index
  var m = -1;    // primary key ID
  var q = false; // trace flag
  var f = "";    // template HTML
  var h = null;  // panel dialog object
  var z = null;  // legacy TabView dummy
  var currentSongObj = null; // song being edited
  var n = "";    // new category cache
  var s = 0;     // selected category index
  var e = ["Arial", "Times New Roman", "Calibri"];
  var d = 0;     // selected font index
  var k = 3;

  function M(P) {
    v("Initialize Song Edit Panel");
    e = ["Arial", "Times New Roman", "Calibri"];
    f = P;
    G();
    l();
    F();
    O();
  }

  function G() {
    v("Generating Panel");
    h = new AppUI.Modal("panelObj");
    h.render(document.body);
    h.setHeader("Add / Edit Song");
    h.setBody(f);
    h.hide();
  }

  function O() {
    v("Generating Events");

    // Add / Delete / Create legacy slide buttons (safely bind if element exists)
    var btnAddSlide = document.getElementById("songEdit_addSlideButtonID");
    if (btnAddSlide) btnAddSlide.addEventListener("click", E, false);
    var btnDelSlide = document.getElementById("songEdit_deleteSlideButtonID");
    if (btnDelSlide) btnDelSlide.addEventListener("click", B, false);
    var btnCreateSlides = document.getElementById("songEdit_createSlidesButtonID");
    if (btnCreateSlides) btnCreateSlides.addEventListener("click", y, false);

    // Categories
    var btnAddCat = document.getElementById("songEdit_addCatButtonID");
    if (btnAddCat) btnAddCat.addEventListener("click", r, false);
    var btnSubmitCat = document.getElementById("se_submitCatButtonID2");
    if (btnSubmitCat) btnSubmitCat.addEventListener("click", a, false);

    // Fonts
    var btnAddFont = document.getElementById("se_addFontButtonID2");
    if (btnAddFont) btnAddFont.addEventListener("click", D, false);
    var btnSubmitFont = document.getElementById("se_submitFontButtonID2");
    if (btnSubmitFont) btnSubmitFont.addEventListener("click", C, false);
    var selFont = document.getElementById("se_fontID2");
    if (selFont) selFont.addEventListener("change", p, false);

    // Lyrics live slide counter
    var lyricsInput = document.getElementById("se_lyricsInput");
    if (lyricsInput) {
      lyricsInput.addEventListener("input", updateSlideCounter, false);
    }

    // Modal action buttons
    var btnPresent = document.getElementById("se_presentID");
    if (btnPresent) btnPresent.addEventListener("click", g, false);
    var btnSave = document.getElementById("songEdit_saveButtonID");
    if (btnSave) btnSave.addEventListener("click", K, false);
    var btnCancel = document.getElementById("songEdit_cancelButtonID");
    if (btnCancel) btnCancel.addEventListener("click", u, false);
  }

  function updateSlideCounter() {
    var lyricsInput = document.getElementById("se_lyricsInput");
    var badgeNumber = document.getElementById("se_slideCountNumber");
    if (!lyricsInput || !badgeNumber) return;

    var text = lyricsInput.value || "";
    var slides = parseLyrics(text);
    var count = slides.length;
    badgeNumber.textContent = count + (count === 1 ? " Slide" : " Slides");
  }

  function parseLyrics(text) {
    if (!text) return [];
    var blocks = text.split(/\r?\n\s*\r?\n+/);
    var slides = [];
    for (var i = 0; i < blocks.length; i++) {
      var trimmed = blocks[i].trim();
      if (trimmed.length > 0) {
        slides.push(trimmed.replace(/\r?\n/g, "<BR>"));
      }
    }
    return slides;
  }

  function A(P) {
    m = P;
  }

  function F() {
    v("Init Slide Tabs (kept for legacy compatibility)");
    var slidesContainer = document.getElementById("se_slides");
    if (slidesContainer) {
      z = new AppUI.Tabs();
      z.appendTo("se_slides");
    }
  }

  function I() {
    if (z && typeof z.getTab === "function") {
      var P = 0;
      var Q = z.getTab(P);
      while (Q != null) {
        z.removeTab(Q);
        Q = z.getTab(P);
      }
    }
    k = 1;
  }

  function J() {
    var R = songManagerObj.get_sm_cat_records();
    if (R.data != null) {
      var Q = R.data.length;
      for (var P = 0; P < Q; P++) {
        if (R.data[P].cat != null) {
          document.getElementById("songnav_category2").options[P] = new Option(R.data[P].cat, P);
        }
      }
    }
  }

  function N(P) {
    var U = new Array();
    var S = songManagerObj.get_sm_cat_records();
    if (S.data != null) {
      var R = S.data.length;
      for (var Q = 0; Q < R; Q++) {
        if (S.data[Q].cat != null) {
          U.push(S.data[Q].cat);
        }
      }
      if (n != "") {
        U.push(n);
      }
      U.sort(function(a, b) {
        return String(a || "").localeCompare(String(b || ""), undefined, { sensitivity: "base" });
      });
    }
    var T = U.length;
    s = 0;
    for (var Q = 0; Q < T; Q++) {
      document.getElementById("songnav_category2").options[Q] = new Option(U[Q], Q);
      if (P == null) {
        if (U[Q] == n) {
          s = Q;
        }
      } else {
        if (U[Q] == P) {
          s = Q;
        }
      }
    }
    n = "";
    document.getElementById("songnav_category2").selectedIndex = s;
  }

  function l(R) {
    var V = songManagerObj.getFontList();
    var Q = new Array();
    var T = null;
    if (V != null) {
      var U = e.length;
      for (var S = U - 1; S >= 0; S--) {
        T = V.indexOf(e[S]);
        if (T != -1) {
          e.splice(S, 1);
        }
      }
      Q = e.concat(V);
    } else {
      Q = e;
    }
    Q.sort(function(a, b) {
      return String(a || "").localeCompare(String(b || ""), undefined, { sensitivity: "base" });
    });
    var W = Q.length;
    clearSelectList("se_fontID2");
    for (var S = 0; S < W; S++) {
      document.getElementById("se_fontID2").options[S] = new Option(Q[S], S);
      if (Q[S] == R) {
        d = S;
      }
    }
    document.getElementById("se_fontID2").selectedIndex = d;
    p();
  }

  function C() {
    var Q = document.getElementById("se_fontTextID").value;
    var P = w(Q);
    if (P) {
      var fontContainer = document.getElementById("se_fontInputContainer");
      if (fontContainer) fontContainer.style.display = "none";
      e.push(Q);
      l(Q);
    }
  }

  function p() {
    var fontSelect = document.getElementById("se_fontID2");
    if (!fontSelect || fontSelect.selectedIndex < 0) return;
    var T = fontSelect.selectedIndex;
    var S = fontSelect.options[T].text;

    // Apply font to unified lyrics textarea
    var lyricsInput = document.getElementById("se_lyricsInput");
    if (lyricsInput) {
      lyricsInput.style.fontFamily = S;
    }
  }

  function w(P) {
    return true;
  }

  // Populate song data into modal
  function c(P) {
    currentSongObj = P;
    // Hide inline add category / font inputs by default
    var catContainer = document.getElementById("se_catInputContainer");
    if (catContainer) catContainer.style.display = "none";
    var fontContainer = document.getElementById("se_fontInputContainer");
    if (fontContainer) fontContainer.style.display = "none";

    if (P != null) {
      document.getElementById("songEdit_NameID").value = P.name || "";
      document.getElementById("se_copyrightID").value = P.copyright || "";
      N(P.catIndex);
      l(P.font);
      document.getElementById("se_keyID").value = P.key || "";
      document.getElementById("se_notesID").value = P.notes || "";

      // Load slides into unified textarea
      var slidesText = "";
      if (P.slides && P.slides.length > 0) {
        slidesText = P.slides.map(function(s) {
          return s.replace(/<BR>/gi, "\n");
        }).join("\n\n");
      }
      var lyricsInput = document.getElementById("se_lyricsInput");
      if (lyricsInput) {
        lyricsInput.value = slidesText;
      }
    } else {
      document.getElementById("songEdit_NameID").value = "";
      document.getElementById("se_copyrightID").value = "";
      N(null);
      l(null);
      document.getElementById("se_keyID").value = "";
      document.getElementById("se_notesID").value = "";
      var lyricsInput = document.getElementById("se_lyricsInput");
      if (lyricsInput) {
        lyricsInput.value = "";
      }
    }

    setAudioUI(P ? (P.audio || "") : "");
    updateSlideCounter();
    p();
  }

  function j(P, Q, R) {
    b = Q;
    o = R;
    m = (P && P.id) ? P.id : null;
    c(P);
    h.setHeader(Q ? "Edit Song" : "Add New Song");
    h.show();
  }

  function r() {
    var catContainer = document.getElementById("se_catInputContainer");
    var catInput = document.getElementById("se_catTextID");
    if (catContainer) {
      catContainer.style.display = catContainer.style.display === "none" ? "flex" : "none";
      if (catContainer.style.display !== "none" && catInput) {
        catInput.value = "";
        catInput.focus();
      }
    }
  }

  function a() {
    var Q = document.getElementById("se_catTextID").value;
    var P = t(Q);
    if (P) {
      var catContainer = document.getElementById("se_catInputContainer");
      if (catContainer) catContainer.style.display = "none";
      n = Q;
      N(null);
    }
  }

  function E() {
    var P = null;
    L(P);
  }

  function L(R) {
    // Kept for backward compatibility
    var lyricsInput = document.getElementById("se_lyricsInput");
    if (lyricsInput && R) {
      if (lyricsInput.value.trim().length > 0) {
        lyricsInput.value += "\n\n" + R;
      } else {
        lyricsInput.value = R;
      }
      updateSlideCounter();
    }
  }

  function y() {
    // Legacy generate slides dialog is no longer needed since the main textarea already supports multi-stanza input,
    // but we can provide focus to the main lyrics textarea.
    var lyricsInput = document.getElementById("se_lyricsInput");
    if (lyricsInput) lyricsInput.focus();
  }

  function B() {
    // Legacy delete slide: remove last stanza if requested
    var lyricsInput = document.getElementById("se_lyricsInput");
    if (!lyricsInput) return;
    var slides = parseLyrics(lyricsInput.value);
    if (slides.length > 1) {
      slides.pop();
      lyricsInput.value = slides.map(function(s) {
        return s.replace(/<BR>/gi, "\n");
      }).join("\n\n");
      updateSlideCounter();
    }
  }

  function D() {
    var fontContainer = document.getElementById("se_fontInputContainer");
    var fontInput = document.getElementById("se_fontTextID");
    if (fontContainer) {
      fontContainer.style.display = fontContainer.style.display === "none" ? "flex" : "none";
      if (fontContainer.style.display !== "none" && fontInput) {
        fontInput.value = "";
        fontInput.focus();
      }
    }
  }

  // Extract songObj from Form
  function H() {
    v("Extract data from Form");
    var X = document.getElementById("songEdit_NameID").value;
    X = X.replace(/^\s+|\s+$/g, "");
    X = X.replace(/\s\s+/g, " ");
    if (X == "") {
      alert("Please enter a valid Song Title");
      return false;
    }

    var U = new songObj();
    U.name = X;

    // Parse lyrics from unified textarea
    var lyricsInput = document.getElementById("se_lyricsInput");
    var lyricsText = lyricsInput ? lyricsInput.value : "";
    var parsedSlides = parseLyrics(lyricsText);

    // If no lyrics entered, keep at least one empty slide to avoid crash
    if (parsedSlides.length === 0) {
      parsedSlides = [""];
    }

    U.slides = parsedSlides;
    U.copyright = document.getElementById("se_copyrightID").value;
    var S = document.getElementById("songnav_category2").selectedIndex;
    if (S >= 0 && document.getElementById("songnav_category2").options[S]) {
      U.catIndex = document.getElementById("songnav_category2").options[S].text;
    } else {
      U.catIndex = "English";
    }

    // Song font defaults cleanly to Arial (or preserves previous font) without requiring user input
    var existingFont = (currentSongObj && currentSongObj.font) ? currentSongObj.font : "Arial";
    var V = document.getElementById("se_fontID2") ? document.getElementById("se_fontID2").selectedIndex : -1;
    if (V >= 0 && document.getElementById("se_fontID2").options[V] && document.getElementById("se_fontID2").options[V].text) {
      U.font = document.getElementById("se_fontID2").options[V].text;
    } else {
      U.font = existingFont;
    }

    U.key = document.getElementById("se_keyID").value;
    U.notes = document.getElementById("se_notesID").value;
    U.audio = (document.getElementById("se_audioFileName") ? document.getElementById("se_audioFileName").value : "") || "";
    if (m != null) U.id = m;
    return U;
  }

  function g() {
    v("Process Present button");
    var Q = H();
    if (Q !== false) {
      var P = new songPresentObj();
      P.init(Q);
      P.present();
    }
  }

  function K() {
    v("Process Save button");
    var P = H();
    if (P !== false) {
      if (!b) {
        songManagerObj.addSong(P, true, false);
        b = true;
      } else {
        songManagerObj.updateSong(P, o, m);
      }
      h.hide();
    }
  }

  function i() {
    var Q = H();
    if (Q !== false) {
      for (var P = 0; P < 200; P++) {
        Q.name = "Test Song_" + P;
        if (!b) {
          songManagerObj.addSong(Q, false, false);
          b = true;
        } else {
          songManagerObj.updateSong(Q, o, m);
        }
      }
    }
  }

  function u() {
    v("Process Cancel button");
    var P = confirm("Do you want to CANCEL from Add/Edit Song panel?");
    if (P) {
      h.hide();
    }
  }

  function x(Q) {
    var P = Q.split('"');
    return P[1];
  }

  function t(P) {
    if (P != "_ALL") {
      return true;
    } else {
      alert("_ALL is reserved Category");
      return false;
    }
  }

  function v(P) {
    if (q) {
      console.log("[SongEdit]...." + P);
    }
  }

  // --- Audio Track & Synchronized Lyrics Helpers ---
  var previewAudioEl = null;

  function setAudioUI(fileName) {
    var fn = String(fileName || "").trim();
    var fnInput = document.getElementById("se_audioFileName");
    if (fnInput) fnInput.value = fn;

    var noAudioWrap = document.getElementById("se_noAudioWrap");
    var audioBadgeWrap = document.getElementById("se_audioBadgeWrap");
    var nameDisplay = document.getElementById("se_audioNameDisplay");

    if (fn) {
      if (noAudioWrap) noAudioWrap.style.display = "none";
      if (audioBadgeWrap) audioBadgeWrap.style.display = "flex";
      if (nameDisplay) nameDisplay.textContent = fn;
    } else {
      if (noAudioWrap) noAudioWrap.style.display = "flex";
      if (audioBadgeWrap) audioBadgeWrap.style.display = "none";
    }
    stopAudioPreview();
  }

  function handleAudioUpload(event) {
    try {
      var input = event ? event.target : null;
      if (!input || !input.files || input.files.length === 0) return;
      var file = input.files[0];
      var fileName = file.name || "";
      if (!fileName) return;

      if (typeof require !== "undefined") {
        try {
          var fs = require("fs");
          var path = require("path");
          var dir1 = path.join(process.cwd(), "audio");
          var dir2 = path.join(process.cwd(), "storage", "audio");
          if (!fs.existsSync(dir1)) fs.mkdirSync(dir1, { recursive: true });
          if (!fs.existsSync(dir2)) fs.mkdirSync(dir2, { recursive: true });

          if (file.path) {
            fs.copyFileSync(file.path, path.join(dir1, fileName));
            fs.copyFileSync(file.path, path.join(dir2, fileName));
          } else {
            var reader = new FileReader();
            reader.onload = function() {
              try {
                var buffer = Buffer.from(reader.result);
                fs.writeFileSync(path.join(dir1, fileName), buffer);
                fs.writeFileSync(path.join(dir2, fileName), buffer);
              } catch (e2) {}
            };
            reader.readAsArrayBuffer(file);
          }
        } catch (err) {
          console.error("[SongEdit] Error copying audio file:", err);
        }
      }

      setAudioUI(fileName);
      if (input) input.value = "";
    } catch (e) {
      console.error("[SongEdit] handleAudioUpload error:", e);
    }
  }

  function toggleAudioPreview() {
    var fnInput = document.getElementById("se_audioFileName");
    var fn = fnInput ? fnInput.value.trim() : "";
    if (!fn) return;

    if (!previewAudioEl) {
      previewAudioEl = new Audio();
    }

    var icon = document.getElementById("se_audioPreviewIcon");
    if (!previewAudioEl.paused) {
      previewAudioEl.pause();
      if (icon) icon.className = "fa-solid fa-play text-[10px]";
    } else {
      previewAudioEl.src = "./audio/" + encodeURIComponent(fn);
      previewAudioEl.play().catch(function() {});
      if (icon) icon.className = "fa-solid fa-pause text-[10px]";
      previewAudioEl.onended = function() {
        if (icon) icon.className = "fa-solid fa-play text-[10px]";
      };
    }
  }

  function stopAudioPreview() {
    if (previewAudioEl) {
      try {
        previewAudioEl.pause();
        previewAudioEl.currentTime = 0;
      } catch (e) {}
      var icon = document.getElementById("se_audioPreviewIcon");
      if (icon) icon.className = "fa-solid fa-play text-[10px]";
    }
  }

  function removeAudio() {
    stopAudioPreview();
    setAudioUI("");
    var fileInput = document.getElementById("se_audioFileInput");
    if (fileInput) fileInput.value = "";
  }

  // Interactive "Tap to Sync" Modal
  function openTapSyncModal() {
    var fnInput = document.getElementById("se_audioFileName");
    var audioFile = fnInput ? fnInput.value.trim() : "";
    if (!audioFile) {
      alert("Please upload or choose an audio file first before tapping timestamps.");
      return;
    }

    var lyricsInput = document.getElementById("se_lyricsInput");
    var rawText = lyricsInput ? lyricsInput.value : "";
    if (!rawText.trim()) {
      alert("Please enter song lyrics first.");
      return;
    }

    // Split lyrics into lines preserving blank line slide separators
    var lines = rawText.split("\n");
    var lineObjects = lines.map(function(l) {
      var trimmed = l.trim();
      var cleanText = trimmed.replace(/^\s*\[\d{1,2}:\d{2}(?:\.\d{1,3})?\]\s*/, "");
      var existingTs = "";
      var match = trimmed.match(/^\[(\d{1,2}:\d{2}(?:\.\d{1,3})?)\]/);
      if (match) existingTs = match[1];
      return {
        original: l,
        clean: cleanText,
        isBlank: (trimmed === "" || trimmed === "."),
        timestamp: existingTs
      };
    });

    var syncAudio = new Audio("./audio/" + encodeURIComponent(audioFile));
    var currentLineIndex = 0;
    while (currentLineIndex < lineObjects.length && lineObjects[currentLineIndex].isBlank) {
      currentLineIndex++;
    }

    var modalId = "uecfi_tap_sync_modal";
    var existingModal = document.getElementById(modalId);
    if (existingModal) existingModal.remove();

    var modalEl = document.createElement("dialog");
    modalEl.id = modalId;
    modalEl.className = "p-0 bg-transparent border-0 rounded-2xl shadow-2xl backdrop:bg-slate-900/80 backdrop:backdrop-blur-xs max-w-xl w-full m-auto overflow-hidden text-slate-800 focus:outline-none";

    function renderLinesHtml() {
      return lineObjects.map(function(lo, idx) {
        if (lo.isBlank) {
          return '<div class="py-1 text-center text-[10px] uppercase font-bold text-slate-400 bg-slate-100/50 rounded my-1">--- Slide Break ---</div>';
        }
        var isCurrent = (idx === currentLineIndex);
        var hasTs = !!lo.timestamp;
        var ringClass = isCurrent ? "ring-2 ring-purple-600 bg-purple-50/70 border-purple-300 font-bold" : (hasTs ? "bg-emerald-50/60 border-emerald-200" : "bg-white border-slate-200");
        return '<div id="syncLineItem_' + idx + '" class="flex items-center justify-between p-2 rounded-lg border ' + ringClass + ' transition">' +
          '<span class="text-xs text-slate-800">' + (lo.clean || "&nbsp;") + '</span>' +
          '<span class="text-[11px] font-mono font-bold ' + (hasTs ? 'text-emerald-700' : 'text-slate-400') + '">' + (lo.timestamp ? '[' + lo.timestamp + ']' : '--:--') + '</span>' +
        '</div>';
      }).join("");
    }

    modalEl.innerHTML = 
      '<div class="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-xl flex flex-col max-h-[88vh] overflow-hidden">' +
        '<div class="flex items-center justify-between px-5 py-3.5 bg-slate-900 text-white shrink-0">' +
          '<div class="flex items-center gap-2">' +
            '<i class="fa-solid fa-stopwatch text-purple-400"></i>' +
            '<h3 class="text-sm font-bold">Tap to Sync Timestamps</h3>' +
          '</div>' +
          '<button type="button" id="tapSyncCloseBtn" class="text-slate-400 hover:text-white text-sm"><i class="fa-solid fa-xmark"></i></button>' +
        '</div>' +

        '<div class="p-4 bg-slate-100 border-b border-slate-200 flex items-center justify-between gap-3 shrink-0">' +
          '<div class="flex items-center gap-3">' +
            '<button type="button" id="tapSyncPlayPause" class="w-9 h-9 rounded-full bg-purple-600 hover:bg-purple-700 text-white flex items-center justify-center transition cursor-pointer">' +
              '<i id="tapSyncPlayIcon" class="fa-solid fa-play text-xs"></i>' +
            '</button>' +
            '<span id="tapSyncTimer" class="text-sm font-mono font-bold text-slate-800">00:00.00</span>' +
          '</div>' +
          '<div class="text-[11px] text-slate-500 font-medium">Press <kbd class="px-1.5 py-0.5 bg-white border border-slate-300 rounded font-bold shadow-xs">SPACE</kbd> or click <b>Stamp Line</b> when each line starts</div>' +
        '</div>' +

        '<div id="tapSyncLinesContainer" class="p-4 overflow-y-auto flex-1 space-y-1.5 bg-slate-50 custom-scrollbar">' +
          renderLinesHtml() +
        '</div>' +

        '<div class="p-3 bg-purple-50/40 border-t border-purple-100 flex items-center justify-center shrink-0">' +
          '<button type="button" id="tapSyncStampBtn" class="w-full py-3 bg-purple-600 hover:bg-purple-700 text-white font-bold text-sm rounded-xl shadow-md transition flex items-center justify-center gap-2 cursor-pointer">' +
            '<i class="fa-solid fa-tag"></i> Stamp Current Line (SPACE)' +
          '</button>' +
        '</div>' +

        '<div class="flex items-center justify-between px-5 py-3 bg-white border-t border-slate-200 shrink-0">' +
          '<button type="button" id="tapSyncResetBtn" class="px-3 py-1.5 text-xs font-semibold text-slate-600 hover:text-slate-800 bg-slate-100 hover:bg-slate-200 rounded-lg transition cursor-pointer">' +
            'Clear Timestamps' +
          '</button>' +
          '<div class="flex items-center gap-2">' +
            '<button type="button" id="tapSyncCancelBtn" class="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-lg transition cursor-pointer">Cancel</button>' +
            '<button type="button" id="tapSyncApplyBtn" class="px-4 py-2 text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg shadow-xs transition cursor-pointer flex items-center gap-1.5">' +
              '<i class="fa-solid fa-check"></i> Apply to Lyrics' +
            '</button>' +
          '</div>' +
        '</div>' +
      '</div>';

    document.body.appendChild(modalEl);
    try {
      modalEl.showModal();
    } catch (e) {
      modalEl.setAttribute("open", "");
    }

    modalEl.addEventListener("click", function(e) {
      if (e.target === modalEl) cleanup();
    });
    modalEl.addEventListener("cancel", function(e) {
      e.preventDefault();
      cleanup();
    });

    var playBtn = document.getElementById("tapSyncPlayPause");
    var playIcon = document.getElementById("tapSyncPlayIcon");
    var timerEl = document.getElementById("tapSyncTimer");
    var stampBtn = document.getElementById("tapSyncStampBtn");
    var linesContainer = document.getElementById("tapSyncLinesContainer");

    function formatLrcTime(secs) {
      var m = Math.floor(secs / 60);
      var s = Math.floor(secs % 60);
      var ms = Math.floor((secs % 1) * 100);
      return (m < 10 ? "0" : "") + m + ":" + (s < 10 ? "0" : "") + s + "." + (ms < 10 ? "0" : "") + ms;
    }

    var timerInterval = setInterval(function() {
      if (syncAudio && !syncAudio.paused && timerEl) {
        timerEl.textContent = formatLrcTime(syncAudio.currentTime);
      }
    }, 50);

    function togglePlay() {
      if (syncAudio.paused) {
        syncAudio.play().catch(function() {});
        if (playIcon) playIcon.className = "fa-solid fa-pause text-xs";
      } else {
        syncAudio.pause();
        if (playIcon) playIcon.className = "fa-solid fa-play text-xs";
      }
    }

    if (playBtn) playBtn.onclick = togglePlay;

    function stampCurrentLine() {
      if (currentLineIndex >= lineObjects.length) return;
      var curTimeStr = formatLrcTime(syncAudio.currentTime);
      lineObjects[currentLineIndex].timestamp = curTimeStr;

      // Advance to next non-blank line
      currentLineIndex++;
      while (currentLineIndex < lineObjects.length && lineObjects[currentLineIndex].isBlank) {
        currentLineIndex++;
      }

      if (linesContainer) {
        linesContainer.innerHTML = renderLinesHtml();
        var targetEl = document.getElementById("syncLineItem_" + currentLineIndex);
        if (targetEl) targetEl.scrollIntoView({ behavior: "smooth", block: "center" });
      }
    }

    if (stampBtn) stampBtn.onclick = stampCurrentLine;

    function handleKeyDown(e) {
      if (e.code === "Space") {
        e.preventDefault();
        stampCurrentLine();
      }
    }
    window.addEventListener("keydown", handleKeyDown);

    function cleanup() {
      clearInterval(timerInterval);
      window.removeEventListener("keydown", handleKeyDown);
      try { syncAudio.pause(); } catch(e) {}
      try { modalEl.close(); } catch(e) {}
      modalEl.remove();
    }

    document.getElementById("tapSyncCloseBtn").onclick = cleanup;
    document.getElementById("tapSyncCancelBtn").onclick = cleanup;

    document.getElementById("tapSyncResetBtn").onclick = function() {
      if (!confirm("Clear all timestamps?")) return;
      lineObjects.forEach(function(lo) { lo.timestamp = ""; });
      currentLineIndex = 0;
      while (currentLineIndex < lineObjects.length && lineObjects[currentLineIndex].isBlank) {
        currentLineIndex++;
      }
      linesContainer.innerHTML = renderLinesHtml();
    };

    document.getElementById("tapSyncApplyBtn").onclick = function() {
      var formatted = lineObjects.map(function(lo) {
        if (lo.isBlank) return "";
        if (lo.timestamp) {
          return "[" + lo.timestamp + "] " + lo.clean;
        }
        return lo.clean;
      }).join("\n");

      if (lyricsInput) {
        lyricsInput.value = formatted;
        updateSlideCounter();
      }
      cleanup();
    };
  }
}