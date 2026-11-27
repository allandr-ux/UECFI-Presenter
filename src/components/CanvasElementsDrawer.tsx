import React, { useEffect, useRef, useState } from 'react';
import {
  ArrowLeft,
  Frame,
  Image as ImageIcon,
  LayoutGrid,
  Loader2,
  Minus,
  Palette,
  PenTool,
  Search,
  Shapes,
  Sparkles,
  Wand2,
  X
} from 'lucide-react';
import type { CanvasElement, FrameVariant, ShapeVariant } from '../../shared/types';
import { ANIMATED_STICKERS, type AnimatedStickerPreset } from '../utils/animatedStickers';
import { buildColoredSvgDataUrl } from './AssetBrowserModal';
import { CanvasFrameGraphic, FRAME_OPTIONS } from './CanvasFrameGraphic';
import { CanvasShapeGraphic, SHAPE_OPTIONS } from './CanvasShapeGraphic';
import { cn } from '../utils/cn';

const PIXABAY_SECRET_KEY = 'pixabay_api_key';
const DEFAULT_PIXABAY_KEY = '58818457-ed1e6684bc4b217d0e6e4d991';
const RECENT_STORAGE_KEY = 'uecfi_canvas_recent_elements_v1';

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

interface PixabayHit {
  id: number;
  tags: string;
  previewURL: string;
  webformatURL: string;
  largeImageURL: string;
  imageWidth: number;
  imageHeight: number;
}

type RecentElementRecord =
  | {
      id: string;
      kind: 'shape';
      name: string;
      shapeType: ShapeVariant;
    }
  | {
      id: string;
      kind: 'svg';
      name: string;
      svgTemplate: string;
      color: string;
      aspect?: number;
    }
  | {
      id: string;
      kind: 'photo';
      name: string;
      url: string;
      naturalWidth: number;
      naturalHeight: number;
    }
  | {
      id: string;
      kind: 'frame';
      name: string;
      frameShape: FrameVariant;
      aspect: number;
    };

/**
 * Multi-panel Canva-style layout Grids (each drops aligned rectangular panels onto the slide).
 */
const GRID_PRESETS: Array<{
  id: string;
  name: string;
  rects: Array<{ x: number; y: number; width: number; height: number }>;
}> = [
  {
    id: 'grid-2col',
    name: '2-Column Split',
    rects: [
      { x: 4, y: 8, width: 44, height: 84 },
      { x: 52, y: 8, width: 44, height: 84 }
    ]
  },
  {
    id: 'grid-3col',
    name: '3-Column Grid',
    rects: [
      { x: 4, y: 10, width: 28.5, height: 80 },
      { x: 35.75, y: 10, width: 28.5, height: 80 },
      { x: 67.5, y: 10, width: 28.5, height: 80 }
    ]
  },
  {
    id: 'grid-2x2',
    name: '2 × 2 Grid',
    rects: [
      { x: 5, y: 7, width: 43, height: 41 },
      { x: 52, y: 7, width: 43, height: 41 },
      { x: 5, y: 52, width: 43, height: 41 },
      { x: 52, y: 52, width: 43, height: 41 }
    ]
  },
  {
    id: 'grid-feature-left',
    name: 'Feature Left + 2',
    rects: [
      { x: 4, y: 8, width: 54, height: 84 },
      { x: 61, y: 8, width: 35, height: 40 },
      { x: 61, y: 52, width: 35, height: 40 }
    ]
  },
  {
    id: 'grid-top-banner',
    name: 'Header + 2 Columns',
    rects: [
      { x: 4, y: 6, width: 92, height: 26 },
      { x: 4, y: 36, width: 44, height: 58 },
      { x: 52, y: 36, width: 44, height: 58 }
    ]
  },
  {
    id: 'grid-2row',
    name: '2-Row Stack',
    rects: [
      { x: 5, y: 7, width: 90, height: 41 },
      { x: 5, y: 52, width: 90, height: 41 }
    ]
  }
];

type DrawerCategory =
  | null
  | 'recent'
  | 'shapes'
  | 'graphics'
  | 'animations'
  | 'frames'
  | 'grids'
  | 'photos'
  | 'vectors'
  | 'art';

interface CanvasElementsDrawerProps {
  onAddShape: (shapeType: ShapeVariant) => void;
  onAddDivider: () => void;
  onInsertSvgIcon: (opts: {
    name: string;
    svgTemplate: string;
    color: string;
    dataUrl: string;
    aspect?: number;
  }) => void;
  onInsertImage: (opts: {
    name: string;
    url: string;
    naturalWidth: number;
    naturalHeight: number;
  }) => void;
  onSetBackgroundImage: (url: string) => void;
  onInsertGridLayout: (
    name: string,
    rects: Array<{ x: number; y: number; width: number; height: number }>
  ) => void;
  onAddFrame: (frameShape: FrameVariant, name: string, aspect: number) => void;
}

const GRAPHIC_CHIPS = ['church', 'cross', 'music', 'bible', 'dove', 'heart', 'star', 'sparkles', 'arrow'];
const PHOTO_CHIPS = ['worship', 'church', 'cross', 'light rays', 'sky', 'mountains', 'abstract', 'nature'];

/**
 * Canva-style Elements Drawer embedded directly inside Canvas's collapsible left panel.
 * Features global search, Recently Used strip + See All, and 6 rich categories:
 * Shapes, Graphics, Animations, Frames, Grids, and Photos.
 */
export const CanvasElementsDrawer: React.FC<CanvasElementsDrawerProps> = ({
  onAddShape,
  onAddDivider,
  onInsertSvgIcon,
  onInsertImage,
  onSetBackgroundImage,
  onInsertGridLayout,
  onAddFrame
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [activeCategory, setActiveCategory] = useState<DrawerCategory>(null);

  // Recently Used (persisted in localStorage)
  const [recentItems, setRecentItems] = useState<RecentElementRecord[]>(() => {
    try {
      const raw = localStorage.getItem(RECENT_STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as RecentElementRecord[];
        if (Array.isArray(parsed)) return parsed;
      }
    } catch {
      // Ignore malformed storage
    }
    return [];
  });

  const recordRecent = (item: RecentElementRecord) => {
    setRecentItems((prev) => {
      const next = [item, ...prev.filter((r) => r.id !== item.id)].slice(0, 20);
      try {
        localStorage.setItem(RECENT_STORAGE_KEY, JSON.stringify(next));
      } catch {
        // Ignore storage quota errors
      }
      return next;
    });
  };

  // Graphics (9,000+ offline bundled icons)
  const [graphicColor, setGraphicColor] = useState('#ffffff');
  const [graphicQuery, setGraphicQuery] = useState('church');
  const [graphicResults, setGraphicResults] = useState<LocalIconEntry[]>([]);
  const [graphicLoading, setGraphicLoading] = useState(false);

  // Animations
  const [animColor, setAnimColor] = useState('#fde047');
  const [animFilter, setAnimFilter] = useState<'all' | 'worship' | 'accents' | 'pointers'>('all');

  // Frames
  const [frameColor, setFrameColor] = useState('#ffffff');

  // Photos (Pixabay with infinite scroll)
  const [pixabayKey, setPixabayKey] = useState(DEFAULT_PIXABAY_KEY);
  const [photoQuery, setPhotoQuery] = useState('worship');
  const [photoType, setPhotoType] = useState<'all' | 'photo' | 'illustration' | 'vector'>('all');
  const [photoResults, setPhotoResults] = useState<PixabayHit[]>([]);
  const [photoPage, setPhotoPage] = useState(1);
  const [photoHasMore, setPhotoHasMore] = useState(false);
  const [photoLoading, setPhotoLoading] = useState(false);
  const [photoLoadingMore, setPhotoLoadingMore] = useState(false);
  const [photoError, setPhotoError] = useState<string | null>(null);
  const [downloadingId, setDownloadingId] = useState<number | null>(null);
  const photoGridRef = useRef<HTMLDivElement | null>(null);

  // Load optional user override Pixabay key
  useEffect(() => {
    const loadKey = async () => {
      try {
        const secret = await window.presenterAPI?.getSecret(PIXABAY_SECRET_KEY);
        const saved = (secret || localStorage.getItem(PIXABAY_SECRET_KEY) || '').trim();
        if (saved) setPixabayKey(saved);
      } catch {
        // Keep built-in default
      }
    };
    void loadKey();
  }, []);

  const runGraphicSearch = async (qRaw: string, limit = 60) => {
    const q = qRaw.trim().toLowerCase();
    setGraphicLoading(true);
    try {
      const index = await loadLocalIconIndex();
      if (!q) {
        setGraphicResults(index.slice(0, limit));
        return;
      }
      const terms = ICON_SYNONYMS[q] ?? [q];
      const scored: Array<{ entry: LocalIconEntry; score: number }> = [];
      for (const entry of index) {
        let best = 0;
        for (const term of terms) {
          if (entry.name === term || entry.searchKey === term) best = Math.max(best, 4);
          else if (entry.searchKey.startsWith(term)) best = Math.max(best, 3);
          else if (entry.searchKey.split(' ').some((tok) => tok.startsWith(term))) best = Math.max(best, 2);
          else if (entry.searchKey.includes(term)) best = Math.max(best, 1);
        }
        if (best > 0) scored.push({ entry, score: best });
      }
      scored.sort((a, b) => b.score - a.score || a.entry.name.length - b.entry.name.length);
      setGraphicResults(scored.slice(0, limit).map((s) => s.entry));
    } finally {
      setGraphicLoading(false);
    }
  };

  const runPhotoSearch = async (
    qRaw: string,
    imgType: 'all' | 'photo' | 'illustration' | 'vector',
    page = 1
  ) => {
    const q = qRaw.trim();
    if (!pixabayKey.trim() || !q) return;
    if (page === 1) {
      setPhotoLoading(true);
      if (photoGridRef.current) photoGridRef.current.scrollTop = 0;
    } else {
      setPhotoLoadingMore(true);
    }
    setPhotoError(null);
    try {
      const url = `https://pixabay.com/api/?key=${encodeURIComponent(pixabayKey)}&q=${encodeURIComponent(q)}&image_type=${imgType}&safesearch=true&per_page=24&page=${page}`;
      const res = await fetch(url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = (await res.json()) as { hits?: PixabayHit[]; totalHits?: number };
      const hits = Array.isArray(data.hits) ? data.hits : [];
      const totalHits = typeof data.totalHits === 'number' ? data.totalHits : 0;
      setPhotoPage(page);
      setPhotoHasMore(hits.length > 0 && page * 24 < totalHits);
      if (page === 1) {
        setPhotoResults(hits);
      } else {
        setPhotoResults((prev) => {
          const seen = new Set(prev.map((h) => h.id));
          return [...prev, ...hits.filter((h) => !seen.has(h.id))];
        });
      }
    } catch {
      setPhotoError('Could not load Pixabay results. Check your connection.');
      if (page === 1) {
        setPhotoResults([]);
        setPhotoHasMore(false);
      }
    } finally {
      if (page === 1) setPhotoLoading(false);
      else setPhotoLoadingMore(false);
    }
  };

  // Auto-populate when drilling into Graphics, Photos, Vectors, or Art
  useEffect(() => {
    if (activeCategory === 'graphics' && graphicResults.length === 0) {
      void runGraphicSearch(graphicQuery);
    }
    if (activeCategory === 'photos') {
      setPhotoType('photo');
      void runPhotoSearch(photoQuery, 'photo', 1);
    } else if (activeCategory === 'vectors') {
      setPhotoType('vector');
      void runPhotoSearch(photoQuery, 'vector', 1);
    } else if (activeCategory === 'art') {
      setPhotoType('illustration');
      void runPhotoSearch(photoQuery, 'illustration', 1);
    }
  }, [activeCategory]);

  // Global search across Graphics + Animations + Photos when typing in the top search bar
  const globalSearchTimerRef = useRef<number | null>(null);
  useEffect(() => {
    const q = searchQuery.trim();
    if (!q) return;
    void runGraphicSearch(q, 24);
    if (globalSearchTimerRef.current) window.clearTimeout(globalSearchTimerRef.current);
    globalSearchTimerRef.current = window.setTimeout(() => {
      void runPhotoSearch(q, 'all', 1);
    }, 350);
    return () => {
      if (globalSearchTimerRef.current) window.clearTimeout(globalSearchTimerRef.current);
    };
  }, [searchQuery]);

  const handleInsertShape = (shapeType: ShapeVariant) => {
    const opt = SHAPE_OPTIONS.find((s) => s.id === shapeType);
    onAddShape(shapeType);
    recordRecent({
      id: `shape:${shapeType}`,
      kind: 'shape',
      name: opt?.label || shapeType,
      shapeType
    });
  };

  const handleInsertSvg = (opts: {
    id: string;
    name: string;
    svgTemplate: string;
    color: string;
    aspect?: number;
  }) => {
    let svgText = opts.svgTemplate;
    if (!svgText.includes('currentColor') && !svgText.includes('fill=')) {
      svgText = svgText.replace('<svg ', '<svg fill="currentColor" ');
    }
    const dataUrl = buildColoredSvgDataUrl(svgText, opts.color);
    onInsertSvgIcon({
      name: opts.name,
      svgTemplate: svgText,
      color: opts.color,
      dataUrl,
      aspect: opts.aspect
    });
    recordRecent({
      id: opts.id,
      kind: 'svg',
      name: opts.name,
      svgTemplate: svgText,
      color: opts.color,
      aspect: opts.aspect
    });
  };

  const downloadAndCachePhoto = async (hit: PixabayHit): Promise<string> => {
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
    return await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = () => reject(new Error('Failed to read image'));
      reader.readAsDataURL(blob);
    });
  };

  const handleUsePhoto = async (hit: PixabayHit, mode: 'layer' | 'background') => {
    setDownloadingId(hit.id);
    setPhotoError(null);
    try {
      const localUrl = await downloadAndCachePhoto(hit);
      const cleanName =
        (hit.tags || '')
          .split(',')
          .map((t) => t.trim())
          .filter(Boolean)
          .slice(0, 2)
          .map((t) => t.charAt(0).toUpperCase() + t.slice(1))
          .join(', ') || `Photo #${hit.id}`;
      if (mode === 'background') {
        onSetBackgroundImage(localUrl);
      } else {
        onInsertImage({
          name: cleanName,
          url: localUrl,
          naturalWidth: hit.imageWidth || 1280,
          naturalHeight: hit.imageHeight || 720
        });
        recordRecent({
          id: `photo:${hit.id}`,
          kind: 'photo',
          name: cleanName,
          url: localUrl,
          naturalWidth: hit.imageWidth || 1280,
          naturalHeight: hit.imageHeight || 720
        });
      }
    } catch {
      setPhotoError('Failed to download image.');
    } finally {
      setDownloadingId(null);
    }
  };

  const handleInsertFrame = (frameShape: FrameVariant, name: string, aspect: number) => {
    onAddFrame(frameShape, name, aspect);
    recordRecent({
      id: `frame:${frameShape}`,
      kind: 'frame',
      name,
      frameShape,
      aspect
    });
  };

  const handleClickRecent = (rec: RecentElementRecord) => {
    if (rec.kind === 'shape') {
      handleInsertShape(rec.shapeType);
    } else if (rec.kind === 'frame') {
      handleInsertFrame(rec.frameShape, rec.name, rec.aspect);
    } else if (rec.kind === 'svg') {
      handleInsertSvg({
        id: rec.id,
        name: rec.name,
        svgTemplate: rec.svgTemplate,
        color: rec.color,
        aspect: rec.aspect
      });
    } else {
      onInsertImage({
        name: rec.name,
        url: rec.url,
        naturalWidth: rec.naturalWidth,
        naturalHeight: rec.naturalHeight
      });
      recordRecent(rec);
    }
  };

  const renderRecentTile = (rec: RecentElementRecord, size = 50) => (
    <button
      key={rec.id}
      type="button"
      title={rec.name}
      onClick={() => handleClickRecent(rec)}
      className="flex shrink-0 cursor-pointer items-center justify-center overflow-hidden rounded-[10px] border border-subtle bg-panel-elevated p-1.5 transition-colors hover:border-accent/60 hover:bg-hover"
      style={{ width: `${size}px`, height: `${size}px` }}
    >
      {rec.kind === 'shape' ? (
        <div className="h-7 w-7">
          <CanvasShapeGraphic shapeType={rec.shapeType} fill="#e2e8f0" />
        </div>
      ) : rec.kind === 'frame' ? (
        <div className="h-8 w-8">
          <CanvasFrameGraphic frameShape={rec.frameShape} />
        </div>
      ) : rec.kind === 'svg' ? (
        <img
          src={buildColoredSvgDataUrl(rec.svgTemplate, rec.color)}
          alt={rec.name}
          className="h-full w-full object-contain"
        />
      ) : (
        <img
          src={rec.url}
          alt={rec.name}
          className="h-full w-full rounded-md object-cover"
        />
      )}
    </button>
  );

  const CATEGORIES: Array<{
    id: Exclude<DrawerCategory, null | 'recent'>;
    label: string;
    gradient: string;
    icon: React.ReactNode;
  }> = [
    {
      id: 'shapes',
      label: 'Shapes',
      gradient: 'linear-gradient(135deg, #06b6d4 0%, #0d9488 100%)',
      icon: <Shapes size={22} color="#fff" />
    },
    {
      id: 'graphics',
      label: 'Graphics',
      gradient: 'linear-gradient(135deg, #f97316 0%, #ea580c 100%)',
      icon: <Sparkles size={22} color="#fff" />
    },
    {
      id: 'animations',
      label: 'Animations',
      gradient: 'linear-gradient(135deg, #22c55e 0%, #15803d 100%)',
      icon: <Wand2 size={22} color="#fff" />
    },
    {
      id: 'frames',
      label: 'Frames',
      gradient: 'linear-gradient(135deg, #10b981 0%, #047857 100%)',
      icon: <Frame size={22} color="#fff" />
    },
    {
      id: 'grids',
      label: 'Grids',
      gradient: 'linear-gradient(135deg, #d946ef 0%, #9333ea 100%)',
      icon: <LayoutGrid size={22} color="#fff" />
    },
    {
      id: 'photos',
      label: 'Photos',
      gradient: 'linear-gradient(135deg, #3b82f6 0%, #1d4ed8 100%)',
      icon: <ImageIcon size={22} color="#fff" />
    },
    {
      id: 'vectors',
      label: 'Vectors',
      gradient: 'linear-gradient(135deg, #ec4899 0%, #be185d 100%)',
      icon: <PenTool size={22} color="#fff" />
    },
    {
      id: 'art',
      label: 'Art',
      gradient: 'linear-gradient(135deg, #f59e0b 0%, #b45309 100%)',
      icon: <Palette size={22} color="#fff" />
    }
  ];

  const isGlobalSearching = searchQuery.trim().length > 0 && activeCategory === null;

  return (
    <div className="flex h-full min-h-0 flex-col gap-3">
      {/* Top Canva-style Search Bar */}
      <div className="relative flex shrink-0 items-center">
        <Search
          size={14}
          className="pointer-events-none absolute left-2.5 text-text-muted"
        />
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => {
            setSearchQuery(e.target.value);
            if (e.target.value.trim()) setActiveCategory(null);
          }}
          placeholder="Search elements"
          className="w-full rounded-[10px] border border-subtle bg-app py-2 pr-7 pl-8 text-[0.82rem] text-text-primary focus:border-accent focus:outline-none"
        />
        {searchQuery && (
          <button
            type="button"
            onClick={() => setSearchQuery('')}
            className="absolute right-2 cursor-pointer border-0 bg-transparent p-0.5 text-text-muted hover:text-text-primary"
          >
            <X size={13} />
          </button>
        )}
      </div>

      {/* GLOBAL SEARCH RESULTS */}
      {isGlobalSearching && (
        <div className="flex min-h-0 flex-1 flex-col gap-3.5 overflow-y-auto">
          {/* Graphics matches */}
          <div className="flex flex-col gap-1.5">
            <div className="flex items-center justify-between">
              <span className="text-[0.75rem] font-bold text-text-primary">
                Graphics
              </span>
              <button
                type="button"
                onClick={() => {
                  setGraphicQuery(searchQuery);
                  setSearchQuery('');
                  setActiveCategory('graphics');
                  void runGraphicSearch(searchQuery);
                }}
                className="cursor-pointer border-0 bg-transparent text-[0.72rem] font-semibold text-blue-300 hover:underline"
              >
                See all
              </button>
            </div>
            {graphicLoading ? (
              <div className="text-[0.74rem] text-text-muted">Searching...</div>
            ) : graphicResults.length === 0 ? (
              <div className="text-[0.74rem] text-text-muted">No matching graphics.</div>
            ) : (
              <div className="grid grid-cols-4 gap-1.5">
                {graphicResults.slice(0, 12).map((item) => {
                  const displayName = item.name
                    .split('-')
                    .map((p) => (p ? p[0].toUpperCase() + p.slice(1) : ''))
                    .join(' ');
                  return (
                    <button
                      key={item.id}
                      type="button"
                      title={displayName}
                      onClick={() =>
                        handleInsertSvg({
                          id: item.id,
                          name: displayName,
                          svgTemplate: item.svgTemplate,
                          color: graphicColor
                        })
                      }
                      className="flex h-[54px] cursor-pointer items-center justify-center rounded-lg border border-subtle bg-panel-elevated p-2 transition-colors hover:border-accent/60 hover:bg-hover"
                    >
                      <img
                        src={buildColoredSvgDataUrl(item.svgTemplate, graphicColor)}
                        alt={displayName}
                        className="h-full w-full object-contain"
                      />
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* Animations matches */}
          {(() => {
            const q = searchQuery.trim().toLowerCase();
            const matchedAnims = ANIMATED_STICKERS.filter(
              (a) => a.name.toLowerCase().includes(q) || a.category.includes(q)
            );
            if (matchedAnims.length === 0) return null;
            return (
              <div className="flex flex-col gap-1.5">
                <span className="text-[0.75rem] font-bold text-text-primary">
                  Animations
                </span>
                <div className="grid grid-cols-3 gap-1.5">
                  {matchedAnims.slice(0, 6).map((st) => (
                    <button
                      key={st.id}
                      type="button"
                      title={st.name}
                      onClick={() =>
                        handleInsertSvg({
                          id: `anim:${st.id}`,
                          name: st.name,
                          svgTemplate: st.svgTemplate,
                          color: animColor,
                          aspect: st.aspect
                        })
                      }
                      className="flex h-[62px] cursor-pointer items-center justify-center rounded-lg border border-subtle bg-panel-elevated p-2 transition-colors hover:border-accent/60 hover:bg-hover"
                    >
                      <img
                        src={buildColoredSvgDataUrl(st.svgTemplate, animColor)}
                        alt={st.name}
                        className="max-h-full max-w-full object-contain"
                      />
                    </button>
                  ))}
                </div>
              </div>
            );
          })()}

          {/* Photos matches */}
          <div className="flex flex-col gap-1.5">
            <div className="flex items-center justify-between">
              <span className="text-[0.75rem] font-bold text-text-primary">
                Photos
              </span>
              <button
                type="button"
                onClick={() => {
                  setPhotoQuery(searchQuery);
                  setSearchQuery('');
                  setActiveCategory('photos');
                  void runPhotoSearch(searchQuery, photoType, 1);
                }}
                className="cursor-pointer border-0 bg-transparent text-[0.72rem] font-semibold text-blue-300 hover:underline"
              >
                See all
              </button>
            </div>
            {photoLoading ? (
              <div className="text-[0.74rem] text-text-muted">Searching Pixabay...</div>
            ) : (
              <div className="grid grid-cols-2 gap-1.5">
                {photoResults.slice(0, 6).map((hit) => (
                  <button
                    key={hit.id}
                    type="button"
                    disabled={Boolean(downloadingId)}
                    onClick={() => void handleUsePhoto(hit, 'layer')}
                    className="h-[76px] cursor-pointer overflow-hidden rounded-lg border border-subtle bg-slate-950 p-0 transition-opacity hover:opacity-90 disabled:opacity-50"
                  >
                    <img
                      src={hit.webformatURL || hit.previewURL}
                      alt={hit.tags}
                      className="h-full w-full object-cover"
                    />
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* HOME VIEW: Recently Used + Browse Categories */}
      {!isGlobalSearching && activeCategory === null && (
        <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto">
          {/* Recently Used Row */}
          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <span className="text-[0.8rem] font-bold text-text-primary">
                Recently used
              </span>
              {recentItems.length > 0 && (
                <button
                  type="button"
                  onClick={() => setActiveCategory('recent')}
                  className="cursor-pointer border-0 bg-transparent text-[0.74rem] font-semibold text-violet-400 hover:underline"
                >
                  See all
                </button>
              )}
            </div>
            {recentItems.length === 0 ? (
              <div className="rounded-[10px] border border-dashed border-subtle p-2.5 text-center text-[0.73rem] text-text-muted">
                Elements you add will appear here for quick reuse.
              </div>
            ) : (
              <div className="flex gap-1.5 overflow-x-auto pb-0.5">
                {recentItems.slice(0, 6).map((rec) => renderRecentTile(rec, 50))}
              </div>
            )}
          </div>

          {/* Browse Categories (3-Column Canva Grid) */}
          <div className="flex flex-col gap-2.5">
            <span className="text-[0.8rem] font-bold text-text-primary">
              Browse categories
            </span>
            <div className="grid grid-cols-3 gap-x-2 gap-y-3">
              {CATEGORIES.map((cat) => (
                <button
                  key={cat.id}
                  type="button"
                  onClick={() => setActiveCategory(cat.id)}
                  className="flex cursor-pointer flex-col items-center gap-1.5 border-0 bg-transparent px-0.5 py-1 transition-transform hover:scale-[1.03]"
                >
                  <div
                    className="flex h-[58px] w-[58px] items-center justify-center rounded-[15px] shadow-[0_6px_16px_rgba(0,0,0,0.35),inset_0_1px_0_rgba(255,255,255,0.28)]"
                    style={{ background: cat.gradient }}
                  >
                    {cat.icon}
                  </div>
                  <span className="text-[0.74rem] font-semibold text-text-secondary">
                    {cat.label}
                  </span>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* DRILLED-IN CATEGORY VIEWS */}
      {!isGlobalSearching && activeCategory !== null && (
        <div className="flex min-h-0 flex-1 flex-col gap-2.5">
          {/* Category Subheader with Back Button */}
          <div className="flex shrink-0 items-center justify-between">
            <button
              type="button"
              onClick={() => setActiveCategory(null)}
              className="inline-flex cursor-pointer items-center gap-[5px] border-0 bg-transparent px-0 py-0.5 text-[0.8rem] font-bold text-slate-300 hover:text-white"
            >
              <ArrowLeft size={15} />
              <span className="capitalize">
                {activeCategory === 'recent' ? 'Recently used' : activeCategory}
              </span>
            </button>

            {activeCategory === 'recent' && recentItems.length > 0 && (
              <button
                type="button"
                onClick={() => {
                  setRecentItems([]);
                  try {
                    localStorage.removeItem(RECENT_STORAGE_KEY);
                  } catch {
                    // Ignore
                  }
                }}
                className="cursor-pointer border-0 bg-transparent text-[0.72rem] font-semibold text-red-300 hover:text-red-200"
              >
                Clear
              </button>
            )}
          </div>

          {/* 1. RECENTLY USED FULL VIEW */}
          {activeCategory === 'recent' && (
            <div className="grid min-h-0 flex-1 auto-rows-max grid-cols-4 gap-2 overflow-y-auto">
              {recentItems.map((rec) => renderRecentTile(rec, 62))}
            </div>
          )}

          {/* 2. SHAPES CATEGORY */}
          {activeCategory === 'shapes' && (
            <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto">
              <div className="grid grid-cols-4 gap-2">
                {SHAPE_OPTIONS.map((opt) => (
                  <button
                    key={opt.id}
                    type="button"
                    title={opt.label}
                    onClick={() => handleInsertShape(opt.id)}
                    className="flex h-[58px] cursor-pointer flex-col items-center justify-center gap-1 rounded-[10px] border border-subtle bg-panel-elevated transition-colors hover:border-accent/60 hover:bg-hover"
                  >
                    <div className="h-6 w-6">
                      <CanvasShapeGraphic shapeType={opt.id} fill="#e2e8f0" />
                    </div>
                    <span className="text-[0.62rem] text-text-muted">{opt.label}</span>
                  </button>
                ))}
              </div>
              <button
                type="button"
                onClick={onAddDivider}
                className="flex w-full cursor-pointer items-center justify-center gap-1.5 rounded-lg border border-subtle bg-panel-elevated p-2.5 text-[0.78rem] font-semibold text-text-primary transition-colors hover:bg-hover"
              >
                <Minus size={14} /> Add Divider Line
              </button>
            </div>
          )}

          {/* 3. GRAPHICS CATEGORY (9,000+ Offline Icons) */}
          {activeCategory === 'graphics' && (
            <div className="flex min-h-0 flex-1 flex-col gap-2">
              <div className="flex items-center gap-1.5">
                <input
                  type="text"
                  value={graphicQuery}
                  onChange={(e) => {
                    setGraphicQuery(e.target.value);
                    void runGraphicSearch(e.target.value);
                  }}
                  placeholder="Filter 9,000+ offline graphics..."
                  className="flex-1 rounded-lg border border-subtle bg-app px-[9px] py-1.5 text-[0.78rem] text-text-primary focus:border-accent focus:outline-none"
                />
                <input
                  type="color"
                  title="Graphic Color"
                  value={graphicColor}
                  onChange={(e) => setGraphicColor(e.target.value)}
                  className="h-7 w-7 cursor-pointer rounded-md border border-subtle bg-transparent p-0"
                />
              </div>
              <div className="flex flex-wrap gap-1">
                {GRAPHIC_CHIPS.map((chip) => (
                  <button
                    key={chip}
                    type="button"
                    onClick={() => {
                      setGraphicQuery(chip);
                      void runGraphicSearch(chip);
                    }}
                    className={cn(
                      'cursor-pointer rounded-full border border-subtle px-2 py-[3px] text-[0.68rem] font-semibold transition-colors',
                      graphicQuery.toLowerCase() === chip
                        ? 'bg-violet-600/28 text-violet-200'
                        : 'bg-panel-elevated text-text-secondary hover:bg-hover'
                    )}
                  >
                    {chip}
                  </button>
                ))}
              </div>
              <div className="grid min-h-0 flex-1 auto-rows-max grid-cols-4 gap-1.5 overflow-y-auto">
                {graphicLoading ? (
                  <div className="col-span-full p-6 text-center text-[0.76rem] text-text-muted">
                    Loading...
                  </div>
                ) : (
                  graphicResults.map((item) => {
                    const displayName = item.name
                      .split('-')
                      .map((p) => (p ? p[0].toUpperCase() + p.slice(1) : ''))
                      .join(' ');
                    return (
                      <button
                        key={item.id}
                        type="button"
                        title={displayName}
                        onClick={() =>
                          handleInsertSvg({
                            id: item.id,
                            name: displayName,
                            svgTemplate: item.svgTemplate,
                            color: graphicColor
                          })
                        }
                        className="flex h-[58px] cursor-pointer items-center justify-center rounded-lg border border-subtle bg-panel-elevated p-2.5 transition-colors hover:border-accent/60 hover:bg-hover"
                      >
                        <img
                          src={buildColoredSvgDataUrl(item.svgTemplate, graphicColor)}
                          alt={displayName}
                          className="h-full w-full object-contain"
                        />
                      </button>
                    );
                  })
                )}
              </div>
            </div>
          )}

          {/* 4. ANIMATIONS CATEGORY (Curated Animated Vector Stickers) */}
          {activeCategory === 'animations' && (
            <div className="flex min-h-0 flex-1 flex-col gap-2">
              <div className="flex items-center justify-between gap-1.5">
                <div className="flex flex-wrap gap-1">
                  {(['all', 'worship', 'accents', 'pointers'] as const).map((cat) => (
                    <button
                      key={cat}
                      type="button"
                      onClick={() => setAnimFilter(cat)}
                      className={cn(
                        'cursor-pointer rounded-full border border-subtle px-2 py-[3px] text-[0.68rem] font-semibold capitalize transition-colors',
                        animFilter === cat
                          ? 'bg-emerald-600/28 text-emerald-300'
                          : 'bg-panel-elevated text-text-secondary hover:bg-hover'
                      )}
                    >
                      {cat}
                    </button>
                  ))}
                </div>
                <input
                  type="color"
                  title="Animation Color"
                  value={animColor}
                  onChange={(e) => setAnimColor(e.target.value)}
                  className="h-[26px] w-[26px] shrink-0 cursor-pointer rounded-md border border-subtle bg-transparent p-0"
                />
              </div>
              <div className="grid min-h-0 flex-1 auto-rows-max grid-cols-2 gap-2 overflow-y-auto">
                {ANIMATED_STICKERS.filter((st: AnimatedStickerPreset) => animFilter === 'all' || st.category === animFilter).map((st) => (
                  <button
                    key={st.id}
                    type="button"
                    onClick={() =>
                      handleInsertSvg({
                        id: `anim:${st.id}`,
                        name: st.name,
                        svgTemplate: st.svgTemplate,
                        color: animColor,
                        aspect: st.aspect
                      })
                    }
                    className="flex cursor-pointer flex-col items-center gap-1.5 rounded-[10px] border border-subtle bg-panel-elevated px-2 py-2.5 transition-colors hover:border-accent/60 hover:bg-hover"
                  >
                    <div className="flex h-14 w-full items-center justify-center">
                      <img
                        src={buildColoredSvgDataUrl(st.svgTemplate, animColor)}
                        alt={st.name}
                        className="max-h-full max-w-full object-contain"
                      />
                    </div>
                    <span className="text-[0.68rem] font-semibold text-text-secondary">{st.name}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* 5. FRAMES CATEGORY (Canva-style Photo Mask Frames) */}
          {activeCategory === 'frames' && (
            <div className="flex min-h-0 flex-1 flex-col gap-2">
              <span className="text-[0.73rem] text-text-muted">
                Add a frame, then drag any photo or image inside it.
              </span>
              <div className="grid min-h-0 flex-1 auto-rows-max grid-cols-2 gap-2 overflow-y-auto">
                {FRAME_OPTIONS.map((fr) => (
                  <button
                    key={fr.id}
                    type="button"
                    onClick={() => handleInsertFrame(fr.id, `${fr.label} Frame`, fr.aspect)}
                    className="flex cursor-pointer flex-col items-center gap-1.5 rounded-[10px] border border-subtle bg-panel-elevated px-2 py-2.5 transition-colors hover:border-accent/60 hover:bg-hover"
                  >
                    <div className="flex h-[62px] w-[62px] items-center justify-center">
                      <div
                        style={{
                          width: fr.aspect >= 1 ? '62px' : `${Math.round(62 * fr.aspect)}px`,
                          height: fr.aspect >= 1 ? `${Math.round(62 / fr.aspect)}px` : '62px'
                        }}
                      >
                        <CanvasFrameGraphic frameShape={fr.id} />
                      </div>
                    </div>
                    <span className="text-[0.68rem] font-semibold text-text-secondary">{fr.label}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* 6. GRIDS CATEGORY */}
          {activeCategory === 'grids' && (
            <div className="grid min-h-0 flex-1 auto-rows-max grid-cols-2 gap-2 overflow-y-auto">
              {GRID_PRESETS.map((grid) => (
                <button
                  key={grid.id}
                  type="button"
                  onClick={() => onInsertGridLayout(grid.name, grid.rects)}
                  className="flex cursor-pointer flex-col items-center gap-1.5 rounded-[10px] border border-subtle bg-panel-elevated px-2 py-2.5 transition-colors hover:border-accent/60 hover:bg-hover"
                >
                  <div className="relative aspect-video w-full overflow-hidden rounded-md bg-[#090d16]">
                    {grid.rects.map((r, i) => (
                      <div
                        key={i}
                        className="absolute rounded-[3px] border border-violet-300/70 bg-violet-500/35"
                        style={{
                          left: `${r.x}%`,
                          top: `${r.y}%`,
                          width: `${r.width}%`,
                          height: `${r.height}%`
                        }}
                      />
                    ))}
                  </div>
                  <span className="text-[0.68rem] font-semibold text-text-secondary">{grid.name}</span>
                </button>
              ))}
            </div>
          )}

          {/* 7, 8 & 9. PHOTOS / VECTORS / ART CATEGORY (Pixabay with Infinite Scroll) */}
          {(activeCategory === 'photos' ||
            activeCategory === 'vectors' ||
            activeCategory === 'art') && (
            <div className="flex min-h-0 flex-1 flex-col gap-2">
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  void runPhotoSearch(photoQuery, photoType, 1);
                }}
                className="flex gap-1"
              >
                <input
                  type="text"
                  value={photoQuery}
                  onChange={(e) => setPhotoQuery(e.target.value)}
                  placeholder={
                    activeCategory === 'vectors'
                      ? 'Search vectors...'
                      : activeCategory === 'art'
                        ? 'Search illustrations & art...'
                        : 'Search photos...'
                  }
                  className="min-w-0 flex-1 rounded-[7px] border border-subtle bg-app px-2 py-1.5 text-[0.76rem] text-text-primary focus:border-accent focus:outline-none"
                />
                <select
                  value={photoType}
                  onChange={(e) => {
                    const next = e.target.value as 'all' | 'photo' | 'illustration' | 'vector';
                    setPhotoType(next);
                    void runPhotoSearch(photoQuery, next, 1);
                  }}
                  className="rounded-[7px] border border-subtle bg-app p-1.5 text-[0.72rem] text-text-primary focus:border-accent focus:outline-none"
                >
                  <option value="all">All</option>
                  <option value="photo">Photos</option>
                  <option value="illustration">Art</option>
                  <option value="vector">Vector</option>
                </select>
              </form>

              <div className="flex flex-wrap gap-1">
                {PHOTO_CHIPS.map((chip) => (
                  <button
                    key={chip}
                    type="button"
                    onClick={() => {
                      setPhotoQuery(chip);
                      void runPhotoSearch(chip, photoType, 1);
                    }}
                    className={cn(
                      'cursor-pointer rounded-full border border-subtle px-[7px] py-[3px] text-[0.67rem] font-semibold transition-colors',
                      photoQuery.toLowerCase() === chip
                        ? 'bg-blue-600/28 text-blue-300'
                        : 'bg-panel-elevated text-text-secondary hover:bg-hover'
                    )}
                  >
                    {chip}
                  </button>
                ))}
              </div>

              {photoError && (
                <div className="text-[0.72rem] text-red-300">{photoError}</div>
              )}

              <div
                ref={photoGridRef}
                onScroll={(e) => {
                  const el = e.currentTarget;
                  if (
                    !photoLoading &&
                    !photoLoadingMore &&
                    photoHasMore &&
                    el.scrollTop + el.clientHeight >= el.scrollHeight - 160
                  ) {
                    void runPhotoSearch(photoQuery, photoType, photoPage + 1);
                  }
                }}
                className="grid min-h-0 flex-1 auto-rows-max grid-cols-2 gap-2 overflow-y-auto"
              >
                {photoLoading ? (
                  <div className="col-span-full p-6 text-center text-[0.76rem] text-text-muted">
                    <Loader2 size={16} className="mx-auto mb-1 animate-spin" /> Loading...
                  </div>
                ) : (
                  photoResults.map((hit) => {
                    const isBusy = downloadingId === hit.id;
                    return (
                      <div
                        key={hit.id}
                        draggable
                        onDragStart={(e) => {
                          e.dataTransfer.setData(
                            'application/x-uecfi-photo',
                            JSON.stringify({
                              id: hit.id,
                              tags: hit.tags,
                              largeImageURL: hit.largeImageURL,
                              webformatURL: hit.webformatURL
                            })
                          );
                        }}
                        className="flex flex-col overflow-hidden rounded-lg border border-subtle bg-panel-elevated"
                      >
                        <div className="h-20 w-full shrink-0 bg-slate-950">
                          <img
                            src={hit.webformatURL || hit.previewURL}
                            alt={hit.tags}
                            className="h-full w-full object-cover"
                          />
                        </div>
                        <div className="flex gap-[3px] p-1">
                          <button
                            type="button"
                            disabled={Boolean(downloadingId)}
                            onClick={() => void handleUsePhoto(hit, 'layer')}
                            className="flex-1 cursor-pointer rounded-[5px] border-0 bg-blue-600 p-1 text-[0.65rem] font-semibold text-white transition-colors hover:bg-blue-500 disabled:opacity-50"
                          >
                            {isBusy ? '...' : '+ Layer'}
                          </button>
                          <button
                            type="button"
                            disabled={Boolean(downloadingId)}
                            onClick={() => void handleUsePhoto(hit, 'background')}
                            className="flex-1 cursor-pointer rounded-[5px] border border-subtle bg-transparent p-1 text-[0.65rem] font-semibold text-text-primary transition-colors hover:bg-hover disabled:opacity-50"
                          >
                            Set BG
                          </button>
                        </div>
                      </div>
                    );
                  })
                )}
                {photoLoadingMore && (
                  <div className="col-span-full p-2.5 text-center text-[0.72rem] text-text-muted">
                    Loading more...
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
