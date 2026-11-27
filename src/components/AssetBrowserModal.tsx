import React, { useEffect, useId, useRef, useState } from 'react';
import { Check, Image as ImageIcon, KeyRound, Loader2, Search, Sparkles, X } from 'lucide-react';
import { ANIMATED_STICKERS, type AnimatedStickerPreset } from '../utils/animatedStickers';
import { cn } from '../utils/cn';

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
      className="h-[min(84vh,680px)] w-[min(94vw,860px)] max-w-[860px] p-0"
      onClose={(e) => {
        e.stopPropagation();
        if (dialogRef.current) dialogRef.current.returnValue = '';
        onClose();
      }}
    >
      <div className="flex h-full flex-col">
        {/* Header */}
        <div className="flex items-center justify-between gap-3 border-b border-subtle bg-panel-elevated px-4 py-3">
          <div className="flex items-center gap-2">
            <Sparkles size={16} color="#a78bfa" />
            <h2 id={titleId} className="m-0 text-[0.98rem] font-bold">
              Icons, Shapes &amp; Stock Graphics
            </h2>
          </div>

          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => setActiveTab('icons')}
              className={cn(
                'cursor-pointer rounded-lg border border-subtle px-3 py-1.5 text-[0.78rem] font-semibold transition-colors',
                activeTab === 'icons'
                  ? 'bg-violet-600 text-white'
                  : 'bg-transparent text-text-secondary hover:bg-hover'
              )}
            >
              Icons &amp; Shapes
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('animated')}
              className={cn(
                'cursor-pointer rounded-lg border border-subtle px-3 py-1.5 text-[0.78rem] font-semibold transition-colors',
                activeTab === 'animated'
                  ? 'bg-emerald-600 text-white'
                  : 'bg-transparent text-text-secondary hover:bg-hover'
              )}
            >
              Animated Stickers
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('stock')}
              className={cn(
                'cursor-pointer rounded-lg border border-subtle px-3 py-1.5 text-[0.78rem] font-semibold transition-colors',
                activeTab === 'stock'
                  ? 'bg-blue-600 text-white'
                  : 'bg-transparent text-text-secondary hover:bg-hover'
              )}
            >
              Stock Photos &amp; Vectors
            </button>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close"
              className="inline-flex cursor-pointer rounded-lg border border-subtle bg-transparent p-1.5 text-text-primary transition-colors hover:bg-hover"
            >
              <X size={15} />
            </button>
          </div>
        </div>

        {/* TAB 1: ICONIFY (FREE, ZERO API KEY) */}
        {activeTab === 'icons' && (
          <div className="flex min-h-0 flex-1 flex-col gap-3 px-4 py-3.5">
            <form
              onSubmit={(e) => {
                e.preventDefault();
                void searchIcons(iconQuery);
              }}
              className="flex flex-wrap items-center gap-2"
            >
              <div className="relative flex min-w-[200px] flex-1">
                <input
                  type="text"
                  value={iconQuery}
                  onChange={(e) => {
                    const next = e.target.value;
                    setIconQuery(next);
                    void searchIcons(next);
                  }}
                  placeholder="Search 9,000+ offline vector icons & shapes (e.g. church, cross, music)..."
                  className="w-full rounded-lg border border-subtle bg-app px-3 py-2 text-[0.84rem] text-text-primary focus:border-accent focus:outline-none"
                />
              </div>
              <label className="inline-flex items-center gap-1.5 text-[0.76rem] text-text-secondary">
                Color
                <input
                  type="color"
                  value={iconColor}
                  onChange={(e) => setIconColor(e.target.value)}
                  className="h-7 w-7 cursor-pointer rounded-md border border-subtle bg-transparent p-0"
                />
              </label>
              <button
                type="submit"
                disabled={iconLoading}
                className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border-0 bg-violet-600 px-3.5 py-2 text-[0.8rem] font-semibold text-white transition-colors hover:bg-violet-500 disabled:opacity-50"
              >
                <Search size={14} /> Search
              </button>
            </form>

            {/* Quick Category Chips */}
            <div className="flex flex-wrap gap-1.5">
              {ICON_QUICK_CHIPS.map((chip) => (
                <button
                  key={chip}
                  type="button"
                  onClick={() => {
                    setIconQuery(chip);
                    void searchIcons(chip);
                  }}
                  className={cn(
                    'cursor-pointer rounded-full border border-subtle px-2.5 py-1 text-[0.73rem] font-semibold transition-colors',
                    iconQuery.toLowerCase() === chip
                      ? 'bg-violet-600/25 text-violet-200'
                      : 'bg-panel-elevated text-text-secondary hover:bg-hover'
                  )}
                >
                  {chip}
                </button>
              ))}
            </div>

            {iconError && (
              <div className="rounded-lg border border-red-500/35 bg-red-600/14 px-3 py-2 text-[0.78rem] text-red-300">
                {iconError}
              </div>
            )}

            {/* Icon Results Grid */}
            <div className="grid min-h-0 flex-1 grid-cols-[repeat(auto-fill,minmax(92px,1fr))] content-start gap-2 overflow-y-auto">
              {iconLoading ? (
                <div className="col-span-full p-10 text-center text-text-muted">
                  <Loader2 size={22} className="mx-auto mb-1.5 animate-spin" />
                  <div className="text-[0.82rem]">Searching Iconify...</div>
                </div>
              ) : iconResults.length === 0 ? (
                <div className="col-span-full p-10 text-center text-[0.82rem] text-text-muted">
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
                      className="flex cursor-pointer flex-col items-center justify-center gap-1.5 rounded-[10px] border border-subtle bg-panel-elevated px-1.5 py-3 text-text-secondary transition-colors hover:border-accent/60 hover:bg-hover"
                    >
                      <img
                        src={previewUrl}
                        alt={item.name}
                        className="h-9 w-9 object-contain"
                      />
                      <span className="max-w-full truncate text-[0.66rem]">
                        {item.name}
                      </span>
                    </button>
                  );
                })
              )}
            </div>
            <div className="text-right text-[0.71rem] text-text-muted">
              9,000+ bundled offline icons (Lucide + Material Design) — zero rate limits, works offline &amp; recolorable.
            </div>
          </div>
        )}

        {/* TAB 2: CURATED ANIMATED VECTOR STICKERS (100% OFFLINE, RECOLORABLE, ZERO MEMES) */}
        {activeTab === 'animated' && (
          <div className="flex min-h-0 flex-1 flex-col gap-3 px-4 py-3.5">
            <div className="flex flex-wrap items-center justify-between gap-2.5">
              <div className="flex flex-wrap gap-1.5">
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
                    className={cn(
                      'cursor-pointer rounded-full border border-subtle px-3 py-[5px] text-[0.75rem] font-semibold transition-colors',
                      animatedCategory === cat.id
                        ? 'bg-emerald-600/25 text-emerald-300'
                        : 'bg-panel-elevated text-text-secondary hover:bg-hover'
                    )}
                  >
                    {cat.label}
                  </button>
                ))}
              </div>

              <div className="inline-flex items-center gap-1.5">
                {['#fde047', '#ffffff', '#93c5fd', '#6ee7b7', '#f9a8d4', '#f87171'].map((swatch) => (
                  <button
                    key={swatch}
                    type="button"
                    onClick={() => setAnimatedColor(swatch)}
                    className={cn(
                      'h-[18px] w-[18px] cursor-pointer rounded-full p-0',
                      animatedColor.toLowerCase() === swatch
                        ? 'border-2 border-accent'
                        : 'border border-white/30'
                    )}
                    style={{ background: swatch }}
                  />
                ))}
                <input
                  type="color"
                  aria-label="Animated sticker color"
                  value={animatedColor}
                  onChange={(e) => setAnimatedColor(e.target.value)}
                  className="h-6 w-7 cursor-pointer rounded-md border border-subtle bg-transparent p-0"
                />
              </div>
            </div>

            <div className="grid min-h-0 flex-1 auto-rows-max grid-cols-[repeat(auto-fill,minmax(145px,1fr))] content-start gap-2.5 overflow-y-auto">
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
                    className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border border-subtle bg-panel-elevated px-2.5 py-3.5 text-text-primary transition-colors hover:border-accent/60 hover:bg-hover"
                  >
                    <div className="flex h-[68px] w-full items-center justify-center">
                      <img
                        src={previewUrl}
                        alt={sticker.name}
                        className="max-h-full max-w-full object-contain"
                      />
                    </div>
                    <span className="text-[0.73rem] font-semibold text-text-secondary">
                      {sticker.name}
                    </span>
                  </button>
                );
              })}
            </div>
            <div className="text-right text-[0.71rem] text-text-muted">
              100% offline animated vector stickers — recolorable anytime in Canvas.
            </div>
          </div>
        )}

        {/* TAB 2: PIXABAY (FREE STOCK PHOTOS, ILLUSTRATIONS, VECTORS) */}
        {activeTab === 'stock' && (
          <div className="flex min-h-0 flex-1 flex-col gap-3 px-4 py-3.5">
            {(!pixabayKey || showKeyInput) && (
              <div className="flex flex-col gap-2 rounded-[10px] border border-subtle bg-panel-elevated p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="inline-flex items-center gap-1.5 text-[0.8rem] font-bold">
                    <KeyRound size={14} color="#60a5fa" /> Pixabay Free API Key
                  </span>
                  <span className="text-[0.74rem] text-text-muted">
                    Free key:{' '}
                    <a
                      href="https://pixabay.com/api/docs/"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="font-bold text-blue-300 underline"
                    >
                      pixabay.com/api/docs
                    </a>
                  </span>
                </div>
                <div className="flex gap-2">
                  <input
                    type="password"
                    value={pixabayKeyDraft}
                    onChange={(e) => setPixabayKeyDraft(e.target.value)}
                    placeholder="Paste your free Pixabay API key..."
                    className="flex-1 rounded-lg border border-subtle bg-app px-2.5 py-[7px] text-[0.82rem] text-text-primary focus:border-accent focus:outline-none"
                  />
                  <button
                    type="button"
                    onClick={() => void handleSavePixabayKey()}
                    className="inline-flex cursor-pointer items-center gap-[5px] rounded-lg border-0 bg-blue-600 px-3.5 py-[7px] text-[0.8rem] font-semibold text-white transition-colors hover:bg-blue-500"
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
                  className="flex flex-wrap items-center gap-2"
                >
                  <input
                    type="text"
                    value={stockQuery}
                    onChange={(e) => setStockQuery(e.target.value)}
                    placeholder="Search free photos, illustrations, & vectors..."
                    className="min-w-[180px] flex-1 rounded-lg border border-subtle bg-app px-3 py-2 text-[0.84rem] text-text-primary focus:border-accent focus:outline-none"
                  />
                  <select
                    value={stockType}
                    onChange={(e) => {
                      const next = e.target.value as 'all' | 'photo' | 'illustration' | 'vector';
                      setStockType(next);
                      void searchStock(stockQuery, next);
                    }}
                    className="rounded-lg border border-subtle bg-app px-2.5 py-2 text-[0.8rem] text-text-primary focus:border-accent focus:outline-none"
                  >
                    <option value="all">All Types</option>
                    <option value="photo">Photos</option>
                    <option value="illustration">Illustrations</option>
                    <option value="vector">Vectors</option>
                  </select>
                  <button
                    type="submit"
                    disabled={stockLoading}
                    className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border-0 bg-blue-600 px-3.5 py-2 text-[0.8rem] font-semibold text-white transition-colors hover:bg-blue-500 disabled:opacity-50"
                  >
                    <Search size={14} /> Search
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowKeyInput((v) => !v)}
                    title="Change Pixabay API Key"
                    className="inline-flex cursor-pointer items-center gap-1 rounded-lg border border-subtle bg-transparent px-2.5 py-2 text-[0.76rem] text-text-secondary transition-colors hover:bg-hover"
                  >
                    <KeyRound size={13} /> Key
                  </button>
                </form>

                <div className="flex flex-wrap gap-1.5">
                  {PIXABAY_QUICK_CHIPS.map((chip) => (
                    <button
                      key={chip}
                      type="button"
                      onClick={() => {
                        setStockQuery(chip);
                        void searchStock(chip, stockType);
                      }}
                      className={cn(
                        'cursor-pointer rounded-full border border-subtle px-2.5 py-1 text-[0.73rem] font-semibold transition-colors',
                        stockQuery.toLowerCase() === chip
                          ? 'bg-blue-600/25 text-blue-300'
                          : 'bg-panel-elevated text-text-secondary hover:bg-hover'
                      )}
                    >
                      {chip}
                    </button>
                  ))}
                </div>
              </>
            )}

            {stockError && (
              <div className="rounded-lg border border-red-500/35 bg-red-600/14 px-3 py-2 text-[0.78rem] text-red-300">
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
              className="grid min-h-0 flex-1 auto-rows-max grid-cols-[repeat(auto-fill,minmax(185px,1fr))] content-start gap-2.5 overflow-y-auto"
            >
              {stockLoading ? (
                <div className="col-span-full p-10 text-center text-text-muted">
                  <Loader2 size={22} className="mx-auto mb-1.5 animate-spin" />
                  <div className="text-[0.82rem]">Searching Pixabay...</div>
                </div>
              ) : !pixabayKey ? (
                <div className="col-span-full p-8 text-center text-[0.82rem] text-text-muted">
                  Enter your free Pixabay API key above to search royalty-free photos, worship backgrounds, illustrations, and vectors.
                </div>
              ) : stockResults.length === 0 ? (
                <div className="col-span-full p-10 text-center text-[0.82rem] text-text-muted">
                  No results found. Try another keyword.
                </div>
              ) : (
                stockResults.map((hit) => {
                  const isBusy = downloadingHitId === hit.id;
                  return (
                    <div
                      key={hit.id}
                      className="flex flex-col overflow-hidden rounded-[10px] border border-subtle bg-panel-elevated"
                    >
                      <div className="h-[118px] w-full shrink-0 overflow-hidden bg-slate-950">
                        <img
                          src={hit.webformatURL || hit.previewURL}
                          alt={hit.tags}
                          loading="lazy"
                          className="h-full w-full object-cover"
                        />
                      </div>
                      <div className="flex gap-1 p-1.5">
                        <button
                          type="button"
                          disabled={Boolean(downloadingHitId)}
                          onClick={() => void handleUseStockImage(hit, 'layer')}
                          className="flex-1 cursor-pointer rounded-md border-0 bg-blue-600 px-1.5 py-[5px] text-[0.71rem] font-semibold text-white transition-colors hover:bg-blue-500 disabled:opacity-50"
                        >
                          {isBusy ? 'Saving...' : '+ Layer'}
                        </button>
                        <button
                          type="button"
                          disabled={Boolean(downloadingHitId)}
                          onClick={() => void handleUseStockImage(hit, 'background')}
                          className="inline-flex flex-1 cursor-pointer items-center justify-center gap-[3px] rounded-md border border-subtle bg-transparent px-1.5 py-[5px] text-[0.71rem] font-semibold text-text-primary transition-colors hover:bg-hover disabled:opacity-50"
                        >
                          <ImageIcon size={11} /> Set BG
                        </button>
                      </div>
                    </div>
                  );
                })
              )}
              {stockLoadingMore && (
                <div className="col-span-full flex items-center justify-center gap-1.5 p-3.5 text-center text-[0.78rem] text-text-muted">
                  <Loader2 size={15} className="animate-spin" /> Loading more results...
                </div>
              )}
            </div>
            <div className="text-right text-[0.71rem] text-text-muted">
              Images are automatically cached locally so your slides work 100% offline.
            </div>
          </div>
        )}
      </div>
    </dialog>
  );
};
