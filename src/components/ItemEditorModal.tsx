import React, { useEffect, useId, useRef, useState } from 'react';
import { Clock, Image as ImageIcon, Music, Plus, Trash2, Upload, X } from 'lucide-react';
import type { ContentType, LyricsDisplayMode, ProgramItem, SlideBlock } from '../../shared/types';
import { useTerminology } from '../hooks/useTerminology';
import { formatTimestamp, parseLrcToBlocks, parseTimestamp } from '../utils/timedLyrics';
import { readTextFileWithEncoding } from '../utils/textEncoding';
import { saveUserMediaFile } from '../utils/mediaUpload';
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
      style={{ maxWidth: '760px', width: 'min(94vw, 760px)' }}
      onClose={() => {
        if (dialogRef.current) dialogRef.current.returnValue = '';
        onClose();
      }}
    >
      <form onSubmit={handleSubmit} style={{ padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: '16px', maxHeight: '88vh' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h2 id={titleId} style={{ margin: 0, fontSize: '1.1rem', fontWeight: 700 }}>
            {initialItem ? `${t.editor.edit}: ${initialItem.title}` : t.contentTypes[type]}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label={t.editor.cancel}
            style={{
              background: 'transparent',
              border: '1px solid var(--border-subtle)',
              borderRadius: '8px',
              padding: '6px',
              display: 'inline-flex'
            }}
          >
            <X size={16} />
          </button>
        </div>

        {/* Metadata row */}
        <div style={{ display: 'grid', gridTemplateColumns: '1.5fr 1fr', gap: '10px' }}>
          <label style={fieldLabelStyle}>
            <span>{t.editor.title}</span>
            <input
              type="text"
              required
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Amazing Grace"
              style={inputStyle}
              autoFocus
            />
          </label>
          <label style={fieldLabelStyle}>
            <span>{t.editor.subtitle}</span>
            <input
              type="text"
              value={subtitle}
              onChange={(e) => setSubtitle(e.target.value)}
              placeholder="e.g. Hymn / Worship"
              style={inputStyle}
            />
          </label>
        </div>

        {/* Song Lyrics Mode + Background Theme */}
        <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', alignItems: 'flex-end' }}>
          {type === 'song' && (
            <div style={fieldLabelStyle}>
              <span>Lyrics Display</span>
              <div style={{ display: 'flex', gap: '6px' }}>
                <button
                  type="button"
                  onClick={() => setLyricsMode('slide')}
                  style={pillBtnStyle(lyricsMode === 'slide')}
                >
                  {t.lyricsModes.slideMode}
                </button>
                <button
                  type="button"
                  onClick={() => setLyricsMode('timed')}
                  style={pillBtnStyle(lyricsMode === 'timed')}
                >
                  {t.lyricsModes.timedMode}
                </button>
              </div>
            </div>
          )}

          {type === 'song' && lyricsMode === 'timed' && (
            <div style={{ ...fieldLabelStyle, flex: 1 }}>
              <span>Audio Track &amp; Sync</span>
              <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', alignItems: 'center' }}>
                <input
                  ref={audioFileRef}
                  type="file"
                  accept="audio/*,.mp3,.wav,.m4a,.ogg,.aac"
                  onChange={handleAudioUpload}
                  style={{ display: 'none' }}
                />
                <input
                  ref={lrcFileRef}
                  type="file"
                  accept=".lrc,text/plain"
                  onChange={handleLrcImport}
                  style={{ display: 'none' }}
                />
                <button
                  type="button"
                  onClick={() => audioFileRef.current?.click()}
                  style={pillBtnStyle(Boolean(audioUrl))}
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
                    style={pillBtnStyle(false)}
                  >
                    Remove Audio
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => lrcFileRef.current?.click()}
                  style={pillBtnStyle(false)}
                  title="Import timestamped .lrc lyrics"
                >
                  <Upload size={12} />
                  Import .lrc
                </button>
                <button
                  type="button"
                  onClick={() => setSyncModalOpen(true)}
                  style={{
                    ...pillBtnStyle(false),
                    borderColor: 'rgba(168, 85, 247, 0.55)',
                    background: 'rgba(147, 51, 234, 0.16)',
                    color: '#d8b4fe'
                  }}
                  title="Open interactive line-by-line sync studio"
                >
                  <Clock size={12} />
                  Sync Lyrics
                </button>
              </div>
            </div>
          )}

          <div style={{ ...fieldLabelStyle, flex: 1 }}>
            <span>{t.editor.theme}</span>
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
                    border: themeBackground === preset.value ? '2px solid #60a5fa' : '1px solid var(--border-subtle)'
                  }}
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
          <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', alignItems: 'center' }}>
            <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>Quick Add:</span>
            {sectionPresets.map((sec) => (
              <button
                key={sec}
                type="button"
                onClick={() => handleAddBlock(sec)}
                style={{
                  padding: '4px 9px',
                  borderRadius: '999px',
                  border: '1px solid var(--border-subtle)',
                  background: 'var(--bg-panel-elevated)',
                  fontSize: '0.74rem'
                }}
              >
                + {sec}
              </button>
            ))}
          </div>
        )}

        {/* Blocks Editor */}
        <div style={{ flex: 1, minHeight: '180px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '10px', paddingRight: '4px' }}>
          {blocks.map((block, idx) => (
            <div
              key={block.id}
              style={{
                padding: '10px',
                borderRadius: '10px',
                background: 'var(--bg-panel-elevated)',
                border: '1px solid var(--border-subtle)',
                display: 'flex',
                flexDirection: 'column',
                gap: '8px'
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flex: 1, minWidth: 0 }}>
                  <input
                    type="text"
                    value={block.label ?? ''}
                    onChange={(e) => handleUpdateBlockLabel(idx, e.target.value)}
                    placeholder={t.editor.sectionLabel}
                    style={{ ...inputStyle, maxWidth: '200px', padding: '5px 8px', fontSize: '0.8rem', fontWeight: 600 }}
                  />
                  {type === 'song' && lyricsMode === 'timed' && (
                    <label style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', fontSize: '0.73rem', color: 'var(--text-muted)' }}>
                      <Clock size={12} />
                      <input
                        type="text"
                        defaultValue={formatTimestamp(block.startTimeSec)}
                        key={`${block.id}-${block.startTimeSec ?? 'none'}`}
                        onBlur={(e) => handleUpdateBlockStartTime(idx, e.target.value)}
                        placeholder="0:00"
                        title="Start time (mm:ss or seconds)"
                        style={{ ...inputStyle, width: '74px', padding: '4px 7px', fontSize: '0.76rem', fontVariantNumeric: 'tabular-nums' }}
                      />
                    </label>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => handleRemoveBlock(idx)}
                  disabled={blocks.length <= 1}
                  title={t.editor.delete}
                  style={{
                    background: 'transparent',
                    border: '1px solid var(--border-subtle)',
                    borderRadius: '6px',
                    padding: '5px',
                    opacity: blocks.length <= 1 ? 0.4 : 1,
                    display: 'inline-flex'
                  }}
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
                style={{ ...inputStyle, resize: 'vertical', lineHeight: 1.4 }}
              />
              {type === 'song' && lyricsMode === 'timed' && block.lines.some((l) => l.trim()) && (
                <div
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '4px',
                    paddingTop: '4px',
                    borderTop: '1px solid var(--border-subtle)'
                  }}
                >
                  <div style={{ fontSize: '0.7rem', fontWeight: 600, color: 'var(--text-muted)' }}>
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
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          gap: '8px'
                        }}
                      >
                        <span
                          style={{
                            fontSize: '0.76rem',
                            color: 'var(--text-secondary)',
                            whiteSpace: 'nowrap',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            flex: 1,
                            minWidth: 0
                          }}
                        >
                          {lineText}
                        </span>
                        <input
                          type="text"
                          defaultValue={formatTimestamp(lineTime)}
                          key={`${block.id}-lt-${lineIdx}-${lineTime ?? 'none'}`}
                          onBlur={(e) => handleUpdateLineStartTime(idx, lineIdx, e.target.value)}
                          placeholder="0:00"
                          title="Line start time (mm:ss or seconds)"
                          style={{
                            ...inputStyle,
                            width: '74px',
                            padding: '3px 7px',
                            fontSize: '0.74rem',
                            fontVariantNumeric: 'tabular-nums',
                            flexShrink: 0
                          }}
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
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderTop: '1px solid var(--border-subtle)', paddingTop: '12px' }}>
          <button
            type="button"
            onClick={() => handleAddBlock()}
            style={pillBtnStyle(false)}
          >
            <Plus size={14} />
            {t.editor.addBlock}
          </button>

          <div style={{ display: 'flex', gap: '8px' }}>
            <button type="button" onClick={onClose} style={pillBtnStyle(false)}>
              {t.editor.cancel}
            </button>
            <button
              type="submit"
              style={{
                padding: '8px 18px',
                borderRadius: '8px',
                border: 'none',
                background: 'var(--accent)',
                color: '#fff',
                fontWeight: 700,
                fontSize: '0.85rem'
              }}
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

const fieldLabelStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: '4px',
  fontSize: '0.76rem',
  color: 'var(--text-secondary)',
  fontWeight: 600
};

const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '8px 10px',
  borderRadius: '8px',
  border: '1px solid var(--border-subtle)',
  background: 'var(--bg-app)',
  color: 'var(--text-primary)',
  fontSize: '0.85rem',
  fontFamily: 'inherit'
};

function pillBtnStyle(active: boolean): React.CSSProperties {
  return {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '5px',
    padding: '6px 12px',
    borderRadius: '8px',
    border: '1px solid',
    borderColor: active ? 'var(--accent)' : 'var(--border-subtle)',
    background: active ? 'rgba(59,130,246,0.16)' : 'var(--bg-panel-elevated)',
    fontSize: '0.8rem',
    fontWeight: 600
  };
}
