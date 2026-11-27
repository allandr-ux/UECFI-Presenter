import React, { useEffect, useId, useMemo, useRef, useState } from 'react';
import { Check, Pause, Play, RotateCcw, Tag, X } from 'lucide-react';
import type { SlideBlock } from '../../shared/types';
import { flattenSongTimedLines, type TimedLyricLine } from '../utils/timedLyrics';
import { cn } from '../utils/cn';

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
      className="h-[min(88vh,780px)] w-[min(94vw,660px)] max-w-[660px]"
      onClose={() => {
        if (dialogRef.current) dialogRef.current.returnValue = '';
        audioRef.current?.pause();
        setPlaying(false);
        onClose();
      }}
    >
      <div className="flex h-full flex-col gap-3 px-[18px] py-4">
        {/* Modal Title */}
        <div className="flex items-center justify-between">
          <h2 id={titleId} className="m-0 text-[0.96rem] font-bold">
            Sync Lyrics — {title || 'Untitled Song'}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="inline-flex rounded-lg border border-subtle bg-transparent p-[5px] transition-colors hover:bg-hover"
          >
            <X size={14} />
          </button>
        </div>

        {/* Transport Bar */}
        <div className="flex flex-col gap-2">
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
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={handleTogglePlay}
              disabled={!audioUrl}
              title={audioUrl ? 'Play / Pause' : 'Upload an audio track first'}
              className={cn(
                'inline-flex h-9 w-9 items-center justify-center rounded-full border-0 bg-purple-600 text-white transition-colors hover:bg-purple-500',
                audioUrl ? 'opacity-100' : 'opacity-45'
              )}
            >
              {playing ? <Pause size={15} /> : <Play size={15} />}
            </button>
            <button
              type="button"
              onClick={() => handleSkip(-3)}
              disabled={!audioUrl}
              className={TRANSPORT_CHIP_CLS}
            >
              -3s
            </button>
            <button
              type="button"
              onClick={() => handleSkip(3)}
              disabled={!audioUrl}
              className={TRANSPORT_CHIP_CLS}
            >
              +3s
            </button>
            <span className="ml-1 font-mono text-[0.9rem] font-bold text-text-primary">
              {formatSyncClock(currentTime)}
            </span>
            <span className="ml-auto text-[0.73rem] text-text-muted">
              Click any line to re-sync · <kbd className={KBD_CLS}>SPACE</kbd> stamp ·{' '}
              <kbd className={KBD_CLS}>⌫</kbd> undo
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
            className="w-full accent-purple-600"
          />
        </div>

        {/* Line-by-line List */}
        <div className="flex min-h-0 flex-1 flex-col gap-1.5 overflow-y-auto pr-1">
          {initialLines.map((line, idx) => {
            const prevLine = idx > 0 ? initialLines[idx - 1] : null;
            const showSlideBreak = prevLine !== null && prevLine.blockIndex !== line.blockIndex;
            const timeSec = timings[line.key];
            const isStamped = timeSec !== undefined;
            const isCursor = idx === cursorIdx;

            return (
              <React.Fragment key={line.key}>
                {showSlideBreak && (
                  <div className="rounded-md bg-slate-400/8 py-1 text-center text-[0.68rem] font-bold tracking-[0.1em] text-text-muted">
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
                  className={cn(
                    'flex cursor-pointer items-center justify-between gap-2.5 rounded-[9px] px-2.5 py-2 transition-colors',
                    isCursor
                      ? 'border-2 border-purple-600'
                      : isStamped
                        ? 'border border-emerald-400/35'
                        : 'border border-subtle',
                    isStamped ? 'bg-emerald-500/10' : 'bg-panel-elevated'
                  )}
                >
                  <span
                    className={cn(
                      'min-w-0 flex-1 truncate text-[0.83rem] text-text-primary',
                      isCursor ? 'font-bold' : 'font-medium'
                    )}
                  >
                    {line.text}
                  </span>

                  <div
                    className="flex shrink-0 items-center gap-1"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <button
                      type="button"
                      onClick={() => handleNudge(line, -0.2)}
                      className={NUDGE_BTN_CLS}
                      title="Earlier by 0.2s"
                    >
                      -0.2s
                    </button>
                    <span
                      className={cn(
                        'rounded-md px-[7px] py-[3px] font-mono text-[0.76rem] font-bold',
                        isStamped
                          ? 'bg-emerald-500/20 text-emerald-300'
                          : 'bg-app text-text-muted'
                      )}
                    >
                      [{isStamped ? formatSyncClock(timeSec) : '--:--.--'}]
                    </span>
                    <button
                      type="button"
                      onClick={() => handleNudge(line, 0.2)}
                      className={NUDGE_BTN_CLS}
                      title="Later by 0.2s"
                    >
                      +0.2s
                    </button>
                    <button
                      type="button"
                      onClick={() => handleClearLine(line)}
                      title="Clear timestamp"
                      className={cn(
                        'inline-flex border-0 bg-transparent px-1 py-[3px] text-red-400',
                        isStamped ? 'opacity-100' : 'opacity-30'
                      )}
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
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleUndo}
            disabled={history.length === 0}
            className={cn(
              'inline-flex items-center gap-1.5 rounded-[10px] border border-subtle bg-panel-elevated px-3.5 py-2.5 text-[0.82rem] font-semibold text-text-primary transition-colors hover:bg-hover',
              history.length === 0 ? 'opacity-45' : 'opacity-100'
            )}
          >
            <RotateCcw size={14} />
            Undo
          </button>
          <button
            type="button"
            onClick={handleStampCurrent}
            disabled={initialLines.length === 0}
            className="inline-flex flex-1 items-center justify-center gap-[7px] rounded-[10px] border-0 bg-purple-600 px-4 py-2.5 text-[0.86rem] font-bold text-white transition-colors hover:bg-purple-500 disabled:opacity-45"
          >
            <Tag size={14} />
            Stamp Current Line (SPACE)
          </button>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between border-t border-subtle pt-2.5">
          <button
            type="button"
            onClick={handleClearAll}
            className="rounded-lg border border-subtle bg-panel-elevated px-3 py-[7px] text-[0.78rem] font-semibold text-text-secondary transition-colors hover:bg-hover"
          >
            Clear Timestamps
          </button>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-transparent bg-transparent px-3 py-[7px] text-[0.8rem] font-semibold text-text-secondary transition-colors hover:text-text-primary"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleApply}
              className="inline-flex items-center gap-[5px] rounded-lg border-0 bg-emerald-600 px-3.5 py-2 text-[0.8rem] font-bold text-white transition-colors hover:bg-emerald-500"
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

const TRANSPORT_CHIP_CLS =
  'rounded-[7px] border border-subtle bg-panel-elevated px-2.5 py-[5px] text-[0.76rem] font-semibold text-text-primary transition-colors hover:bg-hover disabled:opacity-45';

const NUDGE_BTN_CLS =
  'rounded-[5px] border border-subtle bg-app px-1.5 py-[3px] text-[0.7rem] font-semibold text-text-secondary transition-colors hover:bg-hover';

const KBD_CLS =
  'rounded border border-subtle bg-panel-elevated px-[5px] py-px text-[0.68rem] font-bold';
