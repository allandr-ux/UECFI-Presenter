import React, { useEffect, useId, useMemo, useRef, useState } from 'react';
import { Search, Settings2, Sparkles, Upload, X } from 'lucide-react';
import type { BibleLayoutMode, BibleVersion, ProgramItem, SlideBlock } from '../../shared/types';
import { useTerminology } from '../hooks/useTerminology';
import { parseBibleXml } from '../utils/bibleXmlParser';
import { readTextFileWithEncoding } from '../utils/textEncoding';
import { smartSearchBooks } from '../utils/bookSearch';
import { loadImportedBibles, saveImportedBible } from '../utils/bibleStorage';
import { notifyBibleSettingsChanged } from '../utils/bibleVerseResolver';
import { cn } from '../utils/cn';

interface BibleLibraryPanelProps {
  onProjectVerseItem: (item: ProgramItem, startBlockIndex: number) => void;
  onSelectVerseChapter?: (item: ProgramItem, highlightBlockIndex?: number) => void;
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
  const [importSuccess, setImportSuccess] = useState<string | null>(null);
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
    notifyBibleSettingsChanged();
  }, [primaryId]);

  useEffect(() => {
    localStorage.setItem(SECONDARY_BIBLE_KEY, secondaryId);
    notifyBibleSettingsChanged();
  }, [secondaryId]);

  useEffect(() => {
    localStorage.setItem(BIBLE_LAYOUT_KEY, layout);
    notifyBibleSettingsChanged();
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

  // Keep selected book, chapter, and active verse synced when live verse changes
  // (whether from Content Grid, keyboard, Program, or Android Verse Selector).
  useEffect(() => {
    if (!liveVerseLabel || books.length === 0) return;
    const cleanLabel = liveVerseLabel.replace(/\s*\([^)]*\)\s*$/, '').trim();
    const match = cleanLabel.match(/^(.+?)\s+(\d+):(\d+)$/);
    if (!match) return;
    const targetBookName = match[1].trim().toLowerCase();
    const parsedChap = Number.parseInt(match[2], 10);
    const parsedVerse = Number.parseInt(match[3], 10);
    if (Number.isNaN(parsedChap) || Number.isNaN(parsedVerse)) return;

    const matchedBookIdx = books.findIndex((b) => b.name.toLowerCase() === targetBookName);
    if (matchedBookIdx >= 0) {
      setBookIndex(matchedBookIdx);
    }
    setChapterNum(parsedChap);
    setActiveVerseNum(parsedVerse);
  }, [liveVerseLabel, books]);

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
    setImportSuccess(null);
    try {
      const text = await readTextFileWithEncoding(file, { checkXmlProlog: true });
      const parsed = parseBibleXml(text, file.name);
      await saveImportedBible(parsed);
      setBibles((prev) => [...prev.filter((b) => b.id !== parsed.id), parsed]);
      if (!primaryId) {
        setPrimaryId(parsed.id);
        setBookIndex(0);
        setChapterNum(parsed.books[0]?.chapters[0]?.number ?? 1);
        setActiveVerseNum(null);
      }
      setImportSuccess(`Imported "${parsed.title}" (${parsed.books.length} books).`);
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
        secondaryLines: secVerse ? [secVerse.text] : undefined,
        verseRef: {
          bookIndex: targetBookIdx,
          chapterNum: targetChapter.number,
          verseNum: v.number
        }
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
      followActiveBible: true,
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
    <div className="flex h-full min-h-0 flex-col gap-1.5 p-2">
      {/* Top Bar: Search + Bible Settings Modal Trigger + Add to Program */}
      <div className="flex items-center gap-1">
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
          className="relative flex-1"
        >
          <Search
            size={12}
            className="pointer-events-none absolute top-1/2 left-2 -translate-y-1/2 text-text-muted"
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
            className="w-full rounded-md border border-subtle bg-app py-[5px] pr-2 pl-[26px] text-[0.76rem] text-text-primary focus:border-accent focus:outline-none"
          />
        </form>

        <button
          type="button"
          onClick={() => setSettingsOpen(true)}
          title={`${t.bible.primaryBible} / ${t.bible.verseLayout}`}
          className="inline-flex items-center gap-1 rounded-md border border-subtle bg-panel-elevated px-2 py-[5px] text-[0.73rem] font-semibold transition-colors hover:bg-hover"
        >
          <Settings2 size={13} />
          Bibles
        </button>

        <button
          type="button"
          onClick={() => onOpenAiSearch?.()}
          title="AI Bible Search (Ctrl/Cmd + K)"
          className={cn(
            'inline-flex shrink-0 items-center gap-1 whitespace-nowrap rounded-md border px-2 py-[5px] text-[0.73rem] font-semibold transition-colors',
            aiSearchOpen
              ? 'border-amber-500 bg-amber-500/28 text-amber-100'
              : 'border-amber-500/45 bg-amber-500/14 text-amber-300 hover:bg-amber-500/22'
          )}
        >
          <Sparkles size={13} />
          AI Search
        </button>
      </div>

      {/* 3-Column Browser: Books | Chapter | Verse */}
      <div className="grid min-h-0 flex-1 grid-cols-[1.25fr_0.65fr_1.7fr] gap-px overflow-hidden rounded-lg border border-subtle bg-subtle">
        {/* Column 1: Books */}
        <div className={COL_WRAPPER_CLS}>
          <div className={COL_HEADER_CLS}>{t.bible.book}s</div>
          <div ref={bookScrollRef} className={COL_SCROLL_CLS}>
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
                  className={colItemBtnCls(selected)}
                >
                  {b.name}
                </button>
              );
            })}
          </div>
        </div>

        {/* Column 2: Chapter */}
        <div className={COL_WRAPPER_CLS}>
          <div className={COL_HEADER_CLS}>{t.bible.chapter}</div>
          <div ref={chapterScrollRef} className={COL_SCROLL_CLS}>
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
                  className={cn(colItemBtnCls(selected), 'text-center tabular-nums')}
                >
                  {c.number}
                </button>
              );
            })}
          </div>
        </div>

        {/* Column 3: Verse */}
        <div className={COL_WRAPPER_CLS}>
          <div className={COL_HEADER_CLS}>Verse</div>
          <div ref={verseScrollRef} className={COL_SCROLL_CLS}>
            {activeChapter?.verses.map((v, idx) => {
              const selected = v.number === activeVerseNum;
              return (
                <button
                  key={v.number}
                  type="button"
                  data-selected={selected ? 'true' : undefined}
                  onClick={() => handleProjectVerse(idx, v.number)}
                  title="Click to present"
                  className={cn(
                    colItemBtnCls(selected),
                    'flex items-start gap-[5px] leading-[1.3]'
                  )}
                >
                  <span className="shrink-0 font-bold text-blue-400">
                    {v.number}
                  </span>
                  <span className="line-clamp-2">
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
        className="w-[min(92vw,460px)] max-w-[460px]"
        onClose={() => {
          if (modalRef.current) modalRef.current.returnValue = '';
          setImportError(null);
          setImportSuccess(null);
          setSettingsOpen(false);
        }}
      >
        <div className="flex flex-col gap-4 px-[22px] py-5">
          <div className="flex items-center justify-between">
            <h2 id={modalTitleId} className="m-0 text-[1.05rem] font-bold">
              {t.contentTypes.verse} — {t.bible.primaryBible} & {t.bible.verseLayout}
            </h2>
            <form method="dialog" className="m-0">
              <button
                type="submit"
                value="close"
                aria-label={t.editor.cancel}
                className="inline-flex rounded-lg border border-subtle bg-transparent p-1.5 transition-colors hover:bg-hover"
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
              className="hidden"
            />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="inline-flex w-full items-center justify-center gap-1.5 rounded-lg border border-accent bg-blue-500/16 px-3 py-[9px] text-[0.84rem] font-semibold transition-colors hover:bg-blue-500/24"
            >
              <Upload size={15} />
              {t.bible.importXml}
            </button>
            {importError && (
              <div className="mt-1.5 text-[0.76rem] text-red-400">
                {importError}
              </div>
            )}
            {importSuccess && (
              <div className="mt-1.5 text-[0.76rem] text-green-400">
                {importSuccess}
              </div>
            )}
          </div>

          <label className={LABEL_CLS}>
            <span>{t.bible.primaryBible}</span>
            <select
              value={primaryId}
              onChange={(e) => {
                setPrimaryId(e.target.value);
                setBookIndex(0);
                setChapterNum(1);
                setActiveVerseNum(null);
              }}
              className={SELECT_CLS}
            >
              {bibles.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.title}
                </option>
              ))}
            </select>
          </label>

          <label className={LABEL_CLS}>
            <span>{t.bible.secondaryBible}</span>
            <select
              value={secondaryId}
              onChange={(e) => setSecondaryId(e.target.value)}
              className={SELECT_CLS}
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
            <div className="flex flex-col gap-1.5">
              <span className="text-[0.75rem] font-semibold text-text-secondary">
                {t.bible.verseLayout}
              </span>
              <div className="grid grid-cols-3 gap-1.5">
                <button
                  type="button"
                  onClick={() => setLayout('primary')}
                  className={layoutBtnCls(layout === 'primary')}
                >
                  {t.bible.primary}
                </button>
                <button
                  type="button"
                  onClick={() => setLayout('secondary')}
                  className={layoutBtnCls(layout === 'secondary')}
                >
                  {t.bible.secondary}
                </button>
                <button
                  type="button"
                  onClick={() => setLayout('stacked')}
                  className={layoutBtnCls(layout === 'stacked')}
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

const COL_WRAPPER_CLS = 'flex min-h-0 flex-col bg-app';

const COL_HEADER_CLS =
  'shrink-0 border-b border-subtle bg-panel px-[7px] py-[5px] text-[0.7rem] font-bold uppercase tracking-[0.05em] text-text-muted';

const COL_SCROLL_CLS = 'flex min-h-0 flex-1 flex-col gap-0.5 overflow-y-auto p-[3px]';

function colItemBtnCls(selected: boolean): string {
  return cn(
    'rounded-[5px] border-0 px-1.5 py-[5px] text-left text-[0.75rem] transition-colors',
    selected
      ? 'bg-blue-500/22 font-bold text-blue-300'
      : 'bg-transparent font-normal text-text-primary hover:bg-hover/60'
  );
}

const LABEL_CLS = 'flex flex-col gap-1 text-[0.76rem] font-semibold text-text-secondary';

const SELECT_CLS =
  'w-full rounded-lg border border-subtle bg-app px-2.5 py-[7px] text-[0.84rem] text-text-primary focus:border-accent focus:outline-none';

function layoutBtnCls(active: boolean): string {
  return cn(
    'rounded-lg border px-2 py-[7px] text-[0.78rem] font-semibold transition-colors',
    active
      ? 'border-accent bg-blue-500/16'
      : 'border-subtle bg-panel-elevated hover:bg-hover'
  );
}
