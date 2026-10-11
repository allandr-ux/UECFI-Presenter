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
        text1: "Calam at upaya ning Dios a miglalang\nYa sa'ng manitili pusu ning ninu man",
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
        text1: "Kapatid na Juan dela Cruz",
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

  // Load all background images from disk (background/ and storage/background/) and localStorage
  loadAvailableImages() {
    const defaultList = [
      { name: "UECFI", file: "UECFI.png" },
      { name: "Grapevine", file: "Grapevine.png" }
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
        const validExts = [".jpg", ".jpeg", ".png", ".webp", ".bmp", ".gif"];
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
    const shipped = ["uecfi.png", "grapevine.png"];
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

    // Check supported file formats
    const validExtensions = [".jpg", ".jpeg", ".png", ".webp", ".bmp", ".gif"];
    const ext = ("." + (fileName.split('.').pop() || "")).toLowerCase();
    if (!validExtensions.includes(ext)) {
      alert("Unsupported file format. Please upload JPG, PNG, WEBP, BMP, or GIF images.");
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
          name: "Sanctuary Purple",
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

    // Update main tab header button styling
    const btnTheme = document.getElementById("tabBtn_theme");
    const btnDisplay = document.getElementById("tabBtn_display");
    const btnOptions = document.getElementById("tabBtn_options");

    if (btnTheme) {
      btnTheme.className = tabId === "theme"
        ? "px-3 py-1.5 rounded-lg bg-white shadow-xs text-brand-700 flex items-center gap-1.5 transition"
        : "px-3 py-1.5 rounded-lg text-slate-600 hover:text-slate-900 flex items-center gap-1.5 transition";
    }
    if (btnDisplay) {
      btnDisplay.className = tabId === "display"
        ? "px-3 py-1.5 rounded-lg bg-white shadow-xs text-brand-700 flex items-center gap-1.5 transition"
        : "px-3 py-1.5 rounded-lg text-slate-600 hover:text-slate-900 flex items-center gap-1.5 transition";
    }
    if (btnOptions) {
      btnOptions.className = tabId === "options"
        ? "px-3 py-1.5 rounded-lg bg-white shadow-xs text-brand-700 flex items-center gap-1.5 transition"
        : "px-3 py-1.5 rounded-lg text-slate-600 hover:text-slate-900 flex items-center gap-1.5 transition";
    }

    this.renderSettingsUI();
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
      <div class="max-w-4xl mx-auto space-y-6">
        <div class="bg-white p-6 rounded-xl border border-slate-200 shadow-xs space-y-6">
          <div class="pb-3 border-b border-slate-100 flex items-center gap-3">
            <div class="w-9 h-9 rounded-lg bg-indigo-50 flex items-center justify-center text-indigo-600">
              <i class="fa-solid fa-desktop text-base"></i>
            </div>
            <div>
              <h3 class="text-sm font-bold text-slate-900">Presentation Output Screen</h3>
              <p class="text-xs text-slate-500">Configure secondary monitor or projector destination</p>
            </div>
          </div>

          <div class="grid grid-cols-1 md:grid-cols-2 gap-6 items-center">
            <div>
              <label class="block text-xs font-bold uppercase tracking-wider text-slate-600 mb-2">Target Presentation Screen</label>
              <select id="settingScreenSelect" onchange="window.selectedScreenIndex = this.value;" 
                      class="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs font-semibold text-slate-800">
                ${screenOpts}
              </select>
              <p class="text-[11px] text-slate-400 mt-1.5">Select the screen where slides and projection will be shown.</p>
            </div>

            <div class="space-y-3 bg-slate-50 p-4 rounded-xl border border-slate-200">
              <label class="flex items-center gap-2.5 text-xs font-semibold text-slate-800 cursor-pointer">
                <input type="checkbox" id="settingDualScreen" ${typeof dualScreen !== "undefined" && dualScreen ? "checked" : "checked"} 
                       onchange="window.dualScreen = this.checked;" class="rounded text-brand-600">
                <span>Enable Dual Screen Projection Support</span>
              </label>
              <label class="flex items-center gap-2.5 text-xs font-semibold text-slate-800 cursor-pointer">
                <input type="checkbox" id="settingKeepWindowActive" checked class="rounded text-brand-600">
                <span>Retain Focus on Controller Window</span>
              </label>
            </div>
          </div>

          <div class="pt-4 border-t border-slate-100 flex justify-end">
            <button type="button" onclick="if(typeof saveConfigXML==='function') saveConfigXML(); alert('Display settings saved!');" 
                    class="px-4 py-2 bg-brand-600 hover:bg-brand-700 text-white text-xs font-bold rounded-lg transition shadow-xs flex items-center gap-1.5">
              <i class="fa-solid fa-check"></i> Save Display Settings
            </button>
          </div>
        </div>
      </div>
    `;
  }

  // General Options Settings Tab
  renderOptionsTab(container) {
    const isSingleVer = (typeof singleVersion !== "undefined" && singleVersion);
    const isDualLang = (typeof navDualLanguage !== "undefined" && navDualLanguage);

    container.innerHTML = `
      <div class="max-w-4xl mx-auto space-y-6">
        <div class="bg-white p-6 rounded-xl border border-slate-200 shadow-xs space-y-6">
          <div class="pb-3 border-b border-slate-100 flex items-center gap-3">
            <div class="w-9 h-9 rounded-lg bg-purple-50 flex items-center justify-center text-purple-600">
              <i class="fa-solid fa-sliders text-base"></i>
            </div>
            <div>
              <h3 class="text-sm font-bold text-slate-900">Application & Presentation Preferences</h3>
              <p class="text-xs text-slate-500">Language behavior, transition animations, and default presentation rules</p>
            </div>
          </div>

          <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div class="space-y-4">
              <h4 class="text-xs font-bold uppercase tracking-wider text-slate-600">Scripture Preferences</h4>
              <div class="space-y-3">
                <label class="flex items-center gap-2.5 text-xs font-semibold text-slate-800 cursor-pointer">
                  <input type="checkbox" id="settingNavDualLang" ${isDualLang ? "checked" : ""} 
                          onchange="window.navDualLanguage = this.checked; if(document.getElementById('navDualLanguageID')) document.getElementById('navDualLanguageID').checked = this.checked;" class="rounded text-brand-600">
                  <span>Enable Dual Language Display in Verses Workspace</span>
                </label>
                <label class="flex items-center gap-2.5 text-xs font-semibold text-slate-800 cursor-pointer">
                  <input type="checkbox" id="settingSingleVer" ${isSingleVer ? "checked" : ""} 
                          onchange="window.singleVersion = this.checked; if(document.getElementById('singleVersionBoxID')) document.getElementById('singleVersionBoxID').checked = this.checked;" class="rounded text-brand-600">
                  <span>Single Bible Version Mode</span>
                </label>
              </div>
            </div>

            <div class="space-y-4">
              <h4 class="text-xs font-bold uppercase tracking-wider text-slate-600">Slide Effects</h4>
              <div class="space-y-3">
                <label class="flex items-center gap-2.5 text-xs font-semibold text-slate-800 cursor-pointer">
                  <input type="checkbox" id="settingTransitions" checked class="rounded text-brand-600">
                  <span>Smooth Fade Transitions Between Slides</span>
                </label>
                <label class="flex items-center gap-2.5 text-xs font-semibold text-slate-800 cursor-pointer">
                  <input type="checkbox" id="settingShowSongTitle" checked class="rounded text-brand-600">
                  <span>Display Song Title on Slide Header</span>
                </label>
              </div>
            </div>
          </div>

          <div class="pt-4 border-t border-slate-100 flex justify-end">
            <button type="button" onclick="if(typeof saveConfigXML==='function') saveConfigXML(); alert('Preferences saved!');" 
                    class="px-4 py-2 bg-brand-600 hover:bg-brand-700 text-white text-xs font-bold rounded-lg transition shadow-xs flex items-center gap-1.5">
              <i class="fa-solid fa-check"></i> Save Preferences
            </button>
          </div>
        </div>
      </div>
    `;
  }

  // Theme Designer Tab with Category Sub-Tabs
  renderThemeDesignerTab(container) {
    if (!this.currentTheme) {
      this.selectTheme(this.activeThemeId);
    }

    const style = this.getActiveStyle();

    const fontFamilies = ["Arial", "Georgia", "Helvetica", "Times New Roman", "Verdana", "Trebuchet MS", "Impact", "Courier New"];
    let primaryFontOpts = "";
    let secondaryFontOpts = "";
    let headerFontOpts = "";
    let footnoteFontOpts = "";
    fontFamilies.forEach(f => {
      primaryFontOpts += `<option value="${f}" ${f.toLowerCase() === (style.primaryFont || "Arial").toLowerCase() ? "selected" : ""}>${f}</option>`;
      secondaryFontOpts += `<option value="${f}" ${f.toLowerCase() === (style.secondaryFont || "Arial").toLowerCase() ? "selected" : ""}>${f}</option>`;
      headerFontOpts += `<option value="${f}" ${f.toLowerCase() === (style.headerFont || "Arial").toLowerCase() ? "selected" : ""}>${f}</option>`;
      footnoteFontOpts += `<option value="${f}" ${f.toLowerCase() === (style.footnoteFont || "Arial").toLowerCase() ? "selected" : ""}>${f}</option>`;
    });

    // Sub-tab category buttons
    const catVersesActive = (this.activeCategory === "verses");
    const catSongsActive = (this.activeCategory === "songs");
    const catProgramActive = (this.activeCategory === "program");

    container.innerHTML = `
      <div class="w-full h-full flex flex-col gap-5">

        <!-- Side-by-Side Designer Layout: Controls (left) + Sticky Live Preview (right) -->
        <!-- NOTE: the grid must size to content (no flex-1/min-h-0 cap) or the
             sticky preview runs out of runway and releases after a few px.
             Page scrolling is handled by settingsContentContainer. -->
        <div class="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">

          <!-- Style Controls Column (category tabs live here, then sections) -->
          <div class="lg:col-span-7 xl:col-span-7 space-y-5">
            <!-- THEME DESIGNER SUB-TABS: Verses | Songs | Program Items -->
            <div class="bg-white px-4 py-3 rounded-xl border border-slate-200 shadow-xs flex flex-wrap items-center justify-between gap-3">
              <div class="flex items-center gap-1 bg-slate-100 p-1 rounded-xl text-xs font-bold">
                <button type="button" onclick="themeManager.switchCategory('verses')"
                        class="px-4 py-2 rounded-lg transition flex items-center gap-2 ${catVersesActive ? 'bg-white shadow-xs text-brand-700' : 'text-slate-600 hover:text-slate-900'}">
                  <i class="fa-solid fa-book-bible"></i> Verses
                </button>
                <button type="button" onclick="themeManager.switchCategory('songs')"
                        class="px-4 py-2 rounded-lg transition flex items-center gap-2 ${catSongsActive ? 'bg-white shadow-xs text-brand-700' : 'text-slate-600 hover:text-slate-900'}">
                  <i class="fa-solid fa-music"></i> Songs
                </button>
                <button type="button" onclick="themeManager.switchCategory('program')"
                        class="px-4 py-2 rounded-lg transition flex items-center gap-2 ${catProgramActive ? 'bg-white shadow-xs text-brand-700' : 'text-slate-600 hover:text-slate-900'}">
                  <i class="fa-solid fa-layer-group"></i> Program Items
                </button>
              </div>

              <!-- PROGRAM ITEM TYPE PICKER (Tema / Person / General each have their own style) -->
              ${catProgramActive ? `
                <div class="w-full bg-brand-50/60 border border-brand-200 rounded-xl px-4 py-3">
                  <div class="flex items-center gap-2 mb-2">
                    <i class="fa-solid fa-layer-group text-brand-600 text-xs"></i>
                    <span class="text-xs font-bold uppercase tracking-wider text-slate-800">Program Item Type</span>
                    <span class="text-[11px] text-slate-500">— pick one to style its slides below</span>
                  </div>
                  <div class="grid grid-cols-3 gap-2">
                    <button type="button" onclick="themeManager.switchProgramSubTab('tema')"
                            class="px-4 py-2.5 rounded-xl transition flex items-center gap-2.5 text-left ${this.activeProgramSubTab === 'tema' ? 'bg-brand-600 text-white font-bold shadow-md ring-2 ring-brand-300' : 'bg-white text-slate-600 border border-slate-200 hover:border-brand-400 hover:text-brand-700 shadow-xs'}">
                      <i class="fa-solid fa-cross text-base"></i>
                      <span>
                        <span class="block text-sm font-bold leading-tight">Tema</span>
                        <span class="block text-[10px] font-medium opacity-75 leading-tight">Theme &amp; Batayan slides</span>
                      </span>
                    </button>
                    <button type="button" onclick="themeManager.switchProgramSubTab('person')"
                            class="px-4 py-2.5 rounded-xl transition flex items-center gap-2.5 text-left ${this.activeProgramSubTab === 'person' ? 'bg-brand-600 text-white font-bold shadow-md ring-2 ring-brand-300' : 'bg-white text-slate-600 border border-slate-200 hover:border-brand-400 hover:text-brand-700 shadow-xs'}">
                      <i class="fa-solid fa-user-tie text-base"></i>
                      <span>
                        <span class="block text-sm font-bold leading-tight">Person</span>
                        <span class="block text-[10px] font-medium opacity-75 leading-tight">Speaker &amp; role slides</span>
                      </span>
                    </button>
                    <button type="button" onclick="themeManager.switchProgramSubTab('general')"
                            class="px-4 py-2.5 rounded-xl transition flex items-center gap-2.5 text-left ${this.activeProgramSubTab === 'general' ? 'bg-brand-600 text-white font-bold shadow-md ring-2 ring-brand-300' : 'bg-white text-slate-600 border border-slate-200 hover:border-brand-400 hover:text-brand-700 shadow-xs'}">
                      <i class="fa-regular fa-file-lines text-base"></i>
                      <span>
                        <span class="block text-sm font-bold leading-tight">General</span>
                        <span class="block text-[10px] font-medium opacity-75 leading-tight">Announcements &amp; info slides</span>
                      </span>
                    </button>
                  </div>
                </div>
              ` : `
                <div class="text-xs text-slate-500 italic">
                  Configuring style settings for: <span class="font-bold text-slate-700 uppercase">${this.activeCategory}</span>
                </div>
              `}
            </div>

            <!-- SECTION 1: Background & Canvas -->
            <div class="bg-white p-5 rounded-xl border border-slate-200 shadow-xs space-y-4">
              <div class="flex items-center justify-between pb-2 border-b border-slate-100">
                <span class="text-xs font-bold uppercase tracking-wider text-slate-700 flex items-center gap-2">
                  <i class="fa-solid fa-image text-brand-600"></i> Background & Canvas
                </span>
                <div class="flex items-center gap-1 bg-slate-100 p-0.5 rounded-lg text-[11px] font-bold">
                  <button type="button" onclick="themeManager.setStyleField('backgroundType', 'image')" class="px-2.5 py-1 rounded-md transition ${style.backgroundType === 'image' ? 'bg-white shadow-xs text-brand-700' : 'text-slate-600 hover:text-slate-900'}">Image</button>
                  <button type="button" onclick="themeManager.setStyleField('backgroundType', 'gradient')" class="px-2.5 py-1 rounded-md transition ${style.backgroundType === 'gradient' ? 'bg-white shadow-xs text-brand-700' : 'text-slate-600 hover:text-slate-900'}">Gradient</button>
                  <button type="button" onclick="themeManager.setStyleField('backgroundType', 'color')" class="px-2.5 py-1 rounded-md transition ${style.backgroundType === 'color' ? 'bg-white shadow-xs text-brand-700' : 'text-slate-600 hover:text-slate-900'}">Solid Color</button>
                </div>
              </div>

              <!-- Background Sub-Controls -->
              <div class="space-y-3">
                ${this.renderBackgroundSubControls(style)}
              </div>

              <!-- Overlay Controls -->
              <div class="pt-3 border-t border-slate-100 grid grid-cols-2 gap-4 items-center">
                <div>
                  <div class="flex items-center justify-between mb-1">
                    <label class="text-[11px] font-bold text-slate-600">Dimming Overlay Opacity</label>
                    <span id="valOverlayOpacity" class="text-[11px] font-mono text-slate-500">${style.overlayOpacity || 0}%</span>
                  </div>
                  <input type="range" min="0" max="90" value="${style.overlayOpacity || 0}" 
                         oninput="themeManager.setStyleField('overlayOpacity', parseInt(this.value)); document.getElementById('valOverlayOpacity').innerText = this.value + '%';" 
                         class="w-full accent-brand-600 cursor-pointer">
                </div>
                <div>
                  <label class="block text-[11px] font-bold text-slate-600 mb-1">Overlay Tint Color</label>
                  <div class="flex items-center gap-2">
                    <input type="color" value="${style.overlayColor || '#000000'}" 
                           oninput="themeManager.setStyleField('overlayColor', this.value)" 
                           class="w-8 h-8 rounded border border-slate-200 cursor-pointer p-0.5">
                    <span class="text-xs font-mono text-slate-500">${style.overlayColor || '#000000'}</span>
                  </div>
                </div>
              </div>
            </div>

            <!-- SECTION 2: Typography & Text Colors -->
            <div class="bg-white p-5 rounded-xl border border-slate-200 shadow-xs space-y-4">
              <div class="pb-2 border-b border-slate-100">
                <span class="text-xs font-bold uppercase tracking-wider text-slate-700 flex items-center gap-2">
                  <i class="fa-solid fa-font text-brand-600"></i> Typography & Text Colors
                </span>
              </div>

              <!-- Header (top of projection) -->
              <div class="space-y-3 pb-3 border-b border-slate-100">
                <div class="flex items-center justify-between">
                  <span class="text-[11px] font-bold uppercase tracking-wider text-slate-700 flex items-center gap-1.5">
                    <i class="fa-solid fa-heading text-brand-600 text-[10px]"></i> Header / Title Styling
                  </span>
                  <label class="flex items-center gap-1.5 text-xs text-slate-600 cursor-pointer">
                    <input type="checkbox" ${style.headerVisible !== false ? "checked" : ""}
                           onchange="themeManager.setStyleField('headerVisible', this.checked)" class="rounded text-brand-600">
                    <span class="text-[11px] font-semibold">Visible</span>
                  </label>
                </div>

                <div class="grid grid-cols-12 gap-3 items-center">
                  <!-- Font Family -->
                  <div class="col-span-4">
                    <label class="block text-[10px] font-bold text-slate-400 mb-0.5">Font</label>
                    <select onchange="themeManager.setStyleField('headerFont', this.value)" class="w-full px-2 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-800">
                      ${headerFontOpts}
                    </select>
                  </div>
                  <!-- Color -->
                  <div class="col-span-3">
                    <label class="block text-[10px] font-bold text-slate-400 mb-0.5">Color</label>
                    <div class="flex items-center gap-1.5">
                      <input type="color" value="${style.headerColor || '#A5B4FC'}"
                             oninput="themeManager.setStyleField('headerColor', this.value)"
                             class="w-7 h-7 rounded border border-slate-200 cursor-pointer p-0.5">
                      <span class="text-[10px] font-mono text-slate-500">${style.headerColor || '#A5B4FC'}</span>
                    </div>
                  </div>
                  <!-- Size -->
                  <div class="col-span-3">
                    <div class="flex justify-between text-[10px] font-bold text-slate-400 mb-0.5">
                      <span>Size</span>
                      <span id="valHeaderSize">${style.headerSize || 16}px</span>
                    </div>
                    <input type="range" min="10" max="72" value="${style.headerSize || 16}"
                           oninput="themeManager.setStyleField('headerSize', parseInt(this.value)); document.getElementById('valHeaderSize').innerText = this.value + 'px';"
                           class="w-full accent-brand-600">
                  </div>
                  <!-- Align -->
                  <div class="col-span-2">
                    <label class="block text-[10px] font-bold text-slate-400 mb-0.5">Align</label>
                    <select onchange="themeManager.setStyleField('headerAlign', this.value)" class="w-full px-1.5 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-[11px] text-slate-800 font-semibold">
                      <option value="left" ${style.headerAlign === 'left' ? 'selected' : ''}>Left</option>
                      <option value="center" ${style.headerAlign === 'center' || !style.headerAlign ? 'selected' : ''}>Center</option>
                      <option value="right" ${style.headerAlign === 'right' ? 'selected' : ''}>Right</option>
                    </select>
                  </div>
                </div>

                <div class="flex items-center gap-4 text-xs">
                  <div class="flex items-center gap-2">
                    <label class="text-[10px] font-bold text-slate-400">Weight:</label>
                    <select onchange="themeManager.setStyleField('headerWeight', this.value)" class="px-2 py-1 bg-slate-50 border border-slate-200 rounded text-xs text-slate-700">
                      <option value="bold" ${style.headerWeight === 'bold' || !style.headerWeight ? 'selected' : ''}>Bold</option>
                      <option value="normal" ${style.headerWeight === 'normal' ? 'selected' : ''}>Normal</option>
                    </select>
                  </div>
                  <div class="flex items-center gap-2">
                    <label class="text-[10px] font-bold text-slate-400">Transform:</label>
                    <select onchange="themeManager.setStyleField('headerTransform', this.value)" class="px-2 py-1 bg-slate-50 border border-slate-200 rounded text-xs text-slate-700">
                      <option value="uppercase" ${style.headerTransform === 'uppercase' || !style.headerTransform ? 'selected' : ''}>UPPERCASE</option>
                      <option value="none" ${style.headerTransform === 'none' ? 'selected' : ''}>As Entered</option>
                      <option value="capitalize" ${style.headerTransform === 'capitalize' ? 'selected' : ''}>Capitalize</option>
                    </select>
                  </div>
                </div>
                <div class="flex items-center gap-2 flex-wrap pt-2 border-t border-slate-100">
                  <label class="text-[10px] font-bold text-slate-400">Shadow:</label>
                  <label class="flex items-center gap-1 text-xs text-slate-600 cursor-pointer" title="Uncheck to disable shadow for the header">
                    <input type="checkbox" ${style.headerShadowEnabled !== false ? "checked" : ""} onchange="themeManager.setStyleField('headerShadowEnabled', this.checked)" class="rounded text-brand-600">
                  </label>
                  <input type="color" value="${style.headerShadowColor || style.shadowColor || '#000000'}" oninput="themeManager.setStyleField('headerShadowColor', this.value)" class="w-7 h-7 rounded border border-slate-200 cursor-pointer p-0.5">
                  <input type="range" min="0" max="10" step="1" value="${(style.headerShadowBlur !== undefined && style.headerShadowBlur !== null && style.headerShadowBlur !== '') ? style.headerShadowBlur : (style.shadowBlur || 3)}" oninput="themeManager.setStyleField('headerShadowBlur', parseInt(this.value)); document.getElementById('valHeaderShadowBlur').innerText = this.value + 'px';" class="w-24 accent-brand-600">
                  <span id="valHeaderShadowBlur" class="text-[10px] font-mono text-slate-400">${(style.headerShadowBlur !== undefined && style.headerShadowBlur !== null && style.headerShadowBlur !== '') ? style.headerShadowBlur : (style.shadowBlur || 3)}px</span>
                </div>
              </div>

              <!-- Primary Text -->
              <div class="space-y-2">
                <label class="block text-[11px] font-bold uppercase tracking-wider text-slate-500">
                  ${this.activeCategory === 'songs' ? 'Song Lyrics' : (this.activeCategory === 'program' && this.activeProgramSubTab === 'tema') ? 'Theme Text' : (this.activeCategory === 'program' && this.activeProgramSubTab === 'person') ? 'Person Name' : (this.activeCategory === 'program' && this.activeProgramSubTab === 'general') ? 'Content Text' : 'Primary Language'}
                </label>
                <div class="grid grid-cols-12 gap-3 items-center">
                  <div class="col-span-5">
                    <select onchange="themeManager.setStyleField('primaryFont', this.value)" class="w-full px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-800">
                      ${primaryFontOpts}
                    </select>
                  </div>
                  <div class="col-span-3 flex items-center gap-2">
                    <input type="color" value="${style.primaryColor || '#FFFFFF'}" 
                           oninput="themeManager.setStyleField('primaryColor', this.value)" 
                           class="w-8 h-8 rounded border border-slate-200 cursor-pointer p-0.5">
                    <span class="text-[11px] font-mono text-slate-500">${style.primaryColor || '#FFFFFF'}</span>
                  </div>
                  <div class="col-span-4 flex items-center gap-2">
                    <span class="text-[10px] text-slate-400 font-bold">Size:</span>
                    <input type="range" min="1.0" max="2.6" step="0.1" value="${style.primaryScale || 1.6}" 
                           oninput="themeManager.setStyleField('primaryScale', parseFloat(this.value)); document.getElementById('valPrimaryScale') && (document.getElementById('valPrimaryScale').innerText = parseFloat(this.value).toFixed(1) + 'x');" 
                           class="w-full accent-brand-600">
                    <span id="valPrimaryScale" class="text-[10px] font-mono text-slate-400 min-w-[28px]">${parseFloat(style.primaryScale || 1.6).toFixed(1)}x</span>
                  </div>
                </div>
                <div class="flex items-center gap-2 flex-wrap pt-2 border-t border-slate-100">
                  <label class="text-[10px] font-bold text-slate-400">Shadow:</label>
                  <label class="flex items-center gap-1 text-xs text-slate-600 cursor-pointer" title="Uncheck to disable shadow for the primary text">
                    <input type="checkbox" ${style.primaryShadowEnabled !== false ? "checked" : ""} onchange="themeManager.setStyleField('primaryShadowEnabled', this.checked)" class="rounded text-brand-600">
                  </label>
                  <input type="color" value="${style.primaryShadowColor || style.shadowColor || '#000000'}" oninput="themeManager.setStyleField('primaryShadowColor', this.value)" class="w-7 h-7 rounded border border-slate-200 cursor-pointer p-0.5">
                  <input type="range" min="0" max="10" step="1" value="${(style.primaryShadowBlur !== undefined && style.primaryShadowBlur !== null && style.primaryShadowBlur !== '') ? style.primaryShadowBlur : (style.shadowBlur || 3)}" oninput="themeManager.setStyleField('primaryShadowBlur', parseInt(this.value)); document.getElementById('valPrimaryShadowBlur').innerText = this.value + 'px';" class="w-24 accent-brand-600">
                  <span id="valPrimaryShadowBlur" class="text-[10px] font-mono text-slate-400">${(style.primaryShadowBlur !== undefined && style.primaryShadowBlur !== null && style.primaryShadowBlur !== '') ? style.primaryShadowBlur : (style.shadowBlur || 3)}px</span>
                </div>
              </div>

              <!-- Secondary Text (Shown for types that support secondary text: Verses, Person, and Tema) -->
              ${(this.activeCategory === 'verses' || (this.activeCategory === 'program' && (this.activeProgramSubTab === 'person' || this.activeProgramSubTab === 'tema'))) ? `
                <div class="space-y-2 pt-2 border-t border-slate-100">
                  <div class="flex items-center justify-between">
                    <label class="text-[11px] font-bold uppercase tracking-wider text-slate-500">
                      ${(this.activeCategory === 'program' && this.activeProgramSubTab === 'tema') ? 'Batayan' : (this.activeCategory === 'program' && this.activeProgramSubTab === 'person') ? 'Centro / Role Subtitle' : 'Secondary Language'}
                    </label>
                    <label class="flex items-center gap-1.5 text-xs text-slate-600 cursor-pointer">
                      <input type="checkbox" ${style.secondaryItalic ? "checked" : ""} 
                             onchange="themeManager.setStyleField('secondaryItalic', this.checked)" class="rounded text-brand-600">
                      <span class="text-[11px] font-semibold">Italic</span>
                    </label>
                  </div>
                  <div class="grid grid-cols-12 gap-3 items-center">
                    <div class="col-span-5">
                      <select onchange="themeManager.setStyleField('secondaryFont', this.value)" class="w-full px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-800">
                        ${secondaryFontOpts}
                      </select>
                    </div>
                    <div class="col-span-3 flex items-center gap-2">
                      <input type="color" value="${style.secondaryColor || '#C7D2FE'}" 
                             oninput="themeManager.setStyleField('secondaryColor', this.value)" 
                             class="w-8 h-8 rounded border border-slate-200 cursor-pointer p-0.5">
                      <span class="text-[11px] font-mono text-slate-500">${style.secondaryColor || '#C7D2FE'}</span>
                    </div>
                    <div class="col-span-4 flex items-center gap-2">
                      <span class="text-[10px] text-slate-400 font-bold">Size:</span>
                      <input type="range" 
                             min="${(this.activeCategory === 'program' && this.activeProgramSubTab === 'tema') ? '0.4' : '0.8'}" 
                             max="2.0" step="0.05" value="${style.secondaryScale || 1.1}" 
                             oninput="themeManager.setStyleField('secondaryScale', parseFloat(this.value)); document.getElementById('valSecondaryScale') && (document.getElementById('valSecondaryScale').innerText = this.value + 'x');" 
                             class="w-full accent-brand-600">
                      <span id="valSecondaryScale" class="text-[10px] font-mono text-slate-400 min-w-[28px]">${style.secondaryScale || 1.1}x</span>
                    </div>
                  </div>
                  <div class="flex items-center gap-2 flex-wrap pt-2 border-t border-slate-100">
                    <label class="text-[10px] font-bold text-slate-400">Shadow:</label>
                    <label class="flex items-center gap-1 text-xs text-slate-600 cursor-pointer" title="Uncheck to disable shadow for the secondary text">
                      <input type="checkbox" ${style.secondaryShadowEnabled !== false ? "checked" : ""} onchange="themeManager.setStyleField('secondaryShadowEnabled', this.checked)" class="rounded text-brand-600">
                    </label>
                    <input type="color" value="${style.secondaryShadowColor || style.shadowColor || '#000000'}" oninput="themeManager.setStyleField('secondaryShadowColor', this.value)" class="w-7 h-7 rounded border border-slate-200 cursor-pointer p-0.5">
                    <input type="range" min="0" max="10" step="1" value="${(style.secondaryShadowBlur !== undefined && style.secondaryShadowBlur !== null && style.secondaryShadowBlur !== '') ? style.secondaryShadowBlur : (style.shadowBlur || 3)}" oninput="themeManager.setStyleField('secondaryShadowBlur', parseInt(this.value)); document.getElementById('valSecondaryShadowBlur').innerText = this.value + 'px';" class="w-24 accent-brand-600">
                    <span id="valSecondaryShadowBlur" class="text-[10px] font-mono text-slate-400">${(style.secondaryShadowBlur !== undefined && style.secondaryShadowBlur !== null && style.secondaryShadowBlur !== '') ? style.secondaryShadowBlur : (style.shadowBlur || 3)}px</span>
                  </div>
                </div>
              ` : ''}

              ${this.activeCategory !== 'program' ? `
              <!-- Footnote Controls (program items project no footnote) -->
              <div class="space-y-3 pt-3 border-t border-slate-100">
                <div class="flex items-center justify-between">
                  <span class="text-[11px] font-bold uppercase tracking-wider text-slate-700 flex items-center gap-1.5">
                    <i class="fa-solid fa-quote-left text-brand-600 text-[10px]"></i> Footnote / Reference Styling
                  </span>
                  <label class="flex items-center gap-1.5 text-xs text-slate-600 cursor-pointer">
                    <input type="checkbox" ${style.footnoteVisible !== false ? "checked" : ""} 
                           onchange="themeManager.setStyleField('footnoteVisible', this.checked)" class="rounded text-brand-600">
                    <span class="text-[11px] font-semibold">Visible</span>
                  </label>
                </div>
                
                <div class="grid grid-cols-12 gap-3 items-center">
                  <!-- Font Family -->
                  <div class="col-span-4">
                    <label class="block text-[10px] font-bold text-slate-400 mb-0.5">Font</label>
                    <select onchange="themeManager.setStyleField('footnoteFont', this.value)" class="w-full px-2 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-800">
                      ${footnoteFontOpts}
                    </select>
                  </div>
                  <!-- Color -->
                  <div class="col-span-3">
                    <label class="block text-[10px] font-bold text-slate-400 mb-0.5">Color</label>
                    <div class="flex items-center gap-1.5">
                      <input type="color" value="${style.footnoteColor || '#94A3B8'}" 
                             oninput="themeManager.setStyleField('footnoteColor', this.value)" 
                             class="w-7 h-7 rounded border border-slate-200 cursor-pointer p-0.5">
                      <span class="text-[10px] font-mono text-slate-500">${style.footnoteColor || '#94A3B8'}</span>
                    </div>
                  </div>
                  <!-- Size -->
                  <div class="col-span-3">
                    <div class="flex justify-between text-[10px] font-bold text-slate-400 mb-0.5">
                      <span>Size</span>
                      <span id="valFootnoteSize">${style.footnoteSize || 12}px</span>
                    </div>
                    <input type="range" min="9" max="28" value="${style.footnoteSize || 12}" 
                           oninput="themeManager.setStyleField('footnoteSize', parseInt(this.value)); document.getElementById('valFootnoteSize').innerText = this.value + 'px';" 
                           class="w-full accent-brand-600">
                  </div>
                  <!-- Align -->
                  <div class="col-span-2">
                    <label class="block text-[10px] font-bold text-slate-400 mb-0.5">Align</label>
                    <select onchange="themeManager.setStyleField('footnoteAlign', this.value)" class="w-full px-1.5 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-[11px] text-slate-800 font-semibold">
                      <option value="left" ${style.footnoteAlign === 'left' ? 'selected' : ''}>Left</option>
                      <option value="center" ${style.footnoteAlign === 'center' || !style.footnoteAlign ? 'selected' : ''}>Center</option>
                      <option value="right" ${style.footnoteAlign === 'right' ? 'selected' : ''}>Right</option>
                    </select>
                  </div>
                </div>

                <div class="flex items-center gap-4 text-xs">
                  <div class="flex items-center gap-2">
                    <label class="text-[10px] font-bold text-slate-400">Weight:</label>
                    <select onchange="themeManager.setStyleField('footnoteWeight', this.value)" class="px-2 py-1 bg-slate-50 border border-slate-200 rounded text-xs text-slate-700">
                      <option value="normal" ${style.footnoteWeight === 'normal' || !style.footnoteWeight ? 'selected' : ''}>Normal</option>
                      <option value="bold" ${style.footnoteWeight === 'bold' ? 'selected' : ''}>Bold</option>
                    </select>
                  </div>
                  <div class="flex items-center gap-2">
                    <label class="text-[10px] font-bold text-slate-400">Transform:</label>
                    <select onchange="themeManager.setStyleField('footnoteTransform', this.value)" class="px-2 py-1 bg-slate-50 border border-slate-200 rounded text-xs text-slate-700">
                      <option value="none" ${style.footnoteTransform === 'none' || !style.footnoteTransform ? 'selected' : ''}>Normal</option>
                      <option value="uppercase" ${style.footnoteTransform === 'uppercase' ? 'selected' : ''}>UPPERCASE</option>
                      <option value="capitalize" ${style.footnoteTransform === 'capitalize' ? 'selected' : ''}>Capitalize</option>
                    </select>
                  </div>
                </div>
                <div class="flex items-center gap-2 flex-wrap pt-2 border-t border-slate-100">
                  <label class="text-[10px] font-bold text-slate-400">Shadow:</label>
                  <label class="flex items-center gap-1 text-xs text-slate-600 cursor-pointer" title="Uncheck to disable shadow for the footnote">
                    <input type="checkbox" ${style.footnoteShadowEnabled !== false ? "checked" : ""} onchange="themeManager.setStyleField('footnoteShadowEnabled', this.checked)" class="rounded text-brand-600">
                  </label>
                  <input type="color" value="${style.footnoteShadowColor || style.shadowColor || '#000000'}" oninput="themeManager.setStyleField('footnoteShadowColor', this.value)" class="w-7 h-7 rounded border border-slate-200 cursor-pointer p-0.5">
                  <input type="range" min="0" max="10" step="1" value="${(style.footnoteShadowBlur !== undefined && style.footnoteShadowBlur !== null && style.footnoteShadowBlur !== '') ? style.footnoteShadowBlur : (style.shadowBlur || 3)}" oninput="themeManager.setStyleField('footnoteShadowBlur', parseInt(this.value)); document.getElementById('valFootnoteShadowBlur').innerText = this.value + 'px';" class="w-24 accent-brand-600">
                  <span id="valFootnoteShadowBlur" class="text-[10px] font-mono text-slate-400">${(style.footnoteShadowBlur !== undefined && style.footnoteShadowBlur !== null && style.footnoteShadowBlur !== '') ? style.footnoteShadowBlur : (style.shadowBlur || 3)}px</span>
                </div>
              </div>
              ` : ""}

              <!-- Divider Controls (Shown for Verses, Person, and Tema) -->
              ${(this.activeCategory === 'verses' || (this.activeCategory === 'program' && (this.activeProgramSubTab === 'person' || this.activeProgramSubTab === 'tema'))) ? `
                <div class="space-y-3 pt-3 border-t border-slate-100">
                  <div class="flex items-center justify-between">
                    <span class="text-[11px] font-bold uppercase tracking-wider text-slate-700 flex items-center gap-1.5">
                      <i class="fa-solid fa-minus text-brand-600 text-[10px]"></i> Divider Line
                    </span>
                    <label class="flex items-center gap-1.5 text-xs text-slate-600 cursor-pointer">
                      <input type="checkbox" ${style.showDivider !== false ? "checked" : ""} 
                             onchange="themeManager.setStyleField('showDivider', this.checked)" class="rounded text-brand-600">
                      <span class="text-[11px] font-semibold">Enable Divider</span>
                    </label>
                  </div>
                  
                  <div class="grid grid-cols-12 gap-3 items-center">
                    <!-- Color -->
                    <div class="col-span-4">
                      <label class="block text-[10px] font-bold text-slate-400 mb-0.5">Line Color</label>
                      <div class="flex items-center gap-1.5">
                        <input type="color" value="${style.dividerColor || '#FFB703'}" 
                               oninput="themeManager.setStyleField('dividerColor', this.value)" 
                               class="w-7 h-7 rounded border border-slate-200 cursor-pointer p-0.5">
                        <span class="text-[10px] font-mono text-slate-500">${style.dividerColor || '#FFB703'}</span>
                      </div>
                    </div>
                    <!-- Thickness -->
                    <div class="col-span-4">
                      <div class="flex justify-between text-[10px] font-bold text-slate-400 mb-0.5">
                        <span>Thickness</span>
                        <span id="valDividerThickness">${style.dividerThickness || 2}px</span>
                      </div>
                      <input type="range" min="1" max="10" value="${style.dividerThickness || 2}" 
                             oninput="themeManager.setStyleField('dividerThickness', parseInt(this.value)); document.getElementById('valDividerThickness').innerText = this.value + 'px';" 
                             class="w-full accent-brand-600">
                    </div>
                    <!-- Width % -->
                    <div class="col-span-4">
                      <div class="flex justify-between text-[10px] font-bold text-slate-400 mb-0.5">
                        <span>Width</span>
                        <span id="valDividerWidth">${style.dividerWidth || 70}%</span>
                      </div>
                      <input type="range" min="20" max="100" value="${style.dividerWidth || 70}" 
                             oninput="themeManager.setStyleField('dividerWidth', parseInt(this.value)); document.getElementById('valDividerWidth').innerText = this.value + '%';" 
                             class="w-full accent-brand-600">
                    </div>
                  </div>

                  <!-- Style Preset & Padding Controls -->
                  <div class="grid grid-cols-12 gap-3 items-center pt-1">
                    <!-- Style Preset -->
                    <div class="col-span-4">
                      <label class="block text-[10px] font-bold text-slate-400 mb-0.5">Style</label>
                      <select onchange="themeManager.setStyleField('dividerStyle', this.value)" class="w-full px-2 py-1 bg-slate-50 border border-slate-200 rounded text-xs text-slate-700">
                        <option value="glow" ${style.dividerStyle === 'glow' || !style.dividerStyle ? 'selected' : ''}>Glowing</option>
                        <option value="solid" ${style.dividerStyle === 'solid' ? 'selected' : ''}>Solid</option>
                        <option value="dotted" ${style.dividerStyle === 'dotted' ? 'selected' : ''}>Dotted</option>
                        <option value="dashed" ${style.dividerStyle === 'dashed' ? 'selected' : ''}>Dashed</option>
                      </select>
                    </div>
                    <!-- Top Padding -->
                    <div class="col-span-4">
                      <div class="flex justify-between text-[10px] font-bold text-slate-400 mb-0.5">
                        <span>Top Padding</span>
                        <span id="valDividerPadTop">${typeof style.dividerPaddingTop !== 'undefined' ? style.dividerPaddingTop : 14}px</span>
                      </div>
                      <input type="range" min="0" max="50" value="${typeof style.dividerPaddingTop !== 'undefined' ? style.dividerPaddingTop : 14}" 
                             oninput="themeManager.setStyleField('dividerPaddingTop', parseInt(this.value)); document.getElementById('valDividerPadTop').innerText = this.value + 'px';" 
                             class="w-full accent-brand-600">
                    </div>
                    <!-- Bottom Padding -->
                    <div class="col-span-4">
                      <div class="flex justify-between text-[10px] font-bold text-slate-400 mb-0.5">
                        <span>Bottom Padding</span>
                        <span id="valDividerPadBottom">${typeof style.dividerPaddingBottom !== 'undefined' ? style.dividerPaddingBottom : 14}px</span>
                      </div>
                      <input type="range" min="0" max="50" value="${typeof style.dividerPaddingBottom !== 'undefined' ? style.dividerPaddingBottom : 14}" 
                             oninput="themeManager.setStyleField('dividerPaddingBottom', parseInt(this.value)); document.getElementById('valDividerPadBottom').innerText = this.value + 'px';" 
                             class="w-full accent-brand-600">
                    </div>
                  </div>
                </div>
              ` : ''}

            </div>

            <!-- SECTION 3: Margins & Alignment -->
            <div class="bg-white p-5 rounded-xl border border-slate-200 shadow-xs space-y-4">
              <div class="flex items-center justify-between pb-2 border-b border-slate-100">
                <span class="text-xs font-bold uppercase tracking-wider text-slate-700 flex items-center gap-2">
                  <i class="fa-solid fa-arrows-to-dot text-brand-600"></i> Screen Margins & Alignment
                </span>
                <div class="flex items-center gap-1 bg-slate-100 p-0.5 rounded-lg text-xs">
                  <button type="button" onclick="themeManager.setStyleField('textAlign', 'left')" class="p-1.5 rounded-md ${style.textAlign === 'left' ? 'bg-white shadow-xs text-brand-700' : 'text-slate-500'}" title="Align Left"><i class="fa-solid fa-align-left"></i></button>
                  <button type="button" onclick="themeManager.setStyleField('textAlign', 'center')" class="p-1.5 rounded-md ${style.textAlign === 'center' ? 'bg-white shadow-xs text-brand-700' : 'text-slate-500'}" title="Align Center"><i class="fa-solid fa-align-center"></i></button>
                  <button type="button" onclick="themeManager.setStyleField('textAlign', 'right')" class="p-1.5 rounded-md ${style.textAlign === 'right' ? 'bg-white shadow-xs text-brand-700' : 'text-slate-500'}" title="Align Right"><i class="fa-solid fa-align-right"></i></button>
                </div>
              </div>

              <!-- Margin Sliders -->
              <div class="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div>
                  <div class="flex justify-between text-[11px] font-bold text-slate-600 mb-1">
                    <span>Top</span>
                    <span id="valMarginTop">${style.marginTop || 50}px</span>
                  </div>
                  <input type="range" min="10" max="150" value="${style.marginTop || 50}" 
                         oninput="themeManager.setStyleField('marginTop', parseInt(this.value)); document.getElementById('valMarginTop').innerText = this.value + 'px';" 
                         class="w-full accent-brand-600">
                </div>
                <div>
                  <div class="flex justify-between text-[11px] font-bold text-slate-600 mb-1">
                    <span>Bottom</span>
                    <span id="valMarginBottom">${style.marginBottom || 50}px</span>
                  </div>
                  <input type="range" min="10" max="150" value="${style.marginBottom || 50}" 
                         oninput="themeManager.setStyleField('marginBottom', parseInt(this.value)); document.getElementById('valMarginBottom').innerText = this.value + 'px';" 
                         class="w-full accent-brand-600">
                </div>
                <div>
                  <div class="flex justify-between text-[11px] font-bold text-slate-600 mb-1">
                    <span>Left</span>
                    <span id="valMarginLeft">${style.marginLeft || 60}px</span>
                  </div>
                  <input type="range" min="10" max="200" value="${style.marginLeft || 60}" 
                         oninput="themeManager.setStyleField('marginLeft', parseInt(this.value)); document.getElementById('valMarginLeft').innerText = this.value + 'px';" 
                         class="w-full accent-brand-600">
                </div>
                <div>
                  <div class="flex justify-between text-[11px] font-bold text-slate-600 mb-1">
                    <span>Right</span>
                    <span id="valMarginRight">${style.marginRight || 60}px</span>
                  </div>
                  <input type="range" min="10" max="200" value="${style.marginRight || 60}" 
                         oninput="themeManager.setStyleField('marginRight', parseInt(this.value)); document.getElementById('valMarginRight').innerText = this.value + 'px';" 
                         class="w-full accent-brand-600">
                </div>
              </div>
            </div>

            <!-- SECTION 4: Legibility & Text Shadows -->
            <div class="bg-white p-5 rounded-xl border border-slate-200 shadow-xs space-y-4">
              <div class="flex items-center justify-between pb-2 border-b border-slate-100">
                <span class="text-xs font-bold uppercase tracking-wider text-slate-700 flex items-center gap-2">
                  <i class="fa-solid fa-moon text-brand-600"></i> Legibility & Shadows
                </span>
                <label class="flex items-center gap-2 text-xs font-semibold text-slate-700 cursor-pointer">
                  <input type="checkbox" ${style.enableShadow ? "checked" : ""} 
                         onchange="themeManager.setStyleField('enableShadow', this.checked)" class="rounded text-brand-600">
                  <span>Enable Outline / Shadow</span>
                </label>
              </div>

              <div class="grid grid-cols-2 gap-4 items-center">
                <div>
                  <label class="block text-[11px] font-bold text-slate-600 mb-1">Shadow Blur / Glow</label>
                  <input type="range" min="1" max="10" value="${style.shadowBlur || 3}" 
                         oninput="themeManager.setStyleField('shadowBlur', parseInt(this.value))" 
                         class="w-full accent-brand-600">
                </div>
                <div>
                  <label class="block text-[11px] font-bold text-slate-600 mb-1">Shadow Color</label>
                  <div class="flex items-center gap-2">
                    <input type="color" value="${style.shadowColor || '#000000'}" 
                           oninput="themeManager.setStyleField('shadowColor', this.value)" 
                           class="w-8 h-8 rounded border border-slate-200 cursor-pointer p-0.5">
                    <span class="text-xs font-mono text-slate-500">${style.shadowColor || '#000000'}</span>
                  </div>
                </div>
              </div>
            </div>

          </div>

          <!-- Sticky Live Preview Column (pinned in view beside controls) -->
          <div class="lg:col-span-5 xl:col-span-5 lg:sticky lg:top-0 space-y-4">
            <div class="bg-white p-5 rounded-xl border border-slate-200 shadow-xs flex flex-col">

              <!-- Preview Header -->
              <div class="flex items-center justify-between pb-3 mb-3 border-b border-slate-100">
                <div>
                  <span class="text-xs font-bold uppercase tracking-wider text-slate-800 flex items-center gap-1.5">
                    <i class="fa-solid fa-desktop text-emerald-600"></i> Scaled Projection Preview
                  </span>
                  <p class="text-[11px] text-slate-400">16:9 Aspect Ratio Mirror (${this.activeCategory === 'program' ? this.activeProgramSubTab : this.activeCategory}) &bull; <span id="previewDimsLabel">1920&times;1080</span></p>
                </div>
                <div class="px-2.5 py-1 bg-slate-100 rounded-md text-[10px] font-bold text-slate-600 uppercase tracking-wider">
                  ${this.activeCategory === 'program' ? 'Program: ' + this.activeProgramSubTab : this.activeCategory}
                </div>
              </div>

          <!-- True-Scale Projection Canvas: the real projection page, scaled -->
          <div class="w-full flex items-center justify-center bg-slate-900 rounded-lg p-3 shadow-inner my-auto">
            <div id="themePreviewBox" class="w-full rounded-md overflow-hidden relative shadow-2xl border border-slate-800 transition-all duration-200">
              <iframe id="themePreviewFrame" title="Projection preview" scrolling="no"
                      style="border:0; pointer-events:none; transform-origin: top left; display:block;"></iframe>
            </div>
          </div>

                    <!-- Footnote / Reference -->
                    <div id="previewFootnote" class="text-center tracking-wide truncate"></div>
                  </div>
                </div>
              </div>

              <!-- Live Projection Sync Actions -->
              <div class="pt-4 mt-3 border-t border-slate-100 flex items-center justify-between gap-3">
                <div class="text-[11px] text-slate-500">
                  <i class="fa-solid fa-circle-info text-brand-500"></i> Real-time preview updates live.
                </div>
                <button type="button" id="refreshLiveViewBtn" onclick="themeManager.refreshLiveView()"
                        ${this.isRefreshLiveForCurrentType() ? "" : "disabled title=\"Nothing of this type is on live projection\""}
                        class="px-4 py-2 text-white text-xs font-bold rounded-lg transition flex items-center gap-2 shadow-xs ${this.isRefreshLiveForCurrentType() ? "bg-emerald-600 hover:bg-emerald-700" : "bg-slate-300 cursor-not-allowed"}">
                  <i class="fa-solid fa-arrows-rotate"></i> Refresh Live View
                </button>
              </div>

            </div>
          </div>

        </div>

      </div>
    `;

    this.updatePreviewCanvas();
    if (typeof requestAnimationFrame === "function") {
      requestAnimationFrame(() => {
        try { this.updatePreviewCanvas(); } catch (e) {}
      });
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

        thumbnailsHtml += `
          <div role="button" tabindex="0"
                  onclick="themeManager.setStyleField('bgImage', '${img.file}')"
                  onkeydown="if(event.key==='Enter'){themeManager.setStyleField('bgImage', '${img.file}')}"
                  title="${img.name} (${img.file})"
                  class="relative group flex flex-col p-1 rounded-lg border transition text-left cursor-pointer ${activeCardClass}">
            <div class="w-full aspect-video rounded overflow-hidden bg-slate-900 border border-slate-100/50 flex items-center justify-center relative">
              <img src="./background/${img.file}"
                   onerror="this.onerror=null; this.src='storage/background/${img.file}'"
                   alt="${img.name}"
                   class="w-full h-full object-cover group-hover:scale-105 transition duration-200" />
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
            <label class="block text-[11px] font-bold text-slate-600">Choose Background Image (${this.availableImages.length} available)</label>
            <div class="flex items-center gap-2">
              <input type="file" id="bgUploadInput" accept="image/png, image/jpeg, image/webp, image/gif, image/bmp" 
                     class="hidden" onchange="themeManager.uploadBackgroundImage(event)">
              <button type="button" onclick="document.getElementById('bgUploadInput').click()" 
                      class="px-2.5 py-1 bg-brand-50 hover:bg-brand-100 text-brand-700 border border-brand-200 rounded-lg text-[11px] font-bold transition flex items-center gap-1.5 shadow-2xs">
                <i class="fa-solid fa-cloud-arrow-up"></i> Upload Background
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
            <button type="button" onclick="themeManager.setStyleField('bgGradient', 'linear-gradient(135deg, #1e1136 0%, #3b0764 50%, #17092c 100%)')" class="h-7 rounded border border-slate-300" style="background: linear-gradient(135deg, #1e1136, #3b0764, #17092c);" title="Sanctuary Purple"></button>
            <button type="button" onclick="themeManager.setStyleField('bgGradient', 'linear-gradient(135deg, #022c43 0%, #053f5e 50%, #115173 100%)')" class="h-7 rounded border border-slate-300" style="background: linear-gradient(135deg, #022c43, #053f5e, #115173);" title="Ocean Blue"></button>
            <button type="button" onclick="themeManager.setStyleField('bgGradient', 'linear-gradient(135deg, #451a03 0%, #78350f 50%, #291205 100%)')" class="h-7 rounded border border-slate-300" style="background: linear-gradient(135deg, #451a03, #78350f, #291205);" title="Warm Amber"></button>
            <button type="button" onclick="themeManager.setStyleField('bgGradient', 'linear-gradient(135deg, #312e81 0%, #0b0f1a 100%)')" class="h-7 rounded border border-slate-300" style="background: linear-gradient(135deg, #312e81, #0b0f1a);" title="Sanctuary Indigo"></button>
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
            const first = slideHost.querySelector("div");
            if (first && first.innerText) firstSlide = first.innerText.trim();
          }
          const copyEl = document.getElementById("ly_copy");
          return {
            title: nameEl.innerText.trim(),
            text1: firstSlide || fallback.text1,
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
              return { title: role, text1: stripBR(s0.text1), text2: stripBR(s0.text2), footnote: "" };
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
        return false;
      }
    };
    if (!frame.dataset.engineReady) {
      frame.dataset.engineReady = "1";
      frame.addEventListener("load", () => {
        pushState();
        this.scalePreviewFrame();
      });
      frame.src = "presentation.htm";
    }
    pushState();
    this.scalePreviewFrame();
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
    if (typeof merged.bgImage === "string" && /^(promote[12]|lens|cross|praise|land2|yellow|3cross|tulip|tulips|footprint|green|vase|candle|bluegrad|redgrad|browngrad|greengrad|sanctuary-indigo|royal-purple|ocean-teal|amber-glow)\.(jpg|jpeg|png)$/i.test(merged.bgImage.trim())) {
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
