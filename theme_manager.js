/**
 * Theme Manager for UECFI Presenter
 * Manages presentation themes, persistence, real-time live preview rendering,
 * and synchronizing styles with the external projection window.
 * Supports Settings Main Tabs (Theme Designer, Display & Screen, General Options)
 * and Theme Designer Sub-Tabs (Verses, Songs, Program Items [Tema, Person, General]).
 */

class ThemeManager {
  constructor() {
    this.themes = [];
    this.activeThemeId = "theme_modern_dark";
    this.currentTheme = null;
    
    // Main Settings Tab: 'theme' | 'display' | 'options'
    this.activeMainTab = "theme";

    // Theme Designer Category Tab: 'verses' | 'songs' | 'program'
    this.activeCategory = "verses";

    // Program Sub-tab: 'tema' | 'person' | 'general'
    this.activeProgramSubTab = "tema";

    // Collapsible sections in Theme Designer (only Background open by default)
    this.openDesignerSections = { bg: true, typo: false, margins: false, shadows: false };
    // Canva-style active canvas element & media drawer state
    this.selectedElement = "background";
    this.canvaMediaOpen = false;

    this.storagePath = "storage/theme/themes.json";

    this.availableImages = [];
    this.loadAvailableImages();

    // Preview sample content per projection type. Shapes mirror the real
    // projection exactly (program items project no footnote): verses show a
    // reference title + version footnote, songs show name/copyright with NO
    // secondary text (hence no divider), tema shows the Batayan line as
    // secondary text only. Live app data overrides these whenever
    // available (see getPreviewData).
    this.sampleData = {
      verses: {
        title: "Genesis 1:1",
        text1: "1 Nang pasimula ay nilikha ng Dios ang langit at ang lupa.",
        text2: "1 King umpisa, lelangan ne ning Dios ing banua ampo ing yatu.",
        footnote: "Ang Dating Biblia / KJV"
      },
      songs: {
        title: "Calam At Upaya",
        text1: "Calam at upaya ning Dios a miglalang<BR>Ya sa'ng manitili pusu ning ninu man",
        text2: "",
        footnote: "Himnario #1"
      },
      tema: {
        title: "(Tema)",
        text1: "\"Ang Matibay na Pananampalataya sa Panahon ng Pagsubok\"",
        text2: "Batayan: Santiago 1:2-4; 1 Pedro 1:6-7",
        footnote: ""
      },
      person: {
        title: "Panauhing Tagapagsalita",
        personTitle: "Pastor",
        text1: "Juan dela Cruz",
        text2: "(Centro General Mariano Alvarez)",
        footnote: ""
      },
      general: {
        title: "MGA PAUNAWA",
        text1: "Malugod na pagtanggap sa lahat ng mga kapatid at panauhin sa ating pagtitipon ngayong araw.",
        text2: "",
        footnote: ""
      }
    };

    // Initialize themes and active style bundle on startup
    this.loadThemes();
  }

  // Get active style configuration target key
  getActiveTargetKey() {
    if (this.activeCategory === "verses") return "verses";
    if (this.activeCategory === "songs") return "songs";
    if (this.activeCategory === "program") {
      if (this.activeProgramSubTab === "person") return "program_person";
      if (this.activeProgramSubTab === "general") return "program_general";
      return "program_tema";
    }
    return "verses";
  }

  // Fallback defaults for a style bundle
  getDefaultStyleBundle(type) {
    if (type === "songs") {
      return {
        backgroundType: "image",
        bgGradient: "linear-gradient(135deg, #090d16 0%, #1e1b4b 50%, #0f172a 100%)",
        bgImage: "UECFI.png",
        bgColor: "#1e1b4b",
        overlayOpacity: 30,
        overlayColor: "#000000",
        primaryFont: "Arial",
        primaryColor: "#FFFFFF",
        primaryScale: 1.8,
        primaryWeight: "bold",
        alternateLineColorEnabled: true,
        alternateLineColor: "#FDE68A",
        syncActiveColor: "#F59E0B",
        syncInactiveColor: "#94A3B8",
        syncActiveOutlineEnabled: false,
        syncActiveOutlineColor: "#000000",
        syncActiveOutlineThickness: 2,
        secondaryFont: "Arial",
        secondaryColor: "#E2E8F0",
        secondaryScale: 1.1,
        secondaryWeight: "normal",
        secondaryItalic: false,
        headerColor: "#CBD5E1",
        headerFont: "Arial",
        headerSize: 14,
        headerWeight: "bold",
        headerAlign: "center",
        headerTransform: "uppercase",
        headerVisible: true,
        footnoteColor: "#94A3B8",
        footnoteFont: "Arial",
        footnoteSize: 12,
        footnoteWeight: "normal",
        footnoteAlign: "center",
        footnoteTransform: "none",
        footnoteVisible: true,
        textAlign: "center",
        marginTop: 50,
        marginBottom: 50,
        marginLeft: 60,
        marginRight: 60,
        enableShadow: true,
        shadowBlur: 3,
        shadowColor: "#000000",
        enableTransition: true
      };
    }
    if (type === "program_tema") {
      return {
        backgroundType: "gradient",
        bgGradient: "linear-gradient(135deg, #1e1136 0%, #3b0764 50%, #17092c 100%)",
        bgImage: "UECFI.png",
        bgColor: "#2e1065",
        overlayOpacity: 25,
        overlayColor: "#000000",
        primaryFont: "Arial",
        primaryColor: "#FAF5FF",
        primaryScale: 1.6,
        primaryWeight: "bold",
        secondaryFont: "Arial",
        secondaryColor: "#E9D5FF",
        secondaryScale: 1.15,
        secondaryWeight: "normal",
        secondaryItalic: true,
        headerColor: "#F3E8FF",
        headerFont: "Arial",
        headerSize: 14,
        headerWeight: "bold",
        headerAlign: "center",
        headerTransform: "uppercase",
        headerVisible: true,
        footnoteColor: "#D8B4FE",
        footnoteFont: "Arial",
        footnoteSize: 12,
        footnoteWeight: "normal",
        footnoteAlign: "center",
        footnoteTransform: "none",
        footnoteVisible: true,
        textAlign: "center",
        marginTop: 50,
        marginBottom: 50,
        marginLeft: 60,
        marginRight: 60,
        enableShadow: true,
        shadowBlur: 3,
        shadowColor: "#120224",
        enableTransition: true,
        showDivider: true,
        dividerColor: "#F3E8FF",
        dividerThickness: 2,
        dividerWidth: 70,
        dividerStyle: "glow",
        dividerPaddingTop: 12,
        dividerPaddingBottom: 12
      };
    }
    if (type === "program_person") {
      return {
        backgroundType: "gradient",
        bgGradient: "linear-gradient(135deg, #1c1917 0%, #292524 50%, #0c0a09 100%)",
        bgImage: "UECFI.png",
        bgColor: "#1c1917",
        overlayOpacity: 25,
        overlayColor: "#000000",
        primaryFont: "Arial",
        primaryColor: "#FFFFFF",
        primaryScale: 1.6,
        primaryWeight: "bold",
        secondaryFont: "Arial",
        secondaryColor: "#FDE68A",
        secondaryScale: 1.05,
        secondaryWeight: "normal",
        secondaryItalic: false,
        headerColor: "#F59E0B",
        headerFont: "Arial",
        headerSize: 16,
        headerWeight: "bold",
        headerAlign: "center",
        headerTransform: "uppercase",
        headerVisible: true,
        footnoteColor: "#D97706",
        footnoteFont: "Arial",
        footnoteSize: 12,
        footnoteWeight: "normal",
        footnoteAlign: "center",
        footnoteTransform: "none",
        footnoteVisible: true,
        textAlign: "center",
        marginTop: 50,
        marginBottom: 50,
        marginLeft: 60,
        marginRight: 60,
        enableShadow: true,
        shadowBlur: 3,
        shadowColor: "#000000",
        enableTransition: true,
        showDivider: true,
        dividerColor: "#F59E0B",
        dividerThickness: 2,
        dividerWidth: 60,
        dividerStyle: "glow",
        dividerPaddingTop: 12,
        dividerPaddingBottom: 12
      };
    }
    if (type === "program_scripture") {
      return this.getDefaultStyleBundle("verses");
    }
    if (type === "program_general") {
      return {
        backgroundType: "gradient",
        bgGradient: "linear-gradient(135deg, #0f172a 0%, #1e293b 100%)",
        bgImage: "UECFI.png",
        bgColor: "#0f172a",
        overlayOpacity: 20,
        overlayColor: "#000000",
        primaryFont: "Arial",
        primaryColor: "#FFFFFF",
        primaryScale: 1.5,
        primaryWeight: "bold",
        secondaryFont: "Arial",
        secondaryColor: "#CBD5E1",
        secondaryScale: 1.1,
        secondaryWeight: "normal",
        secondaryItalic: false,
        headerColor: "#94A3B8",
        headerFont: "Arial",
        headerSize: 14,
        headerWeight: "bold",
        headerAlign: "center",
        headerTransform: "uppercase",
        headerVisible: true,
        footnoteColor: "#64748B",
        footnoteFont: "Arial",
        footnoteSize: 12,
        footnoteWeight: "normal",
        footnoteAlign: "center",
        footnoteTransform: "none",
        footnoteVisible: true,
        textAlign: "center",
        marginTop: 50,
        marginBottom: 50,
        marginLeft: 60,
        marginRight: 60,
        enableShadow: true,
        shadowBlur: 3,
        shadowColor: "#000000",
        enableTransition: true
      };
    }
    // Default verses bundle
    return {
      backgroundType: "gradient",
      bgGradient: "linear-gradient(135deg, #090d16 0%, #1e1b4b 50%, #0f172a 100%)",
      bgImage: "UECFI.png",
      bgColor: "#0f172a",
      overlayOpacity: 20,
      overlayColor: "#000000",
      primaryFont: "Arial",
      primaryColor: "#FFFFFF",
      primaryScale: 1.6,
      primaryWeight: "bold",
      secondaryFont: "Arial",
      secondaryColor: "#C7D2FE",
      secondaryScale: 1.1,
      secondaryWeight: "normal",
      secondaryItalic: false,
      headerColor: "#A5B4FC",
      headerFont: "Arial",
      headerSize: 14,
      headerWeight: "bold",
      headerAlign: "center",
      headerTransform: "uppercase",
      headerVisible: true,
      footnoteColor: "#94A3B8",
      footnoteFont: "Arial",
      footnoteSize: 12,
      footnoteWeight: "normal",
      footnoteAlign: "center",
      footnoteTransform: "none",
      footnoteVisible: true,
      textAlign: "center",
      marginTop: 50,
      marginBottom: 50,
      marginLeft: 60,
      marginRight: 60,
      enableShadow: true,
      shadowBlur: 3,
      shadowColor: "#000000",
      enableTransition: true,
      showDivider: true,
      dividerColor: "#FFB703",
      dividerThickness: 2,
      dividerWidth: 70,
      dividerStyle: "glow",
      dividerPaddingTop: 14,
      dividerPaddingBottom: 14
    };
  }

  // Get active category styling object
  getActiveStyle() {
    if (!this.currentTheme) return this.getDefaultStyleBundle("verses");
    const key = this.getActiveTargetKey();
    if (!this.currentTheme.styles) {
      this.currentTheme.styles = {};
    }
    if (!this.currentTheme.styles[key]) {
      // Migrate top-level legacy fields or generate default
      const base = {
        backgroundType: this.currentTheme.backgroundType || "gradient",
        bgGradient: this.currentTheme.bgGradient || "linear-gradient(135deg, #090d16 0%, #1e1b4b 50%, #0f172a 100%)",
        bgImage: this.currentTheme.bgImage || "UECFI.png",
        bgColor: this.currentTheme.bgColor || "#0f172a",
        overlayOpacity: typeof this.currentTheme.overlayOpacity !== "undefined" ? this.currentTheme.overlayOpacity : 20,
        overlayColor: this.currentTheme.overlayColor || "#000000",
        primaryFont: this.currentTheme.primaryFont || "Arial",
        primaryColor: this.currentTheme.primaryColor || "#FFFFFF",
        primaryScale: this.currentTheme.primaryScale || 1.6,
        primaryWeight: this.currentTheme.primaryWeight || "bold",
        secondaryFont: this.currentTheme.secondaryFont || "Arial",
        secondaryColor: this.currentTheme.secondaryColor || "#C7D2FE",
        secondaryScale: this.currentTheme.secondaryScale || 1.1,
        secondaryWeight: this.currentTheme.secondaryWeight || "normal",
        secondaryItalic: !!this.currentTheme.secondaryItalic,
        headerColor: this.currentTheme.headerColor || "#A5B4FC",
        headerFont: this.currentTheme.headerFont || "Arial",
        headerSize: this.currentTheme.headerSize || 14,
        headerWeight: this.currentTheme.headerWeight || "bold",
        headerAlign: this.currentTheme.headerAlign || "center",
        headerTransform: this.currentTheme.headerTransform || "uppercase",
        headerVisible: this.currentTheme.headerVisible !== false,
        footnoteColor: this.currentTheme.footnoteColor || "#94A3B8",
        footnoteFont: this.currentTheme.footnoteFont || "Arial",
        footnoteSize: this.currentTheme.footnoteSize || 12,
        footnoteWeight: this.currentTheme.footnoteWeight || "normal",
        footnoteAlign: this.currentTheme.footnoteAlign || "center",
        footnoteTransform: this.currentTheme.footnoteTransform || "none",
        footnoteVisible: this.currentTheme.footnoteVisible !== false,
        textAlign: this.currentTheme.textAlign || "center",
        marginTop: this.currentTheme.marginTop || 50,
        marginBottom: this.currentTheme.marginBottom || 50,
        marginLeft: this.currentTheme.marginLeft || 60,
        marginRight: this.currentTheme.marginRight || 60,
        enableShadow: this.currentTheme.enableShadow !== false,
        shadowBlur: this.currentTheme.shadowBlur || 3,
        shadowColor: this.currentTheme.shadowColor || "#000000",
        enableTransition: this.currentTheme.enableTransition !== false,
        showDivider: typeof this.currentTheme.showDivider !== "undefined" ? this.currentTheme.showDivider : true,
        dividerColor: this.currentTheme.dividerColor || "#FFB703",
        dividerThickness: this.currentTheme.dividerThickness || 2,
        dividerWidth: this.currentTheme.dividerWidth || 70,
        dividerStyle: this.currentTheme.dividerStyle || "glow"
      };
      this.currentTheme.styles[key] = JSON.parse(JSON.stringify(base));
    }
    return this.currentTheme.styles[key];
  }

  // Load all background media (photos & motion loops) from disk (background/ and storage/background/) and localStorage
  loadAvailableImages() {
    const defaultList = [
      { name: "UECFI", file: "UECFI.png" },
      { name: "Grapevine", file: "Grapevine.png" },
      { name: "BNB Song BG", file: "BNB Song BG.png" },
      // Shipped Worship Photos
      { name: "Worship Mountain Sunset", file: "Worship_Mountain_Sunset.jpg" },
      { name: "Worship Alpine Lake", file: "Worship_Alpine_Lake.jpg" },
      { name: "Worship Snowy Peaks", file: "Worship_Snowy_Peaks.jpg" },
      { name: "Worship Hands Praise", file: "Worship_Hands_Praise.jpg" },
      { name: "Worship Golden Wheat", file: "Worship_Golden_Wheat.jpg" },
      { name: "Worship Mountain Fog", file: "Worship_Mountain_Fog.jpg" },
      { name: "Worship Forest Lake", file: "Worship_Forest_Lake.jpg" },
      { name: "Worship The Cross", file: "Worship_The_Cross.jpg" },
      { name: "Worship Stage Concert", file: "Worship_Stage_Concert.jpg" },
      { name: "Worship Nature Greenery", file: "Worship_Nature_Greenery.jpg" },
      { name: "Worship Mountain Valley", file: "Worship_Mountain_Valley.jpg" },
      { name: "Worship Hills Sunset", file: "Worship_Hills_Sunset.jpg" },
      { name: "Worship Pines and Lake", file: "Worship_Pines_and_Lake.jpg" },
      { name: "Worship Stage Light Rays", file: "Worship_Stage_Light_Rays.jpg" },
      { name: "Worship Harvest Ears", file: "Worship_Harvest_Ears.jpg" },
      { name: "Worship Peaks in Clouds", file: "Worship_Peaks_in_Clouds.jpg" },
      { name: "Worship Silent Phone", file: "Worship_Silent_Phone.jpg" },
      // Shipped Worship Motion Looping Videos
      { name: "Motion Mountains", file: "Motion_Mountains.mp4", isVideo: true },
      { name: "Motion Ocean Waves", file: "Motion_Ocean_Waves.mp4", isVideo: true },
      { name: "Motion Forest Aerial", file: "Motion_Forest_Aerial.mp4", isVideo: true },
      { name: "Motion Worship Hands", file: "Motion_Worship_Hands.mp4", isVideo: true },
      { name: "Motion Golden Harvest", file: "Motion_Golden_Harvest.mp4", isVideo: true },
      { name: "Motion Nature Stream", file: "Motion_Nature_Stream.mp4", isVideo: true },
      { name: "Motion Floating Clouds", file: "Motion_Floating_Clouds.mp4", isVideo: true },
      { name: "Motion Heavenly Sky", file: "Motion_Heavenly_Sky.mp4", isVideo: true },
      { name: "Motion City Lights", file: "Motion_City_Lights.mp4", isVideo: true },
      { name: "Motion Waterfall", file: "Motion_Waterfall.mp4", isVideo: true },
      { name: "Motion Morning Sunrise", file: "Motion_Morning_Sunrise.mp4", isVideo: true },
      { name: "Motion Youth Fellowship", file: "Motion_Youth_Fellowship.mp4", isVideo: true }
    ];

    const fileMap = new Map();
    // Pre-populate with default user-friendly names
    defaultList.forEach(item => {
      fileMap.set(item.file.toLowerCase(), { name: item.name, file: item.file });
    });

    // 1. Scan filesystem if running in Electron / Node environment
    if (typeof require !== "undefined") {
      try {
        const fs = require("fs");
        const path = require("path");
        const validExts = [".jpg", ".jpeg", ".png", ".webp", ".bmp", ".gif", ".mp4", ".webm", ".mov"];
        const scanDirs = [
          path.join(process.cwd(), "background"),
          path.join(process.cwd(), "storage", "background")
        ];

        scanDirs.forEach(dir => {
          if (fs.existsSync(dir)) {
            const files = fs.readdirSync(dir);
            files.forEach(f => {
              const ext = path.extname(f).toLowerCase();
              if (validExts.includes(ext)) {
                const key = f.toLowerCase();
                if (!fileMap.has(key)) {
                  // Format human readable name from filename (e.g. "my_new_photo.jpg" -> "My New Photo")
                  const baseName = path.basename(f, ext);
                  const cleanName = baseName.replace(/[_-]+/g, " ").replace(/\b\w/g, c => c.toUpperCase());
                  fileMap.set(key, { name: cleanName, file: f });
                }
              }
            });
          }
        });
      } catch (err) {
        console.warn("[THEME] Error scanning background directory:", err);
      }
    }

    // 2. Also incorporate any custom backgrounds saved in localStorage (for web/fallback environments)
    try {
      const storedCustom = localStorage.getItem("uecfi_custom_backgrounds");
      if (storedCustom) {
        const parsed = JSON.parse(storedCustom);
        if (Array.isArray(parsed)) {
          parsed.forEach(item => {
            if (item && item.file) {
              const key = item.file.toLowerCase();
              if (!fileMap.has(key)) {
                fileMap.set(key, item);
              }
            }
          });
        }
      }
    } catch (e) {
      console.warn("[THEME] Error reading custom backgrounds from localStorage:", e);
    }

    this.availableImages = Array.from(fileMap.values());
  }

  // Shipped defaults are never deletable; anything else in the gallery
  // is user-uploaded (disk scan and/or custom registry) and may be removed.
  isDeletableBackground(file) {
    if (!file) return false;
    const shipped = [
      "uecfi.png", "grapevine.png", "bnb song bg.png",
      "worship_mountain_sunset.jpg", "worship_alpine_lake.jpg", "worship_snowy_peaks.jpg",
      "worship_hands_praise.jpg", "worship_golden_wheat.jpg", "worship_mountain_fog.jpg",
      "worship_forest_lake.jpg", "worship_the_cross.jpg", "worship_stage_concert.jpg",
      "worship_nature_greenery.jpg", "worship_mountain_valley.jpg", "worship_hills_sunset.jpg",
      "worship_pines_and_lake.jpg", "worship_stage_light_rays.jpg", "worship_harvest_ears.jpg",
      "worship_peaks_in_clouds.jpg", "worship_silent_phone.jpg",
      "motion_mountains.mp4", "motion_ocean_waves.mp4", "motion_forest_aerial.mp4",
      "motion_worship_hands.mp4", "motion_golden_harvest.mp4", "motion_nature_stream.mp4",
      "motion_floating_clouds.mp4", "motion_heavenly_sky.mp4", "motion_city_lights.mp4",
      "motion_waterfall.mp4", "motion_morning_sunrise.mp4", "motion_youth_fellowship.mp4"
    ];
    return !shipped.includes(String(file).toLowerCase());
  }

  // Delete a user-uploaded background image (shipped defaults are protected).
  deleteBackgroundImage(file, event) {
    if (event && typeof event.stopPropagation === "function") {
      event.stopPropagation();
    }
    if (!file) return;
    if (!this.isDeletableBackground(file)) {
      alert("Only user-uploaded background images can be deleted.");
      return;
    }
    const displayName = file;
    if (!confirm(`Delete the uploaded background "${displayName}"? Themes using it will fall back to UECFI.png.`)) {
      return;
    }

    // Repoint any theme style currently using it so nothing references a missing file.
    // Covers the working copy too: saveThemes() writes it back over the array.
    try {
      let touched = false;
      const allThemes = [];
      if (this.currentTheme) allThemes.push(this.currentTheme);
      (this.themes || []).forEach(t => { if (!allThemes.includes(t)) allThemes.push(t); });
      allThemes.forEach(th => {
        ["verses", "songs", "program_tema", "program_person", "program_general"].forEach(cat => {
          const style = th.styles ? th.styles[cat] : null;
          if (style && style.bgImage && String(style.bgImage).toLowerCase() === String(file).toLowerCase()) {
            style.bgImage = "UECFI.png";
            touched = true;
          }
        });
      });
      if (touched && typeof this.saveThemes === "function") {
        this.saveThemes();
      }
    } catch (e) {
      console.warn("[THEME] Error repointing themes off deleted background:", e);
    }

    // Remove from the custom registry
    try {
      const raw = localStorage.getItem("uecfi_custom_backgrounds");
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) {
          const kept = parsed.filter(x => !(x && x.file && String(x.file).toLowerCase() === String(file).toLowerCase()));
          localStorage.setItem("uecfi_custom_backgrounds", JSON.stringify(kept));
        }
      }
    } catch (e) {
      console.warn("[THEME] Error updating custom background registry:", e);
    }

    // Delete the files from disk (both live and storage mirrors, incl. thumbnails)
    if (typeof require !== "undefined") {
      try {
        const fs = require("fs");
        const path = require("path");
        [
          path.join(process.cwd(), "background", file),
          path.join(process.cwd(), "storage", "background", file),
          path.join(process.cwd(), "background", "thumbnail", file),
          path.join(process.cwd(), "storage", "background", "thumbnail", file)
        ].forEach(p => {
          try {
            if (fs.existsSync(p) && fs.statSync(p).isFile()) fs.unlinkSync(p);
          } catch (e) {
            console.warn("[THEME] Could not delete background file:", p, e);
          }
        });
      } catch (err) {
        console.error("[THEME] Error deleting background from disk:", err);
      }
    }

    this.loadAvailableImages();
    this.renderSettingsUI();
  }

  // Handle uploading custom background images
  uploadBackgroundImage(event) {    const input = event.target;
    if (!input || !input.files || input.files.length === 0) return;

    const file = input.files[0];
    const fileName = file.name;
    const baseName = fileName.replace(/\.[^/.]+$/, "");
    const cleanName = baseName.replace(/[_-]+/g, " ").replace(/\b\w/g, c => c.toUpperCase());

    // Check supported file formats (photos & motion loops)
    const validExtensions = [".jpg", ".jpeg", ".png", ".webp", ".bmp", ".gif", ".mp4", ".webm", ".mov"];
    const ext = ("." + (fileName.split('.').pop() || "")).toLowerCase();
    if (!validExtensions.includes(ext)) {
      alert("Unsupported file format. Please upload JPG, PNG, WEBP, GIF, MP4, or WEBM media.");
      return;
    }

    let savedFileName = fileName;

    // Check if running in Node / Electron environment
    if (typeof require !== "undefined") {
      try {
        const fs = require("fs");
        const path = require("path");

        const targetDir1 = path.join(process.cwd(), "background");
        const targetDir2 = path.join(process.cwd(), "storage", "background");

        if (!fs.existsSync(targetDir1)) fs.mkdirSync(targetDir1, { recursive: true });
        if (!fs.existsSync(targetDir2)) fs.mkdirSync(targetDir2, { recursive: true });

        // Copy directly from local path if available
        if (file.path) {
          const dest1 = path.join(targetDir1, fileName);
          const dest2 = path.join(targetDir2, fileName);
          fs.copyFileSync(file.path, dest1);
          fs.copyFileSync(file.path, dest2);
        } else {
          // Read from FileReader buffer
          const reader = new FileReader();
          reader.onload = () => {
            const buffer = Buffer.from(reader.result);
            fs.writeFileSync(path.join(targetDir1, fileName), buffer);
            fs.writeFileSync(path.join(targetDir2, fileName), buffer);
          };
          reader.readAsArrayBuffer(file);
        }
      } catch (err) {
        console.error("[THEME] Error saving uploaded background to disk:", err);
      }
    }

    // Persist in localStorage registry so it is immediately known to all tabs and reload cycles
    try {
      let storedCustom = [];
      const raw = localStorage.getItem("uecfi_custom_backgrounds");
      if (raw) storedCustom = JSON.parse(raw);
      if (!storedCustom.some(x => x.file.toLowerCase() === fileName.toLowerCase())) {
        storedCustom.push({ name: cleanName, file: fileName });
        localStorage.setItem("uecfi_custom_backgrounds", JSON.stringify(storedCustom));
      }
    } catch (e) {
      console.warn("[THEME] Error persisting background to localStorage:", e);
    }

    // Reload image library so all categories have this image
    this.loadAvailableImages();

    // Set the newly uploaded image as active for current category
    const style = this.getActiveStyle();
    if (style) {
      style.backgroundType = "image";
      style.bgImage = savedFileName;
      this.saveThemes();
    }

    // Re-render designer UI so thumbnail grid highlights the newly uploaded image
    this.renderSettingsUI();
  }

  init() {
    this.loadAvailableImages();
    this.loadThemes();
    this.renderSettingsUI();
    // Keep the scaled preview truthful when the window is resized
    if (typeof window !== "undefined" && !window._themePreviewResizeBound) {
      window.addEventListener("resize", () => {
        try { this.updatePreviewCanvas(); } catch (e) {}
      });
      window._themePreviewResizeBound = true;
    }
  }

  // Load themes from disk or fallback
  loadThemes() {
    let loaded = false;
    try {
      if (typeof require !== "undefined") {
        const fs = require("fs");
        const path = require("path");
        let fullPath = path.join(process.cwd(), this.storagePath);
        if (fs.existsSync(fullPath)) {
          const raw = fs.readFileSync(fullPath, "utf8");
          this.themes = JSON.parse(raw);
          loaded = true;
        }
      }
    } catch (e) {
      console.warn("[THEME] Error reading themes from filesystem:", e);
    }

    if (!loaded) {
      try {
        const local = localStorage.getItem("uecfi_themes");
        if (local) {
          this.themes = JSON.parse(local);
          loaded = true;
        }
      } catch (e) {
        console.warn("[THEME] Error loading themes from localStorage:", e);
      }
    }

    if (!loaded || !Array.isArray(this.themes) || this.themes.length === 0) {
      this.themes = [
        {
          id: "theme_sanctuary_purple",
          name: "Centro Purple",
          backgroundType: "gradient",
          bgGradient: "linear-gradient(135deg, #1e1136 0%, #3b0764 50%, #17092c 100%)",
          bgImage: "UECFI.png",
          bgColor: "#2e1065",
          overlayOpacity: 40,
          overlayColor: "#000000",
          primaryFont: "Arial",
          primaryColor: "#FAF5FF",
          primaryScale: 1.6,
          primaryWeight: "bold",
          secondaryFont: "Arial",
          secondaryColor: "#E9D5FF",
          secondaryScale: 1.1,
          secondaryWeight: "normal",
          secondaryItalic: true,
          headerColor: "#F3E8FF",
          headerVisible: true,
          footnoteColor: "#D8B4FE",
          footnoteVisible: true,
          textAlign: "center",
          marginTop: 50,
          marginBottom: 50,
          marginLeft: 60,
          marginRight: 60,
          enableShadow: true,
          shadowBlur: 4,
          shadowColor: "#120224",
          enableTransition: true,
          styles: {
            verses: {
              backgroundType: "gradient",
              bgGradient: "linear-gradient(135deg, #1e1136 0%, #3b0764 50%, #17092c 100%)",
              bgImage: "UECFI.png",
              bgColor: "#2e1065",
              overlayOpacity: 20,
              overlayColor: "#000000",
              primaryFont: "Arial",
              primaryColor: "#FAF5FF",
              primaryScale: 1.6,
              primaryWeight: "bold",
              secondaryFont: "Arial",
              secondaryColor: "#E9D5FF",
              secondaryScale: 1.1,
              secondaryWeight: "normal",
              secondaryItalic: true,
              headerColor: "#F3E8FF",
              headerVisible: true,
              footnoteColor: "#D8B4FE",
              footnoteVisible: true,
              textAlign: "center",
              marginTop: 50,
              marginBottom: 50,
              marginLeft: 60,
              marginRight: 60,
              enableShadow: true,
              shadowBlur: 4,
              shadowColor: "#120224",
              enableTransition: true
            },
            songs: {
              backgroundType: "gradient",
              bgGradient: "linear-gradient(135deg, #1e1136 0%, #3b0764 50%, #17092c 100%)",
              bgImage: "UECFI.png",
              bgColor: "#1e1136",
              overlayOpacity: 30,
              overlayColor: "#000000",
              primaryFont: "Arial",
              primaryColor: "#FFFFFF",
              primaryScale: 1.8,
              primaryWeight: "bold",
              alternateLineColorEnabled: true,
              alternateLineColor: "#FDE68A",
              syncActiveColor: "#F59E0B",
              syncInactiveColor: "#94A3B8",
              syncActiveOutlineEnabled: false,
              syncActiveOutlineColor: "#000000",
              syncActiveOutlineThickness: 2,
              secondaryFont: "Arial",
              secondaryColor: "#E9D5FF",
              secondaryScale: 1.1,
              secondaryWeight: "normal",
              secondaryItalic: false,
              headerColor: "#F3E8FF",
              headerVisible: true,
              footnoteColor: "#D8B4FE",
              footnoteVisible: true,
              textAlign: "center",
              marginTop: 50,
              marginBottom: 50,
              marginLeft: 60,
              marginRight: 60,
              enableShadow: true,
              shadowBlur: 3,
              shadowColor: "#000000",
              enableTransition: true
            },
            program_tema: {
              backgroundType: "gradient",
              bgGradient: "linear-gradient(135deg, #1e1136 0%, #3b0764 50%, #17092c 100%)",
              bgImage: "UECFI.png",
              bgColor: "#2e1065",
              overlayOpacity: 25,
              overlayColor: "#000000",
              primaryFont: "Arial",
              primaryColor: "#FAF5FF",
              primaryScale: 1.6,
              primaryWeight: "bold",
              secondaryFont: "Arial",
              secondaryColor: "#E9D5FF",
              secondaryScale: 1.15,
              secondaryWeight: "normal",
              secondaryItalic: true,
              headerColor: "#F3E8FF",
              headerVisible: true,
              footnoteColor: "#D8B4FE",
              footnoteVisible: true,
              textAlign: "center",
              marginTop: 50,
              marginBottom: 50,
              marginLeft: 60,
              marginRight: 60,
              enableShadow: true,
              shadowBlur: 3,
              shadowColor: "#120224",
              enableTransition: true
            },
            program_scripture: {
              backgroundType: "gradient",
              bgGradient: "linear-gradient(135deg, #1e1136 0%, #3b0764 50%, #17092c 100%)",
              bgImage: "UECFI.png",
              bgColor: "#2e1065",
              overlayOpacity: 20,
              overlayColor: "#000000",
              primaryFont: "Arial",
              primaryColor: "#FFFFFF",
              primaryScale: 1.6,
              primaryWeight: "bold",
              secondaryFont: "Arial",
              secondaryColor: "#E9D5FF",
              secondaryScale: 1.1,
              secondaryWeight: "normal",
              secondaryItalic: false,
              headerColor: "#F3E8FF",
              headerVisible: true,
              footnoteColor: "#D8B4FE",
              footnoteVisible: true,
              textAlign: "center",
              marginTop: 50,
              marginBottom: 50,
              marginLeft: 60,
              marginRight: 60,
              enableShadow: true,
              shadowBlur: 3,
              shadowColor: "#000000",
              enableTransition: true
            },
            program_general: {
              backgroundType: "gradient",
              bgGradient: "linear-gradient(135deg, #1e1136 0%, #3b0764 50%, #17092c 100%)",
              bgImage: "UECFI.png",
              bgColor: "#1e1136",
              overlayOpacity: 20,
              overlayColor: "#000000",
              primaryFont: "Arial",
              primaryColor: "#FFFFFF",
              primaryScale: 1.5,
              primaryWeight: "bold",
              secondaryFont: "Arial",
              secondaryColor: "#E9D5FF",
              secondaryScale: 1.1,
              secondaryWeight: "normal",
              secondaryItalic: false,
              headerColor: "#F3E8FF",
              headerVisible: true,
              footnoteColor: "#D8B4FE",
              footnoteVisible: true,
              textAlign: "center",
              marginTop: 50,
              marginBottom: 50,
              marginLeft: 60,
              marginRight: 60,
              enableShadow: true,
              shadowBlur: 3,
              shadowColor: "#000000",
              enableTransition: true
            },
            program_person: {
              backgroundType: "gradient",
              bgGradient: "linear-gradient(135deg, #1e1136 0%, #3b0764 50%, #17092c 100%)",
              bgImage: "UECFI.png",
              bgColor: "#1e1136",
              overlayOpacity: 25,
              overlayColor: "#000000",
              primaryFont: "Arial",
              primaryColor: "#FFFFFF",
              primaryScale: 1.6,
              primaryWeight: "bold",
              secondaryFont: "Arial",
              secondaryColor: "#FDE68A",
              secondaryScale: 1.05,
              secondaryWeight: "normal",
              secondaryItalic: false,
              headerColor: "#F59E0B",
              headerFont: "Arial",
              headerSize: 16,
              headerWeight: "bold",
              headerAlign: "center",
              headerTransform: "uppercase",
              headerVisible: true,
              footnoteColor: "#D97706",
              footnoteFont: "Arial",
              footnoteSize: 12,
              footnoteWeight: "normal",
              footnoteAlign: "center",
              footnoteTransform: "none",
              footnoteVisible: true,
              textAlign: "center",
              marginTop: 50,
              marginBottom: 50,
              marginLeft: 60,
              marginRight: 60,
              enableShadow: true,
              shadowBlur: 3,
              shadowColor: "#000000",
              enableTransition: true,
              showDivider: true,
              dividerColor: "#F59E0B",
              dividerThickness: 2,
              dividerWidth: 60,
              dividerStyle: "glow",
              dividerPaddingTop: 12,
              dividerPaddingBottom: 12
            }
          }
        }
      ];
    } else {
      // Ensure all themes have the multi-category styles schema
      this.themes.forEach(th => {
        if (!th.styles) {
          th.styles = {
            verses: this.getDefaultStyleBundle("verses"),
            songs: this.getDefaultStyleBundle("songs"),
            program_tema: this.getDefaultStyleBundle("program_tema"),
            program_person: this.getDefaultStyleBundle("program_person"),
            program_general: this.getDefaultStyleBundle("program_general")
          };
          // Migrate legacy top-level properties if present
          if (th.primaryFont) {
            Object.assign(th.styles.verses, {
              backgroundType: th.backgroundType || "gradient",
              bgGradient: th.bgGradient || "",
              bgImage: th.bgImage || "UECFI.png",
              bgColor: th.bgColor || "#0f172a",
              primaryFont: th.primaryFont,
              primaryColor: th.primaryColor,
              primaryScale: th.primaryScale,
              secondaryFont: th.secondaryFont,
              secondaryColor: th.secondaryColor,
              secondaryScale: th.secondaryScale,
              secondaryItalic: th.secondaryItalic,
              headerColor: th.headerColor,
              footnoteColor: th.footnoteColor,
              textAlign: th.textAlign,
              marginTop: th.marginTop,
              marginBottom: th.marginBottom,
              marginLeft: th.marginLeft,
              marginRight: th.marginRight,
              enableShadow: th.enableShadow,
              shadowBlur: th.shadowBlur,
              shadowColor: th.shadowColor
            });
          }
        }
        // Fill missing category bundles and backfill any missing properties (e.g., headerWeight, headerAlign, footnoteWeight)
        ["verses", "songs", "program_tema", "program_person", "program_general"].forEach(cat => {
          const defaults = this.getDefaultStyleBundle(cat);
          if (!th.styles[cat]) {
            th.styles[cat] = defaults;
          } else {
            // Ensure all newly introduced fields (headerWeight, headerAlign, headerTransform, footnoteWeight, etc.) exist
            for (const key in defaults) {
              if (typeof th.styles[cat][key] === "undefined") {
                th.styles[cat][key] = defaults[key];
              }
            }
          }
        });
      });
    }

    // Load active theme ID
    const savedActiveId = localStorage.getItem("uecfi_active_theme_id");
    if (savedActiveId && this.themes.some(t => t.id === savedActiveId)) {
      this.activeThemeId = savedActiveId;
    } else {
      this.activeThemeId = this.themes[0].id;
    }

    this.selectTheme(this.activeThemeId);
  }

  saveThemes() {
    // currentTheme is a detached edit buffer (see selectTheme): write it back
    // first, otherwise field edits (and uploads) would never reach the disk.
    try {
      if (this.currentTheme) {
        const widx = this.themes.findIndex(t => t.id === this.currentTheme.id);
        if (widx >= 0) {
          this.themes[widx] = JSON.parse(JSON.stringify(this.currentTheme));
        } else {
          this.themes.push(JSON.parse(JSON.stringify(this.currentTheme)));
        }
      }
    } catch (e) {
      console.warn("[THEME] Error writing back working copy:", e);
    }
    try {
      if (typeof require !== "undefined") {
        const fs = require("fs");
        const path = require("path");
        let fullPath = path.join(process.cwd(), this.storagePath);
        fs.writeFileSync(fullPath, JSON.stringify(this.themes, null, 2), "utf8");
      }
    } catch (e) {
      console.warn("[THEME] Error writing themes to filesystem:", e);
    }
    try {
      localStorage.setItem("uecfi_themes", JSON.stringify(this.themes));
      localStorage.setItem("uecfi_active_theme_id", this.activeThemeId);
    } catch (e) {
      console.warn("[THEME] Error saving themes to localStorage:", e);
    }
  }

  selectTheme(themeId) {
    const found = this.themes.find(t => t.id === themeId);
    if (found) {
      this.activeThemeId = themeId;
      this.currentTheme = JSON.parse(JSON.stringify(found));
      localStorage.setItem("uecfi_active_theme_id", this.activeThemeId);
    }
  }

  // Switch Main Settings Tab
  switchSettingsMainTab(tabId) {
    this.activeMainTab = tabId;

    const tabs = ["theme", "display", "timing", "options"];
    tabs.forEach((id) => {
      const btn = document.getElementById(`tabBtn_${id}`);
      if (!btn) return;
      btn.className = id === tabId
        ? "w-full px-3 py-2 rounded-xl text-xs font-bold bg-white shadow-xs text-brand-700 border border-slate-200/80 flex items-center gap-2.5 transition cursor-pointer text-left"
        : "w-full px-3 py-2 rounded-xl text-xs font-semibold text-slate-600 hover:text-slate-900 hover:bg-white/70 flex items-center gap-2.5 transition cursor-pointer text-left";
    });

    this.renderSettingsUI();
  }

  showSettingsSavedToast(label = "Saved") {
    try {
      if (typeof saveConfigXML === "function") saveConfigXML();
    } catch (e) {}
    const pill = document.getElementById("settingsSaveStatus");
    const txt = document.getElementById("settingsSaveStatusText");
    if (!pill) return;
    if (txt) txt.textContent = label;
    pill.classList.remove("hidden");
    pill.classList.add("inline-flex");
    clearTimeout(this._saveToastTimer);
    this._saveToastTimer = setTimeout(() => {
      pill.classList.add("hidden");
      pill.classList.remove("inline-flex");
    }, 2200);
  }

  toggleDesignerSection(key) {
    if (!this.openDesignerSections) {
      this.openDesignerSections = { bg: true, typo: false, margins: false, shadows: false };
    }
    this.openDesignerSections[key] = !this.openDesignerSections[key];
    this.renderSettingsUI();
  }

  selectSlideTarget(target) {
    if (target === "verses" || target === "songs") {
      this.activeCategory = target;
    } else {
      this.activeCategory = "program";
      this.activeProgramSubTab = target;
    }
    const hasDivider = (target === "verses" || target === "tema" || target === "person");
    const hasSecondary = (target === "verses" || target === "tema" || target === "person");
    const hasFootnote = (target === "verses" || target === "songs");
    const hasPersonTitle = (target === "person");
    if ((this.selectedElement === "divider" && !hasDivider) ||
        (this.selectedElement === "secondary" && !hasSecondary) ||
        (this.selectedElement === "footnote" && !hasFootnote) ||
        (this.selectedElement === "personTitle" && !hasPersonTitle)) {
      this.selectedElement = "background";
    }
    this.renderSettingsUI();
  }

  copyCurrentStyleToAll() {
    if (!this.currentTheme) return;
    if (!confirm("Apply the current background, fonts, margins, and shadow settings to Verses, Songs, and all Program Item types?")) return;
    const src = JSON.parse(JSON.stringify(this.getActiveStyle()));
    if (!this.currentTheme.styles) this.currentTheme.styles = {};
    ["verses", "songs", "program_tema", "program_person", "program_general"].forEach((k) => {
      this.currentTheme.styles[k] = JSON.parse(JSON.stringify(src));
    });
    this.saveThemes();
    this.updatePreviewCanvas();
    this.showSettingsSavedToast("Applied to all slide types");
  }

  // Switch Theme Designer Category Sub-Tab
  switchCategory(category) {
    this.activeCategory = category;
    this.renderSettingsUI();
  }

  // Switch Program Items Sub-Tab
  switchProgramSubTab(subTab) {
    this.activeProgramSubTab = subTab;
    this.renderSettingsUI();
  }

  // Main UI Renderer
  renderSettingsUI() {
    const container = document.getElementById("settingsContentContainer");
    if (!container) return;

    if (this.activeMainTab === "display") {
      this.renderDisplayTab(container);
      return;
    }
    if (this.activeMainTab === "timing") {
      this.renderTimingTab(container);
      return;
    }
    if (this.activeMainTab === "options") {
      this.renderOptionsTab(container);
      return;
    }

    // Default: Theme Designer Tab
    this.renderThemeDesignerTab(container);
  }

  // Display & Screen Settings Tab
  renderDisplayTab(container) {
    let screenOpts = "";
    const screens = (window.electronBridge && typeof window.electronBridge.getScreens === "function") 
      ? window.electronBridge.getScreens() 
      : [];
    if (screens && screens.length > 0) {
      screens.forEach((sc, idx) => {
        const isSel = (typeof selectedScreenIndex !== "undefined" && parseInt(selectedScreenIndex) === idx);
        const w = (sc.bounds && sc.bounds.width) || (sc.size && sc.size.width) || 1920;
        const h = (sc.bounds && sc.bounds.height) || (sc.size && sc.size.height) || 1080;
        screenOpts += `<option value="${idx}" ${isSel ? "selected" : ""}>Screen ${idx + 1} (${w}x${h})</option>`;
      });
    } else {
      screenOpts = `<option value="1">Screen 2 (Projector / External)</option><option value="0">Screen 1 (Primary)</option>`;
    }

    container.innerHTML = `
      <div class="max-w-3xl mx-auto space-y-5">
        <div class="bg-white p-6 rounded-2xl border border-slate-200 shadow-xs space-y-5">
          <div class="pb-3 border-b border-slate-100 flex items-center gap-3">
            <div class="w-9 h-9 rounded-xl bg-indigo-50 flex items-center justify-center text-indigo-600 border border-indigo-100">
              <i class="fa-solid fa-desktop text-base"></i>
            </div>
            <div>
              <h3 class="text-sm font-bold text-slate-900">Presentation Output Screen</h3>
              <p class="text-xs text-slate-500">Choose which monitor or projector displays live slides (auto-saved)</p>
            </div>
          </div>

          <div class="grid grid-cols-1 md:grid-cols-2 gap-5 items-start">
            <div>
              <label class="block text-xs font-bold uppercase tracking-wider text-slate-600 mb-2">Target Presentation Screen</label>
              <select id="settingScreenSelect" onchange="window.selectedScreenIndex = this.value; themeManager.showSettingsSavedToast('Display updated');" 
                      class="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-800">
                ${screenOpts}
              </select>
              <p class="text-[11px] text-slate-400 mt-1.5">Select the screen where slides and projection will be shown.</p>
            </div>

            <div class="bg-slate-50 p-4 rounded-xl border border-slate-200">
              <label class="flex items-start gap-2.5 text-xs font-semibold text-slate-800 cursor-pointer">
                <input type="checkbox" id="settingDualScreen" ${typeof dualScreen === "undefined" || dualScreen ? "checked" : ""} 
                       onchange="window.dualScreen = this.checked; themeManager.showSettingsSavedToast('Dual screen updated');" class="rounded text-brand-600 mt-0.5">
                <span>
                  <span class="block">Enable Dual Screen Projection</span>
                  <span class="block text-[11px] font-normal text-slate-500 mt-0.5">Opens projection on the external monitor while keeping the controller on your main screen.</span>
                </span>
              </label>
            </div>
          </div>
        </div>
      </div>
    `;
  }

  // Audio & Lyrics Timing Tab
  renderTimingTab(container) {
    const leadMs = this.getSongLeadAdvanceMs();
    container.innerHTML = `
      <div class="max-w-3xl mx-auto space-y-5">
        <div class="bg-white p-6 rounded-2xl border border-slate-200 shadow-xs space-y-5">
          <div class="pb-3 border-b border-slate-100 flex items-center justify-between gap-3">
            <div class="flex items-center gap-3">
              <div class="w-9 h-9 rounded-xl bg-brand-50 flex items-center justify-center text-brand-600 border border-brand-100">
                <i class="fa-solid fa-clock-rotate-left text-base"></i>
              </div>
              <div>
                <h3 class="text-sm font-bold text-slate-900">Audio Sync &amp; Lyrics Timing</h3>
                <p class="text-xs text-slate-500">Fine-tune how early synchronized song lyrics advance ahead of audio timestamps</p>
              </div>
            </div>
            <span id="valOptionsLeadAdvanceMs" class="text-xs font-mono font-bold text-brand-700 bg-brand-50 border border-brand-200 px-3 py-1 rounded-lg shrink-0">
              ${leadMs}ms
            </span>
          </div>

          <div class="space-y-3">
            <label class="block text-xs font-bold text-slate-800">Line Lead Advance Time</label>
            <p class="text-xs text-slate-500">Advances the highlighted lyric line ahead of its recorded timestamp (0–2000ms) so singers can read ahead comfortably.</p>
            <div class="flex items-center gap-3 pt-1">
              <span class="text-[10px] font-bold text-slate-400">0ms</span>
              <input type="range" min="0" max="2000" step="100" value="${leadMs}"
                     id="optionsLeadAdvanceSlider"
                     oninput="themeManager.setSongLeadAdvanceMs(this.value); themeManager.showSettingsSavedToast('Timing saved');"
                     class="w-full accent-brand-600 cursor-pointer">
              <span class="text-[10px] font-bold text-slate-400">2000ms</span>
            </div>
            <div class="flex flex-wrap items-center gap-2 pt-2">
              <span class="text-[11px] font-semibold text-slate-500 mr-1">Quick presets:</span>
              ${[0, 300, 500, 1000].map((ms) => `
                <button type="button" onclick="themeManager.setSongLeadAdvanceMs(${ms}); const s=document.getElementById('optionsLeadAdvanceSlider'); if(s) s.value=${ms}; themeManager.showSettingsSavedToast('Timing set to ${ms}ms');"
                        class="px-2.5 py-1 text-[11px] font-bold rounded-lg border border-slate-200 bg-slate-50 hover:bg-brand-50 hover:border-brand-300 hover:text-brand-700 transition cursor-pointer">
                  ${ms === 0 ? "Exact (0ms)" : `${ms}ms`}
                </button>
              `).join("")}
            </div>
          </div>
        </div>
      </div>
    `;
  }

  // Scripture & Preferences Settings Tab
  renderOptionsTab(container) {
    const isSingleVer = (typeof singleVersion !== "undefined" && singleVersion);
    const isDualLang = (typeof navDualLanguage !== "undefined" && navDualLanguage);

    container.innerHTML = `
      <div class="max-w-3xl mx-auto space-y-5">
        <div class="bg-white p-6 rounded-2xl border border-slate-200 shadow-xs space-y-5">
          <div class="pb-3 border-b border-slate-100 flex items-center gap-3">
            <div class="w-9 h-9 rounded-xl bg-purple-50 flex items-center justify-center text-purple-600 border border-purple-100">
              <i class="fa-solid fa-book-bible text-base"></i>
            </div>
            <div>
              <h3 class="text-sm font-bold text-slate-900">Scripture Preferences</h3>
              <p class="text-xs text-slate-500">Default Bible display behavior (auto-saved)</p>
            </div>
          </div>

          <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
            <label class="flex items-start gap-3 p-4 rounded-xl bg-slate-50 border border-slate-200 cursor-pointer hover:border-brand-300 transition">
              <input type="checkbox" id="settingNavDualLang" ${isDualLang ? "checked" : ""} 
                     onchange="window.navDualLanguage = this.checked; if(document.getElementById('navDualLanguageID')) document.getElementById('navDualLanguageID').checked = this.checked; themeManager.showSettingsSavedToast('Preference saved');" class="rounded text-brand-600 mt-0.5">
              <span>
                <span class="block text-xs font-bold text-slate-800">Dual Language in Verses Workspace</span>
                <span class="block text-[11px] text-slate-500 mt-0.5">Show both primary and secondary Bible translations side-by-side while browsing.</span>
              </span>
            </label>

            <label class="flex items-start gap-3 p-4 rounded-xl bg-slate-50 border border-slate-200 cursor-pointer hover:border-brand-300 transition">
              <input type="checkbox" id="settingSingleVer" ${isSingleVer ? "checked" : ""} 
                     onchange="window.singleVersion = this.checked; if(document.getElementById('singleVersionBoxID')) document.getElementById('singleVersionBoxID').checked = this.checked; themeManager.showSettingsSavedToast('Preference saved');" class="rounded text-brand-600 mt-0.5">
              <span>
                <span class="block text-xs font-bold text-slate-800">Single Bible Version Mode</span>
                <span class="block text-[11px] text-slate-500 mt-0.5">Project only the primary Bible version on screen.</span>
              </span>
            </label>
          </div>
        </div>
      </div>
    `;
  }

  // Canva-Style Interactive Theme Designer
  renderThemeDesignerTab(container) {
    if (!this.currentTheme) {
      this.selectTheme(this.activeThemeId);
    }

    const style = this.getActiveStyle();
    const catVersesActive = (this.activeCategory === "verses");
    const catSongsActive = (this.activeCategory === "songs");
    const catProgramActive = (this.activeCategory === "program");

    container.innerHTML = `
      <div class="w-full max-w-6xl mx-auto flex flex-col gap-3.5">

        <!-- ROW 1: Slide Target Picker + Global Actions -->
        <div class="bg-white px-4 py-2.5 rounded-2xl border border-slate-200 shadow-xs flex flex-wrap items-center justify-between gap-2.5">
          <div class="flex flex-wrap items-center gap-1 bg-slate-100 p-1 rounded-xl text-xs font-bold">
            <button type="button" onclick="themeManager.selectSlideTarget('verses')"
                    class="px-3 py-1.5 rounded-lg transition flex items-center gap-1.5 cursor-pointer ${catVersesActive ? 'bg-white shadow-xs text-brand-700' : 'text-slate-600 hover:text-slate-900'}">
              <i class="fa-solid fa-book-bible"></i> Verses
            </button>
            <button type="button" onclick="themeManager.selectSlideTarget('songs')"
                    class="px-3 py-1.5 rounded-lg transition flex items-center gap-1.5 cursor-pointer ${catSongsActive ? 'bg-white shadow-xs text-brand-700' : 'text-slate-600 hover:text-slate-900'}">
              <i class="fa-solid fa-music"></i> Songs
            </button>
            <button type="button" onclick="themeManager.selectSlideTarget('tema')"
                    class="px-3 py-1.5 rounded-lg transition flex items-center gap-1.5 cursor-pointer ${(catProgramActive && this.activeProgramSubTab === 'tema') ? 'bg-white shadow-xs text-brand-700' : 'text-slate-600 hover:text-slate-900'}">
              <i class="fa-solid fa-cross"></i> Tema
            </button>
            <button type="button" onclick="themeManager.selectSlideTarget('person')"
                    class="px-3 py-1.5 rounded-lg transition flex items-center gap-1.5 cursor-pointer ${(catProgramActive && this.activeProgramSubTab === 'person') ? 'bg-white shadow-xs text-brand-700' : 'text-slate-600 hover:text-slate-900'}">
              <i class="fa-solid fa-user-tie"></i> Person
            </button>
            <button type="button" onclick="themeManager.selectSlideTarget('general')"
                    class="px-3 py-1.5 rounded-lg transition flex items-center gap-1.5 cursor-pointer ${(catProgramActive && this.activeProgramSubTab === 'general') ? 'bg-white shadow-xs text-brand-700' : 'text-slate-600 hover:text-slate-900'}">
              <i class="fa-regular fa-file-lines"></i> General
            </button>
          </div>

          <div class="flex flex-wrap items-center gap-1.5">
            <button type="button" onclick="themeManager.selectCanvasElement('margins')"
                    class="px-2.5 py-1.5 text-[11px] font-bold rounded-lg border transition flex items-center gap-1.5 cursor-pointer ${this.selectedElement === 'margins' ? 'bg-brand-50 text-brand-700 border-brand-300' : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100'}"
                    title="Edit Screen Margins & Alignment">
              <i class="fa-solid fa-arrows-to-dot"></i> Margins
            </button>
            <button type="button" onclick="themeManager.selectCanvasElement('shadows')"
                    class="px-2.5 py-1.5 text-[11px] font-bold rounded-lg border transition flex items-center gap-1.5 cursor-pointer ${this.selectedElement === 'shadows' ? 'bg-brand-50 text-brand-700 border-brand-300' : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100'}"
                    title="Edit Text Shadows & Readability">
              <i class="fa-solid fa-moon"></i> Shadows
            </button>
            <button type="button" onclick="themeManager.copyCurrentStyleToAll()"
                    class="px-2.5 py-1.5 text-[11px] font-bold text-slate-600 hover:text-brand-700 bg-slate-50 hover:bg-brand-50 border border-slate-200 hover:border-brand-300 rounded-lg transition flex items-center gap-1.5 cursor-pointer"
                    title="Copy current background, fonts, margins, and shadows to all 5 slide types">
              <i class="fa-regular fa-copy"></i> Copy to All
            </button>
            <button type="button" id="refreshLiveViewBtn" onclick="themeManager.refreshLiveView()"
                    ${this.isRefreshLiveForCurrentType() ? "" : "disabled title=\"Nothing of this type is on live projection\""}
                    class="px-3 py-1.5 text-white text-[11px] font-bold rounded-lg transition flex items-center gap-1.5 shadow-xs ${this.isRefreshLiveForCurrentType() ? "bg-emerald-600 hover:bg-emerald-700 cursor-pointer" : "bg-slate-300 cursor-not-allowed"}">
              <i class="fa-solid fa-arrows-rotate"></i> Refresh Live
            </button>
          </div>
        </div>

        <!-- ROW 2: CONTEXT-ADAPTIVE CANVA TOOLBAR -->
        <div id="canvaContextToolbar" class="bg-white px-4 py-2.5 rounded-2xl border border-slate-200 shadow-xs">
          ${this.renderCanvaToolbar(style)}
        </div>

        <!-- ROW 3: INTERACTIVE 16:9 CANVA CANVAS -->
        <div class="bg-slate-900 rounded-2xl p-4 sm:p-6 shadow-inner border border-slate-800 relative">
          <div class="flex items-center justify-between text-[11px] text-slate-400 mb-2.5 px-1">
            <span class="flex items-center gap-1.5">
              <i class="fa-solid fa-arrow-pointer text-brand-400"></i>
              Click any element on the slide (Background, Header, Text, Divider, Footnote) to edit it
            </span>
            <span class="font-mono text-slate-500">16:9 &bull; <span id="previewDimsLabel">1920&times;1080</span></span>
          </div>

          <div class="w-full max-w-4xl mx-auto relative">
            <div id="themePreviewBox" class="w-full rounded-lg overflow-hidden relative shadow-2xl border border-slate-700 bg-black transition-all duration-200">
              <iframe id="themePreviewFrame" title="Projection preview" scrolling="no"
                      style="border:0; pointer-events:none; transform-origin: top left; display:block;"></iframe>

              <!-- Interactive Canva Hit Layer -->
              <div id="canvaHitLayer"
                   onclick="if(event.target === this) themeManager.selectCanvasElement('background')"
                   style="position:absolute; inset:0; z-index:20; cursor:pointer;">
              </div>
            </div>

            <!-- Floating Quick-Actions Pill -->
            <div id="canvaQuickActions"
                 class="hidden absolute z-30 bg-slate-900/95 backdrop-blur-md text-white px-2.5 py-1.5 rounded-xl border border-slate-700 shadow-2xl flex items-center gap-1.5 text-[11px] whitespace-nowrap"
                 onclick="event.stopPropagation()">
            </div>
          </div>

          <!-- Quick Element Chips -->
          <div class="flex flex-wrap items-center justify-center gap-2 mt-3 text-[11px]">
            <button type="button" onclick="themeManager.selectCanvasElement('background')"
                    class="px-2.5 py-1 rounded-full border transition cursor-pointer ${this.selectedElement === 'background' ? 'bg-brand-600 text-white border-brand-500 font-bold' : 'bg-slate-800 text-slate-300 border-slate-700 hover:text-white'}">
              Background
            </button>
            <button type="button" onclick="themeManager.selectCanvasElement('header')"
                    class="px-2.5 py-1 rounded-full border transition cursor-pointer ${this.selectedElement === 'header' ? 'bg-brand-600 text-white border-brand-500 font-bold' : 'bg-slate-800 text-slate-300 border-slate-700 hover:text-white'}">
              Header ${style.headerVisible === false ? '(Hidden)' : ''}
            </button>
            ${(catProgramActive && this.activeProgramSubTab === 'person') ? `
              <button type="button" onclick="themeManager.selectCanvasElement('personTitle')"
                      class="px-2.5 py-1 rounded-full border transition cursor-pointer ${this.selectedElement === 'personTitle' ? 'bg-brand-600 text-white border-brand-500 font-bold' : 'bg-slate-800 text-slate-300 border-slate-700 hover:text-white'}">
                Person Title
              </button>
            ` : ''}
            <button type="button" onclick="themeManager.selectCanvasElement('primary')"
                    class="px-2.5 py-1 rounded-full border transition cursor-pointer ${this.selectedElement === 'primary' ? 'bg-brand-600 text-white border-brand-500 font-bold' : 'bg-slate-800 text-slate-300 border-slate-700 hover:text-white'}">
              Primary Text
            </button>
            ${(catVersesActive || (catProgramActive && (this.activeProgramSubTab === 'tema' || this.activeProgramSubTab === 'person'))) ? `
              <button type="button" onclick="themeManager.selectCanvasElement('divider')"
                      class="px-2.5 py-1 rounded-full border transition cursor-pointer ${this.selectedElement === 'divider' ? 'bg-brand-600 text-white border-brand-500 font-bold' : 'bg-slate-800 text-slate-300 border-slate-700 hover:text-white'}">
                Divider Line ${style.showDivider === false ? '(Hidden)' : ''}
              </button>
              <button type="button" onclick="themeManager.selectCanvasElement('secondary')"
                      class="px-2.5 py-1 rounded-full border transition cursor-pointer ${this.selectedElement === 'secondary' ? 'bg-brand-600 text-white border-brand-500 font-bold' : 'bg-slate-800 text-slate-300 border-slate-700 hover:text-white'}">
                Secondary Text
              </button>
            ` : ''}
            ${(catVersesActive || catSongsActive) ? `
              <button type="button" onclick="themeManager.selectCanvasElement('footnote')"
                      class="px-2.5 py-1 rounded-full border transition cursor-pointer ${this.selectedElement === 'footnote' ? 'bg-brand-600 text-white border-brand-500 font-bold' : 'bg-slate-800 text-slate-300 border-slate-700 hover:text-white'}">
                Footnote ${style.footnoteVisible === false ? '(Hidden)' : ''}
              </button>
            ` : ''}
          </div>
        </div>

      </div>
    `;

    this.updatePreviewCanvas();
    if (typeof requestAnimationFrame === "function") {
      requestAnimationFrame(() => {
        try {
          this.updatePreviewCanvas();
          this.syncCanvaHitboxes();
        } catch (e) {}
      });
    }
  }

  selectCanvasElement(elKey) {
    this.selectedElement = elKey || "background";
    const style = this.getActiveStyle();
    const toolbar = document.getElementById("canvaContextToolbar");
    if (toolbar && style) toolbar.innerHTML = this.renderCanvaToolbar(style);
    this.syncCanvaHitboxes();
  }

  toggleCanvaMediaDrawer(forceType) {
    this.selectedElement = "background";
    if (forceType) {
      this.setStyleField("backgroundType", forceType);
    }
    this.openCanvaMediaModal();
  }

  openCanvaMediaModal() {
    let modal = document.getElementById("canvaMediaModal");
    if (!modal) {
      modal = document.createElement("div");
      modal.id = "canvaMediaModal";
      modal.style.cssText = "position: fixed; inset: 0; z-index: 99999; display: none; align-items: center; justify-content: center; background: rgba(2, 6, 23, 0.72); backdrop-filter: blur(4px); padding: 16px;";
      modal.onclick = (e) => {
        if (e.target === modal) this.closeCanvaMediaModal();
      };
      document.body.appendChild(modal);
    }
    this.canvaMediaOpen = true;
    this.refreshCanvaMediaModal();
    modal.style.display = "flex";
  }

  closeCanvaMediaModal() {
    this.canvaMediaOpen = false;
    const modal = document.getElementById("canvaMediaModal");
    if (modal) modal.style.display = "none";
  }

  refreshCanvaMediaModal() {
    const modal = document.getElementById("canvaMediaModal");
    if (!modal) return;
    const style = this.getActiveStyle();
    if (!style) return;

    modal.innerHTML = `
      <div style="background: #ffffff; border-radius: 16px; border: 1px solid #cbd5e1; width: 94vw; max-width: 760px; max-height: 84vh; display: flex; flex-direction: column; overflow: hidden; box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.35);">
        <div class="px-5 py-3.5 border-b border-slate-200 flex items-center justify-between bg-slate-50 shrink-0">
          <div class="flex items-center gap-3">
            <span class="text-sm font-bold text-slate-900 flex items-center gap-2">
              <i class="fa-solid fa-photo-film text-brand-600"></i> Background Picker
            </span>
            <div class="flex items-center gap-1 bg-slate-200/70 p-0.5 rounded-lg text-[11px] font-bold">
              <button type="button" onclick="themeManager.setStyleField('backgroundType', 'image')" class="px-2.5 py-1 rounded-md transition cursor-pointer ${style.backgroundType === 'image' ? 'bg-white shadow-xs text-brand-700' : 'text-slate-600 hover:text-slate-900'}">Image / Video</button>
              <button type="button" onclick="themeManager.setStyleField('backgroundType', 'gradient')" class="px-2.5 py-1 rounded-md transition cursor-pointer ${style.backgroundType === 'gradient' ? 'bg-white shadow-xs text-brand-700' : 'text-slate-600 hover:text-slate-900'}">Gradient</button>
              <button type="button" onclick="themeManager.setStyleField('backgroundType', 'color')" class="px-2.5 py-1 rounded-md transition cursor-pointer ${style.backgroundType === 'color' ? 'bg-white shadow-xs text-brand-700' : 'text-slate-600 hover:text-slate-900'}">Solid Color</button>
            </div>
          </div>
          <button type="button" onclick="themeManager.closeCanvaMediaModal()" class="w-8 h-8 rounded-lg text-slate-400 hover:text-slate-800 hover:bg-slate-200/60 flex items-center justify-center transition cursor-pointer">
            <i class="fa-solid fa-xmark text-sm"></i>
          </button>
        </div>
        <div class="p-5 overflow-y-auto flex-1 bg-white">
          ${this.renderBackgroundSubControls(style)}
        </div>
        <div class="px-5 py-3 border-t border-slate-200 bg-slate-50 flex items-center justify-between shrink-0">
          <span class="text-[11px] text-slate-500">Changes apply to the preview immediately.</span>
          <button type="button" onclick="themeManager.closeCanvaMediaModal()" class="px-4 py-1.5 bg-brand-600 hover:bg-brand-700 text-white text-xs font-bold rounded-lg transition cursor-pointer">Done</button>
        </div>
      </div>
    `;
  }

  nudgeStyleField(field, delta, min, max, fallback) {
    const style = this.getActiveStyle();
    if (!style) return;
    const cur = (typeof style[field] === "number" && isFinite(style[field])) ? style[field] : fallback;
    const next = Math.min(max, Math.max(min, Math.round((cur + delta) * 100) / 100));
    this.setStyleField(field, next);
    this.selectCanvasElement(this.selectedElement);
  }

  renderCanvaToolbar(style) {
    const el = this.selectedElement || "background";
    const fontFamilies = ["Arial", "Georgia", "Helvetica", "Times New Roman", "Verdana", "Trebuchet MS", "Impact", "Courier New"];
    const fontOpts = (selected) => fontFamilies.map((f) =>
      `<option value="${f}" ${f.toLowerCase() === (selected || "Arial").toLowerCase() ? "selected" : ""}>${f}</option>`
    ).join("");

    const badgeMap = {
      background: { icon: "fa-image", label: "Background" },
      header: { icon: "fa-heading", label: "Header / Title" },
      personTitle: { icon: "fa-id-badge", label: "Person Title" },
      primary: { icon: "fa-font", label: "Primary Text" },
      divider: { icon: "fa-minus", label: "Divider Line" },
      secondary: { icon: "fa-align-left", label: "Secondary Text" },
      footnote: { icon: "fa-quote-right", label: "Footnote" },
      margins: { icon: "fa-arrows-to-dot", label: "Screen Margins" },
      shadows: { icon: "fa-moon", label: "Shadows" }
    };
    const badge = badgeMap[el] || badgeMap.background;
    const badgeHtml = `<span class="px-2.5 py-1 rounded-lg bg-brand-50 text-brand-700 border border-brand-200 text-[11px] font-bold flex items-center gap-1.5 shrink-0"><i class="fa-solid ${badge.icon}"></i> ${badge.label}</span>`;

    if (el === "background") {
      return `
        <div class="flex flex-wrap items-center gap-3">
          ${badgeHtml}
          <div class="flex items-center gap-1 bg-slate-100 p-0.5 rounded-lg text-[11px] font-bold">
            <button type="button" onclick="themeManager.toggleCanvaMediaDrawer('image')" class="px-2.5 py-1 rounded-md transition cursor-pointer ${style.backgroundType === 'image' ? 'bg-white shadow-xs text-brand-700' : 'text-slate-600'}">Image / Video</button>
            <button type="button" onclick="themeManager.toggleCanvaMediaDrawer('gradient')" class="px-2.5 py-1 rounded-md transition cursor-pointer ${style.backgroundType === 'gradient' ? 'bg-white shadow-xs text-brand-700' : 'text-slate-600'}">Gradient</button>
            <button type="button" onclick="themeManager.toggleCanvaMediaDrawer('color')" class="px-2.5 py-1 rounded-md transition cursor-pointer ${style.backgroundType === 'color' ? 'bg-white shadow-xs text-brand-700' : 'text-slate-600'}">Solid Color</button>
          </div>
          <button type="button" onclick="themeManager.openCanvaMediaModal()"
                  class="px-3 py-1.5 text-[11px] font-bold rounded-lg border transition flex items-center gap-1.5 cursor-pointer bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100">
            <i class="fa-solid fa-photo-film"></i> Choose Background...
          </button>
          <div class="flex items-center gap-2 ml-auto">
            <span class="text-[11px] font-bold text-slate-600">Dimmer</span>
            <input type="range" min="0" max="90" value="${style.overlayOpacity || 0}"
                   oninput="themeManager.setStyleField('overlayOpacity', parseInt(this.value)); const s=document.getElementById('canvaDimVal'); if(s) s.textContent=this.value+'%';"
                   class="w-24 accent-brand-600 cursor-pointer">
            <span id="canvaDimVal" class="text-[11px] font-mono text-slate-600 w-8">${style.overlayOpacity || 0}%</span>
            <input type="color" value="${style.overlayColor || '#000000'}" title="Dimmer Tint Color"
                   oninput="themeManager.setStyleField('overlayColor', this.value)"
                   class="w-7 h-7 rounded border border-slate-200 cursor-pointer p-0.5">
          </div>
        </div>
      `;
    }

    if (el === "divider") {
      const showDiv = style.showDivider !== false;
      return `
        <div class="flex flex-wrap items-center gap-3">
          ${badgeHtml}
          <label class="inline-flex items-center gap-1.5 text-xs font-bold text-slate-700 cursor-pointer">
            <input type="checkbox" ${showDiv ? "checked" : ""} onchange="themeManager.setStyleField('showDivider', this.checked); themeManager.selectCanvasElement('divider');" class="rounded accent-brand-600">
            <span>Visible</span>
          </label>
          <div class="flex items-center gap-1.5">
            <span class="text-[11px] font-semibold text-slate-500">Color</span>
            <input type="color" value="${style.dividerColor || '#FFB703'}" oninput="themeManager.setStyleField('dividerColor', this.value)" class="w-7 h-7 rounded border border-slate-200 cursor-pointer p-0.5">
          </div>
          <select onchange="themeManager.setStyleField('dividerStyle', this.value)" class="px-2 py-1 text-xs font-semibold bg-slate-50 border border-slate-200 rounded-lg">
            <option value="glow" ${(style.dividerStyle || 'glow') === 'glow' ? 'selected' : ''}>Glow</option>
            <option value="solid" ${style.dividerStyle === 'solid' ? 'selected' : ''}>Solid</option>
            <option value="dashed" ${style.dividerStyle === 'dashed' ? 'selected' : ''}>Dashed</option>
            <option value="dotted" ${style.dividerStyle === 'dotted' ? 'selected' : ''}>Dotted</option>
          </select>
          <div class="flex items-center gap-1.5">
            <span class="text-[11px] font-semibold text-slate-500">Thickness</span>
            <input type="range" min="1" max="10" value="${style.dividerThickness || 2}" oninput="themeManager.setStyleField('dividerThickness', parseInt(this.value))" class="w-20 accent-brand-600 cursor-pointer">
          </div>
          <div class="flex items-center gap-1.5">
            <span class="text-[11px] font-semibold text-slate-500">Width</span>
            <input type="range" min="20" max="100" value="${style.dividerWidth || 70}" oninput="themeManager.setStyleField('dividerWidth', parseInt(this.value))" class="w-20 accent-brand-600 cursor-pointer">
          </div>
          <div class="flex items-center gap-1.5">
            <span class="text-[11px] font-semibold text-slate-500">Top Pad</span>
            <input type="range" min="0" max="50" value="${typeof style.dividerPaddingTop !== 'undefined' ? style.dividerPaddingTop : 14}" oninput="themeManager.setStyleField('dividerPaddingTop', parseInt(this.value))" class="w-16 accent-brand-600 cursor-pointer">
          </div>
          <div class="flex items-center gap-1.5">
            <span class="text-[11px] font-semibold text-slate-500">Bottom Pad</span>
            <input type="range" min="0" max="50" value="${typeof style.dividerPaddingBottom !== 'undefined' ? style.dividerPaddingBottom : 14}" oninput="themeManager.setStyleField('dividerPaddingBottom', parseInt(this.value))" class="w-16 accent-brand-600 cursor-pointer">
          </div>
        </div>
      `;
    }

    if (el === "margins") {
      return `
        <div class="flex flex-wrap items-center gap-4">
          ${badgeHtml}
          ${[["marginTop", "Top", 10, 150, 50], ["marginBottom", "Bottom", 10, 150, 50], ["marginLeft", "Left", 10, 200, 60], ["marginRight", "Right", 10, 200, 60]].map(([f, lbl, min, max, def]) => `
            <div class="flex items-center gap-1.5">
              <span class="text-[11px] font-bold text-slate-600">${lbl}</span>
              <input type="range" min="${min}" max="${max}" value="${style[f] || def}" oninput="themeManager.setStyleField('${f}', parseInt(this.value)); const el=document.getElementById('canva_${f}'); if(el) el.textContent=this.value+'px';" class="w-20 accent-brand-600 cursor-pointer">
              <span id="canva_${f}" class="text-[10px] font-mono text-slate-500 w-9">${style[f] || def}px</span>
            </div>
          `).join("")}
        </div>
      `;
    }

    if (el === "shadows") {
      return `
        <div class="flex flex-wrap items-center gap-4">
          ${badgeHtml}
          <label class="inline-flex items-center gap-1.5 text-xs font-bold text-slate-700 cursor-pointer">
            <input type="checkbox" ${style.enableShadow ? "checked" : ""} onchange="themeManager.setStyleField('enableShadow', this.checked)" class="rounded accent-brand-600">
            <span>Enable Shadow</span>
          </label>
          <div class="flex items-center gap-2">
            <span class="text-[11px] font-semibold text-slate-500">Blur</span>
            <input type="range" min="1" max="10" value="${style.shadowBlur || 3}" oninput="themeManager.setStyleField('shadowBlur', parseInt(this.value))" class="w-24 accent-brand-600 cursor-pointer">
          </div>
          <div class="flex items-center gap-1.5">
            <span class="text-[11px] font-semibold text-slate-500">Color</span>
            <input type="color" value="${style.shadowColor || '#000000'}" oninput="themeManager.setStyleField('shadowColor', this.value)" class="w-7 h-7 rounded border border-slate-200 cursor-pointer p-0.5">
          </div>
        </div>
      `;
    }

    const prefix = el;
    const isHeader = el === "header";
    const isFootnote = el === "footnote";
    const isPrimary = el === "primary";
    const isPersonTitle = el === "personTitle";
    const fontKey = `${prefix}Font`;
    const colorKey = `${prefix}Color`;
    const sizeKey = (isHeader || isFootnote) ? `${prefix}Size` : `${prefix}Scale`;
    const sizeMin = (isHeader || isFootnote) ? 14 : (isPersonTitle ? 0.25 : 0.6);
    const sizeMax = (isHeader || isFootnote) ? 72 : (isPersonTitle ? 1.5 : 2.5);
    const sizeStep = (isHeader || isFootnote) ? 2 : 0.05;
    const sizeVal = style[sizeKey] || (isHeader ? 36 : isFootnote ? 20 : isPersonTitle ? 0.48 : isPrimary ? 1.6 : 1.1);
    const visKey = isHeader ? "headerVisible" : (isFootnote ? "footnoteVisible" : null);

    return `
      <div class="flex flex-wrap items-center gap-2.5">
        ${badgeHtml}
        ${visKey ? `
          <label class="inline-flex items-center gap-1.5 text-xs font-bold text-slate-700 cursor-pointer">
            <input type="checkbox" ${style[visKey] !== false ? "checked" : ""} onchange="themeManager.setStyleField('${visKey}', this.checked); themeManager.selectCanvasElement('${el}');" class="rounded accent-brand-600">
            <span>Visible</span>
          </label>
        ` : ""}
        <select onchange="themeManager.setStyleField('${fontKey}', this.value)" class="px-2.5 py-1 text-xs font-semibold bg-slate-50 border border-slate-200 rounded-lg text-slate-800">
          ${fontOpts(style[fontKey])}
        </select>
        <input type="color" value="${style[colorKey] || '#ffffff'}" title="Text Color"
               oninput="themeManager.setStyleField('${colorKey}', this.value)"
               class="w-7 h-7 rounded border border-slate-200 cursor-pointer p-0.5">
        <div class="flex items-center gap-1.5">
          <span class="text-[11px] font-semibold text-slate-500">Size</span>
          <input type="range" min="${sizeMin}" max="${sizeMax}" step="${sizeStep}" value="${sizeVal}"
                 oninput="themeManager.setStyleField('${sizeKey}', parseFloat(this.value))"
                 class="w-24 accent-brand-600 cursor-pointer">
        </div>
        ${(isPrimary || el === "secondary" || isPersonTitle) ? `
          <div class="flex items-center gap-0.5 bg-slate-100 p-0.5 rounded-lg text-xs">
            <button type="button" onclick="themeManager.setStyleField('${prefix}Weight', '${style[prefix + 'Weight'] === 'bold' ? 'normal' : 'bold'}'); themeManager.selectCanvasElement('${el}');"
                    class="px-2 py-1 rounded font-bold cursor-pointer ${style[prefix + 'Weight'] === 'bold' ? 'bg-white shadow-xs text-brand-700' : 'text-slate-500'}" title="Bold">B</button>
            <button type="button" onclick="themeManager.setStyleField('${prefix}Italic', ${!style[prefix + 'Italic']}); themeManager.selectCanvasElement('${el}');"
                    class="px-2 py-1 rounded italic font-serif cursor-pointer ${style[prefix + 'Italic'] ? 'bg-white shadow-xs text-brand-700' : 'text-slate-500'}" title="Italic">I</button>
          </div>
        ` : ""}
        ${isPrimary ? `
          <div class="flex items-center gap-1.5">
            <span class="text-[11px] font-semibold text-slate-500">Line</span>
            <input type="range" min="1.0" max="2.0" step="0.05" value="${style.lineHeight || 1.25}"
                   oninput="themeManager.setStyleField('lineHeight', parseFloat(this.value))"
                   class="w-16 accent-brand-600 cursor-pointer" title="Line Spacing">
          </div>
          <div class="flex items-center gap-0.5 bg-slate-100 p-0.5 rounded-lg text-xs">
            <button type="button" onclick="themeManager.setStyleField('textAlign', 'left')" class="px-2 py-1 rounded ${style.textAlign === 'left' ? 'bg-white shadow-xs text-brand-700' : 'text-slate-500'} cursor-pointer"><i class="fa-solid fa-align-left"></i></button>
            <button type="button" onclick="themeManager.setStyleField('textAlign', 'center')" class="px-2 py-1 rounded ${style.textAlign === 'center' ? 'bg-white shadow-xs text-brand-700' : 'text-slate-500'} cursor-pointer"><i class="fa-solid fa-align-center"></i></button>
            <button type="button" onclick="themeManager.setStyleField('textAlign', 'right')" class="px-2 py-1 rounded ${style.textAlign === 'right' ? 'bg-white shadow-xs text-brand-700' : 'text-slate-500'} cursor-pointer"><i class="fa-solid fa-align-right"></i></button>
          </div>
        ` : ""}
        ${(isPrimary && this.activeCategory === "songs") ? `
          <div class="flex items-center gap-1.5 pl-2 border-l border-slate-200">
            <span class="text-[11px] font-semibold text-slate-500">Alt</span>
            <input type="color" value="${style.alternateLineColor || '#e2e8f0'}" title="Alternate Line Color" oninput="themeManager.setStyleField('alternateLineColor', this.value)" class="w-6 h-6 rounded border border-slate-200 cursor-pointer p-0.5">
            <span class="text-[11px] font-semibold text-slate-500">Sync</span>
            <input type="color" value="${style.syncActiveColor || '#fde047'}" title="Audio Sync Active Color" oninput="themeManager.setStyleField('syncActiveColor', this.value)" class="w-6 h-6 rounded border border-slate-200 cursor-pointer p-0.5">
          </div>
        ` : ""}
      </div>
    `;
  }

  renderCanvaQuickActions(style) {
    const el = this.selectedElement || "background";
    if (el === "background") {
      return `
        <span class="font-bold text-slate-300 px-1">Background</span>
        <button type="button" onclick="themeManager.toggleCanvaMediaDrawer()" class="px-2 py-1 rounded-lg bg-brand-600 hover:bg-brand-500 font-bold cursor-pointer">Change Media</button>
        <button type="button" onclick="themeManager.nudgeStyleField('overlayOpacity', -10, 0, 90, 0)" class="px-1.5 py-1 rounded bg-slate-800 hover:bg-slate-700 cursor-pointer" title="Less Dim">- Dim</button>
        <button type="button" onclick="themeManager.nudgeStyleField('overlayOpacity', 10, 0, 90, 0)" class="px-1.5 py-1 rounded bg-slate-800 hover:bg-slate-700 cursor-pointer" title="More Dim">+ Dim</button>
      `;
    }
    if (el === "divider") {
      const showDiv = style.showDivider !== false;
      return `
        <span class="font-bold text-slate-300 px-1">Divider</span>
        <button type="button" onclick="themeManager.setStyleField('showDivider', ${!showDiv}); themeManager.selectCanvasElement('divider');" class="px-2 py-1 rounded-lg ${showDiv ? 'bg-slate-800 hover:bg-slate-700' : 'bg-amber-600'} font-bold cursor-pointer">${showDiv ? 'Hide' : 'Show'}</button>
        <input type="color" value="${style.dividerColor || '#FFB703'}" oninput="themeManager.setStyleField('dividerColor', this.value)" class="w-6 h-6 rounded cursor-pointer border-0 bg-transparent p-0">
        <button type="button" onclick="themeManager.nudgeStyleField('dividerThickness', -1, 1, 10, 2)" class="px-1.5 py-1 rounded bg-slate-800 hover:bg-slate-700 cursor-pointer">-</button>
        <span class="font-mono text-slate-300">${style.dividerThickness || 2}px</span>
        <button type="button" onclick="themeManager.nudgeStyleField('dividerThickness', 1, 1, 10, 2)" class="px-1.5 py-1 rounded bg-slate-800 hover:bg-slate-700 cursor-pointer">+</button>
      `;
    }
    if (el === "margins" || el === "shadows") return "";

    const isHeader = el === "header";
    const isFootnote = el === "footnote";
    const isPersonTitle = el === "personTitle";
    const visKey = isHeader ? "headerVisible" : (isFootnote ? "footnoteVisible" : null);
    const colorKey = `${el}Color`;
    const sizeKey = (isHeader || isFootnote) ? `${el}Size` : `${el}Scale`;
    const step = (isHeader || isFootnote) ? 4 : 0.05;
    const min = (isHeader || isFootnote) ? 14 : (isPersonTitle ? 0.25 : 0.6);
    const max = (isHeader || isFootnote) ? 72 : (isPersonTitle ? 1.5 : 2.5);
    const def = isHeader ? 36 : isFootnote ? 20 : isPersonTitle ? 0.48 : el === "primary" ? 1.6 : 1.1;

    return `
      <span class="font-bold text-slate-300 px-1 capitalize">${isPersonTitle ? "Person Title" : el}</span>
      ${visKey ? `<button type="button" onclick="themeManager.setStyleField('${visKey}', ${style[visKey] === false}); themeManager.selectCanvasElement('${el}');" class="px-2 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 font-bold cursor-pointer">${style[visKey] === false ? 'Show' : 'Hide'}</button>` : ""}
      <input type="color" value="${style[colorKey] || '#ffffff'}" oninput="themeManager.setStyleField('${colorKey}', this.value)" class="w-6 h-6 rounded cursor-pointer border-0 bg-transparent p-0">
      <button type="button" onclick="themeManager.nudgeStyleField('${sizeKey}', ${-step}, ${min}, ${max}, ${def})" class="px-1.5 py-1 rounded bg-slate-800 hover:bg-slate-700 cursor-pointer">A-</button>
      <button type="button" onclick="themeManager.nudgeStyleField('${sizeKey}', ${step}, ${min}, ${max}, ${def})" class="px-1.5 py-1 rounded bg-slate-800 hover:bg-slate-700 cursor-pointer">A+</button>
    `;
  }

  syncCanvaHitboxes() {
    const layer = document.getElementById("canvaHitLayer");
    const box = document.getElementById("themePreviewBox");
    const frame = document.getElementById("themePreviewFrame");
    const pill = document.getElementById("canvaQuickActions");
    if (!layer || !box || !frame) return;

    const doc = frame.contentDocument;
    const dims = this.previewProjectionDims();
    const availW = box.clientWidth || box.offsetWidth || 0;
    const s = (availW > 0 && dims.w > 0) ? (availW / dims.w) : 1;

    const targets = [
      { key: "header", id: "presentationTitle", label: "Header" },
      { key: "personTitle", id: "contentPersonTitle", label: "Person Title" },
      { key: "primary", id: "content1", label: "Primary Text" },
      { key: "divider", id: "presentationDivider", label: "Divider Line" },
      { key: "secondary", id: "content2", label: "Secondary Text" },
      { key: "footnote", id: "footnote", label: "Footnote" }
    ];

    layer.innerHTML = "";
    let selectedRect = null;

    if (doc) {
      targets.forEach((t) => {
        const el = doc.getElementById(t.id);
        if (!el) return;
        const cs = doc.defaultView ? doc.defaultView.getComputedStyle(el) : null;
        if (cs && cs.display === "none") return;
        const r = el.getBoundingClientRect();
        if (r.width <= 1 || r.height <= 1) return;

        const left = Math.max(0, r.left * s);
        const top = Math.max(0, r.top * s);
        const width = Math.max(24, r.width * s);
        const height = Math.max(t.key === "divider" ? 18 : 20, r.height * s);
        const adjTop = t.key === "divider" ? Math.max(0, top - 8) : top;

        const isSel = this.selectedElement === t.key;
        if (isSel) selectedRect = { left, top: adjTop, width, height };

        const hitbox = document.createElement("div");
        hitbox.title = `Click to edit ${t.label}`;
        hitbox.style.cssText = `
          position: absolute;
          left: ${left}px;
          top: ${adjTop}px;
          width: ${width}px;
          height: ${height}px;
          border: ${isSel ? "2px solid #3b82f6" : "1px dashed transparent"};
          border-radius: 6px;
          box-sizing: border-box;
          transition: border-color 0.12s ease, background 0.12s ease;
          background: ${isSel ? "rgba(59, 130, 246, 0.08)" : "transparent"};
        `;
        hitbox.onmouseenter = () => {
          if (!isSel) hitbox.style.border = "1.5px dashed rgba(96, 165, 250, 0.85)";
        };
        hitbox.onmouseleave = () => {
          if (!isSel) hitbox.style.border = "1px dashed transparent";
        };
        hitbox.onclick = (e) => {
          e.stopPropagation();
          this.selectCanvasElement(t.key);
        };
        layer.appendChild(hitbox);
      });
    }

    if (pill) {
      const style = this.getActiveStyle();
      const html = style ? this.renderCanvaQuickActions(style) : "";
      if (!html) {
        pill.classList.add("hidden");
        return;
      }
      pill.innerHTML = html;
      pill.classList.remove("hidden");
      if (selectedRect) {
        const pillTop = selectedRect.top > 44 ? (selectedRect.top - 40) : (selectedRect.top + selectedRect.height + 8);
        const pillLeft = Math.max(8, Math.min(box.clientWidth - 220, selectedRect.left + selectedRect.width / 2 - 90));
        pill.style.top = `${pillTop}px`;
        pill.style.left = `${pillLeft}px`;
      } else {
        pill.style.top = "10px";
        pill.style.left = "10px";
      }
    }
  }

  renderBackgroundSubControls(style) {
    if (style.backgroundType === "image") {
      const currentBg = style.bgImage || "";

      let thumbnailsHtml = "";
      this.availableImages.forEach(img => {
        const isSelected = (img.file.toLowerCase() === currentBg.toLowerCase());
        const activeCardClass = isSelected
          ? "ring-2 ring-brand-600 border-brand-500 shadow-sm bg-brand-50/30"
          : "border-slate-200 hover:border-slate-400 bg-white hover:bg-slate-50";
        const badgeHtml = isSelected
          ? `<span class="absolute top-1 right-1 w-4 h-4 rounded-full bg-brand-600 text-white flex items-center justify-center text-[9px] shadow-xs"><i class="fa-solid fa-check"></i></span>`
          : "";
        const canDelete = this.isDeletableBackground(img.file);
        const safeFile = String(img.file).replace(/\\/g, "\\\\").replace(/'/g, "\\'");
        const deleteHtml = canDelete
          ? `<span role="button" tabindex="0" title="Delete uploaded background"
                   onclick="event.stopPropagation(); themeManager.deleteBackgroundImage('${safeFile}', event)"
                   onkeydown="if(event.key==='Enter'||event.key===' '){event.preventDefault();event.stopPropagation();themeManager.deleteBackgroundImage('${safeFile}',event)}"
                   class="absolute top-1 left-1 w-5 h-5 rounded-md bg-white/95 hover:bg-red-50 text-slate-400 hover:text-red-600 border border-slate-200 hover:border-red-300 shadow-xs flex items-center justify-center text-[10px] transition opacity-0 group-hover:opacity-100 focus:opacity-100 cursor-pointer"><i class="fa-regular fa-trash-can"></i></span>`
          : "";

        const isVideo = Boolean(img.file && (/\.(mp4|webm|ogv|mov)$/i).test(img.file));
        const motionBadge = isVideo
          ? `<span class="absolute bottom-1 right-1 px-1 py-0.5 rounded bg-black/80 text-amber-300 text-[8px] font-bold tracking-wider flex items-center gap-0.5 pointer-events-none z-10"><i class="fa-solid fa-play text-[7px]"></i> MOTION</span>`
          : "";
        const mediaHtml = isVideo
          ? `<video src="./background/${img.file}" preload="metadata" muted playsinline class="w-full h-full object-cover group-hover:scale-105 transition duration-200" onmouseover="try{this.play();}catch(e){}" onmouseout="try{this.pause();this.currentTime=0;}catch(e){}"></video>`
          : `<img src="./background/${img.file}"
                   onerror="this.onerror=null; this.src='storage/background/${img.file}'"
                   alt="${img.name}"
                   class="w-full h-full object-cover group-hover:scale-105 transition duration-200" />`;

        thumbnailsHtml += `
          <div role="button" tabindex="0"
                  onclick="themeManager.setStyleField('bgImage', '${img.file}')"
                  onkeydown="if(event.key==='Enter'){themeManager.setStyleField('bgImage', '${img.file}')}"
                  title="${img.name} (${img.file})"
                  class="relative group flex flex-col p-1 rounded-lg border transition text-left cursor-pointer ${activeCardClass}">
            <div class="w-full aspect-video rounded overflow-hidden bg-slate-900 border border-slate-100/50 flex items-center justify-center relative">
              ${mediaHtml}
              ${motionBadge}
              ${badgeHtml}
              ${deleteHtml}
            </div>
            <div class="mt-1 px-0.5 truncate text-[10px] font-semibold text-slate-700 leading-tight">
              ${img.name}
            </div>
          </div>
        `;
      });

      return `
        <div class="space-y-2.5">
          <div class="flex items-center justify-between">
            <label class="block text-[11px] font-bold text-slate-600">Choose Background Media (${this.availableImages.length} available)</label>
            <div class="flex items-center gap-2">
              <button type="button" onclick="themeManager.openStockMediaModal()" 
                      class="px-2.5 py-1 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 rounded-lg text-[11px] font-bold transition flex items-center gap-1.5 shadow-2xs cursor-pointer" title="Search and download royalty-free worship motion videos and photos via Pexels">
                <i class="fa-solid fa-film text-indigo-600"></i> Free Stock Media
              </button>
              <input type="file" id="bgUploadInput" accept="image/png, image/jpeg, image/webp, image/gif, image/bmp, video/mp4, video/webm" 
                     class="hidden" onchange="themeManager.uploadBackgroundImage(event)">
              <button type="button" onclick="document.getElementById('bgUploadInput').click()" 
                      class="px-2.5 py-1 bg-brand-50 hover:bg-brand-100 text-brand-700 border border-brand-200 rounded-lg text-[11px] font-bold transition flex items-center gap-1.5 shadow-2xs cursor-pointer">
                <i class="fa-solid fa-cloud-arrow-up"></i> Upload Media
              </button>
            </div>
          </div>

          <!-- Thumbnail Gallery Grid -->
          <div class="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-2 max-h-56 overflow-y-auto p-1.5 bg-slate-50 border border-slate-200 rounded-xl custom-scrollbar">
            ${thumbnailsHtml}
          </div>
        </div>
      `;
    } else if (style.backgroundType === "gradient") {
      return `
        <div>
          <label class="block text-[11px] font-bold text-slate-600 mb-1">Gradient Preset or CSS</label>
          <div class="grid grid-cols-4 gap-2 mb-2">
            <button type="button" onclick="themeManager.setStyleField('bgGradient', 'linear-gradient(135deg, #090d16 0%, #1e1b4b 50%, #0f172a 100%)')" class="h-7 rounded border border-slate-300" style="background: linear-gradient(135deg, #090d16, #1e1b4b, #0f172a);" title="Dark Indigo"></button>
            <button type="button" onclick="themeManager.setStyleField('bgGradient', 'linear-gradient(135deg, #1e1136 0%, #3b0764 50%, #17092c 100%)')" class="h-7 rounded border border-slate-300" style="background: linear-gradient(135deg, #1e1136, #3b0764, #17092c);" title="Centro Purple"></button>
            <button type="button" onclick="themeManager.setStyleField('bgGradient', 'linear-gradient(135deg, #022c43 0%, #053f5e 50%, #115173 100%)')" class="h-7 rounded border border-slate-300" style="background: linear-gradient(135deg, #022c43, #053f5e, #115173);" title="Ocean Blue"></button>
            <button type="button" onclick="themeManager.setStyleField('bgGradient', 'linear-gradient(135deg, #451a03 0%, #78350f 50%, #291205 100%)')" class="h-7 rounded border border-slate-300" style="background: linear-gradient(135deg, #451a03, #78350f, #291205);" title="Warm Amber"></button>
            <button type="button" onclick="themeManager.setStyleField('bgGradient', 'linear-gradient(135deg, #312e81 0%, #0b0f1a 100%)')" class="h-7 rounded border border-slate-300" style="background: linear-gradient(135deg, #312e81, #0b0f1a);" title="Centro Indigo"></button>
            <button type="button" onclick="themeManager.setStyleField('bgGradient', 'linear-gradient(135deg, #5b21b6 0%, #1e1b4b 100%)')" class="h-7 rounded border border-slate-300" style="background: linear-gradient(135deg, #5b21b6, #1e1b4b);" title="Royal Purple"></button>
            <button type="button" onclick="themeManager.setStyleField('bgGradient', 'linear-gradient(135deg, #0f766e 0%, #042f2e 100%)')" class="h-7 rounded border border-slate-300" style="background: linear-gradient(135deg, #0f766e, #042f2e);" title="Ocean Teal"></button>
            <button type="button" onclick="themeManager.setStyleField('bgGradient', 'linear-gradient(135deg, #b45309 0%, #451a03 100%)')" class="h-7 rounded border border-slate-300" style="background: linear-gradient(135deg, #b45309, #451a03);" title="Amber Glow"></button>
          </div>
          <input type="text" value="${style.bgGradient || ''}" 
                 oninput="themeManager.setStyleField('bgGradient', this.value)" 
                 placeholder="e.g. linear-gradient(135deg, #1e1b4b, #0f172a)" 
                 class="w-full px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs font-mono text-slate-800">
        </div>
      `;
    } else {
      return `
        <div>
          <label class="block text-[11px] font-bold text-slate-600 mb-1">Solid Canvas Color</label>
          <div class="flex items-center gap-2">
            <input type="color" value="${style.bgColor || '#000000'}" 
                   oninput="themeManager.setStyleField('bgColor', this.value)" 
                   class="w-9 h-9 rounded border border-slate-200 cursor-pointer p-0.5">
            <input type="text" value="${style.bgColor || '#000000'}" 
                   oninput="themeManager.setStyleField('bgColor', this.value)" 
                   class="w-28 px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs font-mono text-slate-800">
          </div>
        </div>
      `;
    }
  }

  // Resolve what the preview should show for the active projection type.
  // Prefers LIVE app data (current verse selection, selected song, selected
  // program item) so the preview mirrors a real projection; falls back to
  // sampleData when nothing is selected yet. Never throws.
  getPreviewData() {
    let sampleKey = this.activeCategory;
    if (this.activeCategory === "program") {
      sampleKey = this.activeProgramSubTab;
    }
    const fallback = this.sampleData[sampleKey] || this.sampleData.verses;
    try {
      // Verses: mirror getdata()/launch() exactly (numbered texts, chapter
      // title, version-copyright footnote, singleVersion blanks text2)
      if (this.activeCategory === "verses" && typeof getSingleVerse === "function" &&
          typeof bible !== "undefined" && bible[version1] && typeof booknames !== "undefined") {
        const b = (typeof bookIndex === "number") ? bookIndex : 0;
        const c = (typeof chapterIndex === "number") ? chapterIndex : 0;
        let v = (typeof verseIndex === "number") ? verseIndex : 0;
        if (typeof window !== "undefined" && typeof window.selectedVerseIndex === "number" && window.selectedVerseIndex >= 0) {
          v = window.selectedVerseIndex;
        }
        const t1 = getSingleVerse(b, c, v, 1);
        if (t1 && booknames[b]) {
          let t2 = "";
          const dual = (typeof singleVersion !== "undefined") ? !singleVersion : false;
          if (dual && bible[version2]) {
            try { t2 = getSingleVerse(b, c, v, 2) || ""; } catch (e) {}
          }
          let fn = "";
          const v1c = (typeof bibleVersionArray !== "undefined" && bibleVersionArray[version1]) ? bibleVersionArray[version1][3] : "";
          const v2c = (typeof bibleVersionArray !== "undefined" && bibleVersionArray[version2]) ? bibleVersionArray[version2][3] : "";
          fn = (dual && v2c) ? `${v1c} / ${v2c}` : (v1c || "");
          // Trim: Bible XML verse text starts with a newline, which would
          // push the number onto its own line above the scripture
          return { title: `${booknames[b]} ${c + 1}:${v + 1}`, text1: `${v + 1} ${t1.trim()}`, text2: t2 ? `${v + 1} ${t2.trim()}` : "", footnote: fn };
        }
      }

      // Songs: the Lyrics tab DOM always reflects the selected song
      // (song_nav updates ly_name/ly_slide/ly_copy on every selection)
      if (this.activeCategory === "songs" && typeof document !== "undefined") {
        const nameEl = document.getElementById("ly_name");
        if (nameEl && nameEl.innerText && nameEl.innerText.trim()) {
          let firstSlide = "";
          const slideHost = document.getElementById("ly_slide");
          if (slideHost) {
            const firstLink = slideHost.querySelector("div a") || slideHost.querySelector("div");
            if (firstLink && firstLink.innerHTML) {
              firstSlide = firstLink.innerHTML.trim();
            } else if (firstLink && firstLink.innerText) {
              firstSlide = firstLink.innerText.trim().replace(/\r?\n/g, "<BR>");
            }
          }
          const copyEl = document.getElementById("ly_copy");
          return {
            title: nameEl.innerText.trim(),
            text1: firstSlide || String(fallback.text1 || "").replace(/\r?\n/g, "<BR>"),
            text2: "",
            footnote: copyEl ? copyEl.innerText.trim() : ""
          };
        }
      }

      // Program: mirror executePresentation() for the selected item
      if (this.activeCategory === "program" && typeof window !== "undefined" && window.programManager) {
        const pm = window.programManager;
        if (pm.items && pm.selectedItemIndex >= 0 && pm.items[pm.selectedItemIndex] &&
            typeof pm.generateSlidesForItem === "function") {
          const item = pm.items[pm.selectedItemIndex];
          const stripBR = (s) => String(s || "").replace(/<BR\s*\/?>/gi, "\n");
          if ((sampleKey === "tema" && item.type === "tema") ||
              (sampleKey === "person" && item.type === "person") ||
              (sampleKey === "general" && item.type === "general")) {
            const slides = pm.generateSlidesForItem(item) || [];
            const s0 = slides[0] || {};
            if (item.type === "tema") {
              return { title: item.title || "(Tema)", text1: stripBR(s0.text1), text2: stripBR(s0.text2), footnote: "" };
            }
            if (item.type === "person") {
              const role = (item.data && item.data.personType) || item.title || "";
              const personTitle = (item.data && item.data.personTitle) || s0.personTitle || "";
              return { title: role, personTitle: personTitle, text1: stripBR(s0.text1), text2: stripBR(s0.text2), footnote: "" };
            }
            return { title: item.title || "", text1: stripBR(s0.text1), text2: "", footnote: "" };
          }
        }
      }
    } catch (e) {
      console.warn("[THEME] Live preview data failed, using sample:", e);
    }
    return fallback;
  }

  // Exact projection dimensions used by the preview frame.
  previewProjectionDims() {
    let projW = 1920, projH = 1080;
    try {
      if (typeof getScreensArray === "function") {
        const screens = getScreensArray() || [];
        const idx = (typeof selectedScreenIndex === "number") ? selectedScreenIndex : 0;
        const bounds = (screens[idx] || screens[0] || {}).bounds;
        if (bounds && bounds.width > 0) {
          projW = Math.round(bounds.width);
          projH = Math.round(bounds.height || bounds.width * 9 / 16);
        }
      } else if (typeof pWindowX !== "undefined" && Number(pWindowX) > 0) {
        projW = Math.round(Number(pWindowX));
        projH = Math.round(Number(pWindowY) || projW * 9 / 16);
      }
    } catch (e) {}
    return { w: projW, h: projH };
  }

  // Update preview: drives the REAL projection page inside a scaled frame,
  // so the preview is pixel-identical to projection by construction
  // (same markup, same auto-fit, same theme application). No hand-mirroring.
  updatePreviewCanvas() {
    const box = document.getElementById("themePreviewBox");
    if (!box || !this.currentTheme) return;
    const frame = document.getElementById("themePreviewFrame");
    const dimsLabel = document.getElementById("previewDimsLabel");

    const dims = this.previewProjectionDims();
    const projW = dims.w, projH = dims.h;
    if (dimsLabel) {
      dimsLabel.innerText = `${projW}×${projH}`;
    }

    const style = this.getActiveStyle();
    if (!style || !frame) return;
    const data = this.getPreviewData();
    const maxFS = (typeof p_maxFontSize !== "undefined" && p_maxFontSize) ? p_maxFontSize : 100;
    // Isolated preview state: the frame renders through presentation.js
    // using only this (never live projection globals or broadcast traffic).
    const state = {
      text1: [data.text1 || ""],
      text2: [data.text2 || ""],
      personTitle: data.personTitle || "",
      personTitleArr: [data.personTitle || ""],
      font1: style.primaryFont || "Arial",
      font2: style.secondaryFont || style.primaryFont || "Arial",
      title: (data.title !== undefined && data.title !== null) ? data.title : "",
      titleArr: [(data.title !== undefined && data.title !== null) ? data.title : ""],
      footnote: (data.footnote !== undefined && data.footnote !== null) ? data.footnote : "",
      index: 0,
      last: 0,
      bkgnd: (style.backgroundType === "image" && style.bgImage) ? `./background/${style.bgImage}` : "",
      bkgndColor: "black",
      fontColor: style.primaryColor || "#FFFFFF",
      winX: projW,
      winY: projH,
      marginTop: (style.marginTop !== undefined && style.marginTop !== null) ? style.marginTop : 50,
      marginBottom: (style.marginBottom !== undefined && style.marginBottom !== null) ? style.marginBottom : 50,
      marginLeft: (style.marginLeft !== undefined && style.marginLeft !== null) ? style.marginLeft : 60,
      marginRight: (style.marginRight !== undefined && style.marginRight !== null) ? style.marginRight : 60,
      maxFS: maxFS,
      transition: false,
      showTitle: style.headerVisible !== false,
      shadow: style.enableShadow !== false,
      ver1: style.primaryScale || 1.6,
      ver2: style.secondaryScale || 1.1,
      align: style.textAlign || "center",
      theme: JSON.parse(JSON.stringify(style))
    };

    const pushState = () => {
      try {
        const win = frame.contentWindow;
        if (!win || typeof win.updatePresentation !== "function") return false;
        win.previewState = state;
        if (typeof win.passVariable === "function") win.passVariable();
        win.updatePresentation();
        if (typeof win.updateContent2 === "function") win.updateContent2();
        else if (typeof win.updateContent === "function") win.updateContent();
        frame.style.visibility = "visible";
        return true;
      } catch (e) {
        console.warn("[THEME] Preview pushState error:", e);
        return false;
      }
    };
    if (!frame.dataset.engineReady) {
      frame.dataset.engineReady = "1";
      frame.addEventListener("load", () => {
        pushState();
        this.scalePreviewFrame();
        if (typeof this.syncCanvaHitboxes === "function") this.syncCanvaHitboxes();
      });
      frame.src = "presentation.htm";
    }
    pushState();
    this.scalePreviewFrame();
    if (typeof this.syncCanvaHitboxes === "function") this.syncCanvaHitboxes();
  }

  // Scale the full-size engine frame into the preview box (exact ratio).
  scalePreviewFrame() {
    try {
      const box = document.getElementById("themePreviewBox");
      const frame = document.getElementById("themePreviewFrame");
      if (!box || !frame) return;
      const dims = this.previewProjectionDims();
      const availW = box.clientWidth || box.offsetWidth || 0;
      if (availW <= 0 || dims.w <= 0) return;
      const s = availW / dims.w;
      frame.style.width = dims.w + "px";
      frame.style.height = dims.h + "px";
      frame.style.transform = `scale(${s})`;
      box.style.height = Math.max(1, Math.round(dims.h * s)) + "px";
    } catch (e) {}
  }

  // Set style field on active target category
  setStyleField(field, val) {
    const style = this.getActiveStyle();
    if (!style) return;
    style[field] = val;
    if (field === "backgroundType" || field === "textAlign" || field === "bgImage") {
      this.renderSettingsUI();
      if (this.canvaMediaOpen) this.refreshCanvaMediaModal();
    } else {
      this.updatePreviewCanvas();
    }
    // Push to the open projection (debounced) so designer edits apply live.
    // refreshLiveView itself no-ops unless live matches this designer context.
    this.scheduleLivePush();
    // Persist (debounced) so every edit survives reloads with no Save button.
    this.scheduleAutosave();
  }

  // Debounced live-projection push for designer edits (slider drags etc.).
  scheduleLivePush() {
    try {
      if (this._livePushTimer) clearTimeout(this._livePushTimer);
      this._livePushTimer = setTimeout(() => {
        this._livePushTimer = null;
        try {
          if (typeof this.refreshLiveView === "function") this.refreshLiveView();
        } catch (e) {}
      }, 250);
    } catch (e) {}
  }

  // Debounced persist for designer edits -- every change is saved
  // without any Save button.
  scheduleAutosave() {
    try {
      if (this._autosaveTimer) clearTimeout(this._autosaveTimer);
      this._autosaveTimer = setTimeout(() => {
        this._autosaveTimer = null;
        try {
          if (typeof this.saveThemes === "function") this.saveThemes();
        } catch (e) {}
      }, 500);
    } catch (e) {}
  }

  // Get current lead advance time in milliseconds (0 - 2000ms, step 100ms)
  getSongLeadAdvanceMs() {
    if (typeof window !== "undefined" && window.songAudioEngine && typeof window.songAudioEngine.getLeadAdvanceMs === "function") {
      return window.songAudioEngine.getLeadAdvanceMs();
    }
    if (typeof localStorage !== "undefined") {
      const val = localStorage.getItem("uecfi_song_lead_advance_ms");
      if (val !== null && !isNaN(parseInt(val, 10))) {
        return Math.max(0, Math.min(2000, Math.round(parseInt(val, 10) / 100) * 100));
      }
    }
    return 0;
  }

  // Set lead advance time in milliseconds (0 - 2000ms in increments of 100ms)
  setSongLeadAdvanceMs(val) {
    const ms = parseInt(val, 10) || 0;
    const clamped = Math.max(0, Math.min(2000, Math.round(ms / 100) * 100));
    if (typeof window !== "undefined" && window.songAudioEngine && typeof window.songAudioEngine.setLeadAdvanceMs === "function") {
      window.songAudioEngine.setLeadAdvanceMs(clamped);
    } else if (typeof localStorage !== "undefined") {
      try {
        localStorage.setItem("uecfi_song_lead_advance_ms", String(clamped));
      } catch (e) {}
    }
    const valEl = document.getElementById("valSongLeadAdvanceMs");
    if (valEl) valEl.innerText = `${clamped}ms`;
    const valOptEl = document.getElementById("valOptionsLeadAdvanceMs");
    if (valOptEl) valOptEl.innerText = `${clamped}ms`;
    const inputEl = document.getElementById("songLeadAdvanceSlider");
    if (inputEl && inputEl.value != clamped) inputEl.value = clamped;
    const inputOptEl = document.getElementById("optionsLeadAdvanceSlider");
    if (inputOptEl && inputOptEl.value != clamped) inputOptEl.value = clamped;
    return clamped;
  }

  // Get style for a content context ('verses' | 'songs' | 'tema' | 'scripture' | 'general')
  // Single source of truth for which design bundle a projection type gets.
  // Present paths pass their item type through resolveProjectionContext()
  // instead of making their own design decisions.
  static PROJECTION_THEME_CONTEXTS = {
    verses: "verses",
    songs: "songs",
    song: "songs",
    scripture: "verses",
    program_scripture: "verses",
    tema: "program_tema",
    program_tema: "program_tema",
    person: "program_person",
    program_person: "program_person",
    general: "program_general",
    program_general: "program_general",
  };

  // Map any item/projection type to its canonical theme context.
  // Unknown types fall back to verses with a visible warning.
  resolveProjectionContext(type) {
    const map = ThemeManager.PROJECTION_THEME_CONTEXTS;
    if (type && map[type]) return map[type];
    console.warn(`[THEME] Unknown projection context "${type}", falling back to verses design.`);
    return "verses";
  }

  // Merge the stored bundle over the factory defaults so the result is
  // always complete. Stored values win unless undefined/null/"".
  // Falls back to full defaults with a visible warning (no silent restyle).
  resolveProjectionStyle(context) {
    const canonical = this.resolveProjectionContext(context);
    const defaults = this.getDefaultStyleBundle(canonical);
    const theme = this.currentTheme || (this.themes && this.themes[0]);
    const stored = (theme && theme.styles && theme.styles[canonical]) || null;
    if (!stored) {
      console.warn(`[THEME] No "${canonical}" bundle in active theme, using factory defaults.`);
      return Object.assign({}, defaults);
    }
    const merged = Object.assign({}, defaults);
    Object.keys(stored).forEach((k) => {
      if (stored[k] !== undefined && stored[k] !== null && stored[k] !== "") {
        merged[k] = stored[k];
      }
    });
    // Legacy migration: removed photo/promo/gradient backgrounds fall back
    // to UECFI.png so saved themes never point at a missing file.
    if (typeof merged.bgImage === "string" && /^(promote[12]|lens|cross|praise|land2|yellow|3cross|tulip|tulips|footprint|green|vase|candle|bluegrad|redgrad|browngrad|greengrad|sanctuary-indigo|centro-indigo|royal-purple|ocean-teal|amber-glow)\.(jpg|jpeg|png)$/i.test(merged.bgImage.trim())) {
      console.warn(`[THEME] Background "${merged.bgImage}" no longer ships with the app, using UECFI.png.`);
      merged.bgImage = "UECFI.png";
    }
    return merged;
  }

  // Startup assertion: every mapped context must resolve to a real bundle.
  // Call once after ThemeManager is ready; returns true when healthy.
  validateProjectionContexts() {
    let ok = true;
    const seen = {};
    Object.values(ThemeManager.PROJECTION_THEME_CONTEXTS).forEach((ctx) => {
      if (seen[ctx]) return;
      seen[ctx] = true;
      try {
        const bundle = this.getDefaultStyleBundle(ctx);
        if (!bundle || typeof bundle !== "object") {
          console.warn(`[THEME] No default bundle for context "${ctx}".`);
          ok = false;
        }
      } catch (e) {
        console.warn(`[THEME] No default bundle for context "${ctx}".`, e);
        ok = false;
      }
    });
    return ok;
  }

  getStyleBundle(context) {
    return this.getStyleForContext(context);
  }

  getStyleForContext(context) {
    const canonical = this.resolveProjectionContext(context);
    const theme = this.currentTheme || (this.themes && this.themes[0]);
    if (!theme || !theme.styles) {
      console.warn(`[THEME] No active theme, using factory defaults for "${canonical}".`);
      return this.getDefaultStyleBundle(canonical);
    }
    if (canonical === "songs") {
      return theme.styles.songs || this.getDefaultStyleBundle("songs");
    }
    if (canonical === "program_tema") {
      return theme.styles.program_tema || this.getDefaultStyleBundle("program_tema");
    }
    if (canonical === "program_person") {
      return theme.styles.program_person || this.getDefaultStyleBundle("program_person");
    }
    if (canonical === "program_general") {
      return theme.styles.program_general || this.getDefaultStyleBundle("program_general");
    }
    // Verses (and scripture, which inherits the verses design)
    return theme.styles.verses || this.getDefaultStyleBundle("verses");
  }

  // Push theme properties into active projection window.
  // This is the ONLY writer of projection design globals (fonts, colors,
  // margins, scales, background). Present paths set content only, then call
  // this. The bundle is merged over factory defaults, so every property is
  // always defined -- no per-property literal fallbacks needed here.
  applyThemeToProjection(context) {
    if (!context) {
      // Use active category/subtab as context
      if (this.activeCategory === "songs") context = "songs";
      else if (this.activeCategory === "program") context = this.activeProgramSubTab;
      else context = "verses";
    }

    const style = this.resolveProjectionStyle(context);
    if (!style) return;

    window.p_text1_font = style.primaryFont;
    window.p_text2_font = style.secondaryFont;
    window.p_font_color = style.primaryColor;
    window.p_topMargin = style.marginTop;
    window.p_bottomMargin = style.marginBottom;
    window.p_leftMargin = style.marginLeft;
    window.p_rightMargin = style.marginRight;
    window.p_enableShadow = !!style.enableShadow;
    window.p_enableTransition = !!style.enableTransition;
    window.p_align = style.textAlign;
    window.p_ver1ScaleFactor = style.primaryScale;
    window.p_ver2ScaleFactor = style.secondaryScale;

    // Attach active style bundle to window
    window.activeThemeObj = style;

    if (style.backgroundType === "image" && style.bgImage) {
      window.p_bkgnd_filename = `./background/${style.bgImage}`;
    } else {
      window.p_bkgnd_filename = "";
    }
  }

  // Canonical theme context the designer is currently editing
  // (verses | songs | program_tema | program_person | program_general).
  getDesignerThemeContext() {
    try {
      if (typeof this.getActiveTargetKey === "function") {
        return this.getActiveTargetKey();
      }
    } catch (e) {}
    return "verses";
  }

  // True when the live projection (if any) uses this designer context's
  // bundle. Compared canonically, so e.g. a live scripture program item
  // (verses design) enables the verses Refresh button.
  isRefreshLiveForCurrentType() {
    try {
      const live = (typeof window !== "undefined" && window.liveProjectionType) || null;
      if (!live) return false;
      const designerCtx = this.getDesignerThemeContext();
      const liveCtx = this.resolveProjectionContext(live);
      const designCtx = this.resolveProjectionContext(designerCtx);
      return liveCtx === designCtx;
    } catch (e) {
      return false;
    }
  }

  // Enable/disable the Refresh Live View button to match live state.
  // Called on every present/close and on every settings re-render.
  updateRefreshButtonState() {
    try {
      const btn = document.getElementById("refreshLiveViewBtn");
      if (!btn) return;
      if (this.isRefreshLiveForCurrentType()) {
        btn.removeAttribute("disabled");
        btn.removeAttribute("title");
        btn.classList.remove("bg-slate-300", "cursor-not-allowed");
        btn.classList.add("bg-emerald-600", "hover:bg-emerald-700");
      } else {
        btn.setAttribute("disabled", "");
        btn.setAttribute("title", "Nothing of this type is on live projection");
        btn.classList.remove("bg-emerald-600", "hover:bg-emerald-700");
        btn.classList.add("bg-slate-300", "cursor-not-allowed");
      }
    } catch (e) {}
  }

  // "Refresh Live View" button handler.
  // No-op unless the live projection uses this designer context's bundle.
  refreshLiveView() {
    if (!this.isRefreshLiveForCurrentType()) return;
    this.applyThemeToProjection();
    const style = this.getActiveStyle();
    if (!style) return;

    // 1. Update Live Output Preview in controller window
    const liveBg = document.getElementById("liveBgLayer");
    if (liveBg) {
      if (style.backgroundType === "image" && style.bgImage) {
        liveBg.style.backgroundImage = `url(./background/${style.bgImage})`;
        liveBg.style.backgroundSize = "cover";
        liveBg.style.backgroundPosition = "center";
        liveBg.style.backgroundColor = "transparent";
      } else if (style.backgroundType === "gradient" && style.bgGradient) {
        liveBg.style.backgroundImage = style.bgGradient;
        liveBg.style.backgroundColor = "transparent";
      } else {
        liveBg.style.backgroundImage = "none";
        liveBg.style.backgroundColor = style.bgColor || "#000000";
      }
    }

    const livePrimary = document.getElementById("livePrimaryText");
    if (livePrimary) {
      livePrimary.style.fontFamily = style.primaryFont || "Arial";
      livePrimary.style.color = style.primaryColor || "#FFFFFF";
    }

    const liveSecondary = document.getElementById("liveSecondaryText");
    if (liveSecondary) {
      liveSecondary.style.fontFamily = style.secondaryFont || "Arial";
      liveSecondary.style.color = style.secondaryColor || "#C7D2FE";
    }

    // 2. Push to external projection window if open
    if (typeof newWindow !== "undefined" && newWindow && newWindow.window) {
      try {
        if (typeof newWindow.window.passVariable === "function") {
          newWindow.window.passVariable();
        }
        if (typeof newWindow.window.updatePresentation === "function") {
          newWindow.window.updatePresentation();
        }
        if (typeof newWindow.window.updateContent === "function") {
          newWindow.window.updateContent();
        }
      } catch (e) {
        console.warn("[THEME] Error refreshing presentation window:", e);
      }
    }

    if (typeof presentWindowOpen !== "undefined" && presentWindowOpen && typeof presentation === "function") {
      presentation();
    }
  }

  // ==========================================
  // PEXELS FREE STOCK MEDIA SEARCH & DOWNLOAD
  // ==========================================
  openStockMediaModal() {
    let modal = document.getElementById("stockMediaModal");
    if (!modal) {
      modal = document.createElement("div");
      modal.id = "stockMediaModal";
      modal.style.cssText = "position:fixed;inset:0;z-index:999999;display:flex;align-items:center;justify-content:center;background:rgba(2,6,23,0.78);backdrop-filter:blur(6px);padding:16px;";
      modal.innerHTML = `
        <div style="background:#ffffff;border-radius:16px;border:1px solid #cbd5e1;width:95vw;max-width:960px;height:88vh;max-height:800px;display:flex;flex-direction:column;overflow:hidden;box-shadow:0 25px 50px -12px rgba(0,0,0,0.35);">
          <!-- Header -->
          <div style="padding:16px 20px;border-bottom:1px solid #e2e8f0;display:flex;align-items:center;justify-content:space-between;background:#f8fafc;">
            <div style="display:flex;align-items:center;gap:10px;">
              <div style="width:36px;height:36px;border-radius:10px;background:#e0e7ff;color:#4f46e5;display:flex;align-items:center;justify-content:center;font-size:18px;">
                <i class="fa-solid fa-film"></i>
              </div>
              <div>
                <h3 style="margin:0;font-size:15px;font-weight:700;color:#0f172a;">Free Worship Stock Media Library</h3>
                <p style="margin:0;font-size:11px;color:#64748b;">Search and 1-click apply royalty-free motion video loops and high-res photos via Pexels</p>
              </div>
            </div>
            <button type="button" onclick="themeManager.closeStockMediaModal()" style="border:0;background:none;color:#64748b;font-size:18px;cursor:pointer;padding:6px 10px;border-radius:8px;" class="hover:bg-slate-200">
              <i class="fa-solid fa-xmark"></i>
            </button>
          </div>

          <!-- Search & Filter Bar -->
          <div style="padding:14px 20px;border-bottom:1px solid #e2e8f0;background:#ffffff;display:flex;flex-direction:column;gap:10px;">
            <div style="display:flex;align-items:center;gap:8px;">
              <div style="position:relative;flex:1;">
                <i class="fa-solid fa-magnifying-glass" style="position:absolute;left:12px;top:11px;color:#94a3b8;font-size:13px;"></i>
                <input type="text" id="stockSearchInput" placeholder="Search worship, cross, clouds, mountains, ocean, sky, nature..."
                       style="width:100%;padding:8px 12px 8px 34px;border:1px solid #cbd5e1;border-radius:10px;font-size:13px;outline:none;box-sizing:border-box;"
                       onkeydown="if(event.key==='Enter'){themeManager.searchStockMedia();}">
              </div>
              <button type="button" onclick="themeManager.searchStockMedia()" 
                      style="padding:8px 18px;background:#4f46e5;color:#ffffff;border:0;border-radius:10px;font-size:13px;font-weight:600;cursor:pointer;display:flex;align-items:center;gap:6px;">
                <i class="fa-solid fa-search"></i> Search
              </button>
            </div>

            <!-- Media Type Tabs & Quick Keywords -->
            <div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:8px;">
              <div style="display:flex;gap:4px;background:#f1f5f9;padding:3px;border-radius:8px;">
                <button type="button" id="stockFilterAll" onclick="themeManager.setStockFilter('all')" class="stock-tab-btn" style="padding:4px 12px;border:0;border-radius:6px;font-size:11px;font-weight:700;cursor:pointer;background:#ffffff;color:#0f172a;box-shadow:0 1px 2px rgba(0,0,0,0.05);">All Media</button>
                <button type="button" id="stockFilterVideos" onclick="themeManager.setStockFilter('videos')" class="stock-tab-btn" style="padding:4px 12px;border:0;border-radius:6px;font-size:11px;font-weight:700;cursor:pointer;background:transparent;color:#64748b;">Motion Loops</button>
                <button type="button" id="stockFilterPhotos" onclick="themeManager.setStockFilter('photos')" class="stock-tab-btn" style="padding:4px 12px;border:0;border-radius:6px;font-size:11px;font-weight:700;cursor:pointer;background:transparent;color:#64748b;">Photos</button>
              </div>

              <!-- Quick keyword tags -->
              <div style="display:flex;align-items:center;gap:5px;overflow-x:auto;">
                <span style="font-size:11px;font-weight:600;color:#94a3b8;">Ideas:</span>
                ${["Worship", "Cross", "Clouds", "Mountains", "Nature", "Sky", "Stars", "Ocean"].map(k => `
                  <button type="button" onclick="document.getElementById('stockSearchInput').value='${k}';themeManager.searchStockMedia();"
                          style="border:1px solid #e2e8f0;background:#f8fafc;color:#475569;font-size:10px;font-weight:600;padding:2px 8px;border-radius:6px;cursor:pointer;" class="hover:bg-slate-200">
                    ${k}
                  </button>
                `).join("")}
              </div>
            </div>
          </div>

          <!-- Results Scroll Area -->
          <div id="stockResultsArea" style="flex:1;min-height:0;overflow-y:auto;padding:16px 20px;background:#f8fafc;">
            <div style="display:flex;flex-direction:column;align-items:center;justify-content:center;height:100%;color:#94a3b8;gap:8px;">
              <i class="fa-solid fa-images" style="font-size:32px;"></i>
              <p style="margin:0;font-size:13px;font-weight:500;">Type a keyword above or click an idea chip to discover free motion loops and photos.</p>
            </div>
          </div>

          <!-- Footer / Attribution -->
          <div style="padding:10px 20px;border-top:1px solid #e2e8f0;background:#ffffff;display:flex;align-items:center;justify-content:space-between;font-size:11px;color:#64748b;">
            <span>Photos and videos provided free by <a href="https://www.pexels.com" target="_blank" style="color:#4f46e5;font-weight:600;text-decoration:none;">Pexels</a></span>
            <button type="button" onclick="themeManager.closeStockMediaModal()" style="padding:6px 14px;border:1px solid #cbd5e1;background:#ffffff;border-radius:8px;font-size:11px;font-weight:600;cursor:pointer;">Close</button>
          </div>
        </div>
      `;
      document.body.appendChild(modal);
    }
    modal.style.display = "flex";
    this.stockFilter = this.stockFilter || "all";
    const input = document.getElementById("stockSearchInput");
    if (input) {
      if (!input.value) input.value = "worship";
      input.focus();
      this.searchStockMedia();
    }
  }

  closeStockMediaModal() {
    const modal = document.getElementById("stockMediaModal");
    if (modal) modal.style.display = "none";
  }

  setStockFilter(filter) {
    this.stockFilter = filter;
    ["all", "videos", "photos"].forEach(f => {
      const btn = document.getElementById("stockFilter" + f.charAt(0).toUpperCase() + f.slice(1));
      if (btn) {
        if (f === filter) {
          btn.style.background = "#ffffff";
          btn.style.color = "#0f172a";
          btn.style.boxShadow = "0 1px 2px rgba(0,0,0,0.05)";
        } else {
          btn.style.background = "transparent";
          btn.style.color = "#64748b";
          btn.style.boxShadow = "none";
        }
      }
    });
    this.searchStockMedia();
  }

  async searchStockMedia() {
    const input = document.getElementById("stockSearchInput");
    const container = document.getElementById("stockResultsArea");
    if (!container) return;

    const query = (input && input.value.trim()) || "worship";
    container.innerHTML = `
      <div style="display:flex;flex-direction:column;align-items:center;justify-content:center;height:240px;gap:12px;color:#4f46e5;">
        <i class="fa-solid fa-circle-notch fa-spin" style="font-size:32px;"></i>
        <span style="font-size:13px;font-weight:600;color:#64748b;">Searching Pexels for "${query}"...</span>
      </div>
    `;

    const apiKey = "UalPe317PccDhX8Q9TeE80akl2vzLZ32egvbcQvcxYDCVBeqHcIh3jye";
    const headers = { "Authorization": apiKey };
    const filter = this.stockFilter || "all";

    try {
      let videos = [];
      let photos = [];

      if (filter === "all" || filter === "videos") {
        const vRes = await fetch(`https://api.pexels.com/videos/search?query=${encodeURIComponent(query)}&per_page=12&orientation=landscape`, { headers });
        if (vRes.ok) {
          const vData = await vRes.json();
          videos = vData.videos || [];
        }
      }

      if (filter === "all" || filter === "photos") {
        const pRes = await fetch(`https://api.pexels.com/v1/search?query=${encodeURIComponent(query)}&per_page=12&orientation=landscape`, { headers });
        if (pRes.ok) {
          const pData = await pRes.json();
          photos = pData.photos || [];
        }
      }

      const combined = [];
      if (filter === "all") {
        // Interleave videos and photos
        const max = Math.max(videos.length, photos.length);
        for (let i = 0; i < max; i++) {
          if (videos[i]) combined.push({ type: "video", data: videos[i] });
          if (photos[i]) combined.push({ type: "photo", data: photos[i] });
        }
      } else if (filter === "videos") {
        videos.forEach(v => combined.push({ type: "video", data: v }));
      } else {
        photos.forEach(p => combined.push({ type: "photo", data: p }));
      }

      if (combined.length === 0) {
        container.innerHTML = `
          <div style="display:flex;flex-direction:column;align-items:center;justify-content:center;height:200px;color:#94a3b8;gap:8px;">
            <i class="fa-solid fa-circle-question" style="font-size:28px;"></i>
            <span style="font-size:13px;">No results found for "${query}". Try another search term like "clouds", "cross", or "nature".</span>
          </div>
        `;
        return;
      }

      let cardsHtml = combined.map((item, idx) => {
        if (item.type === "video") {
          const v = item.data;
          const thumb = v.image || (v.video_pictures && v.video_pictures[0] && v.video_pictures[0].picture) || "";
          const dur = v.duration ? `${v.duration}s` : "Loop";
          const user = (v.user && v.user.name) || "Pexels Creator";
          return `
            <div style="background:#ffffff;border:1px solid #e2e8f0;border-radius:12px;overflow:hidden;display:flex;flex-direction:column;box-shadow:0 1px 3px rgba(0,0,0,0.05);transition:all 0.2s;" class="hover:shadow-md hover:border-indigo-300">
              <div style="position:relative;width:100%;aspect-ratio:16/9;background:#090d16;overflow:hidden;">
                <img src="${thumb}" alt="${user}" style="width:100%;height:100%;object-fit:cover;">
                <span style="position:absolute;bottom:6px;right:6px;background:rgba(0,0,0,0.75);color:#fde047;font-size:9px;font-weight:700;padding:2px 6px;border-radius:4px;display:flex;align-items:center;gap:3px;">
                  <i class="fa-solid fa-play" style="font-size:7px;"></i> MOTION (${dur})
                </span>
                <span style="position:absolute;top:6px;left:6px;background:rgba(0,0,0,0.6);color:#ffffff;font-size:9px;padding:2px 6px;border-radius:4px;">
                  ${v.width}×${v.height}
                </span>
              </div>
              <div style="padding:10px 12px;display:flex;flex-direction:column;gap:6px;flex:1;justify-content:space-between;">
                <div style="font-size:11px;font-weight:600;color:#334155;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;" title="By ${user}">
                  By ${user}
                </div>
                <button type="button" id="btnStockApply_${idx}" onclick="themeManager.applyStockMedia('video', ${v.id}, '${encodeURIComponent(JSON.stringify(v))}', 'btnStockApply_${idx}')"
                        style="width:100%;padding:6px 0;background:#4f46e5;color:#ffffff;border:0;border-radius:8px;font-size:11px;font-weight:700;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:5px;">
                  <i class="fa-solid fa-download"></i> Use as Background
                </button>
              </div>
            </div>
          `;
        } else {
          const p = item.data;
          const thumb = p.src.medium || p.src.large;
          const user = p.photographer || "Pexels Creator";
          return `
            <div style="background:#ffffff;border:1px solid #e2e8f0;border-radius:12px;overflow:hidden;display:flex;flex-direction:column;box-shadow:0 1px 3px rgba(0,0,0,0.05);transition:all 0.2s;" class="hover:shadow-md hover:border-indigo-300">
              <div style="position:relative;width:100%;aspect-ratio:16/9;background:#090d16;overflow:hidden;">
                <img src="${thumb}" alt="${user}" style="width:100%;height:100%;object-fit:cover;">
                <span style="position:absolute;bottom:6px;right:6px;background:rgba(0,0,0,0.75);color:#ffffff;font-size:9px;font-weight:700;padding:2px 6px;border-radius:4px;display:flex;align-items:center;gap:3px;">
                  <i class="fa-solid fa-camera" style="font-size:8px;"></i> PHOTO
                </span>
                <span style="position:absolute;top:6px;left:6px;background:rgba(0,0,0,0.6);color:#ffffff;font-size:9px;padding:2px 6px;border-radius:4px;">
                  ${p.width}×${p.height}
                </span>
              </div>
              <div style="padding:10px 12px;display:flex;flex-direction:column;gap:6px;flex:1;justify-content:space-between;">
                <div style="font-size:11px;font-weight:600;color:#334155;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;" title="By ${user}">
                  By ${user}
                </div>
                <button type="button" id="btnStockApply_${idx}" onclick="themeManager.applyStockMedia('photo', ${p.id}, '${encodeURIComponent(JSON.stringify(p))}', 'btnStockApply_${idx}')"
                        style="width:100%;padding:6px 0;background:#4f46e5;color:#ffffff;border:0;border-radius:8px;font-size:11px;font-weight:700;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:5px;">
                  <i class="fa-solid fa-download"></i> Use as Background
                </button>
              </div>
            </div>
          `;
        }
      }).join("");

      container.innerHTML = `
        <div style="display:grid;grid-template-columns:repeat(auto-fill, minmax(200px, 1fr));gap:14px;">
          ${cardsHtml}
        </div>
      `;
    } catch (err) {
      console.error("[PEXELS] Error searching stock media:", err);
      container.innerHTML = `
        <div style="display:flex;flex-direction:column;align-items:center;justify-content:center;height:200px;color:#ef4444;gap:8px;">
          <i class="fa-solid fa-triangle-exclamation" style="font-size:28px;"></i>
          <span style="font-size:13px;font-weight:600;">Unable to connect to Pexels API. Please check your internet connection.</span>
        </div>
      `;
    }
  }

  async applyStockMedia(type, id, encodedData, btnId) {
    const btn = document.getElementById(btnId);
    const origHtml = btn ? btn.innerHTML : "";
    if (btn) {
      btn.innerHTML = `<i class="fa-solid fa-circle-notch fa-spin"></i> Downloading...`;
      btn.disabled = true;
    }

    try {
      const data = JSON.parse(decodeURIComponent(encodedData));
      let downloadUrl = "";
      let filename = "";

      if (type === "video") {
        // Pick optimal HD (1080p or 720p) video file
        const files = data.video_files || [];
        const hd = files.find(f => (f.height === 1080 || f.width === 1080) && f.file_type === "video/mp4")
                || files.find(f => (f.height === 720 || f.width === 720) && f.file_type === "video/mp4")
                || files.find(f => f.file_type === "video/mp4")
                || files[0];
        if (!hd || !hd.link) throw new Error("No valid MP4 link found");
        downloadUrl = hd.link;
        filename = `Motion_Stock_${id}.mp4`;
      } else {
        downloadUrl = data.src.large2x || data.src.original || data.src.large;
        filename = `Worship_Stock_${id}.jpg`;
      }

      // Fetch binary data
      const res = await fetch(downloadUrl);
      if (!res.ok) throw new Error("Download request failed with status " + res.status);
      const blob = await res.blob();
      const arrayBuffer = await blob.arrayBuffer();

      // Check if Electron / Node environment
      if (typeof require !== "undefined") {
        const fs = require("fs");
        const path = require("path");
        const dir1 = path.join(process.cwd(), "background");
        const dir2 = path.join(process.cwd(), "storage", "background");
        if (!fs.existsSync(dir1)) fs.mkdirSync(dir1, { recursive: true });
        if (!fs.existsSync(dir2)) fs.mkdirSync(dir2, { recursive: true });
        const buf = Buffer.from(arrayBuffer);
        fs.writeFileSync(path.join(dir1, filename), buf);
        fs.writeFileSync(path.join(dir2, filename), buf);
      } else {
        // Fallback for Web/cPanel: save to custom registry
        try {
          const raw = localStorage.getItem("uecfi_custom_backgrounds");
          const custom = raw ? JSON.parse(raw) : [];
          custom.push({ name: filename.replace(/\.[^/.]+$/, "").replace(/[_-]+/g, " "), file: filename });
          localStorage.setItem("uecfi_custom_backgrounds", JSON.stringify(custom));
        } catch(e) {}
      }

      // Reload gallery, set as active, update theme and preview
      this.loadAvailableImages();
      const style = this.getActiveStyle();
      if (style) {
        style.backgroundType = "image";
        style.bgImage = filename;
        this.saveThemes();
      }
      this.renderSettingsUI();
      try { this.updatePreviewCanvas(); } catch(e) {}

      this.closeStockMediaModal();
      if (typeof alertText === "function") {
        alertText(`Applied "${filename}" as active background!`);
      } else {
        alert(`Applied "${filename}" as active background!`);
      }
    } catch (e) {
      console.error("[PEXELS] Download error:", e);
      alert("Failed to download media: " + e.message);
      if (btn) {
        btn.innerHTML = origHtml;
        btn.disabled = false;
      }
    }
  }
}

// Tracks what is currently on live projection for the smart
// Refresh Live View button (null when nothing is projected).
// Canonical examples: "verses", "songs", "scripture", "tema", "person", "general".
function setLiveProjectionType(type) {
  try {
    window.liveProjectionType = type || null;
    if (window.themeManager && typeof window.themeManager.updateRefreshButtonState === "function") {
      window.themeManager.updateRefreshButtonState();
    }
  } catch (e) {}
}

// Global instance
window.themeManager = new ThemeManager();
