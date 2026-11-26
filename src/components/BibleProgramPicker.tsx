import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Image as ImageIcon, Plus, Save, Trash2 } from 'lucide-react';
import type { BibleLayoutMode, BibleVersion, ProgramItem, SlideBlock } from '../../shared/types';
import { loadImportedBibles } from '../utils/bibleStorage';
import { saveUserMediaFile } from '../utils/mediaUpload';
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
    <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '14px', flex: 1, minHeight: 0 }}>
      {/* TITLE */}
      <label style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
        <span style={sectionLabelStyle}>Title</span>
        <input
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="e.g. Pagbasa ng Banal na Kasulatan"
          autoFocus
          style={{
            width: '100%',
            padding: '9px 12px',
            borderRadius: '8px',
            border: '1px solid var(--border-subtle)',
            background: 'var(--bg-app)',
            color: 'var(--text-primary)',
            fontSize: '0.86rem'
          }}
        />
      </label>

      {/* BACKGROUND THEME PICKER */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
        <span style={sectionLabelStyle}>Background Theme</span>
        <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', alignItems: 'center' }}>
          {THEME_PRESETS.map((preset) => (
            <button
              key={preset.name}
              type="button"
              title={preset.name}
              onClick={() => setThemeBackground(preset.value)}
              style={{
                width: '28px',
                height: '28px',
                borderRadius: '6px',
                background: preset.value,
                border:
                  themeBackground === preset.value
                    ? '2px solid #60a5fa'
                    : '1px solid var(--border-subtle)'
              }}
            />
          ))}
          <BackgroundImagePicker
            value={themeBackground}
            onSelect={setThemeBackground}
          />
        </div>
      </div>

      {/* SCRIPTURE REFERENCES Header + Add Reference Button */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={sectionLabelStyle}>Scripture References</span>
        <button
          type="button"
          onClick={handleAddRow}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '5px',
            padding: '5px 10px',
            borderRadius: '8px',
            border: '1px solid var(--accent)',
            background: 'rgba(59,130,246,0.14)',
            color: '#93c5fd',
            fontSize: '0.78rem',
            fontWeight: 700
          }}
        >
          <Plus size={13} />
          Add Reference
        </button>
      </div>

      {/* Reference Rows */}
      <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '8px' }}>
        {rows.map((row) => {
          const book = books[row.bookIdx] ?? books[0];
          const chapters = book?.chapters ?? [];
          const chap = chapters.find((c) => c.number === row.chapterNum) ?? chapters[0];
          const verses = chap?.verses ?? [];

          return (
            <div
              key={row.id}
              style={{
                display: 'grid',
                gridTemplateColumns: '1.6fr 0.7fr 0.7fr auto 0.7fr auto',
                gap: '8px',
                alignItems: 'center',
                padding: '10px',
                borderRadius: '10px',
                border: '1px solid var(--border-subtle)',
                background: 'var(--bg-panel-elevated)'
              }}
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
                style={selectStyle}
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
                style={selectStyle}
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
                style={selectStyle}
              >
                {verses.map((v) => (
                  <option key={v.number} value={v.number}>
                    {v.number}
                  </option>
                ))}
              </select>

              <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', fontWeight: 600 }}>
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
                style={selectStyle}
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
                style={{
                  background: 'transparent',
                  border: 'none',
                  padding: '5px',
                  color: 'var(--text-secondary)',
                  opacity: rows.length <= 1 ? 0.3 : 1,
                  display: 'inline-flex'
                }}
              >
                <Trash2 size={15} />
              </button>
            </div>
          );
        })}
      </div>

      {/* Submit */}
      <div style={{ display: 'flex', justifyContent: 'flex-end', borderTop: '1px solid var(--border-subtle)', paddingTop: '12px' }}>
        <button
          type="submit"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '6px',
            padding: '8px 16px',
            borderRadius: '8px',
            border: 'none',
            background: 'var(--accent)',
            color: '#fff',
            fontSize: '0.84rem',
            fontWeight: 700
          }}
        >
          {initialItem ? <Save size={15} /> : <Plus size={15} />}
          {initialItem ? 'Save' : 'Add to Program'}
        </button>
      </div>
    </form>
  );
};

const sectionLabelStyle: React.CSSProperties = {
  fontSize: '0.72rem',
  fontWeight: 700,
  textTransform: 'uppercase',
  letterSpacing: '0.06em',
  color: 'var(--text-secondary)'
};

const selectStyle: React.CSSProperties = {
  width: '100%',
  padding: '7px 8px',
  borderRadius: '7px',
  border: '1px solid var(--border-subtle)',
  background: 'var(--bg-app)',
  color: 'var(--text-primary)',
  fontSize: '0.82rem'
};
