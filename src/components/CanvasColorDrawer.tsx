import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, Pipette, Plus, Search, X } from 'lucide-react';
import { cn } from '../utils/cn';

export interface CanvasColorDrawerProps {
  title?: string;
  currentColor: string;
  allowGradients?: boolean;
  documentColors: string[];
  onSelectColor: (color: string) => void;
  onClose: () => void;
}

const DEFAULT_SOLIDS: Array<{ hex: string; name: string }> = [
  // Row 1: Grayscale
  { hex: '#000000', name: 'black' },
  { hex: '#545454', name: 'charcoal gray' },
  { hex: '#737373', name: 'dark gray' },
  { hex: '#a6a6a6', name: 'gray' },
  { hex: '#b4b4b4', name: 'silver' },
  { hex: '#d9d9d9', name: 'light gray' },
  { hex: '#ffffff', name: 'white' },
  // Row 2: Warm -> Violet
  { hex: '#ff3131', name: 'red' },
  { hex: '#ff5757', name: 'coral red' },
  { hex: '#ff66c4', name: 'pink' },
  { hex: '#e0aaff', name: 'lavender' },
  { hex: '#cb6ce6', name: 'orchid purple' },
  { hex: '#8c52ff', name: 'violet' },
  { hex: '#5e17eb', name: 'deep purple' },
  // Row 3: Teal -> Navy
  { hex: '#0097b2', name: 'teal' },
  { hex: '#00c4cc', name: 'cyan' },
  { hex: '#5ce1e6', name: 'aqua' },
  { hex: '#38b6ff', name: 'sky blue' },
  { hex: '#5271ff', name: 'indigo blue' },
  { hex: '#004aad', name: 'royal blue' },
  { hex: '#001f7a', name: 'navy blue' },
  // Row 4: Green -> Orange
  { hex: '#00bf63', name: 'emerald green' },
  { hex: '#7ed957', name: 'lime green' },
  { hex: '#c1ff72', name: 'neon lime' },
  { hex: '#ffde59', name: 'yellow' },
  { hex: '#ffbd59', name: 'gold amber' },
  { hex: '#ff914d', name: 'peach orange' },
  { hex: '#ff6b00', name: 'orange' }
];

// Full 7-column spectrum matrix (dark -> bright -> pastel) for "See all" solid colors
const SOLID_MATRIX_ROWS: string[][] = [
  ['#03045e', '#001489', '#0029b8', '#0040e6', '#3366ff', '#668cff', '#b3c6ff'],
  ['#10002b', '#240046', '#3c096c', '#5a189a', '#7b2cbf', '#9d4edd', '#c77dff'],
  ['#2b0030', '#4a0054', '#6b007a', '#8f00a3', '#b833cc', '#d470e3', '#ebb3f5'],
  ['#3d001e', '#660033', '#99004d', '#cc0066', '#ff3399', '#ff80bf', '#ffcce6'],
  ['#3d0000', '#660000', '#990000', '#cc0000', '#ff3333', '#ff7070', '#ffb3b3'],
  ['#3d1400', '#702500', '#a33600', '#d64700', '#ff6b1a', '#ff9966', '#ffd1b3'],
  ['#3d2400', '#6e4100', '#a36000', '#d98000', '#ff9f1a', '#ffbe66', '#ffe0b3'],
  ['#3b3200', '#6b5b00', '#9c8500', '#cfb100', '#ffd91a', '#ffe666', '#fff2b3'],
  ['#1f3300', '#3a5e00', '#548a00', '#70b800', '#8fe600', '#b7f266', '#dfffb3'],
  ['#003314', '#005e25', '#008a37', '#00b84a', '#00e65c', '#66f29e', '#b3ffd1'],
  ['#003329', '#005c4a', '#00876d', '#00b391', '#00deb4', '#66ebd0', '#b3f7e9'],
  ['#002b36', '#004f63', '#007391', '#0099bf', '#1ac6f0', '#66d9f5', '#b3ecfa'],
  ['#001d3d', '#003566', '#004e98', '#0068c9', '#338fff', '#75b5ff', '#badbff'],
  ['#0f172a', '#1e293b', '#334155', '#475569', '#64748b', '#94a3b8', '#cbd5e1']
];

const GRADIENT_SECTIONS: Array<{
  id: string;
  label: string;
  items: Array<{ css: string; name: string }>;
}> = [
  {
    id: 'cool',
    label: 'Cool tones',
    items: [
      { css: 'linear-gradient(135deg, #2563eb 0%, #2dd4bf 100%)', name: 'ocean cool' },
      { css: 'linear-gradient(135deg, #1e1b4b 0%, #1d4ed8 100%)', name: 'midnight blue' },
      { css: 'linear-gradient(135deg, #0f766e 0%, #22d3ee 100%)', name: 'lagoon teal' },
      { css: 'linear-gradient(135deg, #38bdf8 0%, #34d399 100%)', name: 'mint sky' },
      { css: 'linear-gradient(135deg, #94a3b8 0%, #e2e8f0 100%)', name: 'frost mist' },
      { css: 'linear-gradient(135deg, #60a5fa 0%, #bfdbfe 100%)', name: 'soft sky' },
      { css: 'linear-gradient(135deg, #6366f1 0%, #38bdf8 100%)', name: 'electric indigo' }
    ]
  },
  {
    id: 'warm',
    label: 'Warm tones',
    items: [
      { css: 'linear-gradient(135deg, #fb7185 0%, #fdba74 100%)', name: 'coral sunset' },
      { css: 'linear-gradient(135deg, #831843 0%, #db2777 100%)', name: 'berry wine' },
      { css: 'linear-gradient(135deg, #7c2d12 0%, #c2410c 100%)', name: 'terracotta' },
      { css: 'linear-gradient(135deg, #f97316 0%, #facc15 100%)', name: 'amber sun' },
      { css: 'linear-gradient(135deg, #9a3412 0%, #fb923c 100%)', name: 'copper glow' },
      { css: 'linear-gradient(135deg, #ec4899 0%, #f472b6 100%)', name: 'rose pink' },
      { css: 'linear-gradient(135deg, #a855f7 0%, #f97316 100%)', name: 'sunset purple' }
    ]
  },
  {
    id: 'mono',
    label: 'Monochromatic',
    items: [
      { css: 'linear-gradient(135deg, #27272a 0%, #52525b 100%)', name: 'slate dark' },
      { css: 'linear-gradient(135deg, #71717a 0%, #d4d4d8 100%)', name: 'silver ash' },
      { css: 'linear-gradient(135deg, #e7e5e4 0%, #fafaf9 100%)', name: 'warm ivory' },
      { css: 'linear-gradient(135deg, #cbd5e1 0%, #ffffff 100%)', name: 'pearl white' },
      { css: 'linear-gradient(135deg, #94a3b8 0%, #e2e8f0 100%)', name: 'cool gray' },
      { css: 'linear-gradient(135deg, #334155 0%, #64748b 100%)', name: 'steel slate' },
      { css: 'linear-gradient(135deg, #090d16 0%, #1e293b 100%)', name: 'obsidian' }
    ]
  },
  {
    id: 'all',
    label: 'All gradients',
    items: [
      { css: 'linear-gradient(135deg, #0f172a 0%, #334155 100%)', name: 'night slate' },
      { css: 'linear-gradient(135deg, #4b5563 0%, #e5e7eb 100%)', name: 'smoke' },
      { css: 'linear-gradient(135deg, #84cc16 0%, #bef264 100%)', name: 'lime' },
      { css: 'linear-gradient(135deg, #422006 0%, #ca8a04 100%)', name: 'bronze gold' },
      { css: 'linear-gradient(135deg, #7e22ce 0%, #facc15 100%)', name: 'royal gold' },
      { css: 'linear-gradient(135deg, #020617 0%, #1e3a8a 100%)', name: 'deep navy' },
      { css: 'linear-gradient(135deg, #d1fae5 0%, #93c5fd 100%)', name: 'mint blue' },
      { css: 'linear-gradient(135deg, #ef4444 0%, #f97316 100%)', name: 'flame' },
      { css: 'linear-gradient(135deg, #f43f5e 0%, #8b5cf6 100%)', name: 'neon berry' },
      { css: 'linear-gradient(135deg, #6366f1 0%, #ec4899 100%)', name: 'vivid violet' },
      { css: 'linear-gradient(135deg, #1d4ed8 0%, #a855f7 100%)', name: 'cobalt purple' },
      { css: 'linear-gradient(135deg, #7c3aed 0%, #2dd4bf 100%)', name: 'aurora' },
      { css: 'linear-gradient(135deg, #06b6d4 0%, #1d4ed8 100%)', name: 'deep sea' },
      { css: 'linear-gradient(135deg, #6366f1 0%, #10b981 100%)', name: 'emerald dusk' },
      { css: 'linear-gradient(135deg, #0d9488 0%, #22c55e 100%)', name: 'jade' },
      { css: 'linear-gradient(135deg, #06b6d4 0%, #eab308 100%)', name: 'tropical' },
      { css: 'linear-gradient(135deg, #fb923c 0%, #fde047 100%)', name: 'marigold' },
      { css: 'linear-gradient(135deg, #f472b6 0%, #fde047 100%)', name: 'peach sorbet' },
      { css: 'linear-gradient(135deg, #fef08a 0%, #f9a8d4 100%)', name: 'pastel dawn' },
      { css: 'linear-gradient(135deg, #8b5cf6 0%, #fb923c 100%)', name: 'twilight' },
      { css: 'linear-gradient(90deg, #b45309 0%, #fde68a 50%, #b45309 100%)', name: 'metallic gold' }
    ]
  }
];

function extractFirstHex(color: string): string {
  const m = color.match(/#[0-9a-fA-F]{6}/);
  return m ? m[0] : '#38bdf8';
}

export const CanvasColorDrawer: React.FC<CanvasColorDrawerProps> = ({
  title = 'Color',
  currentColor,
  allowGradients = false,
  documentColors,
  onSelectColor,
  onClose
}) => {
  const [search, setSearch] = useState('');
  const [subView, setSubView] = useState<'main' | 'solids' | 'gradients'>('main');
  const nativeColorRef = useRef<HTMLInputElement | null>(null);
  const [hexDraft, setHexDraft] = useState(() => extractFirstHex(currentColor));

  useEffect(() => {
    setHexDraft(extractFirstHex(currentColor));
  }, [currentColor]);

  const q = search.trim().toLowerCase();

  const filteredSolids = useMemo(() => {
    if (!q) return DEFAULT_SOLIDS;
    return DEFAULT_SOLIDS.filter((c) => c.name.includes(q) || c.hex.toLowerCase().includes(q));
  }, [q]);

  const filteredGradients = useMemo(() => {
    const all = GRADIENT_SECTIONS.flatMap((s) => s.items);
    if (!q) return GRADIENT_SECTIONS.find((s) => s.id === 'all')?.items ?? all;
    return all.filter((g) => g.name.includes(q));
  }, [q]);

  const handleEyeDropper = async () => {
    try {
      const EyeDropperCtor = (
        window as unknown as { EyeDropper?: new () => { open: () => Promise<{ sRGBHex: string }> } }
      ).EyeDropper;
      if (!EyeDropperCtor) {
        nativeColorRef.current?.click();
        return;
      }
      const dropper = new EyeDropperCtor();
      const res = await dropper.open();
      if (res?.sRGBHex) {
        setHexDraft(res.sRGBHex);
        onSelectColor(res.sRGBHex);
      }
    } catch {
      // Cancelled by user
    }
  };

  const renderSwatch = (value: string, label: string, key: string) => {
    const isActive = currentColor.toLowerCase() === value.toLowerCase();
    return (
      <button
        key={key}
        type="button"
        title={label}
        onClick={() => onSelectColor(value)}
        className={cn(
          'h-7 w-7 cursor-pointer rounded-full border p-0 transition-transform hover:scale-110',
          isActive
            ? 'border-2 border-violet-500 ring-2 ring-violet-400/40'
            : 'border-white/20'
        )}
        style={{ background: value }}
      />
    );
  };

  return (
    <div className="flex h-full min-h-0 flex-col gap-3">
      {/* Header */}
      <div className="flex shrink-0 items-center justify-between">
        {subView !== 'main' ? (
          <button
            type="button"
            onClick={() => setSubView('main')}
            className="inline-flex cursor-pointer items-center gap-1.5 border-0 bg-transparent p-0 text-[0.84rem] font-bold text-text-primary hover:text-white"
          >
            <ArrowLeft size={15} />
            <span>
              {subView === 'solids' ? 'Default solid colors' : 'Default gradient colors'}
            </span>
          </button>
        ) : (
          <span className="text-[0.86rem] font-bold text-text-primary">{title}</span>
        )}
        <button
          type="button"
          onClick={onClose}
          aria-label="Close color picker"
          className="cursor-pointer rounded-md border-0 bg-transparent p-1 text-text-muted hover:bg-hover hover:text-text-primary"
        >
          <X size={15} />
        </button>
      </div>

      {/* Search */}
      {subView === 'main' && (
        <div className="relative flex shrink-0 items-center">
          <Search size={14} className="pointer-events-none absolute left-2.5 text-text-muted" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder='Try "blue" or "#00c4cc"'
            className="w-full rounded-[10px] border border-subtle bg-app py-1.5 pr-7 pl-8 text-[0.78rem] text-text-primary focus:border-accent focus:outline-none"
          />
          {search && (
            <button
              type="button"
              onClick={() => setSearch('')}
              className="absolute right-2 cursor-pointer border-0 bg-transparent p-0.5 text-text-muted hover:text-text-primary"
            >
              <X size={12} />
            </button>
          )}
        </div>
      )}

      {/* Scrollable Content */}
      <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto pr-0.5">
        {subView === 'solids' ? (
          <div className="flex flex-col gap-1.5">
            {SOLID_MATRIX_ROWS.map((row, rIdx) => (
              <div key={rIdx} className="grid grid-cols-7 gap-1.5">
                {row.map((hex) => renderSwatch(hex, hex, hex))}
              </div>
            ))}
          </div>
        ) : subView === 'gradients' ? (
          <div className="flex flex-col gap-4">
            {GRADIENT_SECTIONS.map((sec) => (
              <div key={sec.id} className="flex flex-col gap-1.5">
                <span className="text-[0.74rem] font-semibold text-text-secondary">
                  {sec.label}
                </span>
                <div className="grid grid-cols-7 gap-1.5">
                  {sec.items.map((g, i) => renderSwatch(g.css, g.name, `${sec.id}-${i}`))}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <>
            {/* Custom Color + Eyedropper + Document Colors */}
            <div className="flex flex-col gap-2">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  title="Pick custom color"
                  onClick={() => nativeColorRef.current?.click()}
                  className="flex h-7 w-7 cursor-pointer items-center justify-center rounded-full border border-white/25 p-0 text-slate-900 shadow-sm transition-transform hover:scale-110"
                  style={{
                    background:
                      'conic-gradient(from 0deg, #ff3b30, #ff9500, #ffcc00, #34c759, #00c7be, #007aff, #af52de, #ff3b30)'
                  }}
                >
                  <span className="flex h-4 w-4 items-center justify-center rounded-full bg-white text-slate-900">
                    <Plus size={11} strokeWidth={2.5} />
                  </span>
                </button>
                <input
                  ref={nativeColorRef}
                  type="color"
                  value={extractFirstHex(currentColor)}
                  onChange={(e) => {
                    setHexDraft(e.target.value);
                    onSelectColor(e.target.value);
                  }}
                  className="sr-only"
                />

                <button
                  type="button"
                  title="Eyedropper"
                  onClick={() => void handleEyeDropper()}
                  className="flex h-7 w-7 cursor-pointer items-center justify-center rounded-full border border-subtle bg-panel-elevated text-text-primary transition-colors hover:bg-hover"
                >
                  <Pipette size={13} />
                </button>

                <input
                  type="text"
                  aria-label="Hex color"
                  value={hexDraft}
                  onChange={(e) => {
                    const val = e.target.value;
                    setHexDraft(val);
                    if (/^#[0-9a-fA-F]{6}$/.test(val)) {
                      onSelectColor(val);
                    }
                  }}
                  className="w-24 rounded-lg border border-subtle bg-app px-2 py-1 font-mono text-[0.74rem] text-text-primary focus:border-accent focus:outline-none"
                />
              </div>

              {documentColors.length > 0 && (
                <div className="flex flex-col gap-1.5 pt-1">
                  <span className="text-[0.73rem] font-semibold text-text-secondary">
                    Colors in this design
                  </span>
                  <div className="grid grid-cols-7 gap-1.5">
                    {documentColors.slice(0, 14).map((c, idx) => renderSwatch(c, c, `doc-${idx}`))}
                  </div>
                </div>
              )}
            </div>

            {/* Default Solid Colors */}
            <div className="flex flex-col gap-1.5">
              <div className="flex items-center justify-between">
                <span className="text-[0.76rem] font-bold text-text-primary">
                  Default solid colors
                </span>
                {!q && (
                  <button
                    type="button"
                    onClick={() => setSubView('solids')}
                    className="cursor-pointer border-0 bg-transparent text-[0.72rem] font-semibold text-violet-400 hover:underline"
                  >
                    See all
                  </button>
                )}
              </div>
              <div className="grid grid-cols-7 gap-1.5">
                {filteredSolids.map((c) => renderSwatch(c.hex, `${c.name} (${c.hex})`, c.hex))}
              </div>
            </div>

            {/* Default Gradient Colors */}
            {allowGradients && (
              <div className="flex flex-col gap-1.5">
                <div className="flex items-center justify-between">
                  <span className="text-[0.76rem] font-bold text-text-primary">
                    Default gradient colors
                  </span>
                  {!q && (
                    <button
                      type="button"
                      onClick={() => setSubView('gradients')}
                      className="cursor-pointer border-0 bg-transparent text-[0.72rem] font-semibold text-violet-400 hover:underline"
                    >
                      See all
                    </button>
                  )}
                </div>
                <div className="grid grid-cols-7 gap-1.5">
                  {filteredGradients.map((g, idx) =>
                    renderSwatch(g.css, g.name, `grad-${idx}`)
                  )}
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
};
