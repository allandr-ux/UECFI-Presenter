import React, { useEffect, useId, useMemo, useRef, useState } from 'react';
import { Check, Pause, Play, RotateCcw, Tag, X } from 'lucide-react';
import type { SlideBlock } from '../../shared/types';
import { flattenSongTimedLines, type TimedLyricLine } from '../utils/timedLyrics';

interface LyricsSyncModalProps {
  open: boolean;
  title: string;
  audioUrl?: string;
  blocks: SlideBlock[];
  onClose: () => void;
  onApply: (updatedBlocks: SlideBlock[]) => void;
}

function formatSyncClock(sec?: number): string {
  if (sec === undefined || Number.isNaN(sec) || sec < 0) return '00:00.00';
  const mins = Math.floor(sec / 60);
  const rem = sec - mins * 60;
  const whole = Math.floor(rem);
  const hundredths = Math.min(99, Math.round((rem - whole) * 100));
  return `${String(mins).padStart(2, '0')}:${String(whole).padStart(2, '0')}.${String(
    hundredths
  ).padStart(2, '0')}`;
}

interface SyncHistoryEntry {
  cursorIdx: number;
  prevTime: number | undefined;
}

/**
 * Interactive modal for stamping, nudging, and re-syncing per-line audio timestamps.
 */
export const LyricsSyncModal: React.FC<LyricsSyncModalProps> = ({
  open,
  title,
  audioUrl,
  blocks,
  onClose,
  onApply
}) => {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const audioRef = useRef<HTMLAudioElement>(null);
  const rowRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const titleId = useId();

  const initialLines = useMemo(() => flattenSongTimedLines(blocks), [blocks]);
  const [timings, setTimings] = useState<Record<string, number | undefined>>({});
  const [cursorIdx, setCursorIdx] = useState(0);
  const [history, setHistory] = useState<SyncHistoryEntry[]>([]);
  const [playing, setPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) {
      dialog.showModal();
    } else if (!open && dialog.open) {
      audioRef.current?.pause();
      setPlaying(false);
      dialog.close();
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const map: Record<string, number | undefined> = {};
    for (const line of initialLines) {
      map[line.key] = line.timeSec;
    }
    setTimings(map);
    const firstUnstamped = initialLines.findIndex((l) => l.timeSec === undefined);
    setCursorIdx(firstUnstamped >= 0 ? firstUnstamped : 0);
    setHistory([]);
    setCurrentTime(0);
    setPlaying(false);
    if (audioRef.current) {
      audioRef.current.currentTime = 0;
    }
  }, [open, initialLines]);

  useEffect(() => {
    if (!playing) return;
    const timer = window.setInterval(() => {
      if (audioRef.current && !audioRef.current.paused) {
        setCurrentTime(audioRef.current.currentTime);
      }
    }, 60);
    return () => window.clearInterval(timer);
  }, [playing]);

  // Auto-scroll active line into view
  useEffect(() => {
    const activeLine = initialLines[cursorIdx];
    if (!activeLine) return;
    rowRefs.current[activeLine.key]?.scrollIntoView({
      block: 'nearest',
      behavior: 'smooth'
    });
  }, [cursorIdx, initialLines]);

  const handleTogglePlay = () => {
    const audio = audioRef.current;
    if (!audio || !audioUrl) return;
    if (audio.paused) {
      audio.play().catch(() => {});
    } else {
      audio.pause();
    }
  };

  const handleSkip = (deltaSec: number) => {
    const audio = audioRef.current;
    if (!audio) return;
    const next = Math.max(0, Math.min(duration || 9999, audio.currentTime + deltaSec));
    audio.currentTime = next;
    setCurrentTime(next);
  };

  const handleStampCurrent = () => {
    const line = initialLines[cursorIdx];
    if (!line) return;
    const stampSec = Math.round((audioRef.current?.currentTime ?? currentTime) * 100) / 100;
    setHistory((prev) => [...prev, { cursorIdx, prevTime: timings[line.key] }]);
    setTimings((prev) => ({ ...prev, [line.key]: stampSec }));
    if (cursorIdx + 1 < initialLines.length) {
      setCursorIdx(cursorIdx + 1);
    }
  };

  const handleUndo = () => {
    const last = history[history.length - 1];
    if (!last) return;
    const line = initialLines[last.cursorIdx];
    if (line) {
      setTimings((prev) => ({ ...prev, [line.key]: last.prevTime }));
    }
    setCursorIdx(last.cursorIdx);
    setHistory((prev) => prev.slice(0, -1));
  };

  const handleNudge = (line: TimedLyricLine, delta: number) => {
    const current = timings[line.key] ?? 0;
    const next = Math.max(0, Math.round((current + delta) * 100) / 100);
    setTimings((prev) => ({ ...prev, [line.key]: next }));
  };

  const handleClearLine = (line: TimedLyricLine) => {
    setTimings((prev) => ({ ...prev, [line.key]: undefined }));
  };

  const handleClearAll = () => {
    const cleared: Record<string, undefined> = {};
    for (const line of initialLines) cleared[line.key] = undefined;
    setTimings(cleared);
    setHistory([]);
    setCursorIdx(0);
  };

  const handleApply = () => {
    const updatedBlocks = blocks.map((b, bIdx) => {
      const nextLineTimings = b.lines.map((_, lIdx) => {
        const key = `${b.id}-${lIdx}`;
        const existing = timings[key];
        return existing !== undefined ? existing : undefined;
      });
      const firstLineTime = nextLineTimings.find((t) => t !== undefined);
      return {
        ...b,
        lineTimingsSec: nextLineTimings,
        startTimeSec: bIdx === 0 || firstLineTime !== undefined ? firstLineTime : b.startTimeSec
      };
    });
    onApply(updatedBlocks);
    onClose();
  };

  // Keyboard shortcuts while Sync Modal is open: Space -> Stamp, Backspace -> Undo
  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;

      if (e.code === 'Space') {
        e.preventDefault();
        handleStampCurrent();
      } else if (e.key === 'Backspace') {
        e.preventDefault();
        handleUndo();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  });

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby={titleId}
      style={{ maxWidth: '660px', width: 'min(94vw, 660px)', height: 'min(88vh, 780px)' }}
      onClose={() => {
        if (dialogRef.current) dialogRef.current.returnValue = '';
        audioRef.current?.pause();
        setPlaying(false);
        onClose();
      }}
    >
      <div style={{ display: 'flex', flexDirection: 'column', height: '100%', padding: '16px 18px', gap: '12px' }}>
        {/* Modal Title */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h2 id={titleId} style={{ margin: 0, fontSize: '0.96rem', fontWeight: 700 }}>
            Sync Lyrics — {title || 'Untitled Song'}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            style={{
              background: 'transparent',
              border: '1px solid var(--border-subtle)',
              borderRadius: '8px',
              padding: '5px',
              display: 'inline-flex'
            }}
          >
            <X size={14} />
          </button>
        </div>

        {/* Transport Bar */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {audioUrl && (
            <audio
              ref={audioRef}
              src={audioUrl}
              onPlay={() => setPlaying(true)}
              onPause={() => setPlaying(false)}
              onEnded={() => setPlaying(false)}
              onLoadedMetadata={(e) => setDuration(e.currentTarget.duration || 0)}
              onTimeUpdate={(e) => setCurrentTime(e.currentTarget.currentTime)}
            />
          )}
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
            <button
              type="button"
              onClick={handleTogglePlay}
              disabled={!audioUrl}
              title={audioUrl ? 'Play / Pause' : 'Upload an audio track first'}
              style={{
                width: '36px',
                height: '36px',
                borderRadius: '999px',
                border: 'none',
                background: '#9333ea',
                color: '#ffffff',
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                opacity: audioUrl ? 1 : 0.45
              }}
            >
              {playing ? <Pause size={15} /> : <Play size={15} />}
            </button>
            <button
              type="button"
              onClick={() => handleSkip(-3)}
              disabled={!audioUrl}
              style={transportChipStyle}
            >
              -3s
            </button>
            <button
              type="button"
              onClick={() => handleSkip(3)}
              disabled={!audioUrl}
              style={transportChipStyle}
            >
              +3s
            </button>
            <span
              style={{
                fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
                fontSize: '0.9rem',
                fontWeight: 700,
                color: 'var(--text-primary)',
                marginLeft: '4px'
              }}
            >
              {formatSyncClock(currentTime)}
            </span>
            <span style={{ marginLeft: 'auto', fontSize: '0.73rem', color: 'var(--text-muted)' }}>
              Click any line to re-sync · <kbd style={kbdStyle}>SPACE</kbd> stamp ·{' '}
              <kbd style={kbdStyle}>⌫</kbd> undo
            </span>
          </div>

          <input
            type="range"
            min={0}
            max={Math.max(1, duration)}
            step={0.05}
            value={currentTime}
            disabled={!audioUrl}
            onChange={(e) => {
              const next = Number(e.target.value);
              setCurrentTime(next);
              if (audioRef.current) audioRef.current.currentTime = next;
            }}
            style={{ width: '100%', accentColor: '#9333ea' }}
          />
        </div>

        {/* Line-by-line List */}
        <div
          style={{
            flex: 1,
            minHeight: 0,
            overflowY: 'auto',
            display: 'flex',
            flexDirection: 'column',
            gap: '6px',
            paddingRight: '4px'
          }}
        >
          {initialLines.map((line, idx) => {
            const prevLine = idx > 0 ? initialLines[idx - 1] : null;
            const showSlideBreak = prevLine !== null && prevLine.blockIndex !== line.blockIndex;
            const timeSec = timings[line.key];
            const isStamped = timeSec !== undefined;
            const isCursor = idx === cursorIdx;

            return (
              <React.Fragment key={line.key}>
                {showSlideBreak && (
                  <div
                    style={{
                      textAlign: 'center',
                      fontSize: '0.68rem',
                      fontWeight: 700,
                      letterSpacing: '0.1em',
                      color: 'var(--text-muted)',
                      padding: '4px 0',
                      borderRadius: '6px',
                      background: 'rgba(148, 163, 184, 0.08)'
                    }}
                  >
                    --- SLIDE BREAK ---
                  </div>
                )}

                <div
                  ref={(el) => {
                    rowRefs.current[line.key] = el;
                  }}
                  onClick={() => {
                    setCursorIdx(idx);
                    if (isStamped && audioRef.current && timeSec !== undefined) {
                      audioRef.current.currentTime = timeSec;
                      setCurrentTime(timeSec);
                    }
                  }}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: '10px',
                    padding: '8px 10px',
                    borderRadius: '9px',
                    cursor: 'pointer',
                    border: isCursor ? '2px solid #9333ea' : '1px solid',
                    borderColor: isCursor
                      ? '#9333ea'
                      : isStamped
                        ? 'rgba(52, 211, 153, 0.35)'
                        : 'var(--border-subtle)',
                    background: isStamped
                      ? 'rgba(16, 185, 129, 0.1)'
                      : 'var(--bg-panel-elevated)'
                  }}
                >
                  <span
                    style={{
                      flex: 1,
                      minWidth: 0,
                      fontSize: '0.83rem',
                      fontWeight: isCursor ? 700 : 500,
                      color: 'var(--text-primary)',
                      whiteSpace: 'nowrap',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis'
                    }}
                  >
                    {line.text}
                  </span>

                  <div
                    style={{ display: 'flex', alignItems: 'center', gap: '4px', flexShrink: 0 }}
                    onClick={(e) => e.stopPropagation()}
                  >
                    <button
                      type="button"
                      onClick={() => handleNudge(line, -0.2)}
                      style={nudgeBtnStyle}
                      title="Earlier by 0.2s"
                    >
                      -0.2s
                    </button>
                    <span
                      style={{
                        fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
                        fontSize: '0.76rem',
                        fontWeight: 700,
                        padding: '3px 7px',
                        borderRadius: '6px',
                        background: isStamped ? 'rgba(16, 185, 129, 0.2)' : 'var(--bg-app)',
                        color: isStamped ? '#6ee7b7' : 'var(--text-muted)'
                      }}
                    >
                      [{isStamped ? formatSyncClock(timeSec) : '--:--.--'}]
                    </span>
                    <button
                      type="button"
                      onClick={() => handleNudge(line, 0.2)}
                      style={nudgeBtnStyle}
                      title="Later by 0.2s"
                    >
                      +0.2s
                    </button>
                    <button
                      type="button"
                      onClick={() => handleClearLine(line)}
                      title="Clear timestamp"
                      style={{
                        background: 'transparent',
                        border: 'none',
                        color: '#f87171',
                        padding: '3px 4px',
                        display: 'inline-flex',
                        opacity: isStamped ? 1 : 0.3
                      }}
                    >
                      <X size={13} />
                    </button>
                  </div>
                </div>
              </React.Fragment>
            );
          })}
        </div>

        {/* Stamp Action Row */}
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          <button
            type="button"
            onClick={handleUndo}
            disabled={history.length === 0}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              padding: '10px 14px',
              borderRadius: '10px',
              border: '1px solid var(--border-subtle)',
              background: 'var(--bg-panel-elevated)',
              color: 'var(--text-primary)',
              fontSize: '0.82rem',
              fontWeight: 600,
              opacity: history.length === 0 ? 0.45 : 1
            }}
          >
            <RotateCcw size={14} />
            Undo
          </button>
          <button
            type="button"
            onClick={handleStampCurrent}
            disabled={initialLines.length === 0}
            style={{
              flex: 1,
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '7px',
              padding: '10px 16px',
              borderRadius: '10px',
              border: 'none',
              background: '#9333ea',
              color: '#ffffff',
              fontSize: '0.86rem',
              fontWeight: 700
            }}
          >
            <Tag size={14} />
            Stamp Current Line (SPACE)
          </button>
        </div>

        {/* Footer */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            paddingTop: '10px',
            borderTop: '1px solid var(--border-subtle)'
          }}
        >
          <button
            type="button"
            onClick={handleClearAll}
            style={{
              padding: '7px 12px',
              borderRadius: '8px',
              border: '1px solid var(--border-subtle)',
              background: 'var(--bg-panel-elevated)',
              color: 'var(--text-secondary)',
              fontSize: '0.78rem',
              fontWeight: 600
            }}
          >
            Clear Timestamps
          </button>

          <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
            <button
              type="button"
              onClick={onClose}
              style={{
                padding: '7px 12px',
                borderRadius: '8px',
                border: '1px solid transparent',
                background: 'transparent',
                color: 'var(--text-secondary)',
                fontSize: '0.8rem',
                fontWeight: 600
              }}
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleApply}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '5px',
                padding: '8px 14px',
                borderRadius: '8px',
                border: 'none',
                background: '#059669',
                color: '#ffffff',
                fontSize: '0.8rem',
                fontWeight: 700
              }}
            >
              <Check size={14} />
              Apply to Lyrics
            </button>
          </div>
        </div>
      </div>
    </dialog>
  );
};

const transportChipStyle: React.CSSProperties = {
  padding: '5px 10px',
  borderRadius: '7px',
  border: '1px solid var(--border-subtle)',
  background: 'var(--bg-panel-elevated)',
  color: 'var(--text-primary)',
  fontSize: '0.76rem',
  fontWeight: 600
};

const nudgeBtnStyle: React.CSSProperties = {
  padding: '3px 6px',
  borderRadius: '5px',
  border: '1px solid var(--border-subtle)',
  background: 'var(--bg-app)',
  color: 'var(--text-secondary)',
  fontSize: '0.7rem',
  fontWeight: 600
};

const kbdStyle: React.CSSProperties = {
  padding: '1px 5px',
  borderRadius: '4px',
  border: '1px solid var(--border-subtle)',
  background: 'var(--bg-panel-elevated)',
  fontSize: '0.68rem',
  fontWeight: 700
};
