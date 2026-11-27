import React, { useEffect, useId, useRef, useState } from 'react';
import { Clock, Image as ImageIcon, Music, Plus, Trash2, Upload, X } from 'lucide-react';
import type { ContentType, LyricsDisplayMode, ProgramItem, SlideBlock } from '../../shared/types';
import { useTerminology } from '../hooks/useTerminology';
import { formatTimestamp, parseLrcToBlocks, parseTimestamp } from '../utils/timedLyrics';
import { readTextFileWithEncoding } from '../utils/textEncoding';
import { saveUserMediaFile } from '../utils/mediaUpload';
import { cn } from '../utils/cn';
import { BackgroundImagePicker } from './BackgroundImagePicker';
import { LyricsSyncModal } from './LyricsSyncModal';

interface ItemEditorModalProps {
  open: boolean;
  initialItem: ProgramItem | null;
  defaultType?: ContentType;
  onClose: () => void;
  onSave: (item: ProgramItem) => void;
}

const LIST_ITEM_RE = /^\s*(?:([-*•▪–—])\s+|(\d+[.)]|[a-zA-Z][.)])\s+)(.+\S.*)$/;

/**
 * Detects bulleted or numbered lists (2+ list items) in Doc text and splits
 * each list item into its own SlideBlock lines array. Returns null if not a list.
 */
function splitDocListText(text: string): string[][] | null {
  const rawLines = text.split(/\r?\n/);
  let listItemCount = 0;
  for (const line of rawLines) {
    if (LIST_ITEM_RE.test(line)) listItemCount++;
  }
  if (listItemCount < 2) return null;

  const groups: string[][] = [];
  let current: string[] = [];

  for (const rawLine of rawLines) {
    const match = rawLine.match(LIST_ITEM_RE);
    if (match) {
      if (current.length > 0) {
        groups.push(current);
        current = [];
      }
      const isBullet = Boolean(match[1]);
      // Normalize bullet markers to "• " so every list slide keeps a styleable marker.
      const cleaned = isBullet ? `• ${match[3].trim()}` : `${match[2]} ${match[3].trim()}`;
      current.push(cleaned);
    } else if (rawLine.trim() !== '') {
      current.push(rawLine.trimEnd());
    }
  }
  if (current.length > 0) {
    groups.push(current);
  }

  return groups.length >= 2 ? groups : null;
}

const THEME_PRESETS = [
  { name: 'Deep Navy', value: 'linear-gradient(135deg, #0f172a 0%, #1e3a8a 100%)' },
  { name: 'Royal Indigo', value: 'linear-gradient(135deg, #1e1b4b 0%, #312e81 100%)' },
  { name: 'Sanctuary Emerald', value: 'linear-gradient(135deg, #111827 0%, #064e3b 100%)' },
  { name: 'Midnight Slate', value: 'linear-gradient(135deg, #090d16 0%, #1e293b 100%)' },
  { name: 'Warm Crimson', value: 'linear-gradient(135deg, #1f1018 0%, #7f1d1d 100%)' }
];

export const ItemEditorModal: React.FC<ItemEditorModalProps> = ({
  open,
  initialItem,
  defaultType = 'song',
  onClose,
  onSave
}) => {
  const t = useTerminology();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const bgFileRef = useRef<HTMLInputElement>(null);
  const audioFileRef = useRef<HTMLInputElement>(null);
  const lrcFileRef = useRef<HTMLInputElement>(null);
  const textareaRefs = useRef<Record<string, HTMLTextAreaElement | null>>({});
  const pendingFocusRef = useRef<{ id: string; pos: number } | null>(null);
  const titleId = useId();

  const [type, setType] = useState<ContentType>(defaultType);
  const [title, setTitle] = useState('');
  const [subtitle, setSubtitle] = useState('');
  const [lyricsMode, setLyricsMode] = useState<LyricsDisplayMode>('slide');
  const [audioUrl, setAudioUrl] = useState<string | undefined>(undefined);
  const [audioFileName, setAudioFileName] = useState<string | undefined>(undefined);
  const [themeBackground, setThemeBackground] = useState(THEME_PRESETS[0].value);
  const [blocks, setBlocks] = useState<SlideBlock[]>([]);
  const [syncModalOpen, setSyncModalOpen] = useState(false);

  useEffect(() => {
    const pending = pendingFocusRef.current;
    if (!pending) return;
    const target = textareaRefs.current[pending.id];
    if (!target) return;
    pendingFocusRef.current = null;
    target.focus();
    target.setSelectionRange(pending.pos, pending.pos);
    target.scrollIntoView({ block: 'nearest' });
  }, [blocks]);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) {
      dialog.showModal();
    } else if (!open && dialog.open) {
      dialog.close();
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    if (initialItem) {
      setType(initialItem.type);
      setTitle(initialItem.title);
      setSubtitle(initialItem.subtitle ?? '');
      setLyricsMode(initialItem.lyricsMode ?? 'slide');
      setAudioUrl(initialItem.audioUrl);
      setAudioFileName(initialItem.audioFileName);
      setThemeBackground(initialItem.themeBackground ?? THEME_PRESETS[0].value);
      setBlocks(initialItem.blocks.map((b) => ({ ...b, lines: [...b.lines] })));
    } else {
      setType(defaultType);
      setTitle('');
      setSubtitle('');
      setLyricsMode('slide');
      setAudioUrl(undefined);
      setAudioFileName(undefined);
      setThemeBackground(THEME_PRESETS[0].value);
      setBlocks([
        {
          id: `blk-${Date.now()}`,
          label: defaultType === 'song' ? t.lyricsModes.sections.verse : 'Slide 1',
          lines: ['']
        }
      ]);
    }
  }, [open, initialItem, defaultType, t]);

  const handleAddBlock = (label?: string) => {
    setBlocks((prev) => [
      ...prev,
      {
        id: `blk-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        label: label ?? (type === 'song' ? t.lyricsModes.sections.verse : `Slide ${prev.length + 1}`),
        lines: ['']
      }
    ]);
  };

  const handleUpdateBlockLabel = (idx: number, label: string) => {
    setBlocks((prev) => prev.map((b, i) => (i === idx ? { ...b, label } : b)));
  };

  const handleUpdateBlockText = (idx: number, text: string) => {
    if (type === 'programItem') {
      const splitGroups = splitDocListText(text);
      if (splitGroups) {
        setBlocks((prev) => {
          const before = prev.slice(0, idx);
          const after = prev.slice(idx + 1);
          const now = Date.now();
          const generated: SlideBlock[] = splitGroups.map((lines, gIdx) => ({
            id: gIdx === 0 && prev[idx] ? prev[idx].id : `blk-${now}-${gIdx}-${Math.random().toString(36).slice(2, 6)}`,
            label: `Slide ${before.length + gIdx + 1}`,
            lines
          }));
          const lastBlock = generated[generated.length - 1];
          if (lastBlock) {
            pendingFocusRef.current = {
              id: lastBlock.id,
              pos: lastBlock.lines.join('\n').length
            };
          }
          return [...before, ...generated, ...after];
        });
        return;
      }
    }
    setBlocks((prev) =>
      prev.map((b, i) => (i === idx ? { ...b, lines: text.split('\n') } : b))
    );
  };

  const handleUpdateBlockStartTime = (idx: number, raw: string) => {
    const parsed = parseTimestamp(raw);
    setBlocks((prev) =>
      prev.map((b, i) => (i === idx ? { ...b, startTimeSec: parsed } : b))
    );
  };

  const handleUpdateLineStartTime = (blockIdx: number, lineIdx: number, raw: string) => {
    const parsed = parseTimestamp(raw);
    setBlocks((prev) =>
      prev.map((b, i) => {
        if (i !== blockIdx) return b;
        const nextTimings = [...(b.lineTimingsSec ?? [])];
        nextTimings[lineIdx] = parsed;
        return {
          ...b,
          lineTimingsSec: nextTimings,
          startTimeSec: lineIdx === 0 ? parsed : b.startTimeSec
        };
      })
    );
  };

  const handleAudioUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    const mediaUrl = await saveUserMediaFile(file);
    setAudioUrl(mediaUrl);
    setAudioFileName(file.name);
  };

  const handleLrcImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    const text = await readTextFileWithEncoding(file);
    const parsed = parseLrcToBlocks(text);
    if (parsed.length > 0) {
      setBlocks(parsed);
      setLyricsMode('timed');
    }
  };

  const handleRemoveBlock = (idx: number) => {
    setBlocks((prev) => (prev.length > 1 ? prev.filter((_, i) => i !== idx) : prev));
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
    const cleanedBlocks = blocks.map((b) => ({
      ...b,
      lines: b.lines.map((l) => l.trimEnd()).filter((l, i, arr) => l !== '' || arr.length === 1)
    }));

    onSave({
      ...(initialItem ?? {}),
      id: initialItem?.id ?? `${type}-${Date.now()}`,
      title: title.trim() || `Untitled ${t.contentTypes[type]}`,
      subtitle: subtitle.trim() || t.contentTypes[type],
      type,
      lyricsMode: type === 'song' ? lyricsMode : undefined,
      audioUrl: type === 'song' ? audioUrl : undefined,
      audioFileName: type === 'song' ? audioFileName : undefined,
      bibleLayout: initialItem?.bibleLayout,
      verseMaxFontSize: initialItem?.verseMaxFontSize,
      themeBackground,
      blocks: cleanedBlocks
    });
    onClose();
  };

  const sectionPresets = [
    t.lyricsModes.sections.verse,
    t.lyricsModes.sections.chorus,
    t.lyricsModes.sections.preChorus,
    t.lyricsModes.sections.bridge,
    t.lyricsModes.sections.tag,
    t.lyricsModes.sections.intro,
    t.lyricsModes.sections.outro
  ];

  return (
    <>
    <dialog
      ref={dialogRef}
      aria-labelledby={titleId}
      className="w-[min(94vw,760px)] max-w-[760px]"
      onClose={() => {
        if (dialogRef.current) dialogRef.current.returnValue = '';
        onClose();
      }}
    >
      <form onSubmit={handleSubmit} className="flex max-h-[88vh] flex-col gap-4 px-6 py-5">
        <div className="flex items-center justify-between">
          <h2 id={titleId} className="m-0 text-[1.1rem] font-bold">
            {initialItem ? `${t.editor.edit}: ${initialItem.title}` : t.contentTypes[type]}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label={t.editor.cancel}
            className="inline-flex rounded-lg border border-subtle bg-transparent p-1.5 transition-colors hover:bg-hover"
          >
            <X size={16} />
          </button>
        </div>

        {/* Metadata row */}
        <div className="grid grid-cols-[1.5fr_1fr] gap-2.5">
          <label className={FIELD_LABEL_CLS}>
            <span>{t.editor.title}</span>
            <input
              type="text"
              required
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Amazing Grace"
              className={INPUT_CLS}
              autoFocus
            />
          </label>
          <label className={FIELD_LABEL_CLS}>
            <span>{t.editor.subtitle}</span>
            <input
              type="text"
              value={subtitle}
              onChange={(e) => setSubtitle(e.target.value)}
              placeholder="e.g. Hymn / Worship"
              className={INPUT_CLS}
            />
          </label>
        </div>

        {/* Song Lyrics Mode + Background Theme */}
        <div className="flex flex-wrap items-end gap-3">
          {type === 'song' && (
            <div className={FIELD_LABEL_CLS}>
              <span>Lyrics Display</span>
              <div className="flex gap-1.5">
                <button
                  type="button"
                  onClick={() => setLyricsMode('slide')}
                  className={pillBtnCls(lyricsMode === 'slide')}
                >
                  {t.lyricsModes.slideMode}
                </button>
                <button
                  type="button"
                  onClick={() => setLyricsMode('timed')}
                  className={pillBtnCls(lyricsMode === 'timed')}
                >
                  {t.lyricsModes.timedMode}
                </button>
              </div>
            </div>
          )}

          {type === 'song' && lyricsMode === 'timed' && (
            <div className={cn(FIELD_LABEL_CLS, 'flex-1')}>
              <span>Audio Track &amp; Sync</span>
              <div className="flex flex-wrap items-center gap-1.5">
                <input
                  ref={audioFileRef}
                  type="file"
                  accept="audio/*,.mp3,.wav,.m4a,.ogg,.aac"
                  onChange={handleAudioUpload}
                  className="hidden"
                />
                <input
                  ref={lrcFileRef}
                  type="file"
                  accept=".lrc,text/plain"
                  onChange={handleLrcImport}
                  className="hidden"
                />
                <button
                  type="button"
                  onClick={() => audioFileRef.current?.click()}
                  className={pillBtnCls(Boolean(audioUrl))}
                >
                  <Music size={12} />
                  {audioFileName ? audioFileName : 'Upload Audio'}
                </button>
                {audioUrl && (
                  <button
                    type="button"
                    onClick={() => {
                      setAudioUrl(undefined);
                      setAudioFileName(undefined);
                    }}
                    className={pillBtnCls(false)}
                  >
                    Remove Audio
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => lrcFileRef.current?.click()}
                  className={pillBtnCls(false)}
                  title="Import timestamped .lrc lyrics"
                >
                  <Upload size={12} />
                  Import .lrc
                </button>
                <button
                  type="button"
                  onClick={() => setSyncModalOpen(true)}
                  className={cn(
                    pillBtnCls(false),
                    'border-purple-500/55 bg-purple-600/16 text-purple-300 hover:bg-purple-600/24'
                  )}
                  title="Open interactive line-by-line sync studio"
                >
                  <Clock size={12} />
                  Sync Lyrics
                </button>
              </div>
            </div>
          )}

          <div className={cn(FIELD_LABEL_CLS, 'flex-1')}>
            <span>{t.editor.theme}</span>
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
        </div>

        {/* Section Presets for Songs */}
        {type === 'song' && (
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-[0.75rem] text-text-secondary">Quick Add:</span>
            {sectionPresets.map((sec) => (
              <button
                key={sec}
                type="button"
                onClick={() => handleAddBlock(sec)}
                className="rounded-full border border-subtle bg-panel-elevated px-[9px] py-1 text-[0.74rem] transition-colors hover:bg-hover"
              >
                + {sec}
              </button>
            ))}
          </div>
        )}

        {/* Blocks Editor */}
        <div className="flex min-h-[180px] flex-1 flex-col gap-2.5 overflow-y-auto pr-1">
          {blocks.map((block, idx) => (
            <div
              key={block.id}
              className="flex flex-col gap-2 rounded-[10px] border border-subtle bg-panel-elevated p-2.5"
            >
              <div className="flex items-center justify-between gap-2">
                <div className="flex min-w-0 flex-1 items-center gap-2">
                  <input
                    type="text"
                    value={block.label ?? ''}
                    onChange={(e) => handleUpdateBlockLabel(idx, e.target.value)}
                    placeholder={t.editor.sectionLabel}
                    className={cn(INPUT_CLS, 'max-w-[200px] px-2 py-[5px] text-[0.8rem] font-semibold')}
                  />
                  {type === 'song' && lyricsMode === 'timed' && (
                    <label className="inline-flex items-center gap-1 text-[0.73rem] text-text-muted">
                      <Clock size={12} />
                      <input
                        type="text"
                        defaultValue={formatTimestamp(block.startTimeSec)}
                        key={`${block.id}-${block.startTimeSec ?? 'none'}`}
                        onBlur={(e) => handleUpdateBlockStartTime(idx, e.target.value)}
                        placeholder="0:00"
                        title="Start time (mm:ss or seconds)"
                        className={cn(INPUT_CLS, 'w-[74px] px-[7px] py-1 text-[0.76rem] tabular-nums')}
                      />
                    </label>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => handleRemoveBlock(idx)}
                  disabled={blocks.length <= 1}
                  title={t.editor.delete}
                  className={cn(
                    'inline-flex rounded-md border border-subtle bg-transparent p-[5px] transition-colors hover:bg-hover',
                    blocks.length <= 1 ? 'opacity-40' : 'opacity-100'
                  )}
                >
                  <Trash2 size={13} />
                </button>
              </div>
              <textarea
                ref={(el) => {
                  textareaRefs.current[block.id] = el;
                }}
                rows={3}
                value={block.lines.join('\n')}
                onChange={(e) => handleUpdateBlockText(idx, e.target.value)}
                placeholder={
                  type === 'programItem'
                    ? 'Enter slide text, or paste/type a list (- item or 1. item) to auto-create one slide per item...'
                    : 'Enter lyrics or slide text (one line per row)...'
                }
                className={cn(INPUT_CLS, 'resize-y leading-[1.4]')}
              />
              {type === 'song' && lyricsMode === 'timed' && block.lines.some((l) => l.trim()) && (
                <div className="flex flex-col gap-1 border-t border-subtle pt-1">
                  <div className="text-[0.7rem] font-semibold text-text-muted">
                    Line Timestamps (mm:ss)
                  </div>
                  {block.lines.map((lineText, lineIdx) => {
                    if (!lineText.trim()) return null;
                    const lineTime =
                      block.lineTimingsSec?.[lineIdx] ??
                      (lineIdx === 0 ? block.startTimeSec : undefined);
                    return (
                      <div
                        key={`${block.id}-lt-${lineIdx}`}
                        className="flex items-center justify-between gap-2"
                      >
                        <span className="min-w-0 flex-1 truncate text-[0.76rem] text-text-secondary">
                          {lineText}
                        </span>
                        <input
                          type="text"
                          defaultValue={formatTimestamp(lineTime)}
                          key={`${block.id}-lt-${lineIdx}-${lineTime ?? 'none'}`}
                          onBlur={(e) => handleUpdateLineStartTime(idx, lineIdx, e.target.value)}
                          placeholder="0:00"
                          title="Line start time (mm:ss or seconds)"
                          className={cn(
                            INPUT_CLS,
                            'w-[74px] shrink-0 px-[7px] py-[3px] text-[0.74rem] tabular-nums'
                          )}
                        />
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          ))}
        </div>

        {/* Footer Actions */}
        <div className="flex items-center justify-between border-t border-subtle pt-3">
          <button
            type="button"
            onClick={() => handleAddBlock()}
            className={pillBtnCls(false)}
          >
            <Plus size={14} />
            {t.editor.addBlock}
          </button>

          <div className="flex gap-2">
            <button type="button" onClick={onClose} className={pillBtnCls(false)}>
              {t.editor.cancel}
            </button>
            <button
              type="submit"
              className="rounded-lg border-0 bg-accent px-[18px] py-2 text-[0.85rem] font-bold text-white transition-colors hover:bg-accent-hover"
            >
              {t.editor.save}
            </button>
          </div>
        </div>
      </form>
    </dialog>

    <LyricsSyncModal
      open={syncModalOpen}
      title={title}
      audioUrl={audioUrl}
      blocks={blocks}
      onClose={() => setSyncModalOpen(false)}
      onApply={(updated) => setBlocks(updated)}
    />
    </>
  );
};

const FIELD_LABEL_CLS = 'flex flex-col gap-1 text-[0.76rem] font-semibold text-text-secondary';

const INPUT_CLS =
  'w-full rounded-lg border border-subtle bg-app px-2.5 py-2 font-[inherit] text-[0.85rem] text-text-primary focus:border-accent focus:outline-none';

function pillBtnCls(active: boolean): string {
  return cn(
    'inline-flex items-center gap-[5px] rounded-lg border px-3 py-1.5 text-[0.8rem] font-semibold transition-colors',
    active
      ? 'border-accent bg-blue-500/16'
      : 'border-subtle bg-panel-elevated hover:bg-hover'
  );
}
