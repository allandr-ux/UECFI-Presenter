import React, { useEffect, useId, useMemo, useRef, useState } from 'react';
import { Search, Settings2, Sparkles, Upload, X } from 'lucide-react';
import type { BibleLayoutMode, BibleVersion, ProgramItem, SlideBlock } from '../../shared/types';
import { useTerminology } from '../hooks/useTerminology';
import { parseBibleXml } from '../utils/bibleXmlParser';
import { readTextFileWithEncoding } from '../utils/textEncoding';
import { smartSearchBooks } from '../utils/bookSearch';
import { loadImportedBibles, saveImportedBible } from '../utils/bibleStorage';

interface BibleLibraryPanelProps {
  onProjectVerseItem: (item: ProgramItem, startBlockIndex: number) => void;
  onSelectVerseChapter?: (item: ProgramItem) => void;
  onOpenAiSearch?: () => void;
  aiSearchOpen?: boolean;
  liveVerseLabel?: string;
}

/**
 * Smoothly scrolls only the given scroll container so its `[data-selected="true"]`
 * child is vertically centered without shifting outer ancestor containers.
 */
function centerSelectedInContainer(container: HTMLElement | null) {
  if (!container) return;
  const target = container.querySelector<HTMLElement>('[data-selected="true"]');
  if (!target) return;
  const containerRect = container.getBoundingClientRect();
  const targetRect = target.getBoundingClientRect();
  const targetTop =
    container.scrollTop +
    (targetRect.top - containerRect.top) -
    (container.clientHeight - targetRect.height) / 2;
  container.scrollTo({ top: Math.max(0, targetTop), behavior: 'smooth' });
}

const PRIMARY_BIBLE_KEY = 'uecfi_bible_primary_id';
const SECONDARY_BIBLE_KEY = 'uecfi_bible_secondary_id';
const BIBLE_LAYOUT_KEY = 'uecfi_bible_layout';

export const BibleLibraryPanel: React.FC<BibleLibraryPanelProps> = ({
  onProjectVerseItem,
  onSelectVerseChapter,
  onOpenAiSearch,
  aiSearchOpen = false,
  liveVerseLabel
}) => {
  const t = useTerminology();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const modalRef = useRef<HTMLDialogElement>(null);
  const bookScrollRef = useRef<HTMLDivElement>(null);
  const chapterScrollRef = useRef<HTMLDivElement>(null);
  const verseScrollRef = useRef<HTMLDivElement>(null);
  const modalTitleId = useId();

  const [bibles, setBibles] = useState<BibleVersion[]>([]);
  const [primaryId, setPrimaryId] = useState<string>(
    () => localStorage.getItem(PRIMARY_BIBLE_KEY) || ''
  );
  const [secondaryId, setSecondaryId] = useState<string>(
    () => localStorage.getItem(SECONDARY_BIBLE_KEY) ?? ''
  );
  const [layout, setLayout] = useState<BibleLayoutMode>(() => {
    const saved = localStorage.getItem(BIBLE_LAYOUT_KEY);
    return saved === 'primary' || saved === 'secondary' || saved === 'stacked'
      ? saved
      : 'stacked';
  });

  const [bookIndex, setBookIndex] = useState<number>(0);
  const [chapterNum, setChapterNum] = useState<number>(1);
  const [activeVerseNum, setActiveVerseNum] = useState<number | null>(null);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [importError, setImportError] = useState<string | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);

  useEffect(() => {
    const syncBibles = () => {
      loadImportedBibles().then((stored) => {
        setBibles(stored);

        const savedPrimary = localStorage.getItem(PRIMARY_BIBLE_KEY);
        if (savedPrimary && stored.some((b) => b.id === savedPrimary)) {
          setPrimaryId(savedPrimary);
        } else if (stored.length > 0) {
          setPrimaryId(stored[0].id);
        }

        const savedSecondary = localStorage.getItem(SECONDARY_BIBLE_KEY);
        if (savedSecondary !== null) {
          setSecondaryId(stored.some((b) => b.id === savedSecondary) ? savedSecondary : '');
        }
      });
    };

    syncBibles();
    window.addEventListener('uecfi:bibles-updated', syncBibles);
    return () => window.removeEventListener('uecfi:bibles-updated', syncBibles);
  }, []);

  useEffect(() => {
    localStorage.setItem(PRIMARY_BIBLE_KEY, primaryId);
  }, [primaryId]);

  useEffect(() => {
    localStorage.setItem(SECONDARY_BIBLE_KEY, secondaryId);
  }, [secondaryId]);

  useEffect(() => {
    localStorage.setItem(BIBLE_LAYOUT_KEY, layout);
  }, [layout]);

  useEffect(() => {
    const dialog = modalRef.current;
    if (!dialog) return;
    if (settingsOpen && !dialog.open) {
      dialog.showModal();
    } else if (!settingsOpen && dialog.open) {
      dialog.close();
    }
  }, [settingsOpen]);

  const primaryBible = useMemo(
    () => bibles.find((b) => b.id === primaryId) ?? bibles[0],
    [bibles, primaryId]
  );

  const secondaryBible = useMemo(
    () => (secondaryId ? bibles.find((b) => b.id === secondaryId) ?? null : null),
    [bibles, secondaryId]
  );

  const books = primaryBible?.books ?? [];
  const activeBook = books[bookIndex] ?? books[0];
  const chapters = activeBook?.chapters ?? [];
  const activeChapter =
    chapters.find((c) => c.number === chapterNum) ?? chapters[0];

  // Keep active verse synced when navigating verses from the Content Grid or keyboard
  useEffect(() => {
    if (!liveVerseLabel || !activeBook || !activeChapter) return;
    const prefix = `${activeBook.name} ${activeChapter.number}:`;
    if (liveVerseLabel.startsWith(prefix)) {
      const parsedNum = Number.parseInt(liveVerseLabel.slice(prefix.length), 10);
      if (!Number.isNaN(parsedNum)) {
        setActiveVerseNum(parsedNum);
      }
    }
  }, [liveVerseLabel, activeBook?.name, activeChapter?.number]);

  // Keep selected book centered in Column 1
  useEffect(() => {
    centerSelectedInContainer(bookScrollRef.current);
  }, [primaryId, bookIndex]);

  // Keep selected chapter centered in Column 2 (or top on book change)
  useEffect(() => {
    centerSelectedInContainer(chapterScrollRef.current);
  }, [primaryId, bookIndex, activeChapter?.number]);

  // Keep active verse centered in Column 3 (or reset to top when switching chapters with no active verse)
  useEffect(() => {
    if (activeVerseNum !== null) {
      centerSelectedInContainer(verseScrollRef.current);
    } else if (verseScrollRef.current) {
      verseScrollRef.current.scrollTop = 0;
    }
  }, [primaryId, bookIndex, activeChapter?.number, activeVerseNum]);

  const handleImportFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImportError(null);
    try {
      const text = await readTextFileWithEncoding(file, { checkXmlProlog: true });
      const parsed = parseBibleXml(text, file.name);
      await saveImportedBible(parsed);
      setBibles((prev) => [...prev, parsed]);
      setPrimaryId(parsed.id);
      setBookIndex(0);
      setChapterNum(parsed.books[0]?.chapters[0]?.number ?? 1);
      setActiveVerseNum(null);
    } catch (err) {
      setImportError(err instanceof Error ? err.message : 'Failed to import XML Bible.');
    } finally {
      e.target.value = '';
    }
  };

  const buildChapterItem = (
    targetBookIdx = bookIndex,
    targetChapNum = activeChapter?.number ?? 1
  ): ProgramItem | null => {
    const targetBook = books[targetBookIdx] ?? books[0];
    const targetChapter =
      targetBook?.chapters.find((c) => c.number === targetChapNum) ??
      targetBook?.chapters[0];
    if (!primaryBible || !targetBook || !targetChapter) return null;

    // Match secondary book by name first, then by canonical book index (supports multilingual Bibles)
    const secBook = secondaryBible
      ? secondaryBible.books.find(
          (b) => b.name.toLowerCase() === targetBook.name.toLowerCase()
        ) ?? secondaryBible.books[targetBookIdx]
      : null;

    const secChapter = secBook?.chapters.find((c) => c.number === targetChapter.number);
    const effectiveLayout: BibleLayoutMode = secondaryBible ? layout : 'primary';

    const blocks: SlideBlock[] = targetChapter.verses.map((v) => {
      const secVerse = secChapter?.verses.find((sv) => sv.number === v.number);
      return {
        id: `${primaryBible.id}-${targetBook.name}-${targetChapter.number}-${v.number}`,
        label: `${targetBook.name} ${targetChapter.number}:${v.number} (${primaryBible.title})`,
        groupHeader: `${targetBook.name} ${targetChapter.number}`,
        lines: [v.text],
        secondaryLabel:
          secVerse && secondaryBible
            ? `${secBook?.name ?? targetBook.name} ${targetChapter.number}:${v.number} (${secondaryBible.title})`
            : undefined,
        secondaryLines: secVerse ? [secVerse.text] : undefined
      };
    });

    return {
      id: `verse-${Date.now()}`,
      title: `${targetBook.name} ${targetChapter.number}`,
      subtitle: secondaryBible
        ? `${primaryBible.title} + ${secondaryBible.title}`
        : primaryBible.title,
      type: 'verse',
      bibleLayout: effectiveLayout,
      themeBackground: 'linear-gradient(135deg, #0f172a 0%, #064e3b 100%)',
      blocks
    };
  };

  const handleProjectVerse = (verseIdx: number, verseNumber: number) => {
    const item = buildChapterItem();
    if (!item) return;
    setActiveVerseNum(verseNumber);
    onProjectVerseItem(item, verseIdx);
  };

  const filteredBooks = useMemo(
    () => smartSearchBooks(books, searchQuery, bibles),
    [books, searchQuery, bibles]
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0, gap: '6px', padding: '8px' }}>
      {/* Top Bar: Search + Bible Settings Modal Trigger + Add to Program */}
      <div style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (filteredBooks.length > 0) {
              const top = filteredBooks[0];
              setBookIndex(top.idx);
              setChapterNum(top.book.chapters[0]?.number ?? 1);
              setActiveVerseNum(null);
            }
          }}
          style={{ position: 'relative', flex: 1 }}
        >
          <Search
            size={12}
            style={{
              position: 'absolute',
              left: '8px',
              top: '50%',
              transform: 'translateY(-50%)',
              color: 'var(--text-muted)'
            }}
          />
          <input
            type="search"
            value={searchQuery}
            onChange={(e) => {
              const val = e.target.value;
              setSearchQuery(val);
              if (val.trim()) {
                const ranked = smartSearchBooks(books, val, bibles);
                if (ranked.length > 0 && ranked[0].idx !== bookIndex) {
                  setBookIndex(ranked[0].idx);
                  setChapterNum(ranked[0].book.chapters[0]?.number ?? 1);
                  setActiveVerseNum(null);
                }
              }
            }}
            placeholder={t.bible.searchPlaceholder}
            style={{
              width: '100%',
              padding: '5px 8px 5px 26px',
              borderRadius: '6px',
              border: '1px solid var(--border-subtle)',
              background: 'var(--bg-app)',
              color: 'var(--text-primary)',
              fontSize: '0.76rem'
            }}
          />
        </form>

        <button
          type="button"
          onClick={() => setSettingsOpen(true)}
          title={`${t.bible.primaryBible} / ${t.bible.verseLayout}`}
          style={{
            padding: '5px 8px',
            borderRadius: '6px',
            border: '1px solid var(--border-subtle)',
            background: 'var(--bg-panel-elevated)',
            display: 'inline-flex',
            alignItems: 'center',
            gap: '4px',
            fontSize: '0.73rem',
            fontWeight: 600
          }}
        >
          <Settings2 size={13} />
          Bibles
        </button>

        <button
          type="button"
          onClick={() => onOpenAiSearch?.()}
          title="AI Bible Search (Ctrl/Cmd + K)"
          style={{
            padding: '5px 8px',
            borderRadius: '6px',
            border: `1px solid ${aiSearchOpen ? '#f59e0b' : 'rgba(245, 158, 11, 0.45)'}`,
            background: aiSearchOpen ? 'rgba(245, 158, 11, 0.28)' : 'rgba(245, 158, 11, 0.14)',
            color: aiSearchOpen ? '#fef3c7' : '#fcd34d',
            display: 'inline-flex',
            alignItems: 'center',
            gap: '4px',
            fontSize: '0.73rem',
            fontWeight: 600,
            flexShrink: 0,
            whiteSpace: 'nowrap'
          }}
        >
          <Sparkles size={13} />
          AI Search
        </button>
      </div>

      {/* 3-Column Browser: Books | Chapter | Verse */}
      <div
        style={{
          flex: 1,
          minHeight: 0,
          display: 'grid',
          gridTemplateColumns: '1.25fr 0.65fr 1.7fr',
          gap: '1px',
          background: 'var(--border-subtle)',
          border: '1px solid var(--border-subtle)',
          borderRadius: '8px',
          overflow: 'hidden'
        }}
      >
        {/* Column 1: Books */}
        <div style={colWrapperStyle}>
          <div style={colHeaderStyle}>{t.bible.book}s</div>
          <div ref={bookScrollRef} style={colScrollStyle}>
            {filteredBooks.map(({ book: b, idx }) => {
              const selected = idx === bookIndex;
              return (
                <button
                  key={`${b.name}-${idx}`}
                  type="button"
                  data-selected={selected ? 'true' : undefined}
                  onClick={() => {
                    setBookIndex(idx);
                    setChapterNum(b.chapters[0]?.number ?? 1);
                    setActiveVerseNum(null);
                  }}
                  style={colItemBtnStyle(selected)}
                >
                  {b.name}
                </button>
              );
            })}
          </div>
        </div>

        {/* Column 2: Chapter */}
        <div style={colWrapperStyle}>
          <div style={colHeaderStyle}>{t.bible.chapter}</div>
          <div ref={chapterScrollRef} style={colScrollStyle}>
            {chapters.map((c) => {
              const selected = c.number === activeChapter?.number;
              return (
                <button
                  key={c.number}
                  type="button"
                  data-selected={selected ? 'true' : undefined}
                  onClick={() => {
                    setChapterNum(c.number);
                    setActiveVerseNum(null);
                    const item = buildChapterItem(bookIndex, c.number);
                    if (item) onSelectVerseChapter?.(item);
                  }}
                  style={{
                    ...colItemBtnStyle(selected),
                    textAlign: 'center',
                    fontVariantNumeric: 'tabular-nums'
                  }}
                >
                  {c.number}
                </button>
              );
            })}
          </div>
        </div>

        {/* Column 3: Verse */}
        <div style={colWrapperStyle}>
          <div style={colHeaderStyle}>Verse</div>
          <div ref={verseScrollRef} style={colScrollStyle}>
            {activeChapter?.verses.map((v, idx) => {
              const selected = v.number === activeVerseNum;
              return (
                <button
                  key={v.number}
                  type="button"
                  data-selected={selected ? 'true' : undefined}
                  onClick={() => handleProjectVerse(idx, v.number)}
                  style={{
                    ...colItemBtnStyle(selected),
                    display: 'flex',
                    gap: '5px',
                    alignItems: 'flex-start',
                    lineHeight: 1.3
                  }}
                >
                  <span style={{ color: '#60a5fa', fontWeight: 700, flexShrink: 0 }}>
                    {v.number}
                  </span>
                  <span
                    style={{
                      display: '-webkit-box',
                      WebkitLineClamp: 2,
                      WebkitBoxOrient: 'vertical',
                      overflow: 'hidden'
                    }}
                  >
                    {v.text}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Bible Settings Modal (Import XML, Primary/Secondary Bible, Layout) */}
      <dialog
        ref={modalRef}
        aria-labelledby={modalTitleId}
        style={{ maxWidth: '460px', width: 'min(92vw, 460px)' }}
        onClose={() => {
          if (modalRef.current) modalRef.current.returnValue = '';
          setSettingsOpen(false);
        }}
      >
        <div style={{ padding: '20px 22px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h2 id={modalTitleId} style={{ margin: 0, fontSize: '1.05rem', fontWeight: 700 }}>
              {t.contentTypes.verse} — {t.bible.primaryBible} & {t.bible.verseLayout}
            </h2>
            <form method="dialog" style={{ margin: 0 }}>
              <button
                type="submit"
                value="close"
                aria-label={t.editor.cancel}
                style={{
                  background: 'transparent',
                  border: '1px solid var(--border-subtle)',
                  borderRadius: '8px',
                  padding: '6px',
                  display: 'inline-flex'
                }}
              >
                <X size={15} />
              </button>
            </form>
          </div>

          <div>
            <input
              ref={fileInputRef}
              type="file"
              accept=".xml,text/xml,application/xml"
              onChange={handleImportFile}
              style={{ display: 'none' }}
            />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              style={{
                width: '100%',
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '6px',
                padding: '9px 12px',
                borderRadius: '8px',
                border: '1px solid var(--accent)',
                background: 'rgba(59,130,246,0.16)',
                fontSize: '0.84rem',
                fontWeight: 600
              }}
            >
              <Upload size={15} />
              {t.bible.importXml}
            </button>
            {importError && (
              <div style={{ fontSize: '0.76rem', color: '#f87171', marginTop: '6px' }}>
                {importError}
              </div>
            )}
          </div>

          <label style={labelStyle}>
            <span>{t.bible.primaryBible}</span>
            <select
              value={primaryId}
              onChange={(e) => {
                setPrimaryId(e.target.value);
                setBookIndex(0);
                setChapterNum(1);
                setActiveVerseNum(null);
              }}
              style={selectStyle}
            >
              {bibles.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.title}
                </option>
              ))}
            </select>
          </label>

          <label style={labelStyle}>
            <span>{t.bible.secondaryBible}</span>
            <select
              value={secondaryId}
              onChange={(e) => setSecondaryId(e.target.value)}
              style={selectStyle}
            >
              <option value="">{t.bible.none}</option>
              {bibles
                .filter((b) => b.id !== primaryId)
                .map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.title}
                  </option>
                ))}
            </select>
          </label>

          {secondaryBible && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', fontWeight: 600 }}>
                {t.bible.verseLayout}
              </span>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '6px' }}>
                <button
                  type="button"
                  onClick={() => setLayout('primary')}
                  style={layoutBtnStyle(layout === 'primary')}
                >
                  {t.bible.primary}
                </button>
                <button
                  type="button"
                  onClick={() => setLayout('secondary')}
                  style={layoutBtnStyle(layout === 'secondary')}
                >
                  {t.bible.secondary}
                </button>
                <button
                  type="button"
                  onClick={() => setLayout('stacked')}
                  style={layoutBtnStyle(layout === 'stacked')}
                >
                  {t.bible.stacked}
                </button>
              </div>
            </div>
          )}
        </div>
      </dialog>
    </div>
  );
};

const colWrapperStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  minHeight: 0,
  background: 'var(--bg-app)'
};

const colHeaderStyle: React.CSSProperties = {
  padding: '5px 7px',
  fontSize: '0.7rem',
  fontWeight: 700,
  textTransform: 'uppercase',
  letterSpacing: '0.05em',
  color: 'var(--text-muted)',
  background: 'var(--bg-panel)',
  borderBottom: '1px solid var(--border-subtle)',
  flexShrink: 0
};

const colScrollStyle: React.CSSProperties = {
  flex: 1,
  minHeight: 0,
  overflowY: 'auto',
  display: 'flex',
  flexDirection: 'column',
  padding: '3px',
  gap: '2px'
};

function colItemBtnStyle(selected: boolean): React.CSSProperties {
  return {
    textAlign: 'left',
    padding: '5px 6px',
    borderRadius: '5px',
    border: 'none',
    background: selected ? 'rgba(59,130,246,0.22)' : 'transparent',
    color: selected ? '#93c5fd' : 'var(--text-primary)',
    fontSize: '0.75rem',
    fontWeight: selected ? 700 : 400
  };
}

const labelStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: '4px',
  fontSize: '0.76rem',
  color: 'var(--text-secondary)',
  fontWeight: 600
};

const selectStyle: React.CSSProperties = {
  width: '100%',
  padding: '7px 10px',
  borderRadius: '8px',
  border: '1px solid var(--border-subtle)',
  background: 'var(--bg-app)',
  color: 'var(--text-primary)',
  fontSize: '0.84rem'
};

function layoutBtnStyle(active: boolean): React.CSSProperties {
  return {
    padding: '7px 8px',
    borderRadius: '8px',
    border: '1px solid',
    borderColor: active ? 'var(--accent)' : 'var(--border-subtle)',
    background: active ? 'rgba(59,130,246,0.16)' : 'var(--bg-panel-elevated)',
    fontSize: '0.78rem',
    fontWeight: 600
  };
}
