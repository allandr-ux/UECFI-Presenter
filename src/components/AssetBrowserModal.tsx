import React, { useEffect, useId, useRef, useState } from 'react';
import { Check, Image as ImageIcon, KeyRound, Loader2, Search, Sparkles, X } from 'lucide-react';
import { ANIMATED_STICKERS, type AnimatedStickerPreset } from '../utils/animatedStickers';

/**
 * Helper to turn a raw SVG template (with `currentColor` or fill attributes)
 * into a self-contained data URL colored with `color`.
 */
export function buildColoredSvgDataUrl(svgTemplate: string, color: string): string {
  const colored = svgTemplate.replace(/currentColor/g, color);
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(colored)}`;
}

interface PixabayHit {
  id: number;
  tags: string;
  previewURL: string;
  webformatURL: string;
  largeImageURL: string;
  imageWidth: number;
  imageHeight: number;
}

interface AssetBrowserModalProps {
  open: boolean;
  onClose: () => void;
  onInsertSvgIcon: (opts: {
    name: string;
    svgTemplate: string;
    color: string;
    dataUrl: string;
    aspect?: number;
  }) => void;
  onInsertImage: (opts: { name: string; url: string; naturalWidth: number; naturalHeight: number }) => void;
  onSetBackgroundImage: (url: string) => void;
}

const ICON_QUICK_CHIPS = [
  'church',
  'cross',
  'music',
  'bible',
  'dove',
  'heart',
  'star',
  'sparkles',
  'calendar',
  'clock',
  'arrow',
  'leaf'
];

const PIXABAY_QUICK_CHIPS = [
  'worship',
  'church',
  'cross',
  'light rays',
  'sky',
  'mountains',
  'abstract',
  'nature',
  'watercolor'
];

const PIXABAY_SECRET_KEY = 'pixabay_api_key';
// Built-in default Pixabay key so Stock Photos & Vectors work out of the box with zero setup
const DEFAULT_PIXABAY_KEY = '58818457-ed1e6684bc4b217d0e6e4d991';

interface LocalIconEntry {
  id: string;
  name: string;
  searchKey: string;
  svgTemplate: string;
}

type IconifyJsonSet = {
  prefix: string;
  width?: number;
  height?: number;
  icons: Record<string, { body: string; width?: number; height?: number }>;
};

// Cached in-memory index of ~9,000+ offline vector icons (@iconify-json/lucide + @iconify-json/mdi)
let cachedLocalIconsPromise: Promise<LocalIconEntry[]> | null = null;

function loadLocalIconIndex(): Promise<LocalIconEntry[]> {
  if (cachedLocalIconsPromise) return cachedLocalIconsPromise;
  cachedLocalIconsPromise = Promise.all([
    import('@iconify-json/lucide/icons.json'),
    import('@iconify-json/mdi/icons.json')
  ]).then(([lucideMod, mdiMod]) => {
    const sets = [
      (lucideMod.default ?? lucideMod) as unknown as IconifyJsonSet,
      (mdiMod.default ?? mdiMod) as unknown as IconifyJsonSet
    ];
    const list: LocalIconEntry[] = [];
    for (const set of sets) {
      const defaultW = set.width ?? 24;
      const defaultH = set.height ?? 24;
      for (const [iconName, entry] of Object.entries(set.icons || {})) {
        if (!entry?.body) continue;
        const w = entry.width ?? defaultW;
        const h = entry.height ?? defaultH;
        const svgTemplate = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}">${entry.body}</svg>`;
        list.push({
          id: `${set.prefix}:${iconName}`,
          name: iconName,
          searchKey: iconName.toLowerCase().replace(/-/g, ' '),
          svgTemplate
        });
      }
    }
    return list;
  });
  return cachedLocalIconsPromise;
}

const ICON_SYNONYMS: Record<string, string[]> = {
  bible: ['bible', 'book open', 'scripture', 'book'],
  dove: ['dove', 'bird', 'peace'],
  worship: ['church', 'music', 'hands pray', 'sparkles', 'heart'],
  pray: ['hands pray', 'pray', 'church', 'heart']
};

/**
 * Slide Builder Asset Browser Modal:
 * - Tab 1: Iconify (200k+ free vector SVG icons & shapes, zero API key needed)
 * - Tab 2: Pixabay (free stock photos, illustrations, & vectors with optional free API key)
 * Every inserted asset is embedded or cached locally in userData/media/ so slides remain 100% offline-ready.
 */
export const AssetBrowserModal: React.FC<AssetBrowserModalProps> = ({
  open,
  onClose,
  onInsertSvgIcon,
  onInsertImage,
  onSetBackgroundImage
}) => {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const [activeTab, setActiveTab] = useState<'icons' | 'animated' | 'stock'>('icons');
  const [animatedColor, setAnimatedColor] = useState('#fde047');
  const [animatedCategory, setAnimatedCategory] = useState<'all' | 'worship' | 'accents' | 'pointers'>('all');

  // Iconify state (batch-fetched as SVG templates in memory so color changes make 0 network requests)
  const [iconQuery, setIconQuery] = useState('church');
  const [iconColor, setIconColor] = useState('#ffffff');
  const [iconResults, setIconResults] = useState<
    Array<{ id: string; name: string; svgTemplate: string }>
  >([]);
  const [iconLoading, setIconLoading] = useState(false);
  const [iconError, setIconError] = useState<string | null>(null);

  // Pixabay state (uses built-in default key so users don't need to configure one)
  const [pixabayKey, setPixabayKey] = useState(DEFAULT_PIXABAY_KEY);
  const [pixabayKeyDraft, setPixabayKeyDraft] = useState(DEFAULT_PIXABAY_KEY);
  const [showKeyInput, setShowKeyInput] = useState(false);
  const [stockQuery, setStockQuery] = useState('worship');
  const [stockType, setStockType] = useState<'all' | 'photo' | 'illustration' | 'vector'>('all');
  const [stockResults, setStockResults] = useState<PixabayHit[]>([]);
  const [stockPage, setStockPage] = useState(1);
  const [stockHasMore, setStockHasMore] = useState(false);
  const [stockLoading, setStockLoading] = useState(false);
  const [stockLoadingMore, setStockLoadingMore] = useState(false);
  const [stockError, setStockError] = useState<string | null>(null);
  const [downloadingHitId, setDownloadingHitId] = useState<number | null>(null);
  const stockGridRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) {
      dialog.showModal();
    } else if (!open && dialog.open) {
      dialog.close();
    }
  }, [open]);

  // Load optional user-override Pixabay API key on mount (falls back to built-in default)
  useEffect(() => {
    const loadKey = async () => {
      try {
        const secret = await window.presenterAPI?.getSecret(PIXABAY_SECRET_KEY);
        const saved = (secret || localStorage.getItem(PIXABAY_SECRET_KEY) || '').trim();
        if (saved) {
          setPixabayKey(saved);
          setPixabayKeyDraft(saved);
        }
      } catch {
        const saved = (localStorage.getItem(PIXABAY_SECRET_KEY) || '').trim();
        if (saved) {
          setPixabayKey(saved);
          setPixabayKeyDraft(saved);
        }
      }
    };
    void loadKey();
  }, []);

  const searchIcons = async (query: string) => {
    const q = query.trim().toLowerCase();
    setIconLoading(true);
    setIconError(null);
    try {
      const index = await loadLocalIconIndex();
      if (!q) {
        setIconResults(index.slice(0, 72));
        return;
      }
      const terms = ICON_SYNONYMS[q] ?? [q];
      const scored: Array<{ entry: LocalIconEntry; score: number }> = [];
      for (const entry of index) {
        let best = 0;
        for (const term of terms) {
          if (entry.name === term || entry.searchKey === term) {
            best = Math.max(best, 4);
          } else if (entry.searchKey.startsWith(term)) {
            best = Math.max(best, 3);
          } else if (entry.searchKey.split(' ').some((tok) => tok.startsWith(term))) {
            best = Math.max(best, 2);
          } else if (entry.searchKey.includes(term)) {
            best = Math.max(best, 1);
          }
        }
        if (best > 0) {
          scored.push({ entry, score: best });
        }
      }
      scored.sort((a, b) => b.score - a.score || a.entry.name.length - b.entry.name.length);
      setIconResults(scored.slice(0, 72).map((s) => s.entry));
    } catch {
      setIconError('Failed to load bundled offline icons.');
      setIconResults([]);
    } finally {
      setIconLoading(false);
    }
  };

  const searchStock = async (
    query: string,
    imageType: 'all' | 'photo' | 'illustration' | 'vector',
    keyOverride?: string,
    page = 1
  ) => {
    const activeKey = (keyOverride ?? pixabayKey).trim();
    const q = query.trim();
    if (!activeKey || !q) return;
    if (page === 1) {
      setStockLoading(true);
      if (stockGridRef.current) stockGridRef.current.scrollTop = 0;
    } else {
      setStockLoadingMore(true);
    }
    setStockError(null);
    try {
      const url = `https://pixabay.com/api/?key=${encodeURIComponent(activeKey)}&q=${encodeURIComponent(q)}&image_type=${imageType}&safesearch=true&per_page=24&page=${page}`;
      const res = await fetch(url);
      if (!res.ok) {
        if (res.status === 400 || res.status === 401 || res.status === 403) {
          throw new Error('Invalid Pixabay API key. Please check your key and try again.');
        }
        throw new Error(`Pixabay request failed (HTTP ${res.status}).`);
      }
      const data = (await res.json()) as { hits?: PixabayHit[]; totalHits?: number };
      const hits = Array.isArray(data.hits) ? data.hits : [];
      const totalHits = typeof data.totalHits === 'number' ? data.totalHits : 0;
      setStockPage(page);
      setStockHasMore(hits.length > 0 && page * 24 < totalHits);
      if (page === 1) {
        setStockResults(hits);
      } else {
        setStockResults((prev) => {
          const seen = new Set(prev.map((h) => h.id));
          return [...prev, ...hits.filter((h) => !seen.has(h.id))];
        });
      }
    } catch (err) {
      setStockError(
        err instanceof Error
          ? err.message
          : 'Could not reach Pixabay. Check your internet connection.'
      );
      if (page === 1) {
        setStockResults([]);
        setStockHasMore(false);
      }
    } finally {
      if (page === 1) {
        setStockLoading(false);
      } else {
        setStockLoadingMore(false);
      }
    }
  };

  // Run initial Iconify search when opening modal
  useEffect(() => {
    if (open && activeTab === 'icons' && iconResults.length === 0 && !iconLoading) {
      void searchIcons(iconQuery);
    }
  }, [open, activeTab]);

  // Run initial Pixabay search when switching to stock tab if key is saved
  useEffect(() => {
    if (open && activeTab === 'stock' && pixabayKey && stockResults.length === 0 && !stockLoading) {
      void searchStock(stockQuery, stockType);
    }
  }, [open, activeTab, pixabayKey]);

  const handleSelectIcon = (item: { id: string; name: string; svgTemplate: string }) => {
    let svgText = item.svgTemplate;
    // Ensure the SVG uses currentColor if it has no explicit fill, so recoloring works cleanly
    if (!svgText.includes('currentColor') && !svgText.includes('fill=')) {
      svgText = svgText.replace('<svg ', '<svg fill="currentColor" ');
    }
    const displayName = item.name
      .split('-')
      .map((part) => (part ? part[0].toUpperCase() + part.slice(1) : ''))
      .join(' ');
    const dataUrl = buildColoredSvgDataUrl(svgText, iconColor);
    onInsertSvgIcon({ name: displayName || item.name, svgTemplate: svgText, color: iconColor, dataUrl });
    onClose();
  };

  const handleSavePixabayKey = async () => {
    const cleaned = pixabayKeyDraft.trim() || DEFAULT_PIXABAY_KEY;
    setPixabayKey(cleaned);
    setPixabayKeyDraft(cleaned);
    setShowKeyInput(false);
    const toPersist = cleaned === DEFAULT_PIXABAY_KEY ? '' : cleaned;
    try {
      await window.presenterAPI?.setSecret(PIXABAY_SECRET_KEY, toPersist);
    } catch {
      // Fallback to localStorage below
    }
    try {
      if (toPersist) {
        localStorage.setItem(PIXABAY_SECRET_KEY, toPersist);
      } else {
        localStorage.removeItem(PIXABAY_SECRET_KEY);
      }
    } catch {
      // Ignore storage quota errors
    }
    void searchStock(stockQuery, stockType, cleaned);
  };

  /**
   * Downloads a Pixabay image and saves it into local userData/media/ via Electron IPC
   * so the finished slide remains 100% offline-ready during service.
   */
  const downloadAndCacheStockImage = async (hit: PixabayHit): Promise<string> => {
    const sourceUrl = hit.largeImageURL || hit.webformatURL;
    const res = await fetch(sourceUrl);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const blob = await res.blob();
    const ext = blob.type.includes('png') ? 'png' : blob.type.includes('webp') ? 'webp' : 'jpg';
    const fileName = `pixabay-${hit.id}.${ext}`;

    if (window.presenterAPI?.saveMediaFile) {
      const bytes = new Uint8Array(await blob.arrayBuffer());
      const saved = await window.presenterAPI.saveMediaFile(fileName, bytes);
      return saved.url;
    }

    // Browser dev fallback: convert to data URL
    return await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = () => reject(new Error('Failed to read image'));
      reader.readAsDataURL(blob);
    });
  };

  const handleUseStockImage = async (hit: PixabayHit, mode: 'layer' | 'background') => {
    setDownloadingHitId(hit.id);
    setStockError(null);
    try {
      const localUrl = await downloadAndCacheStockImage(hit);
      if (mode === 'background') {
        onSetBackgroundImage(localUrl);
      } else {
        const cleanTags = (hit.tags || '')
          .split(',')
          .map((t) => t.trim())
          .filter(Boolean)
          .slice(0, 2)
          .map((t) => t.charAt(0).toUpperCase() + t.slice(1))
          .join(', ');
        onInsertImage({
          name: cleanTags || `Stock #${hit.id}`,
          url: localUrl,
          naturalWidth: hit.imageWidth || 1280,
          naturalHeight: hit.imageHeight || 720
        });
      }
      onClose();
    } catch {
      setStockError('Failed to download image. Please try another result.');
    } finally {
      setDownloadingHitId(null);
    }
  };

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby={titleId}
      style={{
        maxWidth: '860px',
        width: 'min(94vw, 860px)',
        height: 'min(84vh, 680px)',
        padding: 0
      }}
      onClose={(e) => {
        e.stopPropagation();
        if (dialogRef.current) dialogRef.current.returnValue = '';
        onClose();
      }}
    >
      <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
        {/* Header */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '12px 16px',
            borderBottom: '1px solid var(--border-subtle)',
            background: 'var(--bg-panel-elevated)',
            gap: '12px'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Sparkles size={16} color="#a78bfa" />
            <h2 id={titleId} style={{ margin: 0, fontSize: '0.98rem', fontWeight: 700 }}>
              Icons, Shapes &amp; Stock Graphics
            </h2>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <button
              type="button"
              onClick={() => setActiveTab('icons')}
              style={{
                padding: '6px 12px',
                borderRadius: '8px',
                border: '1px solid var(--border-subtle)',
                background: activeTab === 'icons' ? '#7c3aed' : 'transparent',
                color: activeTab === 'icons' ? '#fff' : 'var(--text-secondary)',
                fontSize: '0.78rem',
                fontWeight: 600,
                cursor: 'pointer'
              }}
            >
              Icons &amp; Shapes
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('animated')}
              style={{
                padding: '6px 12px',
                borderRadius: '8px',
                border: '1px solid var(--border-subtle)',
                background: activeTab === 'animated' ? '#059669' : 'transparent',
                color: activeTab === 'animated' ? '#fff' : 'var(--text-secondary)',
                fontSize: '0.78rem',
                fontWeight: 600,
                cursor: 'pointer'
              }}
            >
              Animated Stickers
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('stock')}
              style={{
                padding: '6px 12px',
                borderRadius: '8px',
                border: '1px solid var(--border-subtle)',
                background: activeTab === 'stock' ? '#2563eb' : 'transparent',
                color: activeTab === 'stock' ? '#fff' : 'var(--text-secondary)',
                fontSize: '0.78rem',
                fontWeight: 600,
                cursor: 'pointer'
              }}
            >
              Stock Photos &amp; Vectors
            </button>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close"
              style={{
                background: 'transparent',
                border: '1px solid var(--border-subtle)',
                borderRadius: '8px',
                padding: '6px',
                color: 'var(--text-primary)',
                display: 'inline-flex',
                cursor: 'pointer'
              }}
            >
              <X size={15} />
            </button>
          </div>
        </div>

        {/* TAB 1: ICONIFY (FREE, ZERO API KEY) */}
        {activeTab === 'icons' && (
          <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', padding: '14px 16px', gap: '12px' }}>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                void searchIcons(iconQuery);
              }}
              style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}
            >
              <div style={{ flex: 1, minWidth: '200px', position: 'relative', display: 'flex' }}>
                <input
                  type="text"
                  value={iconQuery}
                  onChange={(e) => {
                    const next = e.target.value;
                    setIconQuery(next);
                    void searchIcons(next);
                  }}
                  placeholder="Search 9,000+ offline vector icons & shapes (e.g. church, cross, music)..."
                  style={{
                    width: '100%',
                    padding: '8px 12px',
                    borderRadius: '8px',
                    border: '1px solid var(--border-subtle)',
                    background: 'var(--bg-app)',
                    color: 'var(--text-primary)',
                    fontSize: '0.84rem'
                  }}
                />
              </div>
              <label
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px',
                  fontSize: '0.76rem',
                  color: 'var(--text-secondary)'
                }}
              >
                Color
                <input
                  type="color"
                  value={iconColor}
                  onChange={(e) => setIconColor(e.target.value)}
                  style={{
                    width: '28px',
                    height: '28px',
                    padding: 0,
                    border: '1px solid var(--border-subtle)',
                    borderRadius: '6px',
                    background: 'transparent',
                    cursor: 'pointer'
                  }}
                />
              </label>
              <button
                type="submit"
                disabled={iconLoading}
                style={{
                  padding: '8px 14px',
                  borderRadius: '8px',
                  border: 'none',
                  background: '#7c3aed',
                  color: '#fff',
                  fontSize: '0.8rem',
                  fontWeight: 600,
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px',
                  cursor: 'pointer'
                }}
              >
                <Search size={14} /> Search
              </button>
            </form>

            {/* Quick Category Chips */}
            <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
              {ICON_QUICK_CHIPS.map((chip) => (
                <button
                  key={chip}
                  type="button"
                  onClick={() => {
                    setIconQuery(chip);
                    void searchIcons(chip);
                  }}
                  style={{
                    padding: '4px 10px',
                    borderRadius: '999px',
                    border: '1px solid var(--border-subtle)',
                    background:
                      iconQuery.toLowerCase() === chip
                        ? 'rgba(124, 58, 237, 0.25)'
                        : 'var(--bg-panel-elevated)',
                    color: iconQuery.toLowerCase() === chip ? '#ddd6fe' : 'var(--text-secondary)',
                    fontSize: '0.73rem',
                    fontWeight: 600,
                    cursor: 'pointer'
                  }}
                >
                  {chip}
                </button>
              ))}
            </div>

            {iconError && (
              <div
                style={{
                  padding: '8px 12px',
                  borderRadius: '8px',
                  background: 'rgba(220, 38, 38, 0.14)',
                  border: '1px solid rgba(239, 68, 68, 0.35)',
                  color: '#fca5a5',
                  fontSize: '0.78rem'
                }}
              >
                {iconError}
              </div>
            )}

            {/* Icon Results Grid */}
            <div
              style={{
                flex: 1,
                minHeight: 0,
                overflowY: 'auto',
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fill, minmax(92px, 1fr))',
                gap: '8px',
                alignContent: 'start'
              }}
            >
              {iconLoading ? (
                <div style={{ gridColumn: '1 / -1', textAlign: 'center', padding: '40px', color: 'var(--text-muted)' }}>
                  <Loader2 size={22} style={{ marginBottom: '6px' }} />
                  <div style={{ fontSize: '0.82rem' }}>Searching Iconify...</div>
                </div>
              ) : iconResults.length === 0 ? (
                <div style={{ gridColumn: '1 / -1', textAlign: 'center', padding: '40px', color: 'var(--text-muted)', fontSize: '0.82rem' }}>
                  No icons found. Try another keyword like &ldquo;cross&rdquo;, &ldquo;music&rdquo;, or &ldquo;star&rdquo;.
                </div>
              ) : (
                iconResults.map((item) => {
                  const previewUrl = buildColoredSvgDataUrl(item.svgTemplate, iconColor);
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => handleSelectIcon(item)}
                      title={`Insert ${item.id}`}
                      style={{
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: '6px',
                        padding: '12px 6px',
                        borderRadius: '10px',
                        border: '1px solid var(--border-subtle)',
                        background: 'var(--bg-panel-elevated)',
                        color: 'var(--text-secondary)',
                        cursor: 'pointer'
                      }}
                    >
                      <img
                        src={previewUrl}
                        alt={item.name}
                        style={{ width: '36px', height: '36px', objectFit: 'contain' }}
                      />
                      <span
                        style={{
                          fontSize: '0.66rem',
                          maxWidth: '100%',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap'
                        }}
                      >
                        {item.name}
                      </span>
                    </button>
                  );
                })
              )}
            </div>
            <div style={{ fontSize: '0.71rem', color: 'var(--text-muted)', textAlign: 'right' }}>
              9,000+ bundled offline icons (Lucide + Material Design) — zero rate limits, works offline &amp; recolorable.
            </div>
          </div>
        )}

        {/* TAB 2: CURATED ANIMATED VECTOR STICKERS (100% OFFLINE, RECOLORABLE, ZERO MEMES) */}
        {activeTab === 'animated' && (
          <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', padding: '14px 16px', gap: '12px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '10px', flexWrap: 'wrap' }}>
              <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                {(
                  [
                    { id: 'all', label: 'All' },
                    { id: 'worship', label: 'Worship' },
                    { id: 'accents', label: 'Design Accents' },
                    { id: 'pointers', label: 'Pointers' }
                  ] as const
                ).map((cat) => (
                  <button
                    key={cat.id}
                    type="button"
                    onClick={() => setAnimatedCategory(cat.id)}
                    style={{
                      padding: '5px 12px',
                      borderRadius: '999px',
                      border: '1px solid var(--border-subtle)',
                      background:
                        animatedCategory === cat.id
                          ? 'rgba(5, 150, 105, 0.25)'
                          : 'var(--bg-panel-elevated)',
                      color: animatedCategory === cat.id ? '#6ee7b7' : 'var(--text-secondary)',
                      fontSize: '0.75rem',
                      fontWeight: 600,
                      cursor: 'pointer'
                    }}
                  >
                    {cat.label}
                  </button>
                ))}
              </div>

              <div style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                {['#fde047', '#ffffff', '#93c5fd', '#6ee7b7', '#f9a8d4', '#f87171'].map((swatch) => (
                  <button
                    key={swatch}
                    type="button"
                    onClick={() => setAnimatedColor(swatch)}
                    style={{
                      width: '18px',
                      height: '18px',
                      borderRadius: '999px',
                      background: swatch,
                      border:
                        animatedColor.toLowerCase() === swatch
                          ? '2px solid var(--accent)'
                          : '1px solid rgba(255,255,255,0.3)',
                      padding: 0,
                      cursor: 'pointer'
                    }}
                  />
                ))}
                <input
                  type="color"
                  aria-label="Animated sticker color"
                  value={animatedColor}
                  onChange={(e) => setAnimatedColor(e.target.value)}
                  style={{
                    width: '28px',
                    height: '24px',
                    padding: 0,
                    border: '1px solid var(--border-subtle)',
                    borderRadius: '6px',
                    background: 'transparent',
                    cursor: 'pointer'
                  }}
                />
              </div>
            </div>

            <div
              style={{
                flex: 1,
                minHeight: 0,
                overflowY: 'auto',
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fill, minmax(145px, 1fr))',
                gridAutoRows: 'max-content',
                gap: '10px',
                alignContent: 'start'
              }}
            >
              {ANIMATED_STICKERS.filter(
                (st: AnimatedStickerPreset) =>
                  animatedCategory === 'all' || st.category === animatedCategory
              ).map((sticker) => {
                const previewUrl = buildColoredSvgDataUrl(sticker.svgTemplate, animatedColor);
                return (
                  <button
                    key={sticker.id}
                    type="button"
                    onClick={() => {
                      onInsertSvgIcon({
                        name: sticker.name,
                        svgTemplate: sticker.svgTemplate,
                        color: animatedColor,
                        dataUrl: previewUrl,
                        aspect: sticker.aspect
                      });
                      onClose();
                    }}
                    style={{
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '8px',
                      padding: '14px 10px',
                      borderRadius: '12px',
                      border: '1px solid var(--border-subtle)',
                      background: 'var(--bg-panel-elevated)',
                      color: 'var(--text-primary)',
                      cursor: 'pointer'
                    }}
                  >
                    <div
                      style={{
                        width: '100%',
                        height: '68px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center'
                      }}
                    >
                      <img
                        src={previewUrl}
                        alt={sticker.name}
                        style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }}
                      />
                    </div>
                    <span style={{ fontSize: '0.73rem', fontWeight: 600, color: 'var(--text-secondary)' }}>
                      {sticker.name}
                    </span>
                  </button>
                );
              })}
            </div>
            <div style={{ fontSize: '0.71rem', color: 'var(--text-muted)', textAlign: 'right' }}>
              100% offline animated vector stickers — recolorable anytime in Canvas.
            </div>
          </div>
        )}

        {/* TAB 2: PIXABAY (FREE STOCK PHOTOS, ILLUSTRATIONS, VECTORS) */}
        {activeTab === 'stock' && (
          <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', padding: '14px 16px', gap: '12px' }}>
            {(!pixabayKey || showKeyInput) && (
              <div
                style={{
                  padding: '12px',
                  borderRadius: '10px',
                  background: 'var(--bg-panel-elevated)',
                  border: '1px solid var(--border-subtle)',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '8px'
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                  <span style={{ fontSize: '0.8rem', fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                    <KeyRound size={14} color="#60a5fa" /> Pixabay Free API Key
                  </span>
                  <span style={{ fontSize: '0.74rem', color: 'var(--text-muted)' }}>
                    Free key:{' '}
                    <a
                      href="https://pixabay.com/api/docs/"
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{ color: '#93c5fd', fontWeight: 700, textDecoration: 'underline' }}
                    >
                      pixabay.com/api/docs
                    </a>
                  </span>
                </div>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <input
                    type="password"
                    value={pixabayKeyDraft}
                    onChange={(e) => setPixabayKeyDraft(e.target.value)}
                    placeholder="Paste your free Pixabay API key..."
                    style={{
                      flex: 1,
                      padding: '7px 10px',
                      borderRadius: '8px',
                      border: '1px solid var(--border-subtle)',
                      background: 'var(--bg-app)',
                      color: 'var(--text-primary)',
                      fontSize: '0.82rem'
                    }}
                  />
                  <button
                    type="button"
                    onClick={() => void handleSavePixabayKey()}
                    style={{
                      padding: '7px 14px',
                      borderRadius: '8px',
                      border: 'none',
                      background: '#2563eb',
                      color: '#fff',
                      fontSize: '0.8rem',
                      fontWeight: 600,
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '5px',
                      cursor: 'pointer'
                    }}
                  >
                    <Check size={14} /> Save Key
                  </button>
                </div>
              </div>
            )}

            {pixabayKey && (
              <>
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    void searchStock(stockQuery, stockType);
                  }}
                  style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}
                >
                  <input
                    type="text"
                    value={stockQuery}
                    onChange={(e) => setStockQuery(e.target.value)}
                    placeholder="Search free photos, illustrations, & vectors..."
                    style={{
                      flex: 1,
                      minWidth: '180px',
                      padding: '8px 12px',
                      borderRadius: '8px',
                      border: '1px solid var(--border-subtle)',
                      background: 'var(--bg-app)',
                      color: 'var(--text-primary)',
                      fontSize: '0.84rem'
                    }}
                  />
                  <select
                    value={stockType}
                    onChange={(e) => {
                      const next = e.target.value as 'all' | 'photo' | 'illustration' | 'vector';
                      setStockType(next);
                      void searchStock(stockQuery, next);
                    }}
                    style={{
                      padding: '8px 10px',
                      borderRadius: '8px',
                      border: '1px solid var(--border-subtle)',
                      background: 'var(--bg-app)',
                      color: 'var(--text-primary)',
                      fontSize: '0.8rem'
                    }}
                  >
                    <option value="all">All Types</option>
                    <option value="photo">Photos</option>
                    <option value="illustration">Illustrations</option>
                    <option value="vector">Vectors</option>
                  </select>
                  <button
                    type="submit"
                    disabled={stockLoading}
                    style={{
                      padding: '8px 14px',
                      borderRadius: '8px',
                      border: 'none',
                      background: '#2563eb',
                      color: '#fff',
                      fontSize: '0.8rem',
                      fontWeight: 600,
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '6px',
                      cursor: 'pointer'
                    }}
                  >
                    <Search size={14} /> Search
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowKeyInput((v) => !v)}
                    title="Change Pixabay API Key"
                    style={{
                      padding: '8px 10px',
                      borderRadius: '8px',
                      border: '1px solid var(--border-subtle)',
                      background: 'transparent',
                      color: 'var(--text-secondary)',
                      fontSize: '0.76rem',
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '4px',
                      cursor: 'pointer'
                    }}
                  >
                    <KeyRound size={13} /> Key
                  </button>
                </form>

                <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                  {PIXABAY_QUICK_CHIPS.map((chip) => (
                    <button
                      key={chip}
                      type="button"
                      onClick={() => {
                        setStockQuery(chip);
                        void searchStock(chip, stockType);
                      }}
                      style={{
                        padding: '4px 10px',
                        borderRadius: '999px',
                        border: '1px solid var(--border-subtle)',
                        background:
                          stockQuery.toLowerCase() === chip
                            ? 'rgba(37, 99, 235, 0.25)'
                            : 'var(--bg-panel-elevated)',
                        color: stockQuery.toLowerCase() === chip ? '#93c5fd' : 'var(--text-secondary)',
                        fontSize: '0.73rem',
                        fontWeight: 600,
                        cursor: 'pointer'
                      }}
                    >
                      {chip}
                    </button>
                  ))}
                </div>
              </>
            )}

            {stockError && (
              <div
                style={{
                  padding: '8px 12px',
                  borderRadius: '8px',
                  background: 'rgba(220, 38, 38, 0.14)',
                  border: '1px solid rgba(239, 68, 68, 0.35)',
                  color: '#fca5a5',
                  fontSize: '0.78rem'
                }}
              >
                {stockError}
              </div>
            )}

            {/* Stock Results Grid (auto-loads next page when scrolling near bottom) */}
            <div
              ref={stockGridRef}
              onScroll={(e) => {
                const el = e.currentTarget;
                if (
                  !stockLoading &&
                  !stockLoadingMore &&
                  stockHasMore &&
                  el.scrollTop + el.clientHeight >= el.scrollHeight - 180
                ) {
                  void searchStock(stockQuery, stockType, undefined, stockPage + 1);
                }
              }}
              style={{
                flex: 1,
                minHeight: 0,
                overflowY: 'auto',
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fill, minmax(185px, 1fr))',
                gridAutoRows: 'max-content',
                gap: '10px',
                alignContent: 'start'
              }}
            >
              {stockLoading ? (
                <div style={{ gridColumn: '1 / -1', textAlign: 'center', padding: '40px', color: 'var(--text-muted)' }}>
                  <Loader2 size={22} style={{ marginBottom: '6px' }} />
                  <div style={{ fontSize: '0.82rem' }}>Searching Pixabay...</div>
                </div>
              ) : !pixabayKey ? (
                <div style={{ gridColumn: '1 / -1', textAlign: 'center', padding: '32px', color: 'var(--text-muted)', fontSize: '0.82rem' }}>
                  Enter your free Pixabay API key above to search royalty-free photos, worship backgrounds, illustrations, and vectors.
                </div>
              ) : stockResults.length === 0 ? (
                <div style={{ gridColumn: '1 / -1', textAlign: 'center', padding: '40px', color: 'var(--text-muted)', fontSize: '0.82rem' }}>
                  No results found. Try another keyword.
                </div>
              ) : (
                stockResults.map((hit) => {
                  const isBusy = downloadingHitId === hit.id;
                  return (
                    <div
                      key={hit.id}
                      style={{
                        borderRadius: '10px',
                        overflow: 'hidden',
                        border: '1px solid var(--border-subtle)',
                        background: 'var(--bg-panel-elevated)',
                        display: 'flex',
                        flexDirection: 'column'
                      }}
                    >
                      <div
                        style={{
                          width: '100%',
                          height: '118px',
                          flexShrink: 0,
                          background: '#020617',
                          overflow: 'hidden'
                        }}
                      >
                        <img
                          src={hit.webformatURL || hit.previewURL}
                          alt={hit.tags}
                          loading="lazy"
                          style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                        />
                      </div>
                      <div style={{ display: 'flex', gap: '4px', padding: '6px' }}>
                        <button
                          type="button"
                          disabled={Boolean(downloadingHitId)}
                          onClick={() => void handleUseStockImage(hit, 'layer')}
                          style={{
                            flex: 1,
                            padding: '5px 6px',
                            borderRadius: '6px',
                            border: 'none',
                            background: '#2563eb',
                            color: '#fff',
                            fontSize: '0.71rem',
                            fontWeight: 600,
                            cursor: 'pointer'
                          }}
                        >
                          {isBusy ? 'Saving...' : '+ Layer'}
                        </button>
                        <button
                          type="button"
                          disabled={Boolean(downloadingHitId)}
                          onClick={() => void handleUseStockImage(hit, 'background')}
                          style={{
                            flex: 1,
                            padding: '5px 6px',
                            borderRadius: '6px',
                            border: '1px solid var(--border-subtle)',
                            background: 'transparent',
                            color: 'var(--text-primary)',
                            fontSize: '0.71rem',
                            fontWeight: 600,
                            display: 'inline-flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            gap: '3px',
                            cursor: 'pointer'
                          }}
                        >
                          <ImageIcon size={11} /> Set BG
                        </button>
                      </div>
                    </div>
                  );
                })
              )}
              {stockLoadingMore && (
                <div
                  style={{
                    gridColumn: '1 / -1',
                    textAlign: 'center',
                    padding: '14px',
                    color: 'var(--text-muted)',
                    fontSize: '0.78rem',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '6px'
                  }}
                >
                  <Loader2 size={15} /> Loading more results...
                </div>
              )}
            </div>
            <div style={{ fontSize: '0.71rem', color: 'var(--text-muted)', textAlign: 'right' }}>
              Images are automatically cached locally so your slides work 100% offline.
            </div>
          </div>
        )}
      </div>
    </dialog>
  );
};
