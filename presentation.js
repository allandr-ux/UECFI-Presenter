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
var p_person_title_arr = new Array();
var p_person_title = "";
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
var p_attention_mode = false;
var p_attention_image = "";
var p_attention_title = "ATTENTION";
var p_attention_sub = "";
var p_attention_bg = "#000000";
var p_attention_color = "#ffffff";
var p_attention_imgsize = 35;
var p_attention_titlesize = 10;
var p_attention_subsize = 5;
var p_attention_title_bold = true;
var p_attention_title_italic = false;
var p_attention_title_caps = true;
var p_attention_title_color = "#ffffff";
var p_attention_title_border_color = "#000000";
var p_attention_title_border_thickness = 0;
var p_attention_title_padding_v = 0;
var p_attention_title_padding_h = 0;
var p_attention_sub_bold = false;
var p_attention_sub_italic = false;
var p_attention_sub_caps = false;
var p_attention_sub_color = "#ffffff";
var p_attention_sub_border_color = "#000000";
var p_attention_sub_border_thickness = 0;
var p_attention_sub_padding_v = 0;
var p_attention_sub_padding_h = 0;
var p_attention_border_color = "#ffffff";
var p_attention_border_thickness = 0;
var p_attention_padding_v = 5;
var p_attention_padding_h = 5;
var p_attention_bgimage = "";
var p_attention_bgdim = 60;
var p_custom_slide = null;
var showingtheme = false;
var p_sync_enabled = true;
var p_sync_active_line_index = -1;
var p_sync_active_color = "#F59E0B";
var p_sync_inactive_color = "#94A3B8";
var p_sync_active_outline_enabled = false;
var p_sync_active_outline_color = "#000000";
var p_sync_active_outline_thickness = 2;
var p_teleprompter_mode = false;
var p_teleprompter_lines = null;
var p_teleprompter_font_size = null;
function initPresentation() {
  window.passVariable = function() {
    // Theme-designer preview mode: the hosting page injects an isolated
    // previewState so the preview renders through this exact engine without
    // touching (or being touched by) live projection state.
    if (window.previewState && typeof window.previewState === "object") {
      const s = window.previewState;
      p_text1_arr = s.text1 || [""];
      p_text2_arr = s.text2 || [""];
      p_person_title_arr = s.personTitleArr || (s.personTitle ? [s.personTitle] : []);
      p_person_title = (s.personTitle !== undefined && s.personTitle !== null) ? s.personTitle : (p_person_title_arr[0] || "");
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
      // Remote live feed carries the controller output state (Logo / Black
      // Screen toolbar buttons) through previewState; older payloads omit
      // it and fall back to plain live rendering.
      p_logo_mode = !!(s.logoMode !== undefined ? s.logoMode : (s.outputMode === "logo"));
      p_logo_image = (s.logoImage !== undefined && s.logoImage !== null) ? s.logoImage : "";
      p_logo_title = (s.logoTitle !== undefined && s.logoTitle !== null) ? s.logoTitle : "";
      p_logo_sub = (s.logoSub !== undefined && s.logoSub !== null) ? s.logoSub : "";
      p_logo_bg = s.logoBg || "#020617";
      p_logo_color = s.logoColor || "#ffffff";
      p_logo_imgsize = (isFinite(Number(s.logoImgSize)) ? Number(s.logoImgSize) : 40);
      p_logo_titlesize = (isFinite(Number(s.logoTitleSize)) ? Number(s.logoTitleSize) : 8);
      p_logo_subsize = (isFinite(Number(s.logoSubSize)) ? Number(s.logoSubSize) : 4);
      p_logo_title_bold = (s.logoTitleBold === undefined) ? true : !!s.logoTitleBold;
      p_logo_title_italic = !!s.logoTitleItalic;
      p_logo_sub_bold = !!s.logoSubBold;
      p_logo_sub_italic = !!s.logoSubItalic;
      p_logo_bgimage = (typeof s.logoBgImage === "string") ? s.logoBgImage : "";
      p_logo_bgdim = (isFinite(Number(s.logoBgDim)) ? Number(s.logoBgDim) : 50);
      p_attention_mode = !!(s.attentionMode !== undefined ? s.attentionMode : (s.outputMode === "attention" || s.outputMode === "black"));
      p_attention_image = (s.attentionImage !== undefined && s.attentionImage !== null) ? s.attentionImage : "";
      p_attention_title = (s.attentionTitle !== undefined && s.attentionTitle !== null) ? s.attentionTitle : "ATTENTION";
      p_attention_sub = (s.attentionSub !== undefined && s.attentionSub !== null) ? s.attentionSub : "";
      p_attention_bg = s.attentionBg || "#000000";
      p_attention_color = s.attentionColor || "#ffffff";
      p_attention_imgsize = (isFinite(Number(s.attentionImgSize)) ? Number(s.attentionImgSize) : 35);
      p_attention_titlesize = (isFinite(Number(s.attentionTitleSize)) ? Number(s.attentionTitleSize) : 10);
      p_attention_subsize = (isFinite(Number(s.attentionSubSize)) ? Number(s.attentionSubSize) : 5);
      p_attention_title_bold = (s.attentionTitleBold === undefined) ? true : !!s.attentionTitleBold;
      p_attention_title_italic = !!s.attentionTitleItalic;
      p_attention_title_caps = (s.attentionTitleCaps === undefined) ? true : !!s.attentionTitleCaps;
      p_attention_title_color = s.attentionTitleColor || s.attentionColor || "#ffffff";
      p_attention_title_border_color = s.attentionTitleBorderColor || "#000000";
      p_attention_title_border_thickness = (isFinite(Number(s.attentionTitleBorderThickness)) ? Number(s.attentionTitleBorderThickness) : 0);
      p_attention_title_padding_v = (isFinite(Number(s.attentionTitlePaddingV)) ? Number(s.attentionTitlePaddingV) : 0);
      p_attention_title_padding_h = (isFinite(Number(s.attentionTitlePaddingH)) ? Number(s.attentionTitlePaddingH) : 0);
      p_attention_sub_bold = !!s.attentionSubBold;
      p_attention_sub_italic = !!s.attentionSubItalic;
      p_attention_sub_caps = !!s.attentionSubCaps;
      p_attention_sub_color = s.attentionSubColor || s.attentionColor || "#ffffff";
      p_attention_sub_border_color = s.attentionSubBorderColor || "#000000";
      p_attention_sub_border_thickness = (isFinite(Number(s.attentionSubBorderThickness)) ? Number(s.attentionSubBorderThickness) : 0);
      p_attention_sub_padding_v = (isFinite(Number(s.attentionSubPaddingV)) ? Number(s.attentionSubPaddingV) : 0);
      p_attention_sub_padding_h = (isFinite(Number(s.attentionSubPaddingH)) ? Number(s.attentionSubPaddingH) : 0);
      p_attention_border_color = s.attentionBorderColor || "#ffffff";
      p_attention_border_thickness = (isFinite(Number(s.attentionBorderThickness)) ? Number(s.attentionBorderThickness) : 0);
      const fallbackPadS = isFinite(Number(s.attentionPadding)) ? Number(s.attentionPadding) : 5;
      p_attention_padding_v = (isFinite(Number(s.attentionPaddingV)) ? Number(s.attentionPaddingV) : fallbackPadS);
      p_attention_padding_h = (isFinite(Number(s.attentionPaddingH)) ? Number(s.attentionPaddingH) : fallbackPadS);
      p_attention_bgimage = (typeof s.attentionBgImage === "string") ? s.attentionBgImage : "";
      p_attention_bgdim = (isFinite(Number(s.attentionBgDim)) ? Number(s.attentionBgDim) : 60);
      p_custom_slide = (s.customSlide && typeof s.customSlide === "object") ? s.customSlide : null;
      p_align = s.align || PROJECTION_FALLBACK_STYLE.textAlign;
      p_output_mode = s.outputMode || (p_logo_mode ? "logo" : (p_attention_mode ? "attention" : "live"));
      p_sync_enabled = (s.syncEnabled !== undefined) ? !!s.syncEnabled : true;
      p_sync_active_line_index = (typeof s.syncActiveLineIndex === "number") ? s.syncActiveLineIndex : -1;
      p_sync_active_color = s.syncActiveColor || "#F59E0B";
      p_sync_inactive_color = s.syncInactiveColor || "#94A3B8";
      p_sync_active_outline_enabled = (s.syncActiveOutlineEnabled !== undefined) ? !!s.syncActiveOutlineEnabled : (s.p_sync_active_outline_enabled !== undefined ? !!s.p_sync_active_outline_enabled : false);
      p_sync_active_outline_color = s.syncActiveOutlineColor || s.p_sync_active_outline_color || "#000000";
      p_sync_active_outline_thickness = (typeof s.syncActiveOutlineThickness === "number") ? s.syncActiveOutlineThickness : ((typeof s.p_sync_active_outline_thickness === "number") ? s.p_sync_active_outline_thickness : 2);
      window.p_sync_active_outline_enabled = p_sync_active_outline_enabled;
      window.p_sync_active_outline_color = p_sync_active_outline_color;
      window.p_sync_active_outline_thickness = p_sync_active_outline_thickness;
      p_teleprompter_mode = (s.teleprompterMode !== undefined) ? !!s.teleprompterMode : (s.p_teleprompter_mode !== undefined ? !!s.p_teleprompter_mode : false);
      p_teleprompter_lines = s.teleprompterLines || s.p_teleprompter_lines || null;
      window.isRemoteDisplay = !!(s.isRemoteDisplay || window.isRemoteDisplay);
      if (window.isRemoteDisplay) {
        p_teleprompter_font_size = null;
      } else {
        p_teleprompter_font_size = (typeof s.teleprompterFontSize === "number") ? s.teleprompterFontSize : ((typeof s.p_teleprompter_font_size === "number") ? s.p_teleprompter_font_size : null);
      }
      window.p_teleprompter_mode = p_teleprompter_mode;
      window.p_teleprompter_lines = p_teleprompter_lines;
      window.p_teleprompter_font_size = p_teleprompter_font_size;
      window.activeThemeObj = s.theme || null;
      if (window.activeThemeObj) {
        blur = (typeof window.activeThemeObj.shadowBlur !== "undefined") ? window.activeThemeObj.shadowBlur : 4;
        shadowColor = window.activeThemeObj.shadowColor || PROJECTION_FALLBACK_STYLE.shadowColor;
      }
      p_stage_layout = (s.stageLayout !== undefined) ? s.stageLayout : null;
      window.p_stage_layout = p_stage_layout;
      p_stage_stream_id = (s.stageStreamId !== undefined) ? s.stageStreamId : null;
      window.p_stage_stream_id = p_stage_stream_id;
      p_stage_source_type = (s.stageSourceType !== undefined) ? s.stageSourceType : null;
      window.p_stage_source_type = p_stage_source_type;
      return;
    }
    const src = window.opener || (window.parent !== window ? window.parent : null);
    if (src) {
        const isSanctuaryProjector = Boolean(
          window.isSanctuaryProjector ||
          window.name === "UECFI_Presentation" ||
          (src.newWindow && src.newWindow.window === window)
        );
        const stageLayout = getActiveStageLayout();
        const hasVideo = Boolean(stageLayout);
        const isVersesLive = Boolean(
          (src.liveProjectionType === "verses") ||
          (src.liveProjectionType == null && !src.liveProgramActive && (src.presentedSongIdx == null || src.presentedSongIdx < 0) && typeof src.presentedVerseIndex === "number" && src.presentedVerseIndex >= 0)
        );

        // Main display should always be dual verse mode when no video feed present on it AND verses are being projected.
        // Centro camera is never projected to the centro screen, so when camera
        // or no video is on stage, hasVideo is false and dual verses are displayed.
        const dual1 = src.p_dual_text1_arr;
        const dual2 = src.p_dual_text2_arr;
        if (isVersesLive && isSanctuaryProjector && !hasVideo && dual1 && dual1.length > 0) {
          p_text1_arr = dual1.slice();
          p_text2_arr = (dual2 && dual2.length > 0) ? dual2.slice() : [];
          p_footnote = (src && src.p_dual_footnote) || src.p_footnote || p_footnote;
        } else {
          p_text1_arr = src.p_text1_arr;
          p_text2_arr = src.p_text2_arr;
          p_footnote = src.p_footnote;
        }
        p_person_title_arr = src.p_person_title_arr || [];
        p_person_title = (typeof src.p_person_title === "string") ? src.p_person_title : "";
        p_title_arr = src.p_title_arr || [];
        p_text1_font = src.p_text1_font;
        p_text2_font = src.p_text2_font;
        p_title = src.p_title;
        p_stage_layout = src.p_stage_layout || null;
        window.p_stage_layout = p_stage_layout;
        p_stage_stream_id = src.p_stage_stream_id || null;
        window.p_stage_stream_id = p_stage_stream_id;
        p_stage_source_type = src.p_stage_source_type || null;
        window.p_stage_source_type = p_stage_source_type;
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
        p_attention_mode = !!src.p_attention_mode;
        p_attention_image = src.p_attention_image || "";
        p_attention_title = (src.p_attention_title !== undefined) ? src.p_attention_title : "ATTENTION";
        p_attention_sub = src.p_attention_sub || "";
        p_attention_bg = src.p_attention_bg || "#000000";
        p_attention_color = src.p_attention_color || "#ffffff";
        p_attention_imgsize = (isFinite(Number(src.p_attention_imgsize)) ? Number(src.p_attention_imgsize) : 35);
        p_attention_titlesize = (isFinite(Number(src.p_attention_titlesize)) ? Number(src.p_attention_titlesize) : 10);
        p_attention_subsize = (isFinite(Number(src.p_attention_subsize)) ? Number(src.p_attention_subsize) : 5);
        p_attention_title_bold = (src.p_attention_title_bold === undefined) ? true : !!src.p_attention_title_bold;
        p_attention_title_italic = !!src.p_attention_title_italic;
        p_attention_title_caps = (src.p_attention_title_caps === undefined) ? true : !!src.p_attention_title_caps;
        p_attention_title_color = src.p_attention_title_color || src.p_attention_color || "#ffffff";
        p_attention_title_border_color = src.p_attention_title_border_color || "#000000";
        p_attention_title_border_thickness = (isFinite(Number(src.p_attention_title_border_thickness)) ? Number(src.p_attention_title_border_thickness) : 0);
        p_attention_title_padding_v = (isFinite(Number(src.p_attention_title_padding_v)) ? Number(src.p_attention_title_padding_v) : 0);
        p_attention_title_padding_h = (isFinite(Number(src.p_attention_title_padding_h)) ? Number(src.p_attention_title_padding_h) : 0);
        p_attention_sub_bold = !!src.p_attention_sub_bold;
        p_attention_sub_italic = !!src.p_attention_sub_italic;
        p_attention_sub_caps = !!src.p_attention_sub_caps;
        p_attention_sub_color = src.p_attention_sub_color || src.p_attention_color || "#ffffff";
        p_attention_sub_border_color = src.p_attention_sub_border_color || "#000000";
        p_attention_sub_border_thickness = (isFinite(Number(src.p_attention_sub_border_thickness)) ? Number(src.p_attention_sub_border_thickness) : 0);
        p_attention_sub_padding_v = (isFinite(Number(src.p_attention_sub_padding_v)) ? Number(src.p_attention_sub_padding_v) : 0);
        p_attention_sub_padding_h = (isFinite(Number(src.p_attention_sub_padding_h)) ? Number(src.p_attention_sub_padding_h) : 0);
        p_attention_border_color = src.p_attention_border_color || "#ffffff";
        p_attention_border_thickness = (isFinite(Number(src.p_attention_border_thickness)) ? Number(src.p_attention_border_thickness) : 0);
        const fallbackPadSrc = isFinite(Number(src.p_attention_padding)) ? Number(src.p_attention_padding) : 5;
        p_attention_padding_v = (isFinite(Number(src.p_attention_padding_v)) ? Number(src.p_attention_padding_v) : fallbackPadSrc);
        p_attention_padding_h = (isFinite(Number(src.p_attention_padding_h)) ? Number(src.p_attention_padding_h) : fallbackPadSrc);
        p_attention_bgimage = (typeof src.p_attention_bgimage === "string") ? src.p_attention_bgimage : "";
        p_attention_bgdim = (isFinite(Number(src.p_attention_bgdim)) ? Number(src.p_attention_bgdim) : 60);
        p_custom_slide = (src.p_custom_slide && typeof src.p_custom_slide === "object") ? src.p_custom_slide : null;
        p_output_mode = src.p_output_mode || "live";
        p_align = src.p_align || PROJECTION_FALLBACK_STYLE.textAlign;
        p_sync_enabled = (src.p_sync_enabled !== undefined) ? !!src.p_sync_enabled : true;
        p_sync_active_line_index = (typeof src.p_sync_active_line_index === "number") ? src.p_sync_active_line_index : -1;
        p_sync_active_color = src.p_sync_active_color || "#F59E0B";
        p_sync_inactive_color = src.p_sync_inactive_color || "#94A3B8";
        p_sync_active_outline_enabled = (src.p_sync_active_outline_enabled !== undefined) ? !!src.p_sync_active_outline_enabled : (src.activeThemeObj ? !!src.activeThemeObj.syncActiveOutlineEnabled : false);
        p_sync_active_outline_color = src.p_sync_active_outline_color || (src.activeThemeObj && src.activeThemeObj.syncActiveOutlineColor) || "#000000";
        p_sync_active_outline_thickness = (typeof src.p_sync_active_outline_thickness === "number") ? src.p_sync_active_outline_thickness : ((src.activeThemeObj && typeof src.activeThemeObj.syncActiveOutlineThickness === "number") ? src.activeThemeObj.syncActiveOutlineThickness : 2);
        window.p_sync_active_outline_enabled = p_sync_active_outline_enabled;
        window.p_sync_active_outline_color = p_sync_active_outline_color;
        window.p_sync_active_outline_thickness = p_sync_active_outline_thickness;
        p_teleprompter_mode = (typeof src.p_teleprompter_mode !== "undefined") ? !!src.p_teleprompter_mode : false;
        p_teleprompter_lines = (typeof src.p_teleprompter_lines !== "undefined") ? src.p_teleprompter_lines : null;
        p_teleprompter_font_size = (typeof src.p_teleprompter_font_size !== "undefined") ? src.p_teleprompter_font_size : null;
        window.p_teleprompter_mode = p_teleprompter_mode;
        window.p_teleprompter_lines = p_teleprompter_lines;
        window.p_teleprompter_font_size = p_teleprompter_font_size;
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
        if (!event || !event.data) return;
        const { type, payload } = event.data;
        if (type === "SPEAKER_LOWER_THIRD_UPDATE" && payload) {
          if (typeof updateSpeakerLowerThird === "function") {
            updateSpeakerLowerThird(payload);
          }
          return;
        }
        if (type === "COUNTDOWN_UPDATE" && payload) {
          if (typeof updateSongCountdown === "function") {
            updateSongCountdown(payload);
          }
          return;
        }
        if (type === "HIGHLIGHT_LINE" && payload) {
          p_sync_active_line_index = (typeof payload.lineIndex === "number") ? payload.lineIndex : -1;
          p_sync_enabled = payload.syncEnabled !== false;
          if (payload.activeColor) p_sync_active_color = payload.activeColor;
          if (payload.inactiveColor) p_sync_inactive_color = payload.inactiveColor;
          if (payload.activeOutlineEnabled !== undefined) {
            p_sync_active_outline_enabled = !!payload.activeOutlineEnabled;
            if (typeof window !== "undefined") window.p_sync_active_outline_enabled = !!payload.activeOutlineEnabled;
          }
          if (payload.activeOutlineColor) {
            p_sync_active_outline_color = payload.activeOutlineColor;
            if (typeof window !== "undefined") window.p_sync_active_outline_color = payload.activeOutlineColor;
          }
          if (payload.activeOutlineThickness !== undefined) {
            p_sync_active_outline_thickness = payload.activeOutlineThickness;
            if (typeof window !== "undefined") window.p_sync_active_outline_thickness = payload.activeOutlineThickness;
          }
          if (payload.lineIndex >= 0 && typeof updateSongCountdown === "function") {
            updateSongCountdown({ active: false });
          }
          if (window.p_teleprompter_mode && typeof updateTeleprompterActiveLine === "function") {
            updateTeleprompterActiveLine(p_sync_active_line_index);
          } else if (typeof applySongLineHighlight === "function") {
            applySongLineHighlight(p_sync_active_line_index, p_sync_enabled);
          }
          return;
        }
        if (type === "SET_TELEPROMPTER_FONT_SIZE" && payload) {
          if (window.isRemoteDisplay || (window.previewState && window.previewState.isRemoteDisplay)) {
            return;
          }
          p_teleprompter_font_size = (typeof payload.fontSize === "number") ? payload.fontSize : null;
          window.p_teleprompter_font_size = p_teleprompter_font_size;
          if (window.p_teleprompter_mode && Array.isArray(window.p_teleprompter_lines) && window.p_teleprompter_lines.length > 0) {
            renderTeleprompter(window.p_teleprompter_lines, p_sync_active_line_index, p_teleprompter_font_size);
          }
          return;
        }
        if (window.previewState && typeof window.previewState === "object") return;
        if (type === "UPDATE_STATE" && payload) {
          const isSanctuaryProjector = Boolean(
            window.isSanctuaryProjector ||
            window.name === "UECFI_Presentation"
          );
          const stageLayout = getActiveStageLayout();
          const hasVideo = Boolean(stageLayout);
          const isVersesLive = (payload.liveProjectionType === "verses" || payload.isVersesLive);
          if (isVersesLive && isSanctuaryProjector && !hasVideo && payload.p_dual_text1_arr && payload.p_dual_text1_arr.length > 0) {
            p_text1_arr = payload.p_dual_text1_arr.slice();
            p_text2_arr = (payload.p_dual_text2_arr && payload.p_dual_text2_arr.length > 0) ? payload.p_dual_text2_arr.slice() : [];
            p_footnote = payload.p_dual_footnote || payload.p_footnote;
          } else {
            p_text1_arr = payload.p_text1_arr;
            p_text2_arr = payload.p_text2_arr;
            p_footnote = payload.p_footnote;
          }
          p_person_title_arr = payload.p_person_title_arr || [];
          p_person_title = (typeof payload.p_person_title === "string") ? payload.p_person_title : "";
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
          p_logo_mode = !!payload.p_logo_mode;
          p_logo_image = payload.p_logo_image || "";
          p_logo_title = payload.p_logo_title || "";
          p_logo_sub = payload.p_logo_sub || "";
          p_logo_bg = payload.p_logo_bg || "#020617";
          p_logo_color = payload.p_logo_color || "#ffffff";
          p_logo_imgsize = isFinite(Number(payload.p_logo_imgsize)) ? Number(payload.p_logo_imgsize) : 40;
          p_logo_titlesize = isFinite(Number(payload.p_logo_titlesize)) ? Number(payload.p_logo_titlesize) : 8;
          p_logo_subsize = isFinite(Number(payload.p_logo_subsize)) ? Number(payload.p_logo_subsize) : 4;
          p_logo_title_bold = (payload.p_logo_title_bold === undefined) ? true : !!payload.p_logo_title_bold;
          p_logo_title_italic = !!payload.p_logo_title_italic;
          p_logo_sub_bold = !!payload.p_logo_sub_bold;
          p_logo_sub_italic = !!payload.p_logo_sub_italic;
          p_logo_bgimage = (typeof payload.p_logo_bgimage === "string") ? payload.p_logo_bgimage : "";
          p_logo_bgdim = (isFinite(Number(payload.p_logo_bgdim)) ? Number(payload.p_logo_bgdim) : 50);
          p_attention_mode = !!payload.p_attention_mode;
          p_attention_image = payload.p_attention_image || "";
          p_attention_title = (payload.p_attention_title !== undefined) ? payload.p_attention_title : "ATTENTION";
          p_attention_sub = payload.p_attention_sub || "";
          p_attention_bg = payload.p_attention_bg || "#000000";
          p_attention_color = payload.p_attention_color || "#ffffff";
          p_attention_imgsize = isFinite(Number(payload.p_attention_imgsize)) ? Number(payload.p_attention_imgsize) : 35;
          p_attention_titlesize = isFinite(Number(payload.p_attention_titlesize)) ? Number(payload.p_attention_titlesize) : 10;
          p_attention_subsize = isFinite(Number(payload.p_attention_subsize)) ? Number(payload.p_attention_subsize) : 5;
          p_attention_title_bold = (payload.p_attention_title_bold === undefined) ? true : !!payload.p_attention_title_bold;
          p_attention_title_italic = !!payload.p_attention_title_italic;
          p_attention_title_caps = (payload.p_attention_title_caps === undefined) ? true : !!payload.p_attention_title_caps;
          p_attention_title_color = payload.p_attention_title_color || payload.p_attention_color || "#ffffff";
          p_attention_title_border_color = payload.p_attention_title_border_color || "#000000";
          p_attention_title_border_thickness = isFinite(Number(payload.p_attention_title_border_thickness)) ? Number(payload.p_attention_title_border_thickness) : 0;
          p_attention_title_padding_v = isFinite(Number(payload.p_attention_title_padding_v)) ? Number(payload.p_attention_title_padding_v) : 0;
          p_attention_title_padding_h = isFinite(Number(payload.p_attention_title_padding_h)) ? Number(payload.p_attention_title_padding_h) : 0;
          p_attention_sub_bold = !!payload.p_attention_sub_bold;
          p_attention_sub_italic = !!payload.p_attention_sub_italic;
          p_attention_sub_caps = !!payload.p_attention_sub_caps;
          p_attention_sub_color = payload.p_attention_sub_color || payload.p_attention_color || "#ffffff";
          p_attention_sub_border_color = payload.p_attention_sub_border_color || "#000000";
          p_attention_sub_border_thickness = isFinite(Number(payload.p_attention_sub_border_thickness)) ? Number(payload.p_attention_sub_border_thickness) : 0;
          p_attention_sub_padding_v = isFinite(Number(payload.p_attention_sub_padding_v)) ? Number(payload.p_attention_sub_padding_v) : 0;
          p_attention_sub_padding_h = isFinite(Number(payload.p_attention_sub_padding_h)) ? Number(payload.p_attention_sub_padding_h) : 0;
          p_attention_border_color = payload.p_attention_border_color || "#ffffff";
          p_attention_border_thickness = isFinite(Number(payload.p_attention_border_thickness)) ? Number(payload.p_attention_border_thickness) : 0;
          const fallbackPadPayload = isFinite(Number(payload.p_attention_padding)) ? Number(payload.p_attention_padding) : 5;
          p_attention_padding_v = isFinite(Number(payload.p_attention_padding_v)) ? Number(payload.p_attention_padding_v) : fallbackPadPayload;
          p_attention_padding_h = isFinite(Number(payload.p_attention_padding_h)) ? Number(payload.p_attention_padding_h) : fallbackPadPayload;
          p_attention_bgimage = (typeof payload.p_attention_bgimage === "string") ? payload.p_attention_bgimage : "";
          p_attention_bgdim = (isFinite(Number(payload.p_attention_bgdim)) ? Number(payload.p_attention_bgdim) : 60);
          p_custom_slide = (payload.p_custom_slide && typeof payload.p_custom_slide === "object") ? payload.p_custom_slide : null;
          p_output_mode = payload.p_output_mode || (p_logo_mode ? "logo" : (p_attention_mode ? "attention" : "live"));
          p_align = payload.p_align || p_align || "center";
          p_sync_enabled = (payload.p_sync_enabled !== undefined) ? !!payload.p_sync_enabled : true;
          p_sync_active_line_index = (typeof payload.p_sync_active_line_index === "number") ? payload.p_sync_active_line_index : -1;
          p_sync_active_color = payload.p_sync_active_color || "#F59E0B";
          p_sync_inactive_color = payload.p_sync_inactive_color || "#94A3B8";
          p_teleprompter_mode = (payload.p_teleprompter_mode !== undefined) ? !!payload.p_teleprompter_mode : false;
          p_teleprompter_lines = payload.p_teleprompter_lines || null;
          p_teleprompter_font_size = (typeof payload.p_teleprompter_font_size === "number") ? payload.p_teleprompter_font_size : ((typeof payload.teleprompterFontSize === "number") ? payload.teleprompterFontSize : null);
          window.p_teleprompter_mode = p_teleprompter_mode;
          window.p_teleprompter_lines = p_teleprompter_lines;
          window.p_teleprompter_font_size = p_teleprompter_font_size;
          window.activeThemeObj = payload.activeThemeObj || null;
          if (window.activeThemeObj) {
            blur = (typeof window.activeThemeObj.shadowBlur !== "undefined") ? window.activeThemeObj.shadowBlur : 4;
            shadowColor = window.activeThemeObj.shadowColor || PROJECTION_FALLBACK_STYLE.shadowColor;
          }
          updatePresentation();
          updateContent();
        } else if (type === "SET_TELEPROMPTER_FONT_SIZE" && payload) {
          if (window.isRemoteDisplay || (window.previewState && window.previewState.isRemoteDisplay)) {
            return;
          }
          p_teleprompter_font_size = (typeof payload.fontSize === "number") ? payload.fontSize : null;
          window.p_teleprompter_font_size = p_teleprompter_font_size;
          if (window.p_teleprompter_mode && Array.isArray(window.p_teleprompter_lines) && window.p_teleprompter_lines.length > 0) {
            renderTeleprompter(window.p_teleprompter_lines, p_sync_active_line_index, p_teleprompter_font_size);
          }
        } else if (type === "COUNTDOWN_UPDATE" && payload) {
          if (typeof updateSongCountdown === "function") {
            updateSongCountdown(payload);
          }
        } else if (type === "HIGHLIGHT_LINE" && payload) {
          p_sync_active_line_index = (typeof payload.lineIndex === "number") ? payload.lineIndex : -1;
          p_sync_enabled = payload.syncEnabled !== false;
          if (payload.activeColor) p_sync_active_color = payload.activeColor;
          if (payload.inactiveColor) p_sync_inactive_color = payload.inactiveColor;
          if (payload.activeOutlineEnabled !== undefined) {
            p_sync_active_outline_enabled = !!payload.activeOutlineEnabled;
            if (typeof window !== "undefined") window.p_sync_active_outline_enabled = !!payload.activeOutlineEnabled;
          }
          if (payload.activeOutlineColor) {
            p_sync_active_outline_color = payload.activeOutlineColor;
            if (typeof window !== "undefined") window.p_sync_active_outline_color = payload.activeOutlineColor;
          }
          if (payload.activeOutlineThickness !== undefined) {
            p_sync_active_outline_thickness = payload.activeOutlineThickness;
            if (typeof window !== "undefined") window.p_sync_active_outline_thickness = payload.activeOutlineThickness;
          }
          if (payload.lineIndex >= 0 && typeof updateSongCountdown === "function") {
            updateSongCountdown({ active: false });
          }
          if (window.p_teleprompter_mode && typeof updateTeleprompterActiveLine === "function") {
            updateTeleprompterActiveLine(p_sync_active_line_index);
          } else if (typeof applySongLineHighlight === "function") {
            applySongLineHighlight(p_sync_active_line_index, p_sync_enabled);
          }
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
  const stageLayout = getActiveStageLayout();
  if (stageLayout === "lower-third" || window.p_teleprompter_mode) {
    updateContent2();
    return;
  }
  fadeout.onComplete.subscribe(updateContent2);
  fadeout.animate();
}
function prevSlide() {
  p_current_index = get_prev_index();
  document.getElementById("content1").style.textShadow = null;
  document.getElementById("content2").style.textShadow = null;
  const stageLayout = getActiveStageLayout();
  if (stageLayout === "lower-third" || window.p_teleprompter_mode) {
    updateContent2();
    return;
  }
  fadeout.onComplete.subscribe(updateContent2);
  fadeout.animate();
}
function updateContent() { 
  console.log('updateContent called'); 
  document.getElementById("content1").style.textShadow = null;
  document.getElementById("content2").style.textShadow = null;
  const stageLayout = getActiveStageLayout();
  if (stageLayout === "lower-third" || window.p_teleprompter_mode) {
    updateContent2();
    return;
  }
  fadeout.onComplete.subscribe(updateContent2);
  fadeout.animate();
}
function formatProjectedVerseNumbers(rawHtml, titleStr, theme, hasText2) {
  if (!rawHtml || typeof rawHtml !== "string") return "";
  if (titleStr && /\d+:\d+/.test(String(titleStr))) {
    const accentColor = "#FBBF24";
    return rawHtml.replace(
      /(^|<br\s*\/?>)\s*(\d{1,3})\s+/gi,
      `$1<sup class="proj-verse-num" style="color:${accentColor};font-weight:800;font-size:0.62em;vertical-align:super;line-height:0;margin-right:0.28em;font-style:normal;letter-spacing:0.02em;">$2</sup>`
    );
  }
  const lines = rawHtml.split(/<br\s*\/?>|\r?\n/i);

  // Check if synchronized lyrics highlighting is active for songs
  const isSyncActive = (typeof p_sync_enabled !== "undefined" ? p_sync_enabled : true);
  const activeColor = (theme && theme.syncActiveColor) || (typeof p_sync_active_color !== "undefined" ? p_sync_active_color : "#F59E0B");
  const inactiveColor = (theme && theme.syncInactiveColor) || (typeof p_sync_inactive_color !== "undefined" ? p_sync_inactive_color : "#94A3B8");
  const defaultColor = (theme && theme.primaryColor) ? theme.primaryColor : (typeof p_font_color !== "undefined" ? p_font_color : "#FFFFFF");
  const activeIdx = (typeof p_sync_active_line_index === "number") ? p_sync_active_line_index : -1;

  // Check if any line on this slide contains a timestamp
  const hasTimestamps = lines.some(l => /\[\s*\d{1,2}:\d{2}(?:[.:]\d{1,3})?\s*\]/.test(l));

  if (isSyncActive && hasTimestamps && !hasText2) {
    let lineIdx = 0;
    return lines
      .map((line) => {
        const trimmed = line.trim();
        if (trimmed === "" || trimmed === ".") return "";
        // Strip timestamp for projection display
        const cleanText = line.replace(/^\s*\[\s*\d{1,2}:\d{2}(?:[.:]\d{1,3})?\s*\]\s*/, "");
        const isCurrentActive = (activeIdx >= 0 && lineIdx === activeIdx);
        const color = isCurrentActive ? activeColor : (activeIdx >= 0 ? inactiveColor : defaultColor);
        const weight = isCurrentActive ? "700" : "400";
        // Clean drop shadow without color glow
        const shadow = isCurrentActive ? "text-shadow: 2px 2px 4px #000000;" : "";
        const transform = isCurrentActive ? "transform: scale(1.02);" : "";
        const opacity = (activeIdx >= 0 && !isCurrentActive) ? "opacity: 0.75;" : "opacity: 1;";
        const html = `<div class="song-line" data-line-idx="${lineIdx}" style="color:${color};font-weight:${weight};${shadow}${transform}${opacity}transition: all 0.25s ease-out;display:block;">${cleanText}</div>`;
        lineIdx++;
        return html;
      })
      .join("");
  }

  const formatListBullet = (text) => {
    const bulletColor = (theme && theme.bulletColor) || "#FBBF24";
    const bulletSymbol = (theme && theme.bulletSymbol) || "•";
    const bulletScale = (theme && typeof theme.bulletScale === "number") ? theme.bulletScale : 1.2;
    const bulletMatch = text.match(/^\s*(?:([-*•▸◆✓★–])|(\d+[.)]|[a-zA-Z][.)]))\s+(.+)$/);
    if (!bulletMatch) return text;
    const marker = bulletMatch[1] ? bulletSymbol : bulletMatch[2];
    return `<span class="proj-list-bullet" style="color:${bulletColor};font-weight:900;font-size:${bulletScale}em;margin-right:0.35em;display:inline-block;line-height:1;">${marker}</span>${bulletMatch[3]}`;
  };

  if (theme && theme.alternateLineColorEnabled && !hasText2 && lines.length > 1) {
    const oddColor = theme.primaryColor || p_font_color || "#FFFFFF";
    const evenColor = theme.alternateLineColor || "#FDE68A";
    let lineIdx = 0;
    return lines
      .map((line) => {
        const trimmed = line.trim();
        if (trimmed === "" || trimmed === ".") return "";
        const cleanText = formatListBullet(line.replace(/^\s*\[\s*\d{1,2}:\d{2}(?:[.:]\d{1,3})?\s*\]\s*/, ""));
        const color = (lineIdx % 2 === 1) ? evenColor : oddColor;
        lineIdx++;
        return `<span style="color:${color};">${cleanText}</span>`;
      })
      .join("<BR>");
  }
  return lines
    .map((line) => {
      const trimmed = line.trim();
      if (trimmed === ".") return "";
      const cleanText = line.replace(/^\s*\[\s*\d{1,2}:\d{2}(?:[.:]\d{1,3})?\s*\]\s*/, "");
      return formatListBullet(cleanText);
    })
    .join("<BR>");
}

/**
 * Generates a smooth, uniform contour outline using multi-directional text-shadow.
 * Eliminates the "text placed on top of bigger text" artifact caused by paint-order stroke fill,
 * preserving natural glyph letterforms, inner counters, and kerning.
 */
function getActiveLineOutlineShadow(thickness, outlineColor, baseDropShadow) {
  if (!thickness || thickness <= 0) {
    return baseDropShadow || "none";
  }
  const t = Math.max(1, Math.min(8, thickness));
  const col = outlineColor || "#000000";
  const shadows = [];
  const steps = (t <= 2) ? 8 : (t <= 4 ? 12 : 16);
  for (let r = 1; r <= t; r += (t > 4 ? 1.5 : 1)) {
    for (let i = 0; i < steps; i++) {
      const angle = (i * 2 * Math.PI) / steps;
      const x = (Math.cos(angle) * r).toFixed(1);
      const y = (Math.sin(angle) * r).toFixed(1);
      shadows.push(`${x}px ${y}px 0 ${col}`);
    }
  }
  if (baseDropShadow && baseDropShadow !== "none") {
    shadows.push(baseDropShadow);
  }
  return shadows.join(", ");
}
if (typeof window !== "undefined") {
  window.getActiveLineOutlineShadow = getActiveLineOutlineShadow;
}

function applySongLineHighlight(activeIdx, isSyncEnabled) {
  if (activeIdx >= 0 && typeof updateSongCountdown === "function") {
    updateSongCountdown({ active: false });
  }
  const container = document.getElementById("content1");
  if (!container) return;
  const lineEls = container.querySelectorAll(".song-line");
  if (!lineEls || lineEls.length === 0) return;

  const theme = window.activeThemeObj;
  const activeColor = (theme && theme.syncActiveColor) || (typeof p_sync_active_color !== "undefined" ? p_sync_active_color : "#F59E0B");
  const inactiveColor = (theme && theme.syncInactiveColor) || (typeof p_sync_inactive_color !== "undefined" ? p_sync_inactive_color : "#94A3B8");
  const defaultColor = (theme && theme.primaryColor) ? theme.primaryColor : (typeof p_font_color !== "undefined" ? p_font_color : "#FFFFFF");
  const syncOn = (isSyncEnabled !== false) && (typeof p_sync_enabled !== "undefined" ? p_sync_enabled : true);
  const outlineEnabled = Boolean(
    (typeof window !== "undefined" && window.p_sync_active_outline_enabled) ||
    (typeof p_sync_active_outline_enabled !== "undefined" && p_sync_active_outline_enabled) ||
    (theme && theme.syncActiveOutlineEnabled)
  );
  const outlineColor = (typeof window !== "undefined" && window.p_sync_active_outline_color)
    || (typeof p_sync_active_outline_color !== "undefined" && p_sync_active_outline_color)
    || ((theme && theme.syncActiveOutlineColor) || "#000000");
  const outlineThickness = (typeof window !== "undefined" && typeof window.p_sync_active_outline_thickness === "number")
    ? window.p_sync_active_outline_thickness
    : ((typeof p_sync_active_outline_thickness === "number")
      ? p_sync_active_outline_thickness
      : ((theme && typeof theme.syncActiveOutlineThickness === "number") ? theme.syncActiveOutlineThickness : 2));

  const baseDropShadow = (theme && theme.primaryShadowEnabled === false) ? "none" : "2px 2px 4px #000000";

  lineEls.forEach((el, idx) => {
    if (syncOn && activeIdx >= 0 && idx === activeIdx) {
      el.style.color = activeColor;
      el.style.opacity = "1";
      el.style.fontWeight = "700";
      el.style.transform = "none";
      el.style.webkitTextStroke = "0px transparent";
      el.style.paintOrder = "normal";
      if (outlineEnabled) {
        el.style.textShadow = getActiveLineOutlineShadow(outlineThickness, outlineColor, baseDropShadow);
      } else {
        el.style.textShadow = baseDropShadow;
      }
    } else if (syncOn && activeIdx >= 0) {
      el.style.color = inactiveColor;
      el.style.opacity = "0.75";
      el.style.fontWeight = "400";
      el.style.textShadow = "none";
      el.style.transform = "scale(1)";
      el.style.webkitTextStroke = "0px transparent";
      el.style.paintOrder = "normal";
    } else {
      el.style.color = defaultColor;
      el.style.opacity = "1";
      el.style.fontWeight = "400";
      el.style.textShadow = "none";
      el.style.transform = "scale(1)";
      el.style.webkitTextStroke = "0px transparent";
      el.style.paintOrder = "normal";
    }
  });
}
if (typeof window !== "undefined") {
  window.applySongLineHighlight = applySongLineHighlight;
}

/**
 * Automatically calculates optimal font size so the longest line in the song fits comfortably
 * horizontally across the remote display width without clipping or wrapping.
 */
function calculateOptimalFontSizeForLongestLine(longestText, fontFam, availWidth, maxAllowedFS) {
  if (!longestText || longestText.length === 0) return maxAllowedFS;
  const targetW = availWidth * 0.88; // comfortable breathing room on left/right

  if (typeof document !== "undefined") {
    try {
      const canvas = document.createElement("canvas");
      const ctx = canvas.getContext("2d");
      if (ctx) {
        ctx.font = `bold 100px ${fontFam || "Arial, sans-serif"}`;
        const w100 = ctx.measureText(longestText).width;
        if (w100 > 0) {
          const fitFS = Math.floor((targetW / w100) * 100);
          return Math.max(14, Math.min(maxAllowedFS, fitFS));
        }
      }
    } catch (e) {}
  }

  const charCount = Math.max(1, longestText.length);
  const fitFS = Math.floor(targetW / (charCount * 0.58));
  return Math.max(14, Math.min(maxAllowedFS, fitFS));
}

/**
 * Continuous 5-line scrolling teleprompter presentation mode for audio-synced songs.
 * Renders all song lines into a continuous vertical track with GPU translation (translate3d),
 * smooth top/bottom gradient fading, and prominent dead-center active line highlighting.
 */
function renderTeleprompter(lines, activeIdx, customFontSize) {
  if (!lines || !Array.isArray(lines) || lines.length === 0) return;
  const c1El = document.getElementById("content1");
  const c2El = document.getElementById("content2");
  const divEl = document.getElementById("presentationDivider");
  const ptEl = document.getElementById("contentPersonTitle");
  if (!c1El) return;

  // Clean up dual verse/person elements when in teleprompter mode
  if (c2El) {
    c2El.innerHTML = "";
    c2El.style.display = "none";
    c2El.style.visibility = "hidden";
  }
  if (divEl) divEl.style.display = "none";
  if (ptEl) {
    ptEl.textContent = "";
    ptEl.style.display = "none";
  }

  const stageLayout = getActiveStageLayout();
  const isLowerThird = (stageLayout === "lower-third");
  const totalWinY = Math.max(400, Number(p_window_Y) || window.innerHeight || 600);
  const totalWinX = Math.max(600, Number(p_window_X) || window.innerWidth || 800);
  const theme = window.activeThemeObj;

  const fontFam = (theme && theme.primaryFont) || p_text1_font || "Arial, sans-serif";
  const align = (theme && theme.textAlign) || p_align || "center";

  // Check if this instance is a remote display (e.g. tablet, phone, speaker remote, viewer)
  const isRemote = Boolean(
    window.isRemoteDisplay ||
    (window.previewState && window.previewState.isRemoteDisplay)
  );

  // Available horizontal width inside presentation margins
  const availW = totalWinX - (Number(p_leftMargin) || 40) - (Number(p_rightMargin) || 40) - 30;

  // Find longest line text across song for optimal width fitting
  let longestLineText = "";
  lines.forEach((l) => {
    const text = (l.cleanText || l.rawText || (typeof l === "string" ? l : "")).trim();
    if (text.length > longestLineText.length) {
      longestLineText = text;
    }
  });

  let viewportHeight;
  let lineHeight;
  let fontSize;

  if (isLowerThird) {
    // LOWER THIRD: Exactly 2 lines only, scaled proportionally to the container height
    const ltHeight = Math.max(160, Math.round(totalWinY * 0.32));
    const pTitleEl = document.getElementById("presentationTitle");
    const headerVisible = theme ? (theme.headerVisible !== false) : (p_showTitle !== false);
    const headerHeight = (headerVisible && pTitleEl && pTitleEl.style.display !== "none") ? Math.max(22, Math.round(ltHeight * 0.12)) : 0;
    const availContentH = Math.max(80, ltHeight - headerHeight - 28);

    // Font size ceiling calculated so 2 lines fit comfortably with compact spacing
    // For 2 lines with ~1.25 line-height: total height is 2 * (1.25 * FS) = 2.5 * FS
    const maxFSForHeight = Math.max(18, Math.min(68, Math.floor(availContentH / 2.7)));

    if (isRemote) {
      // Remote displays: auto-scale strictly to container height & longest line width
      fontSize = calculateOptimalFontSizeForLongestLine(longestLineText, fontFam, availW, maxFSForHeight);
    } else {
      // Main projection screen: allow operator font size adjustment if customized, capped to fit container
      let baseFontSize = (typeof customFontSize === "number" && customFontSize > 0)
        ? customFontSize
        : ((typeof p_teleprompter_font_size === "number" && p_teleprompter_font_size > 0) ? p_teleprompter_font_size : 0);
      let targetFS = maxFSForHeight;
      if (baseFontSize > 0) {
        targetFS = Math.max(16, Math.min(maxFSForHeight, Math.round(baseFontSize * 0.75)));
      }
      fontSize = calculateOptimalFontSizeForLongestLine(longestLineText, fontFam, availW, targetFS);
    }

    // REDUCED SPACE BETWEEN LINES: Proportional, compact broadcast line-height (1.25x font size)
    lineHeight = Math.max(24, Math.round(fontSize * 1.25));

    // Viewport height: 2 lines plus generous clearance for font descenders ('g', 'p', 'y', 'q', 'j') and drop-shadows
    // to prevent the lower part of the second line from ever getting clipped or hidden by overflow
    const descenderClearance = Math.max(8, Math.round(fontSize * 0.28));
    viewportHeight = (lineHeight * 2) + descenderClearance;
  } else {
    // FULL SCREEN / STANDARD: 5-line continuous scrolling teleprompter
    if (isRemote) {
      const pTitleEl = document.getElementById("presentationTitle");
      const headerVisible = theme ? (theme.headerVisible !== false) : (p_showTitle !== false);
      const headerHeight = (headerVisible && pTitleEl && pTitleEl.style.display !== "none") ? 60 : 0;
      const availH = Math.max(220, totalWinY - headerHeight - (Number(p_topMargin) || 40) - (Number(p_bottomMargin) || 40) - 30);
      const maxLineH = Math.max(30, Math.floor(availH / 5.2));
      const maxFS = Math.max(20, Math.round(maxLineH * 0.65));
      fontSize = calculateOptimalFontSizeForLongestLine(longestLineText, fontFam, availW, maxFS);
      lineHeight = Math.round(fontSize * 1.5);
      viewportHeight = lineHeight * 5;
    } else {
      let baseFontSize = (typeof customFontSize === "number" && customFontSize > 0)
        ? customFontSize
        : ((typeof p_teleprompter_font_size === "number" && p_teleprompter_font_size > 0) ? p_teleprompter_font_size : 0);
      if (baseFontSize > 0) {
        fontSize = Math.max(24, Math.min(140, Math.round(baseFontSize)));
        lineHeight = Math.round(fontSize * 1.5);
        viewportHeight = lineHeight * 5;
      } else {
        const defaultFS = Math.max(40, Math.min(76, Math.round(totalWinY * 0.052)));
        fontSize = defaultFS;
        lineHeight = Math.round(fontSize * 1.5);
        viewportHeight = lineHeight * 5;
      }
    }
  }

  // Viewport container styling
  c1El.style.height = `${viewportHeight}px`;
  c1El.style.maxHeight = `${viewportHeight}px`;
  c1El.style.position = "relative";
  c1El.style.overflow = "hidden";
  c1El.style.visibility = "visible";
  c1El.style.display = "block";
  if (isLowerThird) {
    c1El.style.boxSizing = "content-box";
    c1El.style.paddingBottom = "4px";
  } else {
    c1El.style.boxSizing = "border-box";
    c1El.style.paddingBottom = "0px";
  }

  if (isLowerThird) {
    // In 2-line lower third: NO gradient mask to avoid composite invalidation flicker over video
    c1El.style.maskImage = "none";
    c1El.style.webkitMaskImage = "none";
  } else {
    const gradMask = "linear-gradient(to bottom, transparent 0%, rgba(0,0,0,0.85) 15%, black 28%, black 72%, rgba(0,0,0,0.85) 85%, transparent 100%)";
    c1El.style.maskImage = gradMask;
    c1El.style.webkitMaskImage = gradMask;
  }

  let track = document.getElementById("teleprompterTrack");
  const existingLineCount = track ? track.querySelectorAll(".teleprompter-line").length : 0;
  const isNewTrack = (!track || existingLineCount !== lines.length);

  const justifyAlign = align === "left" ? "flex-start" : (align === "right" ? "flex-end" : "center");
  const wrapLineHeight = isLowerThird ? 1.18 : 1.25;
  const linePadV = Math.max(3, Math.round(fontSize * 0.14));

  if (isNewTrack) {
    let trackHtml = `<div id="teleprompterTrack" style="width:100%; position:relative; will-change:transform; transition:transform 0.38s cubic-bezier(0.25, 1, 0.5, 1);">`;
    lines.forEach((line, idx) => {
      const text = line.cleanText || line.rawText || (typeof line === "string" ? line : "");
      trackHtml += `<div class="teleprompter-line" data-line-index="${idx}" style="min-height:${lineHeight}px; height:auto; line-height:${wrapLineHeight}; font-size:${fontSize}px; font-family:${fontFam}; text-align:${align}; display:flex; align-items:center; justify-content:${justifyAlign}; white-space:normal; text-wrap:balance; word-break:normal; overflow-wrap:break-word; padding:${linePadV}px 0; box-sizing:border-box; transition: color 0.3s ease, opacity 0.3s ease, text-shadow 0.3s ease;">${text}</div>`;
    });
    trackHtml += `</div>`;
    c1El.innerHTML = trackHtml;
    track = document.getElementById("teleprompterTrack");
  } else {
    const lineEls = track.querySelectorAll(".teleprompter-line");
    lineEls.forEach((el) => {
      el.style.minHeight = `${lineHeight}px`;
      el.style.height = "auto";
      el.style.lineHeight = String(wrapLineHeight);
      el.style.fontSize = `${fontSize}px`;
      el.style.fontFamily = fontFam;
      el.style.textAlign = align;
      el.style.display = "flex";
      el.style.alignItems = "center";
      el.style.justifyContent = justifyAlign;
      el.style.whiteSpace = "normal";
      el.style.textWrap = "balance";
      el.style.wordBreak = "normal";
      el.style.overflowWrap = "break-word";
      el.style.padding = `${linePadV}px 0`;
      el.style.boxSizing = "border-box";
    });
  }

  if (track) {
    track.dataset.lineHeight = String(lineHeight);
    // Snap immediately on newly created track so initial layout doesn't slide down from y=0
    if (isNewTrack) {
      track.style.transition = "none";
    }
  }

  updateTeleprompterActiveLine(activeIdx, lineHeight);

  if (track && isNewTrack) {
    void track.offsetHeight;
    track.style.transition = "transform 0.38s cubic-bezier(0.25, 1, 0.5, 1)";
  }

  const countdownEl = document.getElementById("songCountdownDots");
  if (countdownEl && countdownEl.style.display !== "none" && typeof positionSongCountdown === "function") {
    const dotSize = isLowerThird ? 24 : 36;
    positionSongCountdown(countdownEl, dotSize, isLowerThird);
  }
}

function updateTeleprompterActiveLine(activeIdx, explicitLineHeight) {
  const isStarted = (typeof activeIdx === "number" && activeIdx >= 0);
  if (isStarted && typeof updateSongCountdown === "function") {
    updateSongCountdown({ active: false });
  }
  const track = document.getElementById("teleprompterTrack");
  if (!track) return;
  const lineEls = track.querySelectorAll(".teleprompter-line");
  if (!lineEls || lineEls.length === 0) return;

  const lineHeight = explicitLineHeight || Number(track.dataset.lineHeight) || 60;
  const targetIdx = isStarted ? activeIdx : 0;
  const stageLayout = getActiveStageLayout();
  const isLowerThird = (stageLayout === "lower-third");
  const activeEl = lineEls[targetIdx] || lineEls[0];
  const viewportEl = document.getElementById("content1");
  const viewportH = viewportEl ? viewportEl.clientHeight : (isLowerThird ? lineHeight * 2 : lineHeight * 5);

  // Use measured offsetTop/offsetHeight so balanced multi-line wrapped lyrics stay accurately aligned.
  let targetY;
  if (isLowerThird) {
    targetY = activeEl ? -activeEl.offsetTop : (-targetIdx * lineHeight);
  } else if (activeEl && viewportH > 0) {
    targetY = (viewportH / 2) - (activeEl.offsetTop + (activeEl.offsetHeight / 2));
  } else {
    targetY = (2 - targetIdx) * lineHeight;
  }
  const roundedTargetY = Math.round(targetY);
  track.dataset.targetY = String(roundedTargetY);
  track.style.transform = `translate3d(0, ${roundedTargetY}px, 0)`;

  const theme = window.activeThemeObj;
  const activeColor = (theme && theme.syncActiveColor) || (typeof p_sync_active_color !== "undefined" ? p_sync_active_color : "#F59E0B");
  const inactiveColor = (theme && theme.syncInactiveColor) || (typeof p_sync_inactive_color !== "undefined" ? p_sync_inactive_color : "#CBD5E1");
  const outlineEnabled = Boolean(
    (typeof window !== "undefined" && window.p_sync_active_outline_enabled) ||
    (typeof p_sync_active_outline_enabled !== "undefined" && p_sync_active_outline_enabled) ||
    (theme && theme.syncActiveOutlineEnabled)
  );
  const outlineColor = (typeof window !== "undefined" && window.p_sync_active_outline_color)
    || (typeof p_sync_active_outline_color !== "undefined" && p_sync_active_outline_color)
    || ((theme && theme.syncActiveOutlineColor) || "#000000");
  const outlineThickness = (typeof window !== "undefined" && typeof window.p_sync_active_outline_thickness === "number")
    ? window.p_sync_active_outline_thickness
    : ((typeof p_sync_active_outline_thickness === "number")
      ? p_sync_active_outline_thickness
      : ((theme && typeof theme.syncActiveOutlineThickness === "number") ? theme.syncActiveOutlineThickness : 2));

  lineEls.forEach((el, idx) => {
    if (isLowerThird) {
      // 2-line lower third display:
      if (isStarted && idx === targetIdx) {
        // Line 1 (Top): Active singing line
        el.style.color = activeColor;
        el.style.opacity = "1";
        el.style.fontWeight = "700";
        el.style.transform = "none";
        el.style.webkitTextStroke = "0px transparent";
        el.style.paintOrder = "normal";
        const ltDropShadow = (theme && theme.primaryShadowEnabled === false) ? "none" : "2px 2px 5px rgba(0, 0, 0, 0.95)";
        if (outlineEnabled) {
          el.style.textShadow = getActiveLineOutlineShadow(outlineThickness, outlineColor, ltDropShadow);
        } else {
          el.style.textShadow = ltDropShadow;
        }
      } else if (isStarted && idx === targetIdx + 1) {
        // Line 2 (Bottom): Upcoming preview line
        el.style.color = inactiveColor;
        el.style.opacity = "0.72";
        el.style.fontWeight = "500";
        el.style.transform = "none";
        el.style.textShadow = "1px 1px 3px rgba(0, 0, 0, 0.75)";
        el.style.webkitTextStroke = "0px transparent";
        el.style.paintOrder = "normal";
      } else if (!isStarted && idx === 0) {
        // Audio waiting to start: Line 0
        el.style.color = inactiveColor;
        el.style.opacity = "0.85";
        el.style.fontWeight = "600";
        el.style.transform = "none";
        el.style.textShadow = "1px 1px 3px rgba(0, 0, 0, 0.75)";
        el.style.webkitTextStroke = "0px transparent";
        el.style.paintOrder = "normal";
      } else if (!isStarted && idx === 1) {
        // Audio waiting to start: Line 1
        el.style.color = inactiveColor;
        el.style.opacity = "0.55";
        el.style.fontWeight = "400";
        el.style.transform = "none";
        el.style.textShadow = "none";
        el.style.webkitTextStroke = "0px transparent";
        el.style.paintOrder = "normal";
      } else {
        // Scrolled outside the 2 visible lines
        el.style.color = inactiveColor;
        el.style.opacity = "0";
        el.style.fontWeight = "400";
        el.style.transform = "none";
        el.style.textShadow = "none";
        el.style.webkitTextStroke = "0px transparent";
        el.style.paintOrder = "normal";
      }
    } else {
      // 5-line standard teleprompter display:
      const diff = Math.abs(idx - targetIdx);
      if (isStarted && idx === targetIdx) {
        el.style.color = activeColor;
        el.style.opacity = "1";
        el.style.fontWeight = "700";
        el.style.transform = "none";
        el.style.webkitTextStroke = "0px transparent";
        el.style.paintOrder = "normal";
        const fsDropShadow = (theme && theme.primaryShadowEnabled === false) ? "none" : "2px 2px 5px rgba(0, 0, 0, 0.9)";
        if (outlineEnabled) {
          el.style.textShadow = getActiveLineOutlineShadow(outlineThickness, outlineColor, fsDropShadow);
        } else {
          el.style.textShadow = fsDropShadow;
        }
      } else if (isStarted && diff === 1) {
        el.style.color = inactiveColor;
        el.style.opacity = "0.65";
        el.style.fontWeight = "500";
        el.style.transform = "scale(1.0)";
        el.style.textShadow = "1px 1px 3px rgba(0, 0, 0, 0.75)";
        el.style.webkitTextStroke = "0px transparent";
        el.style.paintOrder = "normal";
      } else if (isStarted && diff === 2) {
        el.style.color = inactiveColor;
        el.style.opacity = "0.35";
        el.style.fontWeight = "400";
        el.style.transform = "scale(0.96)";
        el.style.textShadow = "none";
        el.style.webkitTextStroke = "0px transparent";
        el.style.paintOrder = "normal";
      } else if (isStarted) {
        el.style.color = inactiveColor;
        el.style.opacity = "0.08";
        el.style.fontWeight = "400";
        el.style.transform = "scale(0.92)";
        el.style.textShadow = "none";
        el.style.webkitTextStroke = "0px transparent";
        el.style.paintOrder = "normal";
      } else {
        if (idx === 0) {
          el.style.color = inactiveColor;
          el.style.opacity = "0.85";
          el.style.fontWeight = "600";
          el.style.transform = "scale(1.0)";
          el.style.textShadow = "1px 1px 3px rgba(0, 0, 0, 0.75)";
          el.style.webkitTextStroke = "0px transparent";
          el.style.paintOrder = "normal";
        } else if (diff === 1) {
          el.style.color = inactiveColor;
          el.style.opacity = "0.5";
          el.style.fontWeight = "400";
          el.style.transform = "scale(0.98)";
          el.style.textShadow = "none";
          el.style.webkitTextStroke = "0px transparent";
          el.style.paintOrder = "normal";
        } else {
          el.style.color = inactiveColor;
          el.style.opacity = "0.2";
          el.style.fontWeight = "400";
          el.style.transform = "scale(0.95)";
          el.style.textShadow = "none";
          el.style.webkitTextStroke = "0px transparent";
          el.style.paintOrder = "normal";
        }
      }
    }
  });
}

/**
 * Accurately positions the countdown dots container directly above the first lyric line
 * so it never overlaps with the song title or floats in distant empty space.
 */
function positionSongCountdown(container, dotSize, isLowerThird) {
  if (!container) return;
  const pContentID = document.getElementById("p_contentID");
  if (!pContentID) return;

  const gap = isLowerThird ? 8 : 16;
  let targetTop = null;

  // 1. Deterministic placement for teleprompter mode using resting targetY
  // (avoids measuring mid-transition transform positions that push dots into the title)
  const c1 = document.getElementById("content1");
  const track = document.getElementById("teleprompterTrack");
  const trackLine0 = (track && track.querySelector(".teleprompter-line[data-line-index='0']")) ||
                     (track && track.querySelector(".teleprompter-line"));

  if (track && trackLine0 && c1 && track.dataset.targetY !== undefined) {
    const restingY = Number(track.dataset.targetY) || 0;
    // Use offsetTop (unscaled layout coordinates) so body CSS transform scale() on remotes doesn't distort c1Top
    const c1Top = (typeof c1.offsetTop === "number") ? c1.offsetTop : 0;
    const line0Top = trackLine0.offsetTop || 0;
    targetTop = Math.round(c1Top + restingY + line0Top - dotSize - gap);
  } else {
    // 2. Real-browser measurement via getBoundingClientRect() for non-teleprompter songs
    const firstLineEl = trackLine0 ||
                        document.querySelector("#content1 .song-line") ||
                        c1;

    if (firstLineEl && typeof firstLineEl.getBoundingClientRect === "function" && typeof pContentID.getBoundingClientRect === "function") {
      const lineRect = firstLineEl.getBoundingClientRect();
      const parentRect = pContentID.getBoundingClientRect();
      if (lineRect && parentRect && lineRect.height > 0 && parentRect.height > 0) {
        targetTop = Math.round(lineRect.top - parentRect.top - dotSize - gap);
      }
    }
  }

  // 3. Analytical calculation fallback (for initial render frame, mock VMs, or zero rects)
  if (targetTop === null || isNaN(targetTop)) {
    if (track && c1) {
      const lineHeight = Number(track.dataset.lineHeight) || 60;
      if (isLowerThird) {
        const c1Top = (typeof c1.offsetTop === "number") ? c1.offsetTop : 0;
        targetTop = Math.round(c1Top - dotSize - gap);
      } else {
        const vh = parseInt(c1.style.height) || (lineHeight * 5);
        const pH = pContentID.clientHeight || parseInt(pContentID.style.height) || 600;
        const c1Top = Math.max(0, Math.round((pH - vh) / 2));
        const line0Top = c1Top + (2 * lineHeight);
        targetTop = Math.round(line0Top - dotSize - gap);
      }
    } else if (c1) {
      const c1Top = (typeof c1.offsetTop === "number") ? c1.offsetTop : 0;
      targetTop = Math.round(c1Top - dotSize - gap);
    } else {
      targetTop = 20;
    }
  }

  // Never let dots rise above #p_contentID where they would overlap #presentationTitle
  targetTop = Math.max(0, targetTop);

  container.style.top = `${targetTop}px`;
  container.style.bottom = "auto";
  container.style.marginBottom = "0px";
}

/**
 * Visual Countdown Dots at the beginning of timed songs.
 * Displays 4 animated dots that count in 4 beats leading up to singing entry.
 * Floats right above the first lyric line without displacing content or overlapping the title.
 */
function updateSongCountdown(countdownInfo) {
  let container = document.getElementById("songCountdownDots");
  const pContentID = document.getElementById("p_contentID");

  // Dynamically create container if missing from DOM (e.g. cached markup)
  if (!container && pContentID) {
    container = document.createElement("div");
    container.id = "songCountdownDots";
    container.className = "song-countdown-dots";
    container.style.cssText = "display:none; position:absolute; left:50%; transform:translateX(-50%); align-items:center; justify-content:center; gap:28px; pointer-events:none; z-index:10; transition:opacity 0.25s ease;";
    for (let i = 0; i < 4; i++) {
      const dot = document.createElement("div");
      dot.className = "countdown-dot";
      dot.dataset.dot = String(i);
      dot.style.cssText = "width:36px; height:36px; border-radius:50%; background:rgba(255,255,255,0.25); border:3px solid rgba(255,255,255,0.45); box-sizing:border-box; transition:all 0.22s cubic-bezier(0.34, 1.56, 0.64, 1);";
      container.appendChild(dot);
    }
    pContentID.insertBefore(container, pContentID.firstChild);
  }

  if (!container) return;

  if (!countdownInfo || !countdownInfo.active) {
    if (container.style.display !== "none") {
      container.style.opacity = "0";
      if (container._fadeTimeout) clearTimeout(container._fadeTimeout);
      container._fadeTimeout = setTimeout(() => {
        if (!container.dataset.active || container.dataset.active === "0") {
          container.style.display = "none";
        }
      }, 250);
      container.dataset.active = "0";
    }
    return;
  }

  if (container._fadeTimeout) clearTimeout(container._fadeTimeout);
  container.dataset.active = "1";
  container.style.display = "flex";

  const stageLayout = getActiveStageLayout();
  const isLowerThird = (stageLayout === "lower-third");
  const theme = window.activeThemeObj;
  const activeColor = countdownInfo.activeColor || (theme && theme.syncActiveColor) || (typeof p_sync_active_color !== "undefined" ? p_sync_active_color : "#F59E0B");

  // 100% bigger dots (36px full screen, 24px lower third)
  const dotSize = isLowerThird ? 24 : 36;
  const dotGap = isLowerThird ? 18 : 28;

  container.style.gap = `${dotGap}px`;
  container.style.opacity = "1";

  // Position countdown dots directly above the first lyric line
  positionSongCountdown(container, dotSize, isLowerThird);

  const dots = container.querySelectorAll(".countdown-dot");
  const step = typeof countdownInfo.step === "number" ? countdownInfo.step : 0;
  // Visual countdown where dots disappear one at a time from right to left:
  // step 0 (early intro): 4 dots visible in waiting state
  // step 1 (4 beats remaining): 4 dots active
  // step 2 (3 beats remaining): 3 dots active (Dot 3, rightmost, has disappeared)
  // step 3 (2 beats remaining): 2 dots active (Dots 2 & 3 have disappeared)
  // step 4 (1 beat remaining): 1 dot active (Dots 1, 2, 3 have disappeared; only Dot 0 remains)
  const remainingDots = (typeof countdownInfo.remainingDots === "number")
    ? countdownInfo.remainingDots
    : (step === 0 ? 4 : Math.max(1, 5 - step));

  dots.forEach((dot, idx) => {
    dot.style.width = `${dotSize}px`;
    dot.style.height = `${dotSize}px`;
    dot.style.borderRadius = "50%";
    dot.style.boxSizing = "border-box";
    dot.style.transition = "all 0.22s cubic-bezier(0.34, 1.56, 0.64, 1)";

    if (idx < remainingDots) {
      // Remaining active dot
      dot.style.backgroundColor = activeColor;
      dot.style.borderColor = "#FFFFFF";
      dot.style.borderWidth = isLowerThird ? "2.5px" : "3.5px";
      dot.style.borderStyle = "solid";
      // Highlight the current leading countdown dot slightly
      dot.style.transform = (step > 0 && idx === remainingDots - 1) ? "scale(1.22)" : "scale(1.0)";
      dot.style.boxShadow = (step === 0)
        ? `0 0 10px ${activeColor}`
        : `0 0 18px ${activeColor}, 0 3px 8px rgba(0, 0, 0, 0.75)`;
      dot.style.opacity = (step === 0) ? "0.65" : "1";
    } else {
      // Disappeared dot (vanished from right to left)
      dot.style.backgroundColor = "transparent";
      dot.style.borderColor = "transparent";
      dot.style.borderWidth = "0px";
      dot.style.transform = "scale(0.2)";
      dot.style.boxShadow = "none";
      dot.style.opacity = "0";
    }
  });
}

if (typeof window !== "undefined") {
  window.renderTeleprompter = renderTeleprompter;
  window.updateTeleprompterActiveLine = updateTeleprompterActiveLine;
  window.updateSongCountdown = updateSongCountdown;
  window.positionSongCountdown = positionSongCountdown;
  window.updateSpeakerLowerThird = updateSpeakerLowerThird;
}

/**
 * Broadcast Speaker / Minister Lower Third Overlay
 * Handles broadcast-quality animations (entry, stay, exit, morph).
 */
function updateSpeakerLowerThird(payload) {
  let layer = document.getElementById("speakerLowerThirdLayer");
  let banner = document.getElementById("speakerLowerThirdBanner");
  let nameEl = document.getElementById("speakerLtName");
  let roleEl = document.getElementById("speakerLtRole");
  let innerEl = document.getElementById("speakerLtInner");
  let iconEl = document.getElementById("speakerLtIcon");
  let textWrap = document.getElementById("speakerLtTextWrap");

  // Dynamically inject layer if presentation HTML was cached without it
  if (!layer) {
    layer = document.createElement("div");
    layer.id = "speakerLowerThirdLayer";
    layer.style.cssText = "display:none; position:absolute; left:0px; top:0px; width:100%; height:100%; z-index:20; pointer-events:none; overflow:hidden;";
    layer.innerHTML = `
      <div id="speakerLowerThirdBanner" style="position:absolute; bottom:6.5%; left:4.5%; pointer-events:none; transform:translateX(-120%); opacity:0;">
        <div id="speakerLtInner" style="display:flex; align-items:center; background:rgba(15, 23, 42, 0.90); backdrop-filter:blur(14px); -webkit-backdrop-filter:blur(14px); border-radius:0 14px 14px 0; border-left:6px solid #2563eb; box-shadow:0 14px 35px rgba(0,0,0,0.55), 0 2px 8px rgba(0,0,0,0.35); padding:10px 24px 10px 18px; font-family:'Segoe UI', system-ui, -apple-system, sans-serif;">
          <div id="speakerLtBadge" style="margin-right:14px; width:40px; height:40px; border-radius:10px; background:rgba(255,255,255,0.1); display:flex; align-items:center; justify-content:center; shrink-0;">
            <i id="speakerLtIcon" class="fa-solid fa-microphone-lines" style="font-size:18px; color:#ffffff;"></i>
          </div>
          <div id="speakerLtTextWrap" style="display:flex; flex-direction:column; justify-content:center;">
            <div id="speakerLtName" style="font-size:26px; font-weight:800; color:#ffffff; line-height:1.2; letter-spacing:-0.01em; text-shadow:0 1px 3px rgba(0,0,0,0.4);">Speaker Name</div>
            <div id="speakerLtRole" style="font-size:13px; font-weight:700; color:#93c5fd; text-transform:uppercase; letter-spacing:0.06em; margin-top:2px; line-height:1.2;">Minister / Role</div>
          </div>
        </div>
      </div>
    `;
    document.body.appendChild(layer);
    banner = document.getElementById("speakerLowerThirdBanner");
    nameEl = document.getElementById("speakerLtName");
    roleEl = document.getElementById("speakerLtRole");
    innerEl = document.getElementById("speakerLtInner");
    iconEl = document.getElementById("speakerLtIcon");
    textWrap = document.getElementById("speakerLtTextWrap");
  }

  if (!layer || !banner || !nameEl || !roleEl) return;

  if (!payload || !payload.active || payload.animationState === "out") {
    if (banner.classList.contains("lt-animate-in") || banner.classList.contains("lt-animate-stay")) {
      banner.classList.remove("lt-animate-in", "lt-animate-stay");
      banner.classList.add("lt-animate-out");
      setTimeout(() => {
        layer.style.display = "none";
        banner.classList.remove("lt-animate-out");
      }, 420);
    } else {
      layer.style.display = "none";
      banner.classList.remove("lt-animate-in", "lt-animate-stay", "lt-animate-out");
    }
    return;
  }

  const speaker = payload.speaker || {};
  layer.style.display = "block";

  // Scale typography smoothly based on viewport height (ensuring crisp look across 720p, 1080p, 4K)
  const vh = window.innerHeight || 1080;
  const nameSize = Math.max(16, Math.round(vh * 0.026));
  const roleSize = Math.max(10, Math.round(vh * 0.013));
  nameEl.style.fontSize = `${nameSize}px`;
  roleEl.style.fontSize = `${roleSize}px`;

  if (payload.animationState === "morph") {
    if (textWrap) {
      textWrap.classList.remove("lt-text-morph");
      void textWrap.offsetWidth;
      textWrap.classList.add("lt-text-morph");
    }
    nameEl.textContent = speaker.name || "Speaker Name";
    roleEl.textContent = speaker.role || speaker.ministry || "Minister";
    if (innerEl) innerEl.style.borderLeftColor = speaker.accentColor || "#2563eb";
    if (iconEl && speaker.icon) iconEl.className = `fa-solid ${speaker.icon}`;
    banner.classList.remove("lt-animate-in", "lt-animate-out");
    banner.classList.add("lt-animate-stay");
  } else if (payload.animationState === "in") {
    nameEl.textContent = speaker.name || "Speaker Name";
    roleEl.textContent = speaker.role || speaker.ministry || "Minister";
    if (innerEl) innerEl.style.borderLeftColor = speaker.accentColor || "#2563eb";
    if (iconEl && speaker.icon) iconEl.className = `fa-solid ${speaker.icon}`;
    banner.classList.remove("lt-animate-out", "lt-animate-stay");
    banner.classList.add("lt-animate-in");
  } else if (payload.animationState === "stay") {
    nameEl.textContent = speaker.name || "Speaker Name";
    roleEl.textContent = speaker.role || speaker.ministry || "Minister";
    if (innerEl) innerEl.style.borderLeftColor = speaker.accentColor || "#2563eb";
    if (iconEl && speaker.icon) iconEl.className = `fa-solid ${speaker.icon}`;
    banner.classList.remove("lt-animate-in", "lt-animate-out");
    banner.classList.add("lt-animate-stay");
  }
}

function updateContent2() { console.log('updateContent2 called, text:', window.p_text1_arr, p_text1_arr, p_current_index); 
  if (typeof window !== "undefined") {
    if (typeof window.p_text1_arr !== "undefined" && window.p_text1_arr !== null) p_text1_arr = window.p_text1_arr;
    if (typeof window.p_text2_arr !== "undefined" && window.p_text2_arr !== null) p_text2_arr = window.p_text2_arr;
    if (typeof window.p_title !== "undefined") p_title = window.p_title;
    if (typeof window.p_title_arr !== "undefined" && window.p_title_arr !== null) p_title_arr = window.p_title_arr;
    if (typeof window.p_footnote !== "undefined") p_footnote = window.p_footnote;
    if (typeof window.p_current_index !== "undefined") p_current_index = window.p_current_index;
    if (typeof window.p_last_index !== "undefined") p_last_index = window.p_last_index;
    if (typeof window.p_custom_slide !== "undefined") p_custom_slide = window.p_custom_slide;
    if (typeof window.p_person_title !== "undefined") p_person_title = window.p_person_title;
    if (typeof window.p_person_title_arr !== "undefined" && window.p_person_title_arr !== null) p_person_title_arr = window.p_person_title_arr;
    if (typeof window.p_stage_layout !== "undefined") p_stage_layout = window.p_stage_layout;
    if (typeof window.p_teleprompter_mode !== "undefined") p_teleprompter_mode = window.p_teleprompter_mode;
    if (typeof window.p_teleprompter_lines !== "undefined") p_teleprompter_lines = window.p_teleprompter_lines;
    if (typeof window.p_teleprompter_font_size !== "undefined") p_teleprompter_font_size = window.p_teleprompter_font_size;
  }
  const pTitleEl = document.getElementById("presentationTitle");
  const pFootnoteEl = document.getElementById("footnote");
  const theme = window.activeThemeObj;

  const activeTitle = (p_title_arr && p_title_arr[p_current_index]) || p_title;
  pTitleEl.innerHTML = activeTitle;
  pFootnoteEl.innerHTML = p_footnote;

  const headerVisible = theme ? (theme.headerVisible !== false) : (p_showTitle !== false);
  const headerSize = (theme && theme.headerSize) ? theme.headerSize : PROJECTION_FALLBACK_STYLE.headerSize;
  const stageLayout = getActiveStageLayout();
  const isLowerThird = (stageLayout === 'lower-third');
  const totalWinY = Math.max(400, Number(p_window_Y) || 600);
  const totalWinX = Math.max(600, Number(p_window_X) || 800);
  const ltHeight = isLowerThird ? Math.max(160, Math.round(totalWinY * 0.32)) : 0;

  pTitleEl.style.display = headerVisible ? "block" : "none";
  pTitleEl.style.color = (theme && theme.headerColor) ? theme.headerColor : p_font_color;
  pTitleEl.style.fontFamily = (theme && theme.headerFont) ? theme.headerFont : (p_text1_font || "Arial");
  pTitleEl.style.fontWeight = (theme && theme.headerWeight) ? theme.headerWeight : PROJECTION_FALLBACK_STYLE.headerWeight;
  pTitleEl.style.textTransform = (theme && theme.headerTransform) ? theme.headerTransform : PROJECTION_FALLBACK_STYLE.headerTransform;

  if (isLowerThird) {
    const ltTitleSize = Math.min(headerSize, Math.max(14, Math.round(ltHeight * 0.11)));
    const ltTitleH = headerVisible ? Math.max(22, Math.round(ltTitleSize * 1.35)) : 0;
    pTitleEl.style.fontSize = `${ltTitleSize}px`;
    pTitleEl.style.lineHeight = `${ltTitleH}px`;
    pTitleEl.style.whiteSpace = "nowrap";
    pTitleEl.style.overflow = "hidden";
    pTitleEl.style.textOverflow = "ellipsis";
    pTitleEl.style.textAlign = "center";
  } else {
    pTitleEl.style.fontSize = `${headerSize}px`;
    pTitleEl.style.lineHeight = "normal";
    pTitleEl.style.whiteSpace = "normal";
    pTitleEl.style.overflow = "visible";
    pTitleEl.style.textOverflow = "clip";
    pTitleEl.style.textAlign = (theme && theme.headerAlign) ? theme.headerAlign : PROJECTION_FALLBACK_STYLE.headerAlign;
  }

  // Footnote styling from theme
  const footnoteVisible = theme ? (theme.footnoteVisible !== false) : true;
  const footnoteSize = (theme && theme.footnoteSize) ? theme.footnoteSize : PROJECTION_FALLBACK_STYLE.footnoteSize;
  pFootnoteEl.style.display = (footnoteVisible && !isLowerThird) ? "block" : "none";
  pFootnoteEl.style.color = (theme && theme.footnoteColor) ? theme.footnoteColor : p_font_color;
  pFootnoteEl.style.fontFamily = (theme && theme.footnoteFont) ? theme.footnoteFont : (p_text1_font || "Arial");
  pFootnoteEl.style.fontSize = `${footnoteSize}px`;
  pFootnoteEl.style.fontWeight = (theme && theme.footnoteWeight) ? theme.footnoteWeight : PROJECTION_FALLBACK_STYLE.footnoteWeight;
  pFootnoteEl.style.textAlign = isLowerThird ? "center" : ((theme && theme.footnoteAlign) ? theme.footnoteAlign : PROJECTION_FALLBACK_STYLE.footnoteAlign);
  pFootnoteEl.style.textTransform = (theme && theme.footnoteTransform) ? theme.footnoteTransform : PROJECTION_FALLBACK_STYLE.footnoteTransform;

  // Intercept for continuous 5-line scrolling teleprompter mode (Audio-Synced Songs)
  if (window.p_teleprompter_mode && Array.isArray(window.p_teleprompter_lines) && window.p_teleprompter_lines.length > 0) {
    const actIdx = (typeof p_sync_active_line_index === "number") ? p_sync_active_line_index : -1;
    renderTeleprompter(window.p_teleprompter_lines, actIdx, p_teleprompter_font_size);
    const pContainer = document.getElementById("presentationContainer");
    if (pContainer) pContainer.style.opacity = "1";
    if (stageLayout !== "lower-third" && !window.p_teleprompter_mode) {
      fadein.animate();
    }
    renderCustomSlideLayer();
    return;
  }

  // Not in teleprompter mode: ensure teleprompter styles are reset
  const c1Reset = document.getElementById("content1");
  if (c1Reset) {
    c1Reset.style.maskImage = "none";
    c1Reset.style.webkitMaskImage = "none";
    c1Reset.style.height = "auto";
    c1Reset.style.maxHeight = "none";
    c1Reset.style.position = "static";
  }

  const activeAlign = (theme && theme.textAlign) ? theme.textAlign : (p_align || PROJECTION_FALLBACK_STYLE.textAlign);
  const pContentEl = document.getElementById("presentationContent");
  if (pContentEl) pContentEl.style.textAlign = activeAlign;
  const pContentCell = document.getElementById("p_contentID");
  if (pContentCell) pContentCell.style.textAlign = activeAlign;
  const c1El = document.getElementById("content1");
  const lhVal = String((theme && theme.lineHeight) ? theme.lineHeight : 1.25);
  if (c1El) {
    c1El.style.textAlign = activeAlign;
    c1El.style.fontWeight = ((theme && theme.primaryWeight) || PROJECTION_FALLBACK_STYLE.primaryWeight);
    c1El.style.fontStyle = (theme && theme.primaryItalic) ? "italic" : "normal";
    c1El.style.fontFamily = (theme && theme.primaryFont) ? theme.primaryFont : (p_text1_font || "Arial");
    c1El.style.color = (theme && theme.primaryColor) ? theme.primaryColor : (p_font_color || "#FFFFFF");
    c1El.style.lineHeight = lhVal;
  }
  const c2El = document.getElementById("content2");
  if (c2El) {
    // Restore display in case a prior teleprompter-mode song hid #content2
    c2El.style.display = "";
    c2El.style.textAlign = activeAlign;
    c2El.style.fontWeight = ((theme && theme.secondaryWeight) || PROJECTION_FALLBACK_STYLE.secondaryWeight);
    c2El.style.fontStyle = (theme && theme.secondaryItalic) ? "italic" : "normal";
    c2El.style.fontFamily = (theme && theme.secondaryFont) ? theme.secondaryFont : (p_text2_font || p_text1_font || "Arial");
    c2El.style.color = (theme && theme.secondaryColor) ? theme.secondaryColor : (p_font_color || "#FFFFFF");
    c2El.style.lineHeight = lhVal;
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
  if (!isLowerThird && !window.p_teleprompter_mode) {
    document.getElementById("content1").style.visibility = "hidden";
    document.getElementById("content2").style.visibility = "hidden";
  }
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
  const ptEl = document.getElementById("contentPersonTitle");
  const curPersonTitle = (p_person_title_arr && typeof p_person_title_arr[p_current_index] === "string" && p_person_title_arr[p_current_index].trim() !== "")
    ? p_person_title_arr[p_current_index].trim()
    : ((typeof p_person_title === "string" && p_person_title.trim() !== "") ? p_person_title.trim() : "");

  let text1Val = (p_text1_arr && p_text1_arr[p_current_index] != null) ? p_text1_arr[p_current_index] : "";
  if (curPersonTitle && typeof text1Val === "string") {
    const ptLower = curPersonTitle.toLowerCase();
    if (text1Val.toLowerCase().startsWith(ptLower + " ")) {
      text1Val = text1Val.substring(curPersonTitle.length).trim();
    }
  }

  const text2Val = hasText2 ? p_text2_arr[p_current_index] : "";
  const html1Val = formatProjectedVerseNumbers(text1Val, activeTitle, theme, hasText2);
  let html2Val = hasText2 ? formatProjectedVerseNumbers(text2Val, activeTitle, theme, true) : "";
  if (hasText2 && html2Val.includes(";") && !/<[a-z]/i.test(html2Val)) {
    const semiParts = html2Val.split(/\s*;\s*/).filter(Boolean);
    if (semiParts.length > 1) {
      html2Val = semiParts
        .map((part, idx) => `<span style="white-space:nowrap;">${part}${idx < semiParts.length - 1 ? ";" : ""}</span>`)
        .join(" ");
    }
  }

  let n;
  let availW;
  const ltBottomSafe = isLowerThird ? Math.max(34, Math.round(totalWinY * 0.045)) : 0;
  if (isLowerThird) {
    const ltTitleSize = Math.min(headerSize, Math.max(14, Math.round(ltHeight * 0.11)));
    const ltTitleH = headerVisible ? Math.max(22, Math.round(ltTitleSize * 1.35)) : 0;
    const contentTopOffset = headerVisible ? (10 + ltTitleH + 8) : 14;
    n = Math.max(40, ltHeight - contentTopOffset - ltBottomSafe);
    availW = totalWinX - 96;
  } else if (stageLayout === 'split') {
    n = Math.max(80, totalWinY - (Number(p_topMargin) || 0) - (Number(p_bottomMargin) || 0) - headerHeight - 20 - dividerSpace);
    availW = Math.round(totalWinX / 2) - (Number(p_leftMargin) || 0) - (Number(p_rightMargin) || 0);
  } else {
    n = Math.max(100, totalWinY - (Number(p_topMargin) || 0) - (Number(p_bottomMargin) || 0) - headerHeight - 20 - dividerSpace);
    availW = totalWinX - (Number(p_leftMargin) || 0) - (Number(p_rightMargin) || 0);
  }

  let m = 0;
  let g = 0;
  const baseE = Math.abs(font_size(text1Val, p_ver1ScaleFactor));
  const baseA = hasText2 ? Math.abs(font_size(text2Val, p_ver2ScaleFactor)) : 0;

  // In lower-third mode, seed starting font size from lower-third dimensions to avoid huge initial overshoot
  let e = isLowerThird ? Math.min(baseE, hasText2 ? Math.round(ltHeight * 0.15) : Math.round(ltHeight * 0.22)) : baseE;
  let a = isLowerThird ? (hasText2 ? Math.min(baseA, Math.round(ltHeight * 0.13)) : 0) : baseA;

  if (ptEl) {
    if (curPersonTitle) {
      ptEl.textContent = curPersonTitle;
      ptEl.style.display = "block";
      ptEl.style.fontFamily = (theme && theme.personTitleFont) ? theme.personTitleFont : (p_text1_font || (theme && theme.primaryFont) || "Arial");
      ptEl.style.textAlign = activeAlign;
      ptEl.style.color = (theme && theme.personTitleColor) ? theme.personTitleColor : ((theme && theme.secondaryColor) ? theme.secondaryColor : (theme && theme.headerColor ? theme.headerColor : "#FDE68A"));
      ptEl.style.fontWeight = (theme && theme.personTitleWeight) ? theme.personTitleWeight : "600";
      ptEl.style.fontStyle = (theme && theme.personTitleItalic) ? "italic" : "normal";
      ptEl.style.letterSpacing = "0.04em";
      ptEl.style.lineHeight = "1.2";
      ptEl.style.marginBottom = `${Math.max(4, Math.round(totalWinY * 0.012))}px`;
    } else {
      ptEl.textContent = "";
      ptEl.style.display = "none";
    }
  }

  try {
    let loopCount = 0;
    const maxLoops = 45; // Generous ceiling for convergent font fitting
    const minE = isLowerThird ? 10 : 12;
    const minA = isLowerThird ? 8 : 8;

    do {
      c1El.style.fontSize = `${e}px`;
      c1El.innerHTML = html1Val;
      if (ptEl && curPersonTitle) {
        const ptScale = (theme && typeof theme.personTitleScale === "number" && isFinite(theme.personTitleScale)) ? theme.personTitleScale : 0.48;
        ptEl.style.fontSize = `${Math.max(11, Math.round(e * ptScale))}px`;
      }
      if (hasText2) {
        c2El.style.fontSize = `${a}px`;
        c2El.innerHTML = html2Val;
      } else {
        c2El.innerHTML = "";
      }

      // Read both scroll and client bounds to catch text overflow precisely
      m = Math.max(c1El.scrollHeight, c1El.offsetHeight, c1El.clientHeight);
      g = hasText2 ? Math.max(c2El.scrollHeight, c2El.offsetHeight, c2El.clientHeight) : 0;
      const ptH = (ptEl && curPersonTitle) ? Math.max(ptEl.scrollHeight, ptEl.offsetHeight, ptEl.clientHeight) : 0;
      const activeDivSpace = (hasBothVerses && isDividerEnabled) ? (isLowerThird ? 10 : dividerSpace) : 0;
      const totalH = m + g + ptH + activeDivSpace;

      // Check vertical & horizontal overflow against container bounds
      const vOverflow = (totalH > n);
      const w1 = c1El.scrollWidth || 0;
      const w2 = hasText2 ? (c2El.scrollWidth || 0) : 0;
      const hOverflow = (availW > 100) && ((w1 > availW + 12) || (w2 > availW + 12));

      if (vOverflow || hOverflow) {
        const vDiff = totalH - n;
        const shrinkStep = (vDiff > 40) ? 3 : ((vDiff > 12) ? 2 : 1);
        if (e > minE) e = Math.max(minE, e - shrinkStep);
        if (hasText2 && a > minA) a = Math.max(minA, a - shrinkStep);

        if (e <= minE && (!hasText2 || a <= minA)) {
          break; // Hit floor limits
        }
      } else {
        break; // Clean fit achieved!
      }
      loopCount++;
    } while (loopCount < maxLoops);

    c1El.style.fontSize = `${Math.max(minE, e)}px`;
    if (hasText2) {
      c2El.style.fontSize = `${Math.max(minA, a)}px`;
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
    if (stageLayout !== "lower-third" && !window.p_teleprompter_mode) {
      fadein.animate();
    }
    renderCustomSlideLayer();
    if (window.p_teleprompter_mode && typeof updateTeleprompterActiveLine === "function") {
      updateTeleprompterActiveLine(p_sync_active_line_index);
    } else if (typeof applySongLineHighlight === "function") {
      applySongLineHighlight(p_sync_active_line_index, p_sync_enabled);
    }
  }
  function c() {
    const s1 = elShadow("primary");
    document.getElementById("content1").style.textShadow = s1.enabled
      ? `1px 1px ${s1.blur}px ${s1.color}, -2px -2px ${s1.blur}px ${s1.color}`
      : "none";
    if (ptEl && curPersonTitle) {
      const sPt = elShadow("secondary") || elShadow("primary");
      ptEl.style.textShadow = (sPt && sPt.enabled)
        ? `1px 1px ${sPt.blur}px ${sPt.color}, -1px -1px ${sPt.blur}px ${sPt.color}`
        : "none";
    }
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
    const ptEl = document.getElementById("contentPersonTitle");
    if (ptEl) { ptEl.innerHTML = ""; ptEl.style.display = "none"; }
    document.getElementById("content1").innerHTML = "";
    document.getElementById("content2").innerHTML = "";
    document.getElementById("footnote").innerHTML = "";
  } else {
    showingtheme = false;
    const activeTitle = (p_title_arr && p_title_arr[p_current_index]) || p_title;
    const hasText2 = (p_text2_arr != null && typeof p_text2_arr[p_current_index] === "string" && p_text2_arr[p_current_index].trim() !== "");
    const ptEl = document.getElementById("contentPersonTitle");
    const curPersonTitle = (p_person_title_arr && typeof p_person_title_arr[p_current_index] === "string" && p_person_title_arr[p_current_index].trim() !== "")
      ? p_person_title_arr[p_current_index].trim()
      : ((typeof p_person_title === "string" && p_person_title.trim() !== "") ? p_person_title.trim() : "");
    if (ptEl && curPersonTitle) {
      ptEl.textContent = curPersonTitle;
      ptEl.style.display = "block";
    }
    document.getElementById("presentationTitle").innerHTML = activeTitle;
    document.getElementById("content1").innerHTML =
      formatProjectedVerseNumbers(p_text1_arr[p_current_index], activeTitle, window.activeThemeObj, hasText2);
    document.getElementById("content2").innerHTML =
      formatProjectedVerseNumbers(p_text2_arr[p_current_index], activeTitle, window.activeThemeObj, true);
    document.getElementById("footnote").innerHTML = p_footnote;
  }
}
function showBlankProcess() {}

/**
 * Returns the active stage video layout ('full', 'pip', 'split', 'lower-third')
 * when a live camera or remote guest is currently on stage, or null if slide-only.
 * Note: Centro camera is excluded from the main centro projection screen
 * (only remote guest video feeds are projected to the congregation).
 */
function getActiveStageLayout() {
  const isSanctuaryProjector = Boolean(
    window.isSanctuaryProjector ||
    window.name === "UECFI_Presentation" ||
    (window.opener && window.opener.newWindow && window.opener.newWindow.window === window)
  );

  try {
    const studio = (window.opener && window.opener.liveStudio) || (window.parent && window.parent.liveStudio) || (typeof window !== "undefined" && window.liveStudio);
    if (studio && studio.activeStageSource && studio.activeStageSource.stream) {
      // Exclude centro camera on the main centro projection screen
      if (isSanctuaryProjector && studio.activeStageSource.type === "camera") {
        return null;
      }
      return studio.stageLayout || 'full';
    }
  } catch (e) {}
  if (typeof window !== "undefined") {
    if (window.previewState && window.previewState.stageLayout) {
      if (isSanctuaryProjector && window.previewState.stageSourceType === "camera") {
        return null;
      }
      return window.previewState.stageLayout;
    }
    if (typeof p_stage_layout !== "undefined" && p_stage_layout) {
      if (isSanctuaryProjector && typeof p_stage_source_type !== "undefined" && p_stage_source_type === "camera") {
        return null;
      }
      return p_stage_layout;
    }
  }
  return null;
}

function updatePresentation() {
  if (typeof window !== "undefined") {
    if (typeof window.p_text1_arr !== "undefined" && window.p_text1_arr !== null) p_text1_arr = window.p_text1_arr;
    if (typeof window.p_text2_arr !== "undefined" && window.p_text2_arr !== null) p_text2_arr = window.p_text2_arr;
    if (typeof window.p_title !== "undefined") p_title = window.p_title;
    if (typeof window.p_title_arr !== "undefined" && window.p_title_arr !== null) p_title_arr = window.p_title_arr;
    if (typeof window.p_footnote !== "undefined") p_footnote = window.p_footnote;
    if (typeof window.p_current_index !== "undefined") p_current_index = window.p_current_index;
    if (typeof window.p_last_index !== "undefined") p_last_index = window.p_last_index;
    if (typeof window.p_custom_slide !== "undefined") p_custom_slide = window.p_custom_slide;
    if (typeof window.p_person_title !== "undefined") p_person_title = window.p_person_title;
    if (typeof window.p_person_title_arr !== "undefined" && window.p_person_title_arr !== null) p_person_title_arr = window.p_person_title_arr;
    if (typeof window.p_stage_layout !== "undefined") p_stage_layout = window.p_stage_layout;
  }
  const theme = window.activeThemeObj;
  const stageLayout = getActiveStageLayout();
  const totalWinX = Number(p_window_X) || 800;
  const totalWinY = Number(p_window_Y) || 600;

  let effectiveWinX = totalWinX;
  let offsetX = 0;

  if (stageLayout === 'split') {
    effectiveWinX = Math.round(totalWinX / 2);
    offsetX = Math.round(totalWinX / 2);
  }

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

  // Handle Background (Image, Looping Motion Video, Gradient, or Solid Color)
  const bgImg = document.getElementById("backgroundImage");
  const bgVid = document.getElementById("backgroundVideo");
  const bgLayer = document.getElementById("backgroundLayer");
  const overlay = document.getElementById("overlayLayer");
  let resolvedImgSrc = "";

  if (theme && theme.backgroundType === "gradient" && theme.bgGradient) {
    if (bgImg) bgImg.style.display = "none";
    if (bgVid) { bgVid.style.display = "none"; try { bgVid.pause(); } catch(e) {} }
    if (bgLayer) {
      bgLayer.style.backgroundImage = theme.bgGradient;
      bgLayer.style.backgroundColor = "transparent";
      bgLayer.style.backgroundPosition = "center center";
      bgLayer.style.backgroundSize = "cover";
      bgLayer.style.width = (stageLayout === 'split' ? effectiveWinX : totalWinX) + "px";
      bgLayer.style.height = totalWinY + "px";
    }
  } else if (theme && theme.backgroundType === "color" && theme.bgColor) {
    if (bgImg) bgImg.style.display = "none";
    if (bgVid) { bgVid.style.display = "none"; try { bgVid.pause(); } catch(e) {} }
    if (bgLayer) {
      bgLayer.style.backgroundImage = "none";
      bgLayer.style.backgroundColor = theme.bgColor;
      bgLayer.style.width = (stageLayout === 'split' ? effectiveWinX : totalWinX) + "px";
      bgLayer.style.height = totalWinY + "px";
    }
  } else {
    // Media mode (Image or Looping Motion Video)
    let imgSrc = "";
    if (p_bkgnd_filename && p_bkgnd_filename.trim() !== "") {
      imgSrc = p_bkgnd_filename.startsWith("file://") ? p_bkgnd_filename : AppStorage.resolvePath(p_bkgnd_filename);
      if (typeof AppStorage !== "undefined" && typeof AppStorage.toFileUrl === "function") {
        try {
          imgSrc = AppStorage.toFileUrl(imgSrc);
        } catch (e) {}
      }
    } else if (theme && theme.bgImage && theme.bgImage.trim() !== "") {
      const themeBg = theme.bgImage.startsWith("file://") ? theme.bgImage : `./background/${encodeURIComponent(theme.bgImage)}`;
      imgSrc = (typeof AppStorage !== "undefined" ? AppStorage.resolvePath(themeBg) : themeBg);
      if (typeof AppStorage !== "undefined" && typeof AppStorage.toFileUrl === "function") {
        try {
          imgSrc = AppStorage.toFileUrl(imgSrc);
        } catch (e) {}
      }
    }
    resolvedImgSrc = imgSrc;

    const isVideo = Boolean(imgSrc && (/\.(mp4|webm|ogv|mov)(\?.*)?$/i).test(imgSrc));

    if (isVideo) {
      // Looping motion video background
      if (bgImg) bgImg.style.display = "none";
      if (bgVid) {
        bgVid.style.display = "block";
        bgVid.style.width = "100%";
        bgVid.style.height = "100%";
        bgVid.style.objectFit = "cover";
        bgVid.style.objectPosition = "center";
        if (bgVid.src !== imgSrc && !bgVid.src.endsWith(encodeURI(imgSrc))) {
          bgVid.src = imgSrc;
          try { bgVid.load(); } catch(e) {}
        }
        try {
          const playPromise = bgVid.play();
          if (playPromise !== undefined) {
            playPromise.catch(() => {});
          }
        } catch(e) {}
      }
    } else {
      // Still photo or graphic background
      if (bgVid) {
        bgVid.style.display = "none";
        try { bgVid.pause(); } catch(e) {}
      }
      if (bgImg) {
        if (imgSrc) {
          bgImg.style.display = "block";
          if (bgImg.src !== imgSrc && !bgImg.src.endsWith(encodeURI(imgSrc))) {
            bgImg.src = imgSrc;
          }
          bgImg.removeAttribute("width");
          bgImg.removeAttribute("height");
          bgImg.style.width = "100%";
          bgImg.style.height = "100%";
          bgImg.style.objectFit = "cover";
          bgImg.style.objectPosition = "center";
        } else {
          bgImg.style.display = "none";
        }
      }
    }

    if (bgLayer) {
      bgLayer.style.width = (stageLayout === 'split' ? effectiveWinX : totalWinX) + "px";
      bgLayer.style.height = totalWinY + "px";
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

  const isLowerThird = (stageLayout === 'lower-third');
  const ltHeight = isLowerThird ? Math.max(160, Math.round(totalWinY * 0.32)) : 0;
  const ltTop = isLowerThird ? (totalWinY - ltHeight) : 0;

  // Handle stageLayout background and overlay positioning
  if (bgLayer) {
    if (stageLayout === 'split') {
      bgLayer.style.display = "block";
      bgLayer.style.left = `${offsetX}px`;
      bgLayer.style.width = `${effectiveWinX}px`;
      bgLayer.style.height = `${totalWinY}px`;
    } else if (stageLayout === 'lower-third') {
      bgLayer.style.display = "none";
    } else {
      bgLayer.style.display = "block";
      bgLayer.style.left = "0px";
      bgLayer.style.width = `${totalWinX}px`;
      bgLayer.style.height = `${totalWinY}px`;
    }
  }

  if (overlay) {
    if (stageLayout === 'split') {
      overlay.style.left = `${offsetX}px`;
      overlay.style.width = `${effectiveWinX}px`;
      overlay.style.height = `${totalWinY}px`;
    } else if (stageLayout === 'lower-third') {
      overlay.style.display = "none";
    } else {
      overlay.style.left = "0px";
      overlay.style.width = `${totalWinX}px`;
      overlay.style.height = `${totalWinY}px`;
    }
  }

  // Toggle and style lowerThirdBar backdrop if present
  const ltBar = document.getElementById("lowerThirdBar");
  if (ltBar) {
    if (isLowerThird) {
      ltBar.style.display = "block";
      ltBar.style.position = "absolute";
      ltBar.style.left = "0px";
      ltBar.style.right = "0px";
      ltBar.style.width = "100%";
      ltBar.style.top = `${ltTop}px`;
      ltBar.style.height = `${ltHeight}px`;
      ltBar.style.bottom = "auto";
      ltBar.style.overflow = "hidden";
      ltBar.style.boxSizing = "border-box";
      ltBar.style.borderTop = "none";
      ltBar.style.boxShadow = "none";

      // Fade the top part of the background image / container using hardware-accelerated CSS masking
      const fadeMask = "linear-gradient(to bottom, transparent 0%, rgba(0, 0, 0, 0.35) 10%, rgba(0, 0, 0, 0.85) 24%, black 36%, black 100%)";
      ltBar.style.maskImage = fadeMask;
      ltBar.style.webkitMaskImage = fadeMask;

      // Apply the selected background image or theme style to the lower third container
      if (theme && theme.backgroundType === "gradient" && theme.bgGradient) {
        ltBar.style.backgroundImage = theme.bgGradient;
        ltBar.style.backgroundColor = "transparent";
        ltBar.style.backgroundPosition = "center center";
        ltBar.style.backgroundSize = "cover";
      } else if (theme && theme.backgroundType === "color" && theme.bgColor) {
        ltBar.style.backgroundColor = theme.bgColor;
        ltBar.style.backgroundImage = "none";
      } else if (resolvedImgSrc && resolvedImgSrc.trim() !== "") {
        // Selected background image with feathered gradient overlay that dissolves at top
        const targetBg = `linear-gradient(to bottom, rgba(2, 6, 23, 0) 0%, rgba(2, 6, 23, 0.6) 20%, rgba(2, 6, 23, 0.88) 55%, rgba(2, 6, 23, 0.95) 100%), url("${resolvedImgSrc}")`;
        if (ltBar.dataset.currentBg !== targetBg) {
          ltBar.dataset.currentBg = targetBg;
          ltBar.style.backgroundImage = targetBg;
        }
        ltBar.style.backgroundPosition = "center bottom";
        ltBar.style.backgroundSize = "cover";
        ltBar.style.backgroundRepeat = "no-repeat";
      } else {
        // Clean elegant dark gradient backdrop fallback, faded at top
        const defaultBg = "linear-gradient(to bottom, transparent 0%, rgba(2, 6, 23, 0.75) 25%, rgba(2, 6, 23, 0.94) 70%, rgba(2, 6, 23, 0.98) 100%)";
        if (ltBar.dataset.currentBg !== defaultBg) {
          ltBar.dataset.currentBg = defaultBg;
          ltBar.style.backgroundImage = defaultBg;
        }
        ltBar.style.backgroundColor = "transparent";
      }
    } else {
      ltBar.style.display = "none";
      ltBar.style.maskImage = "none";
      ltBar.style.webkitMaskImage = "none";
      ltBar.dataset.currentBg = "";
    }
  }

  const headerVisible = theme ? (theme.headerVisible !== false) : (p_showTitle !== false);
  const headerSize = (theme && theme.headerSize) ? theme.headerSize : PROJECTION_FALLBACK_STYLE.headerSize;
  const headerHeight = headerVisible ? Math.max(40, Math.round(headerSize * 1.4)) : 0;

  const titleEl = document.getElementById("presentationTitle");
  titleEl.style.position = "absolute";
  if (isLowerThird) {
    const ltTitleSize = Math.min(headerSize, Math.max(14, Math.round(ltHeight * 0.11)));
    const ltTitleH = headerVisible ? Math.max(22, Math.round(ltTitleSize * 1.35)) : 0;
    titleEl.style.left = "48px";
    titleEl.style.top = `${ltTop + 10}px`;
    titleEl.style.width = `${totalWinX - 96}px`;
    titleEl.style.height = `${ltTitleH}px`;
    titleEl.style.fontSize = `${ltTitleSize}px`;
    titleEl.style.lineHeight = `${ltTitleH}px`;
    titleEl.style.whiteSpace = "nowrap";
    titleEl.style.overflow = "hidden";
    titleEl.style.textOverflow = "ellipsis";
    titleEl.style.textAlign = "center";
  } else {
    titleEl.style.left = `${offsetX + (Number(p_leftMargin) || 0)}px`;
    titleEl.style.top = `${Number(p_topMargin) || 0}px`;
    titleEl.style.width = `${Math.max(100, effectiveWinX - (Number(p_leftMargin) || 0) - (Number(p_rightMargin) || 0))}px`;
    titleEl.style.height = `${headerHeight}px`;
    titleEl.style.fontSize = `${headerSize}px`;
    titleEl.style.lineHeight = "normal";
    titleEl.style.whiteSpace = "normal";
    titleEl.style.overflow = "visible";
    titleEl.style.textOverflow = "clip";
    titleEl.style.textAlign = (theme && theme.headerAlign) ? theme.headerAlign : PROJECTION_FALLBACK_STYLE.headerAlign;
  }
  titleEl.style.color = (theme && theme.headerColor) ? theme.headerColor : p_font_color;
  titleEl.style.fontFamily = (theme && theme.headerFont) ? theme.headerFont : (p_text1_font || "Arial");
  titleEl.style.fontWeight = (theme && theme.headerWeight) ? theme.headerWeight : PROJECTION_FALLBACK_STYLE.headerWeight;
  titleEl.style.textTransform = (theme && theme.headerTransform) ? theme.headerTransform : PROJECTION_FALLBACK_STYLE.headerTransform;
  titleEl.style.display = headerVisible ? "block" : "none";

  const footnoteVisible = theme ? (theme.footnoteVisible !== false) : true;
  const footnoteSize = (theme && theme.footnoteSize) ? theme.footnoteSize : PROJECTION_FALLBACK_STYLE.footnoteSize;
  const footEl = document.getElementById("footnote");
  footEl.style.position = "absolute";
  footEl.style.left = isLowerThird ? "48px" : `${offsetX + (Number(p_leftMargin) || 0)}px`;
  footEl.style.top = isLowerThird ? `${totalWinY - 24}px` : `${totalWinY - (Number(p_bottomMargin) || 0) - 20}px`;
  footEl.style.width = isLowerThird ? `${totalWinX - 96}px` : `${Math.max(100, effectiveWinX - (Number(p_leftMargin) || 0) - (Number(p_rightMargin) || 0))}px`;
  footEl.style.height = "20px";
  footEl.style.color = (theme && theme.footnoteColor) ? theme.footnoteColor : p_font_color;
  footEl.style.fontFamily = (theme && theme.footnoteFont) ? theme.footnoteFont : (p_text1_font || "Arial");
  footEl.style.fontSize = `${footnoteSize}px`;
  footEl.style.fontWeight = (theme && theme.footnoteWeight) ? theme.footnoteWeight : PROJECTION_FALLBACK_STYLE.footnoteWeight;
  footEl.style.textAlign = isLowerThird ? "center" : ((theme && theme.footnoteAlign) ? theme.footnoteAlign : PROJECTION_FALLBACK_STYLE.footnoteAlign);
  footEl.style.textTransform = (theme && theme.footnoteTransform) ? theme.footnoteTransform : PROJECTION_FALLBACK_STYLE.footnoteTransform;
  footEl.style.display = (footnoteVisible && !isLowerThird) ? "block" : "none";

  const contentEl = document.getElementById("presentationContent");
  contentEl.style.position = "absolute";
  let b;
  const ltBottomSafe = isLowerThird ? Math.max(20, Math.round(totalWinY * 0.025)) : 0;
  if (isLowerThird) {
    const ltTitleSize = Math.min(headerSize, Math.max(14, Math.round(ltHeight * 0.11)));
    const ltTitleH = headerVisible ? Math.max(22, Math.round(ltTitleSize * 1.35)) : 0;
    const contentTop = headerVisible ? (ltTop + 10 + ltTitleH + 6) : (ltTop + 12);
    b = Math.max(40, totalWinY - contentTop - ltBottomSafe);

    contentEl.style.left = "48px";
    contentEl.style.top = `${contentTop}px`;
    contentEl.style.width = `${totalWinX - 96}px`;
    contentEl.style.height = `${b}px`;
    contentEl.style.maxHeight = `${b}px`;
    contentEl.style.overflow = "visible"; // Allow descenders and soft drop-shadows to breathe without overflow clipping
    contentEl.style.boxSizing = "border-box";
    contentEl.style.paddingBottom = "4px";
  } else {
    contentEl.style.left = `${offsetX + (Number(p_leftMargin) || 0)}px`;
    contentEl.style.top = `${(Number(p_topMargin) || 0) + headerHeight}px`;
    contentEl.style.width = `${Math.max(100, effectiveWinX - (Number(p_leftMargin) || 0) - (Number(p_rightMargin) || 0))}px`;
    b = Math.max(50, totalWinY - (Number(p_topMargin) || 0) - (Number(p_bottomMargin) || 0) - headerHeight - 20);
    contentEl.style.height = `${b}px`;
    contentEl.style.maxHeight = "none";
    contentEl.style.overflow = "visible";
  }
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
  renderCustomSlideLayer();
  syncOverlayVisibility();
  renderTimerOverlay();
  syncRemoteStageVideo(stageLayout);
  const countdownEl = document.getElementById("songCountdownDots");
  if (countdownEl && countdownEl.style.display !== "none" && typeof positionSongCountdown === "function") {
    const isLowerThird = (getActiveStageLayout() === "lower-third");
    const dotSize = isLowerThird ? 24 : 36;
    positionSongCountdown(countdownEl, dotSize, isLowerThird);
  }
}

/**
 * Applies the stage video layout positioning (full, pip, split, lower-third)
 * to the videoLayer and stageVideo elements.
 */
function applyVideoLayerLayout(videoLayer, stageVideo, layout) {
  if (!videoLayer || !stageVideo) return;

  // Enable hardware acceleration layer in Android WebView to eliminate stutter
  videoLayer.style.transform = "translateZ(0)";
  videoLayer.style.willChange = "transform";
  stageVideo.style.transform = "translateZ(0)";
  stageVideo.style.willChange = "transform";

  if (layout === "full") {
    videoLayer.style.position = "absolute";
    videoLayer.style.left = "0px";
    videoLayer.style.top = "0px";
    videoLayer.style.right = "auto";
    videoLayer.style.bottom = "auto";
    videoLayer.style.width = "100%";
    videoLayer.style.height = "100%";
    videoLayer.style.zIndex = "12";
    videoLayer.style.borderRadius = "0px";
    videoLayer.style.border = "none";
    videoLayer.style.boxShadow = "none";
    videoLayer.style.background = "#000000";

    stageVideo.style.width = "100%";
    stageVideo.style.height = "100%";
    stageVideo.style.objectFit = "contain";
    stageVideo.style.objectPosition = "center";
  } else if (layout === "pip") {
    videoLayer.style.position = "absolute";
    videoLayer.style.left = "auto";
    videoLayer.style.top = "auto";
    videoLayer.style.right = "32px";
    videoLayer.style.bottom = "32px";
    videoLayer.style.width = "28%";
    videoLayer.style.aspectRatio = "16 / 9";
    videoLayer.style.height = "auto";
    videoLayer.style.zIndex = "12";
    videoLayer.style.borderRadius = "16px";
    videoLayer.style.border = "3px solid rgba(255, 255, 255, 0.45)";
    videoLayer.style.boxShadow = "0 20px 35px -5px rgba(0, 0, 0, 0.75), 0 0 0 1px rgba(0, 0, 0, 0.2)";
    videoLayer.style.background = "#000000";

    stageVideo.style.width = "100%";
    stageVideo.style.height = "100%";
    stageVideo.style.objectFit = "cover";
    stageVideo.style.objectPosition = "center";
  } else if (layout === "split") {
    videoLayer.style.position = "absolute";
    videoLayer.style.left = "0px";
    videoLayer.style.top = "0px";
    videoLayer.style.right = "auto";
    videoLayer.style.bottom = "auto";
    videoLayer.style.width = "50%";
    videoLayer.style.height = "100%";
    videoLayer.style.zIndex = "2";
    videoLayer.style.borderRadius = "0px";
    videoLayer.style.border = "none";
    videoLayer.style.borderRight = "2px solid rgba(255, 255, 255, 0.15)";
    videoLayer.style.boxShadow = "none";
    videoLayer.style.background = "#000000";

    stageVideo.style.width = "100%";
    stageVideo.style.height = "100%";
    stageVideo.style.objectFit = "cover";
    stageVideo.style.objectPosition = "center";
  } else if (layout === "lower-third") {
    videoLayer.style.position = "absolute";
    videoLayer.style.left = "0px";
    videoLayer.style.top = "0px";
    videoLayer.style.right = "auto";
    videoLayer.style.bottom = "auto";
    videoLayer.style.width = "100%";
    videoLayer.style.height = "100%";
    videoLayer.style.zIndex = "2";
    videoLayer.style.borderRadius = "0px";
    videoLayer.style.border = "none";
    videoLayer.style.boxShadow = "none";
    videoLayer.style.background = "#000000";

    stageVideo.style.width = "100%";
    stageVideo.style.height = "100%";
    stageVideo.style.objectFit = "contain";
    stageVideo.style.objectPosition = "center";
  }
}

let remoteStagePc = null;
let currentRemoteStreamId = null;
let isNegotiatingRemoteStream = false;

/**
 * Connects remote WebViews (like Android TV) to the desktop host's WebRTC stage video stream.
 */
async function syncRemoteStageVideo(stageLayout) {
  // If desktop popup projection window, live_studio.js already sets stageVideo.srcObject directly
  if ((window.opener && window.opener.liveStudio) || (window.parent && window.parent.liveStudio && window.parent !== window)) {
    return;
  }

  const videoLayer = document.getElementById("videoLayer");
  const stageVideo = document.getElementById("stageVideo");
  if (!videoLayer || !stageVideo) return;

  const streamId = (window.previewState && window.previewState.stageStreamId) || window.p_stage_stream_id || null;
  const sourceType = (window.previewState && window.previewState.stageSourceType) || window.p_stage_source_type || "camera";

  // If no stage layout or no active stream, hide video layer and close any peer connection
  if (!stageLayout || !streamId) {
    if (remoteStagePc) {
      try { remoteStagePc.close(); } catch (e) {}
      remoteStagePc = null;
    }
    currentRemoteStreamId = null;
    isNegotiatingRemoteStream = false;
    stageVideo.srcObject = null;
    videoLayer.style.display = "none";
    return;
  }

  // Show and position videoLayer for the active layout mode
  videoLayer.style.display = "block";
  applyVideoLayerLayout(videoLayer, stageVideo, stageLayout);

  // Mute camera to avoid local feedback; unmute remote guest for house sound
  stageVideo.muted = (sourceType === "camera");

  // If already connected to this stream, keep playing
  if (remoteStagePc && currentRemoteStreamId === streamId && stageVideo.srcObject) {
    if (stageVideo.paused) {
      stageVideo.play().catch(() => {});
    }
    return;
  }

  if (isNegotiatingRemoteStream) return;
  isNegotiatingRemoteStream = true;

  currentRemoteStreamId = streamId;
  if (remoteStagePc) {
    try { remoteStagePc.close(); } catch (e) {}
    remoteStagePc = null;
  }

  try {
    const pc = new RTCPeerConnection({ iceServers: [] });
    remoteStagePc = pc;

    pc.addTransceiver("video", { direction: "recvonly" });
    pc.addTransceiver("audio", { direction: "recvonly" });

    pc.ontrack = (event) => {
      if (event.streams && event.streams[0]) {
        stageVideo.srcObject = event.streams[0];
        stageVideo.play().catch((err) => {
          console.warn("[REMOTE STAGE VIDEO] Play failed:", err);
        });
      }
    };

    pc.onconnectionstatechange = () => {
      if (pc.connectionState === "failed" || pc.connectionState === "disconnected") {
        if (remoteStagePc === pc) {
          remoteStagePc = null;
          currentRemoteStreamId = null;
        }
      }
    };

    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);

    // Wait for local LAN ICE candidates
    await new Promise((resolve) => {
      let resolved = false;
      const done = () => { if (!resolved) { resolved = true; resolve(); } };
      const timer = setTimeout(done, 600);
      pc.onicecandidate = (e) => { if (!e.candidate) { clearTimeout(timer); done(); } };
      pc.onicegatheringstatechange = () => { if (pc.iceGatheringState === "complete") { clearTimeout(timer); done(); } };
    });

    const res = await fetch("/api/stage-stream/offer", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sdp: pc.localDescription })
    });

    if (!res.ok) {
      console.warn("[REMOTE STAGE VIDEO] Server rejected offer:", res.status);
      isNegotiatingRemoteStream = false;
      return;
    }

    const answerData = await res.json();
    if (answerData.sdp && remoteStagePc === pc) {
      await pc.setRemoteDescription(new RTCSessionDescription(answerData.sdp));
    }
  } catch (err) {
    console.warn("[REMOTE STAGE VIDEO] Negotiation error:", err);
  } finally {
    isNegotiatingRemoteStream = false;
  }
}
// Render custom slide layer (for individually customized Person & General program items)
function renderCustomSlideLayer() {
  try {
    const layer = document.getElementById("customSlideLayer");
    if (!layer) return;
    const cs = (typeof p_custom_slide !== "undefined" && p_custom_slide) ? p_custom_slide : ((typeof window !== "undefined" && window.p_custom_slide) ? window.p_custom_slide : null);
    if (!cs || !cs.active) {
      layer.style.display = "none";
      const cLayer = document.getElementById("contentLayer");
      if (cLayer) cLayer.style.display = "";
      return;
    }
    const cLayer = document.getElementById("contentLayer");
    if (cLayer) cLayer.style.display = "none";
    const theme = window.activeThemeObj || {};
    const w = Number(p_window_X) || 800;
    const h = Math.max(Number(p_window_Y) || 0, Math.round(w * 9 / 16));
    layer.style.display = "flex";
    layer.style.zIndex = "12";
    layer.style.width = `${w}px`;
    layer.style.height = `${h}px`;

    // Inherit background styles: custom slide values override theme defaults
    const hasCustomBgImage = !!(cs.bgImage && cs.bgImage.trim() !== "");
    const activeBgImage = hasCustomBgImage ? cs.bgImage : ((theme.backgroundType === "image" && theme.bgImage) ? theme.bgImage : "");
    const activeBgColor = (cs.bg === "transparent") ? "transparent" : (cs.bg || theme.bgColor || "#000000");
    const activeBgGradient = cs.bgGradient || (theme.backgroundType === "gradient" ? theme.bgGradient : "");

    if (activeBgImage) {
      layer.style.backgroundImage = "none";
      layer.style.backgroundColor = activeBgColor;
    } else if (activeBgGradient && (!cs.bg || cs.bg === theme.bgColor || cs.bg === "#000000")) {
      layer.style.backgroundImage = activeBgGradient;
      layer.style.backgroundColor = "transparent";
    } else {
      layer.style.backgroundImage = "none";
      layer.style.backgroundColor = activeBgColor;
    }

    // Background photo & dimming
    const dimVal = (cs.bgDim !== undefined && cs.bgDim !== null && cs.bgDim !== "") ? cs.bgDim : (theme.overlayOpacity !== undefined ? theme.overlayOpacity : 25);
    const dimPct = Math.min(90, Math.max(0, isFinite(Number(dimVal)) ? Number(dimVal) : 25));
    const bg = document.getElementById("customSlideBgImage");
    if (bg) {
      if (activeBgImage) {
        const primary = `./background/${activeBgImage}`;
        const fallback = `storage/background/${activeBgImage}`;
        if (bg.getAttribute("data-file") !== activeBgImage) {
          bg.setAttribute("data-file", activeBgImage);
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
    const dim = document.getElementById("customSlideDim");
    if (dim) {
      if (activeBgImage && dimPct > 0) {
        dim.style.display = "block";
        dim.style.opacity = String(dimPct / 100);
      } else {
        dim.style.display = "none";
      }
    }

    // Inset content card
    const content = document.getElementById("customSlideContent");
    if (content) {
      const padV = Math.min(25, Math.max(0, isFinite(Number(cs.paddingV)) ? Number(cs.paddingV) : 5));
      const padH = Math.min(25, Math.max(0, isFinite(Number(cs.paddingH)) ? Number(cs.paddingH) : 5));
      const borderThick = Math.max(0, isFinite(Number(cs.borderThickness)) ? Number(cs.borderThickness) : 0);
      const borderColor = cs.borderColor || "#ffffff";
      const align = cs.textAlign || theme.textAlign || p_align || "center";

      content.style.position = "absolute";
      content.style.left = `${padH}%`;
      content.style.top = `${padV}%`;
      content.style.width = `calc(100% - ${padH * 2}%)`;
      content.style.height = `calc(100% - ${padV * 2}%)`;
      content.style.boxSizing = "border-box";
      content.style.textAlign = align;
      content.style.alignItems = (align === "left") ? "flex-start" : (align === "right") ? "flex-end" : "center";

      if (borderThick > 0) {
        content.style.border = `${borderThick}px solid ${borderColor}`;
        content.style.borderRadius = `${Math.min(16, Math.max(0, borderThick * 2))}px`;
        content.style.padding = "24px";
      } else {
        content.style.border = "none";
        content.style.borderRadius = "0px";
        content.style.padding = "0px";
      }
    }

    // Image (speaker portrait or graphic)
    const imgPct = Math.min(85, Math.max(5, isFinite(Number(cs.imgSize)) ? Number(cs.imgSize) : 35));
    const img = document.getElementById("customSlideImage");
    if (img) {
      if (cs.image) {
        if (img.getAttribute("src") !== cs.image) img.setAttribute("src", cs.image);
        img.style.display = "block";
        img.style.maxHeight = `${imgPct}%`;
        img.style.maxWidth = "80%";
        img.style.borderRadius = cs.type === "person" ? "12px" : "8px";
        img.style.marginBottom = `${Math.round(h * 0.02)}px`;
      } else {
        img.style.display = "none";
      }
    }

    // Title / Header
    const t = document.getElementById("customSlideTitle");
    if (t) {
      const titlePx = Math.max(12, Math.round(h * Math.min(25, Math.max(1, isFinite(Number(cs.titleSize)) ? Number(cs.titleSize) : 8)) / 100));
      if (cs.title && (cs.title.includes("<BR>") || cs.title.includes("<br>") || cs.title.includes("\n"))) {
        t.innerHTML = cs.title.replace(/\r?\n/g, "<BR>");
      } else {
        t.textContent = cs.title || "";
      }
      t.style.display = cs.title ? "block" : "none";
      t.style.color = cs.titleColor || theme.headerColor || (cs.type === "person" ? "#F59E0B" : "#94A3B8");
      t.style.fontFamily = cs.titleFont || theme.headerFont || p_text1_font || "Arial";
      t.style.fontSize = `${titlePx}px`;
      t.style.letterSpacing = "0.06em";

      // Position title in the same position as standard slides' title
      const headerVisible = theme ? (theme.headerVisible !== false) : (p_showTitle !== false);
      const headerHeight = headerVisible ? Math.max(40, Math.round(titlePx * 1.4)) : 0;
      t.style.position = "absolute";
      t.style.left = `${Number(p_leftMargin) || 0}px`;
      t.style.top = `${Number(p_topMargin) || 0}px`;
      t.style.width = `${Math.max(100, (Number(p_window_X) || w) - (Number(p_leftMargin) || 0) - (Number(p_rightMargin) || 0))}px`;
      t.style.height = `${headerHeight}px`;
      t.style.zIndex = "2";

      const align = cs.textAlign || theme.headerAlign || theme.textAlign || p_align || "center";
      t.style.textAlign = align;

      const isCaps = (cs.titleCaps !== undefined) ? !!cs.titleCaps : (theme.headerTransform === "uppercase");
      t.style.textTransform = isCaps ? "uppercase" : (theme.headerTransform || "none");
      const isBold = (cs.titleBold !== undefined) ? !!cs.titleBold : (theme.headerWeight !== "normal");
      t.style.fontWeight = isBold ? "bold" : "normal";
      t.style.fontStyle = cs.titleItalic ? "italic" : "normal";

      const tBorderThick = Math.max(0, isFinite(Number(cs.titleBorderThickness)) ? Number(cs.titleBorderThickness) : 0);
      const tBorderColor = cs.titleBorderColor || "#000000";
      const tPadV = Math.max(0, isFinite(Number(cs.titlePaddingV)) ? Number(cs.titlePaddingV) : 0);
      const tPadH = Math.max(0, isFinite(Number(cs.titlePaddingH)) ? Number(cs.titlePaddingH) : 0);
      if (tBorderThick > 0) {
        t.style.webkitTextStroke = `${tBorderThick}px ${tBorderColor}`;
        t.style.paintOrder = "stroke fill";
        t.style.textShadow = "none";
      } else {
        t.style.webkitTextStroke = "0px transparent";
        t.style.paintOrder = "normal";
        if (theme.headerShadowEnabled !== false && (theme.enableShadow || theme.headerShadowColor)) {
          const sColor = theme.headerShadowColor || theme.shadowColor || "#000000";
          const sBlur = (theme.headerShadowBlur !== undefined && theme.headerShadowBlur !== null && theme.headerShadowBlur !== "") ? theme.headerShadowBlur : (theme.shadowBlur || 3);
          t.style.textShadow = `2px 2px ${sBlur}px ${sColor}, -2px -2px ${sBlur}px ${sColor}`;
        } else {
          t.style.textShadow = "none";
        }
      }
      t.style.padding = `${tPadV}px ${tPadH}px`;
      t.style.boxSizing = "border-box";
    }

    // Person Title (optional title like Pastor, Sister, Brother displayed above name)
    const pt = document.getElementById("customSlidePersonTitle");
    const rawPersonTitle = (cs.type === "person" && typeof cs.personTitle === "string") ? cs.personTitle.trim() : "";
    if (pt) {
      if (rawPersonTitle) {
        pt.textContent = rawPersonTitle;
        pt.style.display = "block";
        const ptPx = Math.max(11, Math.round(h * Math.min(25, Math.max(1, isFinite(Number(cs.personTitleSize)) ? Number(cs.personTitleSize) : 6)) / 100));
        pt.style.fontSize = `${ptPx}px`;
        pt.style.fontFamily = cs.personTitleFont || cs.text1Font || theme.primaryFont || p_text1_font || "Arial";
        pt.style.color = cs.personTitleColor || cs.text2Color || theme.secondaryColor || "#FDE68A";
        const isBoldPt = (cs.personTitleBold !== undefined) ? !!cs.personTitleBold : true;
        pt.style.fontWeight = isBoldPt ? "bold" : "normal";
        pt.style.fontStyle = cs.personTitleItalic ? "italic" : "normal";
        pt.style.textTransform = cs.personTitleCaps ? "uppercase" : "none";
        pt.style.letterSpacing = "0.04em";
        pt.style.lineHeight = "1.2";
        pt.style.marginTop = `${Math.round(h * 0.015)}px`;
        pt.style.marginBottom = `${Math.round(h * 0.005)}px`;

        const ptBorderThick = Math.max(0, isFinite(Number(cs.personTitleBorderThickness)) ? Number(cs.personTitleBorderThickness) : 0);
        const ptBorderColor = cs.personTitleBorderColor || "#000000";
        const ptPadV = Math.max(0, isFinite(Number(cs.personTitlePaddingV)) ? Number(cs.personTitlePaddingV) : 0);
        const ptPadH = Math.max(0, isFinite(Number(cs.personTitlePaddingH)) ? Number(cs.personTitlePaddingH) : 0);
        if (ptBorderThick > 0) {
          pt.style.webkitTextStroke = `${ptBorderThick}px ${ptBorderColor}`;
          pt.style.paintOrder = "stroke fill";
          pt.style.textShadow = "none";
        } else {
          pt.style.webkitTextStroke = "0px transparent";
          pt.style.paintOrder = "normal";
          if (theme.secondaryShadowEnabled !== false && (theme.enableShadow || theme.secondaryShadowColor)) {
            const sColor = theme.secondaryShadowColor || theme.shadowColor || "#000000";
            const sBlur = (theme.secondaryShadowBlur !== undefined && theme.secondaryShadowBlur !== null && theme.secondaryShadowBlur !== "") ? theme.secondaryShadowBlur : (theme.shadowBlur || 3);
            pt.style.textShadow = `1px 1px ${sBlur}px ${sColor}, -1px -1px ${sBlur}px ${sColor}`;
          } else {
            pt.style.textShadow = "none";
          }
        }
        pt.style.padding = `${ptPadV}px ${ptPadH}px`;
      } else {
        pt.textContent = "";
        pt.style.display = "none";
      }
    }

    // Text 1 (Name for Person, Content for General)
    const t1 = document.getElementById("customSlideText1");
    if (t1) {
      const text1Px = Math.max(12, Math.round(h * Math.min(25, Math.max(1, isFinite(Number(cs.text1Size)) ? Number(cs.text1Size) : (cs.type === "person" ? 12 : 7))) / 100));
      let rawText1 = cs.text1 || "";
      if (cs.type === "person" && rawPersonTitle && typeof rawText1 === "string") {
        const ptLower = rawPersonTitle.toLowerCase();
        if (rawText1.toLowerCase().startsWith(ptLower + " ")) {
          rawText1 = rawText1.substring(rawPersonTitle.length).trim();
        }
      }
      if (rawText1 && (rawText1.includes("<BR>") || rawText1.includes("<br>") || rawText1.includes("\n"))) {
        t1.innerHTML = rawText1.replace(/\r?\n/g, "<BR>");
      } else {
        t1.textContent = rawText1 || "";
      }
      t1.style.display = cs.text1 ? "block" : "none";
      t1.style.color = cs.text1Color || theme.primaryColor || "#ffffff";
      t1.style.fontFamily = cs.text1Font || theme.primaryFont || p_text1_font || "Arial";
      t1.style.fontSize = `${text1Px}px`;
      t1.style.lineHeight = "1.3";
      t1.style.textTransform = cs.text1Caps ? "uppercase" : "none";

      const isBold1 = (cs.text1Bold !== undefined) ? !!cs.text1Bold : (theme.primaryWeight !== "normal");
      t1.style.fontWeight = isBold1 ? "bold" : "normal";
      t1.style.fontStyle = cs.text1Italic ? "italic" : "normal";
      t1.style.marginTop = rawPersonTitle ? `${Math.round(h * 0.005)}px` : `${Math.round(h * 0.015)}px`;

      const t1BorderThick = Math.max(0, isFinite(Number(cs.text1BorderThickness)) ? Number(cs.text1BorderThickness) : 0);
      const t1BorderColor = cs.text1BorderColor || "#000000";
      const t1PadV = Math.max(0, isFinite(Number(cs.text1PaddingV)) ? Number(cs.text1PaddingV) : 0);
      const t1PadH = Math.max(0, isFinite(Number(cs.text1PaddingH)) ? Number(cs.text1PaddingH) : 0);
      if (t1BorderThick > 0) {
        t1.style.webkitTextStroke = `${t1BorderThick}px ${t1BorderColor}`;
        t1.style.paintOrder = "stroke fill";
        t1.style.textShadow = "none";
      } else {
        t1.style.webkitTextStroke = "0px transparent";
        t1.style.paintOrder = "normal";
        if (theme.primaryShadowEnabled !== false && (theme.enableShadow || theme.primaryShadowColor)) {
          const sColor = theme.primaryShadowColor || theme.shadowColor || "#000000";
          const sBlur = (theme.primaryShadowBlur !== undefined && theme.primaryShadowBlur !== null && theme.primaryShadowBlur !== "") ? theme.primaryShadowBlur : (theme.shadowBlur || 3);
          t1.style.textShadow = `2px 2px ${sBlur}px ${sColor}, -2px -2px ${sBlur}px ${sColor}`;
        } else {
          t1.style.textShadow = "none";
        }
      }
      t1.style.padding = `${t1PadV}px ${t1PadH}px`;
    }

    // Text 2 (Centro for Person)
    const t2 = document.getElementById("customSlideText2");
    if (t2) {
      const text2Px = Math.max(10, Math.round(h * Math.min(20, Math.max(1, isFinite(Number(cs.text2Size)) ? Number(cs.text2Size) : 5)) / 100));
      if (cs.text2 && (cs.text2.includes("<BR>") || cs.text2.includes("<br>") || cs.text2.includes("\n"))) {
        t2.innerHTML = cs.text2.replace(/\r?\n/g, "<BR>");
      } else {
        t2.textContent = cs.text2 || "";
      }
      t2.style.display = cs.text2 ? "block" : "none";
      t2.style.color = cs.text2Color || theme.secondaryColor || (cs.type === "person" ? "#FDE68A" : "#cbd5e1");
      t2.style.fontFamily = cs.text2Font || theme.secondaryFont || p_text2_font || "Arial";
      t2.style.fontSize = `${text2Px}px`;
      t2.style.opacity = "0.95";
      t2.style.marginTop = `${Math.round(h * 0.01)}px`;
      t2.style.textTransform = cs.text2Caps ? "uppercase" : "none";

      const isBold2 = (cs.text2Bold !== undefined) ? !!cs.text2Bold : (theme.secondaryWeight === "bold");
      t2.style.fontWeight = isBold2 ? "bold" : "normal";
      const isItalic2 = (cs.text2Italic !== undefined) ? !!cs.text2Italic : (!!theme.secondaryItalic);
      t2.style.fontStyle = isItalic2 ? "italic" : "normal";

      const t2BorderThick = Math.max(0, isFinite(Number(cs.text2BorderThickness)) ? Number(cs.text2BorderThickness) : 0);
      const t2BorderColor = cs.text2BorderColor || "#000000";
      const t2PadV = Math.max(0, isFinite(Number(cs.text2PaddingV)) ? Number(cs.text2PaddingV) : 0);
      const t2PadH = Math.max(0, isFinite(Number(cs.text2PaddingH)) ? Number(cs.text2PaddingH) : 0);
      if (t2BorderThick > 0) {
        t2.style.webkitTextStroke = `${t2BorderThick}px ${t2BorderColor}`;
        t2.style.paintOrder = "stroke fill";
        t2.style.textShadow = "none";
      } else {
        t2.style.webkitTextStroke = "0px transparent";
        t2.style.paintOrder = "normal";
        if (theme.secondaryShadowEnabled !== false && (theme.enableShadow || theme.secondaryShadowColor)) {
          const sColor = theme.secondaryShadowColor || theme.shadowColor || "#000000";
          const sBlur = (theme.secondaryShadowBlur !== undefined && theme.secondaryShadowBlur !== null && theme.secondaryShadowBlur !== "") ? theme.secondaryShadowBlur : (theme.shadowBlur || 3);
          t2.style.textShadow = `2px 2px ${sBlur}px ${sColor}, -2px -2px ${sBlur}px ${sColor}`;
        } else {
          t2.style.textShadow = "none";
        }
      }
      t2.style.padding = `${t2PadV}px ${t2PadH}px`;
    }
  } catch (e) {}
}
// Synchronizes slide content visibility with master overlay states (Logo / Attention / Blackout).
// When any master overlay is active, all underlying slide content, custom slides,
// stage video, and lower thirds are hidden so nothing can ever display behind or through it.
function syncOverlayVisibility() {
  try {
    const isLogo = Boolean(p_logo_mode || p_output_mode === "logo");
    const isAttention = Boolean(p_attention_mode || p_output_mode === "attention" || p_output_mode === "black");
    const isMasterOverlayActive = isLogo || isAttention;

    const cLayer = document.getElementById("contentLayer");
    if (cLayer) {
      cLayer.style.visibility = isMasterOverlayActive ? "hidden" : "";
    }
    const csLayer = document.getElementById("customSlideLayer");
    if (csLayer) {
      csLayer.style.visibility = isMasterOverlayActive ? "hidden" : "";
    }
    const vidLayer = document.getElementById("videoLayer");
    if (vidLayer) {
      vidLayer.style.visibility = isMasterOverlayActive ? "hidden" : "";
    }
    const ltLayer = document.getElementById("speakerLowerThirdLayer");
    if (ltLayer) {
      ltLayer.style.visibility = isMasterOverlayActive ? "hidden" : "";
    }
  } catch (e) {}
}

// Output state (Attention / Blackout overlay): renders customizable attention screen or black.
function renderOutputState() {
  try {
    const mode = (typeof p_output_mode === "string") ? p_output_mode : "live";
    const isAtt = (mode === "black" || mode === "attention" || !!p_attention_mode);
    renderAttentionLayer(isAtt);
    const blk = document.getElementById("blackLayer");
    if (blk) {
      if (mode === "black" && !p_attention_mode) {
        blk.style.display = "block";
        blk.style.zIndex = "60";
      } else {
        blk.style.display = "none";
      }
    }
    syncOverlayVisibility();
  } catch (e) {}
}

// Pre-Service Centro Countdown Overlay
function renderTimerOverlay() {
  try {
    const overlay = document.getElementById("serviceCountdownOverlay");
    if (!overlay) return;

    let tState = window.p_timer_state;
    if (!tState) {
      const src = window.opener || (window.parent !== window ? window.parent : null);
      if (src && src.p_timer_state) tState = src.p_timer_state;
      else if (src && src.timerManager && typeof src.timerManager.getState === "function") tState = src.timerManager.getState();
      else {
        try {
          const stored = localStorage.getItem("uecfi_timer_state");
          if (stored) tState = JSON.parse(stored);
        } catch(e) {}
      }
    }

    if (tState && tState.serviceCountdown && tState.serviceCountdown.active && tState.serviceCountdown.showOnProjection) {
      const sc = tState.serviceCountdown;
      overlay.style.display = "flex";
      const clk = document.getElementById("scClock");
      const hdr = document.getElementById("scHeader");
      const sub = document.getElementById("scSub");

      if (clk) {
        const sec = Math.max(0, sc.remainingSeconds || 0);
        const m = Math.floor(sec / 60);
        const s = sec % 60;
        clk.innerText = `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
      }
      if (hdr) {
        if (sc.remainingSeconds <= 0) {
          hdr.innerText = "WELCOME TO UECFI";
          hdr.style.color = "#38bdf8";
        } else {
          hdr.innerText = (sc.title || "SERVICE BEGINS IN").toUpperCase();
          hdr.style.color = "#94a3b8";
        }
      }
      if (sub) {
        let msg = sc.subMessage || "Union Espiritista Cristiana de Filipinas, Inc.";
        if (/United Evangelical/i.test(msg)) {
          msg = "Union Espiritista Cristiana de Filipinas, Inc.";
        }
        sub.innerText = (sc.remainingSeconds <= 0) ? "Service has begun. Let us worship the Lord." : msg;
      }
    } else {
      overlay.style.display = "none";
    }
  } catch(e) {}
}

// Background ticker to keep projection timer smooth and continuous
if (typeof window !== "undefined" && !window._timerOverlayInterval) {
  window._timerOverlayInterval = setInterval(() => {
    try {
      renderTimerOverlay();
    } catch(e) {}
  }, 500);
}
// Custom attention screen overlay (driven by the controller Attention button).
// Scales typography and elements relative to screen height so it scales cleanly
// from small preview boxes up to full high-resolution projectors.
function renderAttentionLayer(active) {
  try {
    const layer = document.getElementById("attentionLayer");
    const fallbackBlack = document.getElementById("blackLayer");
    const isShow = (active !== undefined) ? !!active : (p_attention_mode || p_output_mode === "attention" || p_output_mode === "black");
    if (!layer) {
      if (fallbackBlack) {
        fallbackBlack.style.display = isShow ? "block" : "none";
        fallbackBlack.style.zIndex = "60";
      }
      syncOverlayVisibility();
      return;
    }
    if (!isShow) {
      layer.style.display = "none";
      if (fallbackBlack) fallbackBlack.style.display = "none";
      syncOverlayVisibility();
      return;
    }
    const w = Number(p_window_X) || (typeof window !== "undefined" && window.innerWidth) || 800;
    const h = Math.max(Number(p_window_Y) || 0, (typeof window !== "undefined" && window.innerHeight) || Math.round(w * 9 / 16));
    layer.style.display = "flex";
    layer.style.zIndex = "60";
    layer.style.width = "100%";
    layer.style.height = "100%";
    layer.style.background = p_attention_bg || "#000000";
    if (fallbackBlack) fallbackBlack.style.display = "none";

    // Background photo (optional) with dimming overlay for readability.
    const dimPct = Math.min(90, Math.max(0, isFinite(Number(p_attention_bgdim)) ? Number(p_attention_bgdim) : 60));
    const bg = document.getElementById("attentionBgImage");
    if (bg) {
      if (p_attention_bgimage) {
        const primary = `./background/${p_attention_bgimage}`;
        const fallback = `storage/background/${p_attention_bgimage}`;
        if (bg.getAttribute("data-file") !== p_attention_bgimage) {
          bg.setAttribute("data-file", p_attention_bgimage);
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
    const dim = document.getElementById("attentionDim");
    if (dim) {
      if (p_attention_bgimage && dimPct > 0) {
        dim.style.display = "block";
        dim.style.opacity = String(dimPct / 100);
      } else {
        dim.style.display = "none";
      }
    }
    const content = document.getElementById("attentionContent");
    if (content) {
      const padV = Math.min(25, Math.max(0, isFinite(Number(p_attention_padding_v)) ? Number(p_attention_padding_v) : 5));
      const padH = Math.min(25, Math.max(0, isFinite(Number(p_attention_padding_h)) ? Number(p_attention_padding_h) : 5));
      const borderThick = Math.max(0, isFinite(Number(p_attention_border_thickness)) ? Number(p_attention_border_thickness) : 0);
      const borderColor = p_attention_border_color || "#ffffff";

      content.style.position = "absolute";
      content.style.left = `${padH}%`;
      content.style.top = `${padV}%`;
      content.style.width = `calc(100% - ${padH * 2}%)`;
      content.style.height = `calc(100% - ${padV * 2}%)`;
      content.style.boxSizing = "border-box";
      if (borderThick > 0) {
        content.style.border = `${borderThick}px solid ${borderColor}`;
        content.style.borderRadius = `${Math.min(16, Math.max(0, borderThick * 2))}px`;
        content.style.padding = "24px";
      } else {
        content.style.border = "none";
        content.style.borderRadius = "0px";
        content.style.padding = "0px";
      }
    }
    // Sizes are % of screen height so the layout holds on any resolution.
    const imgPct = Math.min(95, Math.max(5, isFinite(Number(p_attention_imgsize)) ? Number(p_attention_imgsize) : 35));
    const titlePx = Math.max(12, Math.round(h * Math.min(25, Math.max(1, isFinite(Number(p_attention_titlesize)) ? Number(p_attention_titlesize) : 10)) / 100));
    const subPx = Math.max(10, Math.round(h * Math.min(15, Math.max(1, isFinite(Number(p_attention_subsize)) ? Number(p_attention_subsize) : 5)) / 100));
    const img = document.getElementById("attentionImage");
    if (img) {
      if (p_attention_image) {
        if (img.getAttribute("src") !== p_attention_image) img.setAttribute("src", p_attention_image);
        img.style.display = "block";
        img.style.maxHeight = `${imgPct}%`;
        img.style.maxWidth = "90%";
        img.style.marginBottom = `${Math.round(h * 0.025)}px`;
      } else {
        img.style.display = "none";
      }
    }
    const t = document.getElementById("attentionTitle");
    if (t) {
      t.textContent = p_attention_title || "";
      t.style.display = p_attention_title ? "block" : "none";
      t.style.color = p_attention_title_color || p_attention_color || "#ffffff";
      t.style.fontSize = `${titlePx}px`;
      t.style.letterSpacing = "0.08em";
      t.style.textTransform = (p_attention_title_caps !== false) ? "uppercase" : "none";
      t.style.fontWeight = (p_attention_title_bold === false) ? "normal" : "bold";
      t.style.fontStyle = p_attention_title_italic ? "italic" : "normal";
      const tBorderThick = Math.max(0, isFinite(Number(p_attention_title_border_thickness)) ? Number(p_attention_title_border_thickness) : 0);
      const tBorderColor = p_attention_title_border_color || "#000000";
      const tPadV = Math.max(0, isFinite(Number(p_attention_title_padding_v)) ? Number(p_attention_title_padding_v) : 0);
      const tPadH = Math.max(0, isFinite(Number(p_attention_title_padding_h)) ? Number(p_attention_title_padding_h) : 0);
      if (tBorderThick > 0) {
        t.style.webkitTextStroke = `${tBorderThick}px ${tBorderColor}`;
        t.style.paintOrder = "stroke fill";
      } else {
        t.style.webkitTextStroke = "0px transparent";
        t.style.paintOrder = "normal";
      }
      t.style.padding = `${tPadV}px ${tPadH}px`;
    }
    const s = document.getElementById("attentionSub");
    if (s) {
      s.textContent = p_attention_sub || "";
      s.style.display = p_attention_sub ? "block" : "none";
      s.style.color = p_attention_sub_color || p_attention_color || "#ffffff";
      s.style.fontSize = `${subPx}px`;
      s.style.opacity = "0.85";
      s.style.marginTop = `${Math.round(h * 0.012)}px`;
      s.style.textTransform = p_attention_sub_caps ? "uppercase" : "none";
      s.style.fontWeight = p_attention_sub_bold ? "bold" : "normal";
      s.style.fontStyle = p_attention_sub_italic ? "italic" : "normal";
      const sBorderThick = Math.max(0, isFinite(Number(p_attention_sub_border_thickness)) ? Number(p_attention_sub_border_thickness) : 0);
      const sBorderColor = p_attention_sub_border_color || "#000000";
      const sPadV = Math.max(0, isFinite(Number(p_attention_sub_padding_v)) ? Number(p_attention_sub_padding_v) : 0);
      const sPadH = Math.max(0, isFinite(Number(p_attention_sub_padding_h)) ? Number(p_attention_sub_padding_h) : 0);
      if (sBorderThick > 0) {
        s.style.webkitTextStroke = `${sBorderThick}px ${sBorderColor}`;
        s.style.paintOrder = "stroke fill";
      } else {
        s.style.webkitTextStroke = "0px transparent";
        s.style.paintOrder = "normal";
      }
      s.style.padding = `${sPadV}px ${sPadH}px`;
    }
    syncOverlayVisibility();
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
      syncOverlayVisibility();
      return;
    }
    const w = Number(p_window_X) || (typeof window !== "undefined" && window.innerWidth) || 800;
    // Height placeholder defaults ("100") predate the first projection;
    // derive from width (16:9) until a real projection reports dimensions.
    const h = Math.max(Number(p_window_Y) || 0, (typeof window !== "undefined" && window.innerHeight) || Math.round(w * 9 / 16));
    layer.style.display = "flex";
    layer.style.zIndex = "50";
    layer.style.width = "100%";
    layer.style.height = "100%";
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
    syncOverlayVisibility();
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
      if (window.opener && typeof window.opener.navNextVerse === "function") {
        window.opener.navNextVerse();
      } else if (!showingtheme) {
        nextSlide();
      }
      break;
    case 37:
    case 38:
      if (window.opener && typeof window.opener.navPrevVerse === "function") {
        window.opener.navPrevVerse();
      } else if (!showingtheme) {
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

      const stageLayout = getActiveStageLayout();
      if (stageLayout === "lower-third" || window.p_teleprompter_mode) {
        if (el) el.style.opacity = "1";
        executeCallbacks();
        return;
      }

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
      const stageLayout = getActiveStageLayout();
      if (stageLayout === "lower-third" || window.p_teleprompter_mode) {
        // Never flash or fade opacity 0 -> 1 in lower third or teleprompter mode
        return;
      }
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
