import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Check, Clock, FileText, Search, X } from 'lucide-react';
import {
  extractPrimaryFontFamily,
  FONT_CATALOG,
  type FontCategory,
  type FontOption
} from '../fonts';
import { ensureFontLoaded, unloadFontIfUnused } from '../utils/fontLoader';
import { cn } from '../utils/cn';

const RECENT_FONTS_KEY = 'uecfi_recent_fonts_v1';

interface CanvasFontDrawerProps {
  currentFontValue: string;
  documentFontValues: string[];
  onSelectFont: (fontValue: string) => void;
  onClose: () => void;
}

const CATEGORY_TABS: Array<{ id: FontCategory | 'all'; label: string }> = [
  { id: 'all', label: 'All' },
  { id: 'handwriting', label: 'Handwriting' },
  { id: 'sans', label: 'Sans' },
  { id: 'serif', label: 'Serif' },
  { id: 'display', label: 'Display' },
  { id: 'monospace', label: 'Mono' }
];

interface LazyFontRowProps {
  font: FontOption;
  isCurrent: boolean;
  onSelect: (font: FontOption) => void;
  onVisibilityChange: (font: FontOption, visible: boolean) => void;
  scrollRoot: HTMLDivElement | null;
}

const LazyFontRow: React.FC<LazyFontRowProps> = ({
  font,
  isCurrent,
  onSelect,
  onVisibilityChange,
  scrollRoot
}) => {
  const rowRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const el = rowRef.current;
    if (!el || typeof IntersectionObserver === 'undefined') {
      onVisibilityChange(font, true);
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          onVisibilityChange(font, entry.isIntersecting);
        }
      },
      { root: scrollRoot, rootMargin: '80px 0px', threshold: 0.01 }
    );
    observer.observe(el);
    return () => {
      observer.disconnect();
      onVisibilityChange(font, false);
    };
  }, [font, onVisibilityChange, scrollRoot]);

  return (
    <button
      ref={rowRef}
      type="button"
      onClick={() => onSelect(font)}
      className={cn(
        'flex w-full cursor-pointer items-center justify-between rounded-lg border-0 px-2.5 py-2 text-left text-[0.9rem] transition-colors',
        isCurrent
          ? 'bg-violet-500/20 font-semibold text-violet-300'
          : 'bg-transparent text-text-primary hover:bg-hover'
      )}
      style={{ fontFamily: font.value }}
    >
      <span className="truncate">{font.label}</span>
      {isCurrent && <Check size={14} className="shrink-0 text-violet-400" />}
    </button>
  );
};

export const CanvasFontDrawer: React.FC<CanvasFontDrawerProps> = ({
  currentFontValue,
  documentFontValues,
  onSelectFont,
  onClose
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [activeCategory, setActiveCategory] = useState<FontCategory | 'all'>('all');
  const [scrollRoot, setScrollRoot] = useState<HTMLDivElement | null>(null);
  const [, setLoadTick] = useState(0);
  const visibleFamiliesRef = useRef<Set<string>>(new Set());

  const [recentFontValues, setRecentFontValues] = useState<string[]>(() => {
    try {
      const raw = localStorage.getItem(RECENT_FONTS_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as unknown;
        if (Array.isArray(parsed)) {
          return parsed.filter((v): v is string => typeof v === 'string');
        }
      }
    } catch {
      // Ignore malformed storage
    }
    return [];
  });

  const inUseFamilies = useMemo(
    () => new Set(documentFontValues.map((val) => extractPrimaryFontFamily(val))),
    [documentFontValues]
  );

  // Ensure all fonts actively used in the document stay loaded
  useEffect(() => {
    for (const val of documentFontValues) {
      const family = extractPrimaryFontFamily(val);
      const entry = FONT_CATALOG.find((f) => f.family === family);
      if (entry?.googleSpec) {
        void ensureFontLoaded(entry.family, entry.googleSpec).then(() =>
          setLoadTick((n) => n + 1)
        );
      }
    }
  }, [documentFontValues]);

  // Unload any fonts that are neither visible nor used when drawer closes
  useEffect(() => {
    const visibleRef = visibleFamiliesRef;
    return () => {
      visibleRef.current.clear();
      for (const f of FONT_CATALOG) {
        if (f.googleSpec) {
          unloadFontIfUnused(f.family, inUseFamilies, visibleRef.current);
        }
      }
    };
  }, [inUseFamilies]);

  const handleVisibilityChange = React.useCallback(
    (font: FontOption, visible: boolean) => {
      if (!font.googleSpec) return;
      if (visible) {
        visibleFamiliesRef.current.add(font.family);
        void ensureFontLoaded(font.family, font.googleSpec).then(() =>
          setLoadTick((n) => n + 1)
        );
      } else {
        visibleFamiliesRef.current.delete(font.family);
        unloadFontIfUnused(font.family, inUseFamilies, visibleFamiliesRef.current);
      }
    },
    [inUseFamilies]
  );

  const handleChooseFont = (font: FontOption) => {
    if (font.googleSpec) {
      void ensureFontLoaded(font.family, font.googleSpec);
    }
    onSelectFont(font.value);
    setRecentFontValues((prev) => {
      const next = [font.value, ...prev.filter((v) => v !== font.value)].slice(0, 6);
      try {
        localStorage.setItem(RECENT_FONTS_KEY, JSON.stringify(next));
      } catch {
        // Ignore storage errors
      }
      return next;
    });
  };

  const docFonts = useMemo(() => {
    const seen = new Set<string>();
    const list: FontOption[] = [];
    for (const val of documentFontValues) {
      const family = extractPrimaryFontFamily(val);
      if (seen.has(family)) continue;
      seen.add(family);
      const found = FONT_CATALOG.find((f) => f.family === family || f.value === val);
      list.push(
        found ?? {
          label: family,
          family,
          value: val,
          category: 'sans'
        }
      );
    }
    return list;
  }, [documentFontValues]);

  const recentFonts = useMemo(
    () =>
      recentFontValues
        .map((val) => FONT_CATALOG.find((f) => f.value === val))
        .filter((f): f is FontOption => Boolean(f)),
    [recentFontValues]
  );

  const filteredFonts = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return FONT_CATALOG.filter((f) => {
      if (activeCategory !== 'all' && f.category !== activeCategory) return false;
      if (!q) return true;
      return (
        f.label.toLowerCase().includes(q) ||
        f.category.toLowerCase().includes(q) ||
        f.family.toLowerCase().includes(q)
      );
    });
  }, [activeCategory, searchQuery]);

  const currentFamily = extractPrimaryFontFamily(currentFontValue);

  return (
    <div className="flex h-full min-h-0 flex-col gap-2.5">
      <div className="relative">
        <Search
          size={14}
          className="pointer-events-none absolute top-1/2 left-2.5 -translate-y-1/2 text-text-muted"
        />
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder='Try "Handwriting" or "Roboto"'
          className="w-full rounded-[10px] border border-subtle bg-panel-elevated py-2 pr-7 pl-8 text-[0.78rem] text-text-primary outline-none focus:border-violet-500"
        />
        {searchQuery && (
          <button
            type="button"
            onClick={() => setSearchQuery('')}
            className="absolute top-1/2 right-2 -translate-y-1/2 cursor-pointer border-0 bg-transparent text-text-muted hover:text-text-primary"
          >
            <X size={12} />
          </button>
        )}
      </div>

      <div className="no-scrollbar flex gap-1.5 overflow-x-auto pb-0.5">
        {CATEGORY_TABS.map((cat) => {
          const active = activeCategory === cat.id;
          return (
            <button
              key={cat.id}
              type="button"
              onClick={() => setActiveCategory(cat.id)}
              className={cn(
                'shrink-0 cursor-pointer rounded-lg border px-2.5 py-1 text-[0.73rem] font-semibold transition-colors',
                active
                  ? 'border-violet-500 bg-violet-500/20 text-violet-300'
                  : 'border-subtle bg-panel-elevated text-text-secondary hover:text-text-primary'
              )}
            >
              {cat.label}
            </button>
          );
        })}
      </div>

      <div ref={setScrollRoot} className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto pr-0.5">
        {docFonts.length > 0 && !searchQuery && activeCategory === 'all' && (
          <div className="flex flex-col gap-1">
            <div className="flex items-center gap-1.5 text-[0.72rem] font-bold text-text-secondary">
              <FileText size={12} />
              <span>Document fonts</span>
            </div>
            {docFonts.map((font) => (
              <LazyFontRow
                key={`doc-${font.family}`}
                font={font}
                isCurrent={font.family === currentFamily}
                onSelect={handleChooseFont}
                onVisibilityChange={handleVisibilityChange}
                scrollRoot={scrollRoot}
              />
            ))}
          </div>
        )}

        {recentFonts.length > 0 && !searchQuery && activeCategory === 'all' && (
          <div className="flex flex-col gap-1 border-t border-subtle pt-2">
            <div className="flex items-center gap-1.5 text-[0.72rem] font-bold text-text-secondary">
              <Clock size={12} />
              <span>Recently used</span>
            </div>
            {recentFonts.map((font) => (
              <LazyFontRow
                key={`recent-${font.family}`}
                font={font}
                isCurrent={font.family === currentFamily}
                onSelect={handleChooseFont}
                onVisibilityChange={handleVisibilityChange}
                scrollRoot={scrollRoot}
              />
            ))}
          </div>
        )}

        <div className="flex flex-col gap-0.5 border-t border-subtle pt-2">
          <span className="pb-1 text-[0.72rem] font-bold text-text-secondary">
            {activeCategory === 'all' ? 'All fonts' : `${CATEGORY_TABS.find((c) => c.id === activeCategory)?.label} fonts`}
          </span>
          {filteredFonts.map((font) => (
            <LazyFontRow
              key={font.family}
              font={font}
              isCurrent={font.family === currentFamily}
              onSelect={handleChooseFont}
              onVisibilityChange={handleVisibilityChange}
              scrollRoot={scrollRoot}
            />
          ))}
        </div>
      </div>
    </div>
  );
};
