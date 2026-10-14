/**
 * Last-resort renderer fallbacks. The projection window does NOT load
 * ThemeManager, so when window.activeThemeObj is missing entirely these
 * values decide the look. They mirror ThemeManager.getDefaultStyleBundle
 * ("verses") -- if those factory defaults change, update these to match.
 * (Auto-fit floors and geometry formulas elsewhere in this file are layout
 * algorithm, not taste, and stay as-is by design.)
 */
var PROJECTION_FALLBACK_STYLE = {
  textAlign: "center",
  primaryWeight: "bold",
  secondaryWeight: "normal",
  headerSize: 16,
  headerWeight: "bold",
  headerAlign: "center",
  headerTransform: "uppercase",
  footnoteSize: 12,
  footnoteWeight: "normal",
  footnoteAlign: "center",
  footnoteTransform: "none",
  dividerWidth: 70,
  dividerThickness: 2,
  dividerColor: "#FFB703",
  dividerStyle: "glow",
  dividerPaddingTop: 14,
  dividerPaddingBottom: 14,
  shadowBlur: 4,
  shadowColor: "#000000",
  overlayColor: "#000000",
  overlayOpacity: 20
};
/**
 * Resolve the effective shadow for one text element
 * (prefix: "header" | "primary" | "secondary" | "footnote").
 * Per-item fields (e.g. primaryShadowColor) win when set; otherwise the
 * global shadow settings (blur/shadowColor module vars + p_enableShadow)
 * apply, so older themes without per-item fields behave exactly as before.
 */
function elShadow(prefix) {
  var theme = (typeof window !== "undefined") ? window.activeThemeObj : null;
  var F = PROJECTION_FALLBACK_STYLE;
  var itemOn = theme ? theme[prefix + "ShadowEnabled"] : undefined;
  var enabled = (itemOn !== undefined && itemOn !== null) ? !!itemOn : (typeof p_enableShadow === "undefined" || !!p_enableShadow);
  var color = (theme && theme[prefix + "ShadowColor"]) || ((typeof shadowColor !== "undefined") ? shadowColor : F.shadowColor);
  var rawBlur = (theme && theme[prefix + "ShadowBlur"] !== undefined && theme[prefix + "ShadowBlur"] !== null && theme[prefix + "ShadowBlur"] !== "") ? Number(theme[prefix + "ShadowBlur"]) : NaN;
  var b = isNaN(rawBlur) ? ((typeof blur !== "undefined") ? blur : F.shadowBlur) : rawBlur;
  return { enabled: enabled, blur: b, color: color };
}
var p_text1_arr = new Array();
var p_text2_arr = new Array();
var p_title_arr = new Array();
var p_text1_font = "";
var p_text2_font = "";
var p_title = "";
var p_footnote = "";
var p_current_index = 0;
var p_last_index = 0;
var p_bkgnd_filename = "";
var p_bkgnd_color = "";
var p_font_color = "";
var p_window_X = "800";
var p_window_Y = "600";
var p_topMargin = 50;
var p_bottomMargin = 50;
var p_leftMargin = 50;
var p_rightMargin = 50;
var p_align = PROJECTION_FALLBACK_STYLE.textAlign;
var p_maxFontSize = 100;
var p_enableTransition = true;
var p_showTitle = true;
var p_enableShadow = true;
var p_shadowBlur = 4;
var blur = 4;
var shadowColor = PROJECTION_FALLBACK_STYLE.shadowColor;
var p_ver1ScaleFactor = 1;
var p_ver2ScaleFactor = 1;
var p_logo_mode = false;
var p_logo_image = "";
var p_logo_title = "";
var p_logo_sub = "";
var p_logo_bg = "#020617";
var p_logo_color = "#ffffff";
var p_logo_imgsize = 40;
var p_logo_titlesize = 8;
var p_logo_subsize = 4;
var p_logo_title_bold = true;
var p_logo_title_italic = false;
var p_logo_sub_bold = false;
var p_logo_sub_italic = false;
var p_output_mode = "live";
var p_logo_bgimage = "";
var p_logo_bgdim = 50;
var showingtheme = false;
function initPresentation() {
  window.passVariable = function() {
    // Theme-designer preview mode: the hosting page injects an isolated
    // previewState so the preview renders through this exact engine without
    // touching (or being touched by) live projection state.
    if (window.previewState && typeof window.previewState === "object") {
      const s = window.previewState;
      p_text1_arr = s.text1 || [""];
      p_text2_arr = s.text2 || [""];
      p_title_arr = s.titleArr || [];
      p_text1_font = s.font1 || "Arial";
      p_text2_font = s.font2 || "Arial";
      p_title = (s.title !== undefined && s.title !== null) ? s.title : "";
      p_footnote = (s.footnote !== undefined && s.footnote !== null) ? s.footnote : "";
      p_current_index = s.index || 0;
      p_last_index = (s.last !== undefined && s.last !== null) ? s.last : 0;
      p_bkgnd_filename = s.bkgnd || "";
      p_bkgnd_color = s.bkgndColor || "black";
      p_font_color = s.fontColor || "#FFFFFF";
      p_window_X = s.winX || 800;
      p_window_Y = s.winY || 600;
      p_topMargin = (s.marginTop !== undefined) ? s.marginTop : 50;
      p_bottomMargin = (s.marginBottom !== undefined) ? s.marginBottom : 50;
      p_leftMargin = (s.marginLeft !== undefined) ? s.marginLeft : 60;
      p_rightMargin = (s.marginRight !== undefined) ? s.marginRight : 60;
      p_maxFontSize = s.maxFS || 100;
      p_enableTransition = (s.transition !== undefined) ? !!s.transition : true;
      p_showTitle = (s.showTitle !== undefined) ? !!s.showTitle : true;
      p_enableShadow = (s.shadow !== undefined) ? !!s.shadow : true;
      p_ver1ScaleFactor = s.ver1 || 1;
      p_ver2ScaleFactor = s.ver2 || 1;
      p_logo_mode = false;
      p_align = s.align || PROJECTION_FALLBACK_STYLE.textAlign;
      p_output_mode = "live";
      window.activeThemeObj = s.theme || null;
      if (window.activeThemeObj) {
        blur = (typeof window.activeThemeObj.shadowBlur !== "undefined") ? window.activeThemeObj.shadowBlur : 4;
        shadowColor = window.activeThemeObj.shadowColor || PROJECTION_FALLBACK_STYLE.shadowColor;
      }
      return;
    }
    const src = window.opener || (window.parent !== window ? window.parent : null);
    if (src) {
        p_text1_arr = src.p_text1_arr;
        p_text2_arr = src.p_text2_arr;
        p_title_arr = src.p_title_arr || [];
        p_text1_font = src.p_text1_font;
        p_text2_font = src.p_text2_font;
        p_title = src.p_title;
        p_footnote = src.p_footnote;
        p_current_index = src.p_current_index;
        p_last_index = src.p_last_index;
        p_bkgnd_filename = src.p_bkgnd_filename;
        p_bkgnd_color = src.p_bkgnd_color;
        p_font_color = src.p_font_color;
        p_window_X = src.pWindowX || 800;
        p_window_Y = src.pWindowY || 600;
        p_topMargin = src.p_topMargin;
        p_bottomMargin = src.p_bottomMargin;
        p_leftMargin = src.p_leftMargin;
        p_rightMargin = src.p_rightMargin;
        p_maxFontSize = src.p_maxFontSize;
        p_enableTransition = src.p_enableTransition;
        p_showTitle = src.p_showTitle;
        p_enableShadow = src.p_enableShadow;
        p_ver1ScaleFactor = src.p_ver1ScaleFactor;
        p_ver2ScaleFactor = src.p_ver2ScaleFactor;
        p_logo_mode = !!src.p_logo_mode;
        p_logo_image = src.p_logo_image || "";
        p_logo_title = src.p_logo_title || "";
        p_logo_sub = src.p_logo_sub || "";
        p_logo_bg = src.p_logo_bg || "#020617";
        p_logo_color = src.p_logo_color || "#ffffff";
        p_logo_imgsize = (isFinite(Number(src.p_logo_imgsize)) ? Number(src.p_logo_imgsize) : 40);
        p_logo_titlesize = (isFinite(Number(src.p_logo_titlesize)) ? Number(src.p_logo_titlesize) : 8);
        p_logo_subsize = (isFinite(Number(src.p_logo_subsize)) ? Number(src.p_logo_subsize) : 4);
        p_logo_title_bold = (src.p_logo_title_bold === undefined) ? true : !!src.p_logo_title_bold;
        p_logo_title_italic = !!src.p_logo_title_italic;
        p_logo_sub_bold = !!src.p_logo_sub_bold;
        p_logo_sub_italic = !!src.p_logo_sub_italic;
        p_logo_bgimage = (typeof src.p_logo_bgimage === "string") ? src.p_logo_bgimage : "";
        p_logo_bgdim = (isFinite(Number(src.p_logo_bgdim)) ? Number(src.p_logo_bgdim) : 50);
        p_output_mode = src.p_output_mode || "live";
        p_align = src.p_align || PROJECTION_FALLBACK_STYLE.textAlign;
        window.activeThemeObj = src.activeThemeObj || null;
    }
    // If activeThemeObj is not yet attached, fallback to theme saved in localStorage / themeManager
    if (!window.activeThemeObj) {
      try {
        const savedThemes = localStorage.getItem("uecfi_themes");
        const activeId = localStorage.getItem("uecfi_active_theme_id");
        if (savedThemes) {
          const parsed = JSON.parse(savedThemes);
          if (Array.isArray(parsed) && parsed.length > 0) {
            const found = parsed.find(t => t.id === activeId) || parsed[0];
            if (found && found.styles) {
              window.activeThemeObj = found.styles.verses || found.styles.songs || null;
            }
          }
        }
      } catch (err) {
        console.warn("[PRESENTATION] Error resolving theme fallback from localStorage:", err);
      }
    }
    if (window.activeThemeObj) {
      blur = (typeof window.activeThemeObj.shadowBlur !== "undefined") ? window.activeThemeObj.shadowBlur : 4;
      shadowColor = window.activeThemeObj.shadowColor || PROJECTION_FALLBACK_STYLE.shadowColor;
    }
  };
  passVariable();

  // Listen to cross-window BroadcastChannel messages (standard HTML5 Web API for NGINX/Apache/cPanel)
  // Preview iframes ignore live traffic: their previewState is authoritative.
  if (typeof BroadcastChannel !== "undefined") {
    try {
      const channel = new BroadcastChannel("uecfi_presentation_channel");
      channel.onmessage = (event) => {
        if (window.previewState && typeof window.previewState === "object") return;
        if (!event || !event.data) return;
        const { type, payload } = event.data;
        if (type === "UPDATE_STATE" && payload) {
          p_text1_arr = payload.p_text1_arr;
          p_text2_arr = payload.p_text2_arr;
          p_title_arr = payload.p_title_arr || [];
          p_text1_font = payload.p_text1_font;
          p_text2_font = payload.p_text2_font;
          p_title = payload.p_title;
          p_footnote = payload.p_footnote;
          p_current_index = payload.p_current_index;
          p_last_index = payload.p_last_index;
          p_bkgnd_filename = payload.p_bkgnd_filename;
          p_bkgnd_color = payload.p_bkgnd_color;
          p_font_color = payload.p_font_color;
          p_window_X = payload.pWindowX || p_window_X || 800;
          p_window_Y = payload.pWindowY || p_window_Y || 600;
          p_topMargin = payload.p_topMargin;
          p_bottomMargin = payload.p_bottomMargin;
          p_leftMargin = payload.p_leftMargin;
          p_rightMargin = payload.p_rightMargin;
          p_maxFontSize = payload.p_maxFontSize;
          p_enableTransition = payload.p_enableTransition;
          p_showTitle = payload.p_showTitle;
          p_enableShadow = payload.p_enableShadow;
          p_ver1ScaleFactor = payload.p_ver1ScaleFactor;
          p_ver2ScaleFactor = payload.p_ver2ScaleFactor;
          p_align = payload.p_align || p_align || "center";
          window.activeThemeObj = payload.activeThemeObj || null;
          if (window.activeThemeObj) {
            blur = (typeof window.activeThemeObj.shadowBlur !== "undefined") ? window.activeThemeObj.shadowBlur : 4;
            shadowColor = window.activeThemeObj.shadowColor || PROJECTION_FALLBACK_STYLE.shadowColor;
          }
          updatePresentation();
          updateContent();
        } else if (type === "NEXT_SLIDE") {
          nextSlide();
        } else if (type === "PREV_SLIDE") {
          prevSlide();
        } else if (type === "CLOSE") {
          clearPresenter();
        }
      };
    } catch(err) {
      console.warn("[BROADCAST] Presentation channel listener error:", err);
    }
  }

  if (p_enableTransition) {
    initTransition(true);
  } else {
    initTransition(false);
  }
  presentation_initEvent();
  updatePresentation();
  // On initial open, render content directly so projection doesn't start hidden or blanked out
  updateContent2();
}
function presentation_initEvent() {
  document
    .getElementById("presentationContent")
    .addEventListener("click", nextSlide, false);
}
function clearPresenter() {
  window.close();
}
function font_size(d, b) {
  if (!d || typeof d !== "string") {
    d = (d != null) ? String(d) : "";
  }
  const c = d.length;
  if (c === 0) return 30 * (b || 1);
  const a = (c * -0.09 + 80) * (b || 1);
  // Dynamic ceiling allowing scale factor b to expand beyond base p_maxFontSize (default 100)
  const maxCap = Math.max(Number(p_maxFontSize) || 100, Math.round((Number(p_maxFontSize) || 100) * (b || 1)));
  if (a <= maxCap) {
    return a;
  } else {
    return maxCap;
  }
}
function get_next_index() {
  let a = p_current_index * 1 + 1;
  if (p_current_index == p_last_index) {
    a = 0;
  }
  return a;
}
function get_prev_index() {
  let a = p_current_index * 1 - 1;
  if (p_current_index == 0) {
    a = p_last_index;
  }
  return a;
}
function nextSlide() {
  console.log("Calling next slide in presentation.js");
  p_current_index = get_next_index();
  document.getElementById("content1").style.textShadow = null;
  document.getElementById("content2").style.textShadow = null;
  fadeout.onComplete.subscribe(updateContent2);
  fadeout.animate();
}
function prevSlide() {
  p_current_index = get_prev_index();
  document.getElementById("content1").style.textShadow = null;
  document.getElementById("content2").style.textShadow = null;
  fadeout.onComplete.subscribe(updateContent2);
  fadeout.animate();
}
function updateContent() { console.log('updateContent called'); 
  document.getElementById("content1").style.textShadow = null;
  document.getElementById("content2").style.textShadow = null;
  fadeout.onComplete.subscribe(updateContent2);
  fadeout.animate();
}
function updateContent2() { console.log('updateContent2 called, text:', window.p_text1_arr, p_text1_arr, p_current_index); 
  const pTitleEl = document.getElementById("presentationTitle");
  const pFootnoteEl = document.getElementById("footnote");
  const theme = window.activeThemeObj;

  pTitleEl.innerHTML = (p_title_arr && p_title_arr[p_current_index]) || p_title;
  pFootnoteEl.innerHTML = p_footnote;

  // Header Title styling from theme
  const headerVisible = theme ? (theme.headerVisible !== false) : (p_showTitle !== false);
  const headerSize = (theme && theme.headerSize) ? theme.headerSize : PROJECTION_FALLBACK_STYLE.headerSize;
  pTitleEl.style.display = headerVisible ? "block" : "none";
  pTitleEl.style.color = (theme && theme.headerColor) ? theme.headerColor : p_font_color;
  pTitleEl.style.fontFamily = (theme && theme.headerFont) ? theme.headerFont : (p_text1_font || "Arial");
  pTitleEl.style.fontSize = `${headerSize}px`;
  pTitleEl.style.fontWeight = (theme && theme.headerWeight) ? theme.headerWeight : PROJECTION_FALLBACK_STYLE.headerWeight;
  pTitleEl.style.textAlign = (theme && theme.headerAlign) ? theme.headerAlign : PROJECTION_FALLBACK_STYLE.headerAlign;
  pTitleEl.style.textTransform = (theme && theme.headerTransform) ? theme.headerTransform : PROJECTION_FALLBACK_STYLE.headerTransform;

  // Footnote styling from theme
  const footnoteVisible = theme ? (theme.footnoteVisible !== false) : true;
  const footnoteSize = (theme && theme.footnoteSize) ? theme.footnoteSize : PROJECTION_FALLBACK_STYLE.footnoteSize;
  pFootnoteEl.style.display = footnoteVisible ? "block" : "none";
  pFootnoteEl.style.color = (theme && theme.footnoteColor) ? theme.footnoteColor : p_font_color;
  pFootnoteEl.style.fontFamily = (theme && theme.footnoteFont) ? theme.footnoteFont : (p_text1_font || "Arial");
  pFootnoteEl.style.fontSize = `${footnoteSize}px`;
  pFootnoteEl.style.fontWeight = (theme && theme.footnoteWeight) ? theme.footnoteWeight : PROJECTION_FALLBACK_STYLE.footnoteWeight;
  pFootnoteEl.style.textAlign = (theme && theme.footnoteAlign) ? theme.footnoteAlign : PROJECTION_FALLBACK_STYLE.footnoteAlign;
  pFootnoteEl.style.textTransform = (theme && theme.footnoteTransform) ? theme.footnoteTransform : PROJECTION_FALLBACK_STYLE.footnoteTransform;

  const activeAlign = (theme && theme.textAlign) ? theme.textAlign : (p_align || PROJECTION_FALLBACK_STYLE.textAlign);
  const pContentEl = document.getElementById("presentationContent");
  if (pContentEl) pContentEl.style.textAlign = activeAlign;
  const pContentCell = document.getElementById("p_contentID");
  if (pContentCell) pContentCell.style.textAlign = activeAlign;
  const c1El = document.getElementById("content1");
  if (c1El) {
    c1El.style.textAlign = activeAlign;
    c1El.style.fontWeight = ((theme && theme.primaryWeight) || PROJECTION_FALLBACK_STYLE.primaryWeight);
  }
  const c2El = document.getElementById("content2");
  if (c2El) {
    c2El.style.textAlign = activeAlign;
    c2El.style.fontWeight = ((theme && theme.secondaryWeight) || PROJECTION_FALLBACK_STYLE.secondaryWeight);
  }

  const titleSh = elShadow("header");
  const footSh = elShadow("footnote");
  if (titleSh.enabled) {
    pTitleEl.style.textShadow = `2px 2px ${titleSh.blur}px ${titleSh.color}, -2px -2px ${titleSh.blur}px ${titleSh.color}`;
  } else {
    pTitleEl.style.textShadow = "none";
  }
  if (footSh.enabled) {
    pFootnoteEl.style.textShadow = `2px 2px ${footSh.blur}px ${footSh.color}, -2px -2px ${footSh.blur}px ${footSh.color}`;
  } else {
    pFootnoteEl.style.textShadow = "none";
  }
  document.getElementById("content1").style.visibility = "hidden";
  document.getElementById("content2").style.visibility = "hidden";
  const divEl = document.getElementById("presentationDivider");
  const hasBothVerses = (p_text1_arr && p_text1_arr[p_current_index] && p_text2_arr && p_text2_arr[p_current_index] && p_text2_arr[p_current_index].trim() !== "");
  const isDividerEnabled = theme ? (theme.showDivider !== false) : true;
  const padTop = (theme && typeof theme.dividerPaddingTop !== "undefined") ? theme.dividerPaddingTop : PROJECTION_FALLBACK_STYLE.dividerPaddingTop;
  const padBottom = (theme && typeof theme.dividerPaddingBottom !== "undefined") ? theme.dividerPaddingBottom : PROJECTION_FALLBACK_STYLE.dividerPaddingBottom;
  const divThick = (theme && theme.dividerThickness) ? theme.dividerThickness : PROJECTION_FALLBACK_STYLE.dividerThickness;
  const dividerSpace = (hasBothVerses && isDividerEnabled) ? (padTop + padBottom + divThick) : 0;

  // Dynamic header space based on configured header size and visibility
  const headerHeight = headerVisible ? Math.max(40, Math.round(headerSize * 1.4)) : 0;

  const hasText2 = (p_text2_arr != null && typeof p_text2_arr[p_current_index] === "string" && p_text2_arr[p_current_index].trim() !== "");
  const text1Val = (p_text1_arr && p_text1_arr[p_current_index] != null) ? p_text1_arr[p_current_index] : "";
  const text2Val = hasText2 ? p_text2_arr[p_current_index] : "";

  const winY = Math.max(400, Number(p_window_Y) || 600);
  const n = Math.max(100, winY - (Number(p_topMargin) || 0) - (Number(p_bottomMargin) || 0) - headerHeight - 20 - dividerSpace);
  let m = 0;
  let g = 0;
  let e = Math.abs(font_size(text1Val, p_ver1ScaleFactor));
  let a = hasText2 ? Math.abs(font_size(text2Val, p_ver2ScaleFactor)) : 0;

  try {
    let loopCount = 0;
    const maxLoops = 25; // Strict ceiling to prevent infinite loops or layout thrashing
    do {
      document.getElementById("content1").style.fontSize = `${e}px`;
      document.getElementById("content1").innerHTML = text1Val;
      if (hasText2) {
        document.getElementById("content2").style.fontSize = `${a}px`;
        document.getElementById("content2").innerHTML = text2Val;
      } else {
        document.getElementById("content2").innerHTML = "";
      }
      m = document.getElementById("content1").clientHeight;
      g = hasText2 ? document.getElementById("content2").clientHeight : 0;
      const i = m + g;
      var h = 1 - i / n;
      if (h < 0.05) {
        // Content height (i) exceeds 95% of available space (n) -> shrink active fonts
        if (e > 12) e -= 2;
        if (hasText2 && a > 8) a -= 2;
      }
      loopCount++;
    } while (loopCount < maxLoops && h < 0.05 && (e > 12 || (hasText2 && a > 8)));

    document.getElementById("content1").style.fontSize = `${Math.max(12, e)}px`;
    if (hasText2) {
      document.getElementById("content2").style.fontSize = `${Math.max(8, a)}px`;
    }

    // Apply Version Divider Line between content1 and content2
    if (divEl) {
      if (hasBothVerses && isDividerEnabled) {
        divEl.style.display = "block";
      const widthPct = theme && theme.dividerWidth ? Math.min(100, Math.max(10, theme.dividerWidth)) : PROJECTION_FALLBACK_STYLE.dividerWidth;
      divEl.style.width = `${widthPct}%`;
      const thickness = theme && theme.dividerThickness ? Math.max(1, theme.dividerThickness) : PROJECTION_FALLBACK_STYLE.dividerThickness;
        divEl.style.height = `${thickness}px`;
      const color = (theme && theme.dividerColor) ? theme.dividerColor : PROJECTION_FALLBACK_STYLE.dividerColor;
      const divStyle = (theme && theme.dividerStyle) ? theme.dividerStyle : PROJECTION_FALLBACK_STYLE.dividerStyle;

        if (divStyle === "glow") {
          divEl.style.background = `radial-gradient(ellipse at center, ${color} 0%, ${color} 45%, rgba(0,0,0,0) 100%)`;
          divEl.style.border = "none";
          divEl.style.boxShadow = `0 0 8px ${color}`;
        } else if (divStyle === "solid") {
          divEl.style.background = color;
          divEl.style.border = "none";
          divEl.style.boxShadow = "none";
        } else if (divStyle === "dotted") {
          divEl.style.background = "transparent";
          divEl.style.borderTop = `${thickness}px dotted ${color}`;
          divEl.style.boxShadow = "none";
        } else if (divStyle === "dashed") {
          divEl.style.background = "transparent";
          divEl.style.borderTop = `${thickness}px dashed ${color}`;
          divEl.style.boxShadow = "none";
        }
      const padTop = (theme && typeof theme.dividerPaddingTop !== "undefined") ? theme.dividerPaddingTop : PROJECTION_FALLBACK_STYLE.dividerPaddingTop;
      const padBottom = (theme && typeof theme.dividerPaddingBottom !== "undefined") ? theme.dividerPaddingBottom : PROJECTION_FALLBACK_STYLE.dividerPaddingBottom;
        divEl.style.margin = `${padTop}px auto ${padBottom}px auto`;
      } else {
        divEl.style.display = "none";
      }
    }

    if (p_enableShadow) {
      c();
    }
  } catch (err) {
    console.error("[PRESENTATION] Error during font sizing / layout in updateContent2:", err);
  } finally {
    // ALWAYS guarantee content visibility and presentation container opacity
    document.getElementById("content1").style.visibility = "visible";
    document.getElementById("content2").style.visibility = hasText2 ? "visible" : "hidden";
    const pContainer = document.getElementById("presentationContainer");
    if (pContainer) pContainer.style.opacity = "1";
    fadein.animate();
  }
  function c() {
    const s1 = elShadow("primary");
    document.getElementById("content1").style.textShadow = s1.enabled
      ? `1px 1px ${s1.blur}px ${s1.color}, -2px -2px ${s1.blur}px ${s1.color}`
      : "none";
    if (hasText2) {
      const s2 = elShadow("secondary");
      document.getElementById("content2").style.textShadow = s2.enabled
        ? `1px 1px ${s2.blur}px ${s2.color}, -2px -2px ${s2.blur}px ${s2.color}`
        : "none";
    }
  }
}
function showThemeProcess() {
  if (!showingtheme) {
    showingtheme = true;
    document.getElementById("presentationTitle").innerHTML = "";
    document.getElementById("content1").innerHTML = "";
    document.getElementById("content2").innerHTML = "";
    document.getElementById("footnote").innerHTML = "";
  } else {
    showingtheme = false;
    document.getElementById("presentationTitle").innerHTML = p_title;
    document.getElementById("content1").innerHTML =
      p_text1_arr[p_current_index];
    document.getElementById("content2").innerHTML =
      p_text2_arr[p_current_index];
    document.getElementById("footnote").innerHTML = p_footnote;
  }
}
function showBlankProcess() {}
function updatePresentation() {
  const theme = window.activeThemeObj;

  document.getElementById("content1").style.fontFamily = p_text1_font;
  document.getElementById("content1").style.color = p_font_color;
  document.getElementById("content2").style.fontFamily = p_text2_font;
  document.getElementById("content2").style.color = (theme && theme.secondaryColor) ? theme.secondaryColor : p_font_color;
  if (theme && theme.secondaryItalic) {
    document.getElementById("content2").style.fontStyle = "italic";
  } else {
    document.getElementById("content2").style.fontStyle = "normal";
  }

  const activeAlign = (theme && theme.textAlign) ? theme.textAlign : (p_align || PROJECTION_FALLBACK_STYLE.textAlign);
  const c1 = document.getElementById("content1");
  if (c1) {
    c1.style.textAlign = activeAlign;
    c1.style.fontWeight = ((theme && theme.primaryWeight) || PROJECTION_FALLBACK_STYLE.primaryWeight);
  }
  const c2 = document.getElementById("content2");
  if (c2) {
    c2.style.textAlign = activeAlign;
    c2.style.fontWeight = ((theme && theme.secondaryWeight) || PROJECTION_FALLBACK_STYLE.secondaryWeight);
  }
  const pCell = document.getElementById("p_contentID");
  if (pCell) pCell.style.textAlign = activeAlign;

  // Handle Background (Image, Gradient, or Solid Color)
  const bgImg = document.getElementById("backgroundImage");
  const bgLayer = document.getElementById("backgroundLayer");
  const overlay = document.getElementById("overlayLayer");

  if (theme && theme.backgroundType === "gradient" && theme.bgGradient) {
    if (bgImg) bgImg.style.display = "none";
    if (bgLayer) {
      bgLayer.style.backgroundImage = theme.bgGradient;
      bgLayer.style.backgroundColor = "transparent";
      bgLayer.style.width = p_window_X + "px";
      bgLayer.style.height = p_window_Y + "px";
    }
  } else if (theme && theme.backgroundType === "color" && theme.bgColor) {
    if (bgImg) bgImg.style.display = "none";
    if (bgLayer) {
      bgLayer.style.backgroundImage = "none";
      bgLayer.style.backgroundColor = theme.bgColor;
      bgLayer.style.width = p_window_X + "px";
      bgLayer.style.height = p_window_Y + "px";
    }
  } else {
    // Default image mode
    let imgSrc = "";
    if (p_bkgnd_filename && p_bkgnd_filename.trim() !== "") {
      imgSrc = p_bkgnd_filename.startsWith("file://") ? p_bkgnd_filename : AppStorage.resolvePath(p_bkgnd_filename);
      bgImg.style.display = "block";
      bgImg.src = imgSrc;
    } else {
      bgImg.style.display = "none";
    }
    bgImg.width = p_window_X;
    bgImg.height = p_window_Y;
    if (bgLayer) {
      bgLayer.style.backgroundImage = "none";
      bgLayer.style.backgroundColor = "transparent";
    }
  }

  // Apply Overlay Layer
  if (overlay) {
    if (theme && theme.overlayOpacity > 0) {
      overlay.style.display = "block";
      overlay.style.width = p_window_X + "px";
      overlay.style.height = p_window_Y + "px";
      overlay.style.backgroundColor = theme.overlayColor || PROJECTION_FALLBACK_STYLE.overlayColor;
      overlay.style.opacity = (theme.overlayOpacity / 100);
    } else {
      overlay.style.display = "none";
    }
  }

  const headerVisible = theme ? (theme.headerVisible !== false) : (p_showTitle !== false);
  const headerSize = (theme && theme.headerSize) ? theme.headerSize : PROJECTION_FALLBACK_STYLE.headerSize;
  const headerHeight = headerVisible ? Math.max(40, Math.round(headerSize * 1.4)) : 0;

  const titleEl = document.getElementById("presentationTitle");
  titleEl.style.position = "absolute";
  titleEl.style.left = `${Number(p_leftMargin) || 0}px`;
  titleEl.style.top = `${Number(p_topMargin) || 0}px`;
  titleEl.style.width = `${Math.max(100, (Number(p_window_X) || 800) - (Number(p_leftMargin) || 0) - (Number(p_rightMargin) || 0))}px`;
  titleEl.style.height = `${headerHeight}px`;
  titleEl.style.color = (theme && theme.headerColor) ? theme.headerColor : p_font_color;
  titleEl.style.fontFamily = (theme && theme.headerFont) ? theme.headerFont : (p_text1_font || "Arial");
  titleEl.style.fontSize = `${headerSize}px`;
  titleEl.style.fontWeight = (theme && theme.headerWeight) ? theme.headerWeight : PROJECTION_FALLBACK_STYLE.headerWeight;
  titleEl.style.textAlign = (theme && theme.headerAlign) ? theme.headerAlign : PROJECTION_FALLBACK_STYLE.headerAlign;
  titleEl.style.textTransform = (theme && theme.headerTransform) ? theme.headerTransform : PROJECTION_FALLBACK_STYLE.headerTransform;
  titleEl.style.display = headerVisible ? "block" : "none";

  const footnoteVisible = theme ? (theme.footnoteVisible !== false) : true;
  const footnoteSize = (theme && theme.footnoteSize) ? theme.footnoteSize : PROJECTION_FALLBACK_STYLE.footnoteSize;
  const footEl = document.getElementById("footnote");
  footEl.style.position = "absolute";
  footEl.style.left = `${Number(p_leftMargin) || 0}px`;
  footEl.style.top = `${(Number(p_window_Y) || 600) - (Number(p_bottomMargin) || 0) - 20}px`;
  footEl.style.width = `${Math.max(100, (Number(p_window_X) || 800) - (Number(p_leftMargin) || 0) - (Number(p_rightMargin) || 0))}px`;
  footEl.style.height = "20px";
  footEl.style.color = (theme && theme.footnoteColor) ? theme.footnoteColor : p_font_color;
  footEl.style.fontFamily = (theme && theme.footnoteFont) ? theme.footnoteFont : (p_text1_font || "Arial");
  footEl.style.fontSize = `${footnoteSize}px`;
  footEl.style.fontWeight = (theme && theme.footnoteWeight) ? theme.footnoteWeight : PROJECTION_FALLBACK_STYLE.footnoteWeight;
  footEl.style.textAlign = (theme && theme.footnoteAlign) ? theme.footnoteAlign : PROJECTION_FALLBACK_STYLE.footnoteAlign;
  footEl.style.textTransform = (theme && theme.footnoteTransform) ? theme.footnoteTransform : PROJECTION_FALLBACK_STYLE.footnoteTransform;
  footEl.style.display = footnoteVisible ? "block" : "none";
  const contentEl = document.getElementById("presentationContent");
  contentEl.style.position = "absolute";
  contentEl.style.left = `${Number(p_leftMargin) || 0}px`;
  contentEl.style.top = `${(Number(p_topMargin) || 0) + headerHeight}px`;
  contentEl.style.width = `${Math.max(100, (Number(p_window_X) || 800) - (Number(p_leftMargin) || 0) - (Number(p_rightMargin) || 0))}px`;
  const b = Math.max(50, (Number(p_window_Y) || 600) - (Number(p_topMargin) || 0) - (Number(p_bottomMargin) || 0) - headerHeight - 20);
  contentEl.style.height = `${b}px`;
  const pTable = document.getElementById("p_table");
  if (pTable) {
    pTable.style.width = "100%";
    pTable.style.height = `${b}px`;
  }
  const cellEl = document.getElementById("p_contentID");
  if (cellEl) {
    cellEl.style.height = `${b}px`;
    cellEl.style.textAlign = (theme && theme.textAlign) ? theme.textAlign : (p_align || PROJECTION_FALLBACK_STYLE.textAlign);
  }
  renderLogoLayer();
  renderOutputState();
}
// Blackout output state (Black Screen button): covers everything.
function renderOutputState() {
  try {
    const mode = (typeof p_output_mode === "string") ? p_output_mode : "live";
    const black = document.getElementById("blackLayer");
    if (black) black.style.display = (mode === "black") ? "block" : "none";
  } catch (e) {}
}
// Custom logo screen overlay (driven by the controller Logo button).
// Scales type from the projection dimensions so it holds from 800px
// previews to full-HD projectors.
function renderLogoLayer() {
  try {
    const layer = document.getElementById("logoLayer");
    if (!layer) return;
    if (!p_logo_mode) {
      layer.style.display = "none";
      return;
    }
    const w = Number(p_window_X) || 800;
    // Height placeholder defaults ("100") predate the first projection;
    // derive from width (16:9) until a real projection reports dimensions.
    const h = Math.max(Number(p_window_Y) || 0, Math.round(w * 9 / 16));
    layer.style.display = "flex";
    layer.style.width = `${w}px`;
    layer.style.height = `${h}px`;
    layer.style.background = p_logo_bg || "#020617";
    // Background photo (optional) with dimming overlay for readability.
    const dimPct = Math.min(90, Math.max(0, isFinite(Number(p_logo_bgdim)) ? Number(p_logo_bgdim) : 50));
    const bg = document.getElementById("logoBgImage");
    if (bg) {
      if (p_logo_bgimage) {
        const primary = `./background/${p_logo_bgimage}`;
        const fallback = `storage/background/${p_logo_bgimage}`;
        if (bg.getAttribute("data-file") !== p_logo_bgimage) {
          bg.setAttribute("data-file", p_logo_bgimage);
          bg.onerror = () => {
            bg.onerror = null;
            if (bg.getAttribute("src") !== fallback) bg.setAttribute("src", fallback);
          };
          bg.setAttribute("src", primary);
        }
        bg.style.display = "block";
      } else {
        bg.removeAttribute("data-file");
        bg.style.display = "none";
      }
    }
    const dim = document.getElementById("logoDim");
    if (dim) {
      if (p_logo_bgimage && dimPct > 0) {
        dim.style.display = "block";
        dim.style.opacity = String(dimPct / 100);
      } else {
        dim.style.display = "none";
      }
    }
    // Sizes are % of screen height so the layout holds on any resolution.
    const imgPct = Math.min(95, Math.max(5, isFinite(Number(p_logo_imgsize)) ? Number(p_logo_imgsize) : 40));
    const titlePx = Math.max(12, Math.round(h * Math.min(25, Math.max(1, isFinite(Number(p_logo_titlesize)) ? Number(p_logo_titlesize) : 8)) / 100));
    const subPx = Math.max(10, Math.round(h * Math.min(15, Math.max(1, isFinite(Number(p_logo_subsize)) ? Number(p_logo_subsize) : 4)) / 100));
    const img = document.getElementById("logoImage");
    if (img) {
      if (p_logo_image) {
        if (img.getAttribute("src") !== p_logo_image) img.setAttribute("src", p_logo_image);
        img.style.display = "block";
        img.style.maxHeight = `${imgPct}%`;
        img.style.maxWidth = "90%";
        img.style.marginBottom = `${Math.round(h * 0.025)}px`;
      } else {
        img.style.display = "none";
      }
    }
    const t = document.getElementById("logoTitle");
    if (t) {
      t.textContent = p_logo_title || "";
      t.style.display = p_logo_title ? "block" : "none";
      t.style.color = p_logo_color || "#ffffff";
      t.style.fontSize = `${titlePx}px`;
      t.style.letterSpacing = "0.08em";
      t.style.textTransform = "uppercase";
      t.style.fontWeight = (p_logo_title_bold === false) ? "normal" : "bold";
      t.style.fontStyle = p_logo_title_italic ? "italic" : "normal";
    }
    const s = document.getElementById("logoSub");
    if (s) {
      s.textContent = p_logo_sub || "";
      s.style.display = p_logo_sub ? "block" : "none";
      s.style.color = p_logo_color || "#ffffff";
      s.style.fontSize = `${subPx}px`;
      s.style.opacity = "0.85";
      s.style.marginTop = `${Math.round(h * 0.012)}px`;
      s.style.fontWeight = p_logo_sub_bold ? "bold" : "normal";
      s.style.fontStyle = p_logo_sub_italic ? "italic" : "normal";
    }
  } catch (e) {}
}
function findKey(a) {
  // Preview iframes never steal keyboard actions (Esc would close, arrows flip slides)
  if (window.previewState && typeof window.previewState === "object") return;
  key = a.keyCode;
  switch (key) {
    case 27:
      clearPresenter();
      break;
    case 39:
    case 40:
      if (!showingtheme) {
        nextSlide();
      }
      break;
    case 37:
    case 38:
      if (!showingtheme) {
        prevSlide();
      }
      break;
    case 84:
      showThemeProcess();
      break;
  }
}
function savePresentationMargin() {
  let e = true;
  const b = document.getElementById("presentConfigMarginTop").value;
  const c = document.getElementById("presentConfigMarginBottom").value;
  const a = document.getElementById("presentConfigMarginLeft").value;
  const g = document.getElementById("presentConfigMarginRight").value;
  if (IsNumeric(b) && IsNumeric(c) && IsNumeric(a) && IsNumeric(g)) {
    p_topMargin = b;
    p_bottomMargin = c;
    p_leftMargin = a;
    p_rightMargin = g;
  } else {
    e = false;
    alert("Invalid entry for margin");
    document.getElementById("presentConfigMarginTop").value = p_topMargin;
    document.getElementById("presentConfigMarginBottom").value = p_bottomMargin;
    document.getElementById("presentConfigMarginLeft").value = p_leftMargin;
    document.getElementById("presentConfigMarginRight").value = p_rightMargin;
  }
  const d = document.getElementById("presentConfigMaxFontSize").value;
  if (IsNumeric(d)) {
    if (withinRange(30, 100, d)) {
      p_maxFontSize = d;
    } else {
      e = false;
      alert("Maximum font size value out of Range");
      document.getElementById("presentConfigMaxFontSize").value = p_maxFontSize;
    }
  } else {
    e = false;
    alert("Invalid maximum font size value.");
    document.getElementById("presentConfigMaxFontSize").value = p_maxFontSize;
  }
  const f = document.getElementById("presentConfigEnableTransition").checked;
  p_enableTransition = f;
  p_showTitle = document.getElementById("presentConfigEnableSongTitle").checked;
  p_enableShadow = document.getElementById("presentConfigEnableShadow").checked;
  if (e) {
    saveConfigXML();
  }
}
// Robust, modern CSS transition replacement for slide animations
// Guarantees presentationContainer remains visible and never gets stuck at opacity: 0
function initTransition(enabled) {
  const durationMs = enabled ? 180 : 0;
  
  fadeout = {
    _callbacks: [],
    onComplete: {
      subscribe(fn) {
        if (typeof fn === "function") fadeout._callbacks.push(fn);
      }
    },
    animate() {
      const el = document.getElementById("presentationContainer");
      const executeCallbacks = () => {
        const cbs = fadeout._callbacks.slice();
        fadeout._callbacks = [];
        cbs.forEach(fn => {
          try { fn(); } catch(err) { console.error("[TRANSITION] Callback error:", err); }
        });
      };

      if (!el || durationMs <= 0) {
        if (el) el.style.opacity = "1";
        executeCallbacks();
        return;
      }
      
      try {
        // Cancel any lingering animations on presentationContainer
        if (typeof el.getAnimations === "function") {
          el.getAnimations().forEach(a => a.cancel());
        }

        const anim = el.animate(
          [{ opacity: 1 }, { opacity: 0 }],
          { duration: durationMs, easing: "ease-out", fill: "none" }
        );
        anim.onfinish = () => {
          executeCallbacks();
        };
        anim.oncancel = () => {
          if (el) el.style.opacity = "1";
          executeCallbacks();
        };
      } catch (e) {
        if (el) el.style.opacity = "1";
        executeCallbacks();
      }
    }
  };

  fadein = {
    animate() {
      const el = document.getElementById("presentationContainer");
      if (!el) return;
      
      // Cancel any lingering animations on presentationContainer
      if (typeof el.getAnimations === "function") {
        el.getAnimations().forEach(a => a.cancel());
      }

      // Always ensure the element's persistent inline style opacity is 1
      el.style.opacity = "1";
      if (durationMs > 0) {
        try {
          el.animate(
            [{ opacity: 0 }, { opacity: 1 }],
            { duration: durationMs, easing: "ease-in", fill: "none" }
          );
        } catch(e) {}
      }
    }
  };
}
function invert_hex_color(d) {
  const e = "0123456789ABCDEF";
  function c(f) {
    return e.charAt((f >> 4) & 15) + e.charAt(f & 15);
  }
  function b(f) {
    f = f.toUpperCase();
    return parseInt(f, 16);
  }
  function a(h) {
    let f = h;
    if (f.toString().length < 6 || f.toString().length > 6) {
      f = f.toString(16);
    }
    hex1 = f.slice(0, 2);
    hexb1 = f.slice(2, 4);
    hexc1 = f.slice(4, 6);
    hex2 = 16 * b(hex1.slice(0, 1));
    hex3 = b(hex1.slice(1, 2));
    hex1 = hex1 + hex2;
    hexb2 = 16 * b(hexb1.slice(0, 1));
    hexb3 = b(hexb1.slice(1, 2));
    hexb1 = hexb2 + hexb3;
    hexc2 = 16 * b(hexc1.slice(0, 1));
    hexc3 = b(hexc1.slice(1, 2));
    hexc1 = hexc2 + hexc3;
    const g = `${c(255 - hex1)}${c(255 - hexb1)}${c(255 - hexc1)}`;
    return g;
  }
  return a(d);
}
