import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Image as ImageIcon, Plus, Save, Trash2 } from 'lucide-react';
import type { BibleLayoutMode, BibleVersion, ProgramItem, SlideBlock } from '../../shared/types';
import { loadImportedBibles } from '../utils/bibleStorage';
import { saveUserMediaFile } from '../utils/mediaUpload';
import { cn } from '../utils/cn';
import { BackgroundImagePicker } from './BackgroundImagePicker';

interface BibleProgramPickerProps {
  initialItem?: ProgramItem | null;
  onAddReferences: (item: ProgramItem) => void;
}

interface ReferenceRow {
  id: string;
  bookIdx: number;
  chapterNum: number;
  startVerse: number;
  endVerse: number;
}

const THEME_PRESETS = [
  { name: 'Deep Navy', value: 'linear-gradient(135deg, #0f172a 0%, #1e3a8a 100%)' },
  { name: 'Royal Indigo', value: 'linear-gradient(135deg, #1e1b4b 0%, #312e81 100%)' },
  { name: 'Sanctuary Emerald', value: 'linear-gradient(135deg, #0f172a 0%, #064e3b 100%)' },
  { name: 'Midnight Slate', value: 'linear-gradient(135deg, #090d16 0%, #1e293b 100%)' },
  { name: 'Warm Crimson', value: 'linear-gradient(135deg, #1f1018 0%, #7f1d1d 100%)' }
];

const PRIMARY_BIBLE_KEY = 'uecfi_bible_primary_id';
const SECONDARY_BIBLE_KEY = 'uecfi_bible_secondary_id';
const BIBLE_LAYOUT_KEY = 'uecfi_bible_layout';

function parseRowsFromBlocks(blocks: SlideBlock[], books: BibleVersion['books']): ReferenceRow[] {
  if (blocks.length === 0 || books.length === 0) {
    return [{ id: `ref-${Date.now()}`, bookIdx: 0, chapterNum: 1, startVerse: 1, endVerse: 1 }];
  }

  const rows: ReferenceRow[] = [];
  for (const blk of blocks) {
    const cleanLabel = (blk.label ?? '').replace(/\s*\([^)]*\)\s*$/, '').trim();
    const match = cleanLabel.match(/^(.+?)\s+(\d+):(\d+)$/);
    if (!match) continue;
    const bookName = match[1].trim().toLowerCase();
    const chapNum = Number.parseInt(match[2], 10);
    const verseNum = Number.parseInt(match[3], 10);

    let bIdx = books.findIndex((b) => b.name.toLowerCase() === bookName);
    if (bIdx < 0) bIdx = 0;

    const last = rows[rows.length - 1];
    if (
      last &&
      last.bookIdx === bIdx &&
      last.chapterNum === chapNum &&
      verseNum === last.endVerse + 1
    ) {
      last.endVerse = verseNum;
    } else {
      rows.push({
        id: `ref-${Date.now()}-${rows.length}`,
        bookIdx: bIdx,
        chapterNum: chapNum,
        startVerse: verseNum,
        endVerse: verseNum
      });
    }
  }

  return rows.length > 0
    ? rows
    : [{ id: `ref-${Date.now()}`, bookIdx: 0, chapterNum: 1, startVerse: 1, endVerse: 1 }];
}

export const BibleProgramPicker: React.FC<BibleProgramPickerProps> = ({
  initialItem = null,
  onAddReferences
}) => {
  const bgFileRef = useRef<HTMLInputElement>(null);

  const [bibles, setBibles] = useState<BibleVersion[]>([]);
  const [primaryId, setPrimaryId] = useState<string>(
    () => localStorage.getItem(PRIMARY_BIBLE_KEY) || ''
  );
  const [secondaryId, setSecondaryId] = useState<string>(
    () => localStorage.getItem(SECONDARY_BIBLE_KEY) ?? ''
  );
  const [layout] = useState<BibleLayoutMode>(() => {
    const saved = localStorage.getItem(BIBLE_LAYOUT_KEY);
    return saved === 'primary' || saved === 'secondary' || saved === 'stacked'
      ? saved
      : 'stacked';
  });

  const [title, setTitle] = useState(initialItem?.title ?? '');
  const [themeBackground, setThemeBackground] = useState(
    initialItem?.themeBackground ?? THEME_PRESETS[2].value
  );
  const [rows, setRows] = useState<ReferenceRow[]>([
    { id: `ref-${Date.now()}`, bookIdx: 0, chapterNum: 1, startVerse: 1, endVerse: 1 }
  ]);

  useEffect(() => {
    loadImportedBibles().then((stored) => {
      setBibles(stored);

      const savedPrimary = localStorage.getItem(PRIMARY_BIBLE_KEY);
      let resolvedPrimaryId = stored[0]?.id ?? '';
      if (savedPrimary && stored.some((b) => b.id === savedPrimary)) {
        resolvedPrimaryId = savedPrimary;
      }
      setPrimaryId(resolvedPrimaryId);

      const savedSecondary = localStorage.getItem(SECONDARY_BIBLE_KEY);
      if (savedSecondary !== null) {
        setSecondaryId(stored.some((b) => b.id === savedSecondary) ? savedSecondary : '');
      }

      if (initialItem) {
        const pBible = stored.find((b) => b.id === resolvedPrimaryId) ?? stored[0];
        setRows(parseRowsFromBlocks(initialItem.blocks, pBible?.books ?? []));
      }
    });
  }, [initialItem]);

  useEffect(() => {
    if (initialItem) {
      setTitle(initialItem.title);
      setThemeBackground(initialItem.themeBackground ?? THEME_PRESETS[2].value);
    } else {
      setTitle('');
      setThemeBackground(THEME_PRESETS[2].value);
      setRows([{ id: `ref-${Date.now()}`, bookIdx: 0, chapterNum: 1, startVerse: 1, endVerse: 1 }]);
    }
  }, [initialItem]);

  const primaryBible = useMemo(
    () => bibles.find((b) => b.id === primaryId) ?? bibles[0],
    [bibles, primaryId]
  );

  const secondaryBible = useMemo(
    () => (secondaryId ? bibles.find((b) => b.id === secondaryId) ?? null : null),
    [bibles, secondaryId]
  );

  const books = primaryBible?.books ?? [];

  const handleAddRow = () => {
    const firstChap = books[0]?.chapters[0];
    setRows((prev) => [
      ...prev,
      {
        id: `ref-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        bookIdx: 0,
        chapterNum: firstChap?.number ?? 1,
        startVerse: firstChap?.verses[0]?.number ?? 1,
        endVerse: firstChap?.verses[0]?.number ?? 1
      }
    ]);
  };

  const updateRow = (id: string, patch: Partial<ReferenceRow>) => {
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  };

  const removeRow = (id: string) => {
    setRows((prev) => (prev.length > 1 ? prev.filter((r) => r.id !== id) : prev));
  };

  const handleBackgroundImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    const mediaUrl = await saveUserMediaFile(file);
    setThemeBackground(`url("${mediaUrl}") center / cover no-repeat`);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!primaryBible || books.length === 0) return;

    const blocks: SlideBlock[] = [];
    const refSummaries: string[] = [];

    for (const row of rows) {
      const book = books[row.bookIdx] ?? books[0];
      const chap = book?.chapters.find((c) => c.number === row.chapterNum) ?? book?.chapters[0];
      if (!book || !chap) continue;

      const minV = Math.min(row.startVerse, row.endVerse);
      const maxV = Math.max(row.startVerse, row.endVerse);
      const groupRef =
        minV === maxV
          ? `${book.name} ${chap.number}:${minV}`
          : `${book.name} ${chap.number}:${minV}-${maxV}`;
      refSummaries.push(groupRef);

      const secBook = secondaryBible
        ? secondaryBible.books.find(
            (b) => b.name.toLowerCase() === book.name.toLowerCase()
          ) ?? secondaryBible.books[row.bookIdx]
        : null;
      const secChap = secBook?.chapters.find((c) => c.number === chap.number);

      for (const v of chap.verses) {
        if (v.number >= minV && v.number <= maxV) {
          const secVerse = secChap?.verses.find((sv) => sv.number === v.number);
          blocks.push({
            id: `${primaryBible.id}-${book.name}-${chap.number}-${v.number}-${blocks.length}`,
            label: `${book.name} ${chap.number}:${v.number} (${primaryBible.title})`,
            groupHeader: groupRef,
            lines: [v.text],
            secondaryLabel:
              secVerse && secondaryBible
                ? `${secBook?.name ?? book.name} ${chap.number}:${v.number} (${secondaryBible.title})`
                : undefined,
            secondaryLines: secVerse ? [secVerse.text] : undefined,
            verseRef: {
              bookIndex: row.bookIdx,
              chapterNum: chap.number,
              verseNum: v.number
            }
          });
        }
      }
    }

    if (blocks.length === 0) return;

    // Preserve existing verse quick-settings (colors, dimming, stacked background, font size) when editing.
    onAddReferences({
      ...(initialItem ?? {}),
      id: initialItem?.id ?? `prog-verse-${Date.now()}`,
      title: title.trim() || refSummaries.join('; ') || 'Scripture Reading',
      subtitle: secondaryBible
        ? `${primaryBible.title} + ${secondaryBible.title}`
        : primaryBible.title,
      type: 'verse',
      bibleLayout: initialItem?.bibleLayout ?? (secondaryBible ? layout : 'primary'),
      followActiveBible: initialItem?.followActiveBible ?? true,
      verseMaxFontSize: initialItem?.verseMaxFontSize,
      themeBackground,
      blocks
    });
  };

  return (
    <form onSubmit={handleSubmit} className="flex min-h-0 flex-1 flex-col gap-3.5">
      {/* TITLE */}
      <label className="flex flex-col gap-1.5">
        <span className={SECTION_LABEL_CLS}>Title</span>
        <input
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="e.g. Pagbasa ng Banal na Kasulatan"
          autoFocus
          className="w-full rounded-lg border border-subtle bg-app px-3 py-[9px] text-[0.86rem] text-text-primary focus:border-accent focus:outline-none"
        />
      </label>

      {/* BACKGROUND THEME PICKER */}
      <div className="flex flex-col gap-1.5">
        <span className={SECTION_LABEL_CLS}>Background Theme</span>
        <div className="flex flex-wrap items-center gap-1.5">
          {THEME_PRESETS.map((preset) => (
            <button
              key={preset.name}
              type="button"
              title={preset.name}
              onClick={() => setThemeBackground(preset.value)}
              className={cn(
                'h-7 w-7 rounded-md',
                themeBackground === preset.value
                  ? 'border-2 border-blue-400'
                  : 'border border-subtle'
              )}
              style={{ background: preset.value }}
            />
          ))}
          <BackgroundImagePicker
            value={themeBackground}
            onSelect={setThemeBackground}
          />
        </div>
      </div>

      {/* SCRIPTURE REFERENCES Header + Add Reference Button */}
      <div className="flex items-center justify-between">
        <span className={SECTION_LABEL_CLS}>Scripture References</span>
        <button
          type="button"
          onClick={handleAddRow}
          className="inline-flex items-center gap-[5px] rounded-lg border border-accent bg-blue-500/14 px-2.5 py-[5px] text-[0.78rem] font-bold text-blue-300 transition-colors hover:bg-blue-500/24"
        >
          <Plus size={13} />
          Add Reference
        </button>
      </div>

      {/* Reference Rows */}
      <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto">
        {rows.map((row) => {
          const book = books[row.bookIdx] ?? books[0];
          const chapters = book?.chapters ?? [];
          const chap = chapters.find((c) => c.number === row.chapterNum) ?? chapters[0];
          const verses = chap?.verses ?? [];

          return (
            <div
              key={row.id}
              className="grid grid-cols-[1.6fr_0.7fr_0.7fr_auto_0.7fr_auto] items-center gap-2 rounded-[10px] border border-subtle bg-panel-elevated p-2.5"
            >
              {/* Book */}
              <select
                aria-label="Book"
                value={row.bookIdx}
                onChange={(e) => {
                  const nextBookIdx = Number(e.target.value);
                  const nextBook = books[nextBookIdx];
                  const nextChap = nextBook?.chapters[0];
                  const firstV = nextChap?.verses[0]?.number ?? 1;
                  updateRow(row.id, {
                    bookIdx: nextBookIdx,
                    chapterNum: nextChap?.number ?? 1,
                    startVerse: firstV,
                    endVerse: firstV
                  });
                }}
                className={SELECT_CLS}
              >
                {books.map((b, idx) => (
                  <option key={`${b.name}-${idx}`} value={idx}>
                    {b.name}
                  </option>
                ))}
              </select>

              {/* Chapter */}
              <select
                aria-label="Chapter"
                value={chap?.number ?? 1}
                onChange={(e) => {
                  const nextChapNum = Number(e.target.value);
                  const nextChap = chapters.find((c) => c.number === nextChapNum);
                  const firstV = nextChap?.verses[0]?.number ?? 1;
                  updateRow(row.id, {
                    chapterNum: nextChapNum,
                    startVerse: firstV,
                    endVerse: firstV
                  });
                }}
                className={SELECT_CLS}
              >
                {chapters.map((c) => (
                  <option key={c.number} value={c.number}>
                    {c.number}
                  </option>
                ))}
              </select>

              {/* Start Verse */}
              <select
                aria-label="Start Verse"
                value={row.startVerse}
                onChange={(e) => {
                  const nextStart = Number(e.target.value);
                  updateRow(row.id, {
                    startVerse: nextStart,
                    endVerse: Math.max(nextStart, row.endVerse)
                  });
                }}
                className={SELECT_CLS}
              >
                {verses.map((v) => (
                  <option key={v.number} value={v.number}>
                    {v.number}
                  </option>
                ))}
              </select>

              <span className="text-[0.8rem] font-semibold text-text-secondary">
                to
              </span>

              {/* End Verse */}
              <select
                aria-label="End Verse"
                value={row.endVerse}
                onChange={(e) => {
                  const nextEnd = Number(e.target.value);
                  updateRow(row.id, {
                    endVerse: Math.max(row.startVerse, nextEnd)
                  });
                }}
                className={SELECT_CLS}
              >
                {verses
                  .filter((v) => v.number >= row.startVerse)
                  .map((v) => (
                    <option key={v.number} value={v.number}>
                      {v.number}
                    </option>
                  ))}
              </select>

              {/* Remove Row */}
              <button
                type="button"
                disabled={rows.length <= 1}
                onClick={() => removeRow(row.id)}
                title="Remove reference"
                className={cn(
                  'inline-flex border-0 bg-transparent p-[5px] text-text-secondary transition-colors hover:text-text-primary',
                  rows.length <= 1 ? 'opacity-30' : 'opacity-100'
                )}
              >
                <Trash2 size={15} />
              </button>
            </div>
          );
        })}
      </div>

      {/* Submit */}
      <div className="flex justify-end border-t border-subtle pt-3">
        <button
          type="submit"
          className="inline-flex items-center gap-1.5 rounded-lg border-0 bg-accent px-4 py-2 text-[0.84rem] font-bold text-white transition-colors hover:bg-accent-hover"
        >
          {initialItem ? <Save size={15} /> : <Plus size={15} />}
          {initialItem ? 'Save' : 'Add to Program'}
        </button>
      </div>
    </form>
  );
};

const SECTION_LABEL_CLS =
  'text-[0.72rem] font-bold uppercase tracking-[0.06em] text-text-secondary';

const SELECT_CLS =
  'w-full rounded-[7px] border border-subtle bg-app px-2 py-[7px] text-[0.82rem] text-text-primary focus:border-accent focus:outline-none';
