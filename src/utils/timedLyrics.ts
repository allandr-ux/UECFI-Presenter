import type { SlideBlock } from '../../shared/types';

export interface TimedLyricLine {
  key: string;
  blockIndex: number;
  lineIndex: number;
  text: string;
  timeSec?: number;
}

/**
 * Formats seconds (e.g. 72.5) into "1:12.5" or "1:12".
 */
export function formatTimestamp(sec?: number): string {
  if (sec === undefined || Number.isNaN(sec) || sec < 0) return '';
  const mins = Math.floor(sec / 60);
  const rem = sec - mins * 60;
  const whole = Math.floor(rem);
  const tenths = Math.round((rem - whole) * 10);
  const secStr = String(whole).padStart(2, '0');
  return tenths > 0 ? `${mins}:${secStr}.${tenths}` : `${mins}:${secStr}`;
}

/**
 * Parses "mm:ss(.d)" or plain seconds (e.g. "1:12.5" or "72.5") into seconds.
 */
export function parseTimestamp(raw: string): number | undefined {
  const trimmed = raw.trim();
  if (!trimmed) return undefined;

  const colonMatch = trimmed.match(/^(\d+):(\d{1,2}(?:\.\d+)?)$/);
  if (colonMatch) {
    const mins = Number.parseInt(colonMatch[1], 10);
    const secs = Number.parseFloat(colonMatch[2]);
    if (!Number.isNaN(mins) && !Number.isNaN(secs)) {
      return Math.round((mins * 60 + secs) * 10) / 10;
    }
  }

  const num = Number.parseFloat(trimmed);
  if (!Number.isNaN(num) && num >= 0) {
    return Math.round(num * 10) / 10;
  }
  return undefined;
}

/**
 * Flattens all lyric lines across a song's blocks with per-line timestamps.
 */
export function flattenSongTimedLines(blocks: SlideBlock[]): TimedLyricLine[] {
  const flat: TimedLyricLine[] = [];
  for (let bIdx = 0; bIdx < blocks.length; bIdx++) {
    const block = blocks[bIdx];
    for (let lIdx = 0; lIdx < block.lines.length; lIdx++) {
      const text = block.lines[lIdx];
      if (!text.trim()) continue;
      const timeSec =
        block.lineTimingsSec?.[lIdx] ?? (lIdx === 0 ? block.startTimeSec : undefined);
      flat.push({
        key: `${block.id}-${lIdx}`,
        blockIndex: bIdx,
        lineIndex: lIdx,
        text,
        timeSec
      });
    }
  }
  return flat;
}

/**
 * Lead time (in seconds) before a line's timestamp when it becomes active
 * so the congregation can read and prepare in advance.
 */
export const TIMED_LYRICS_LEAD_TIME_SEC = 1.0;

/**
 * Finds the active line index for a given audio playback time.
 * Returns -1 when timestamps exist but playback has not reached the first line yet.
 * Falls back to the first line of `fallbackBlockIndex` if no line timestamps exist.
 */
export function findActiveTimedLineIndex(
  lines: TimedLyricLine[],
  currentTimeSec?: number,
  fallbackBlockIndex = 0,
  leadTimeSec = TIMED_LYRICS_LEAD_TIME_SEC
): number {
  if (lines.length === 0) return -1;

  let hasAnyTimestamp = false;
  let bestIdx = -1;
  let bestTime = -1;
  const tNow = currentTimeSec ?? 0;

  for (let i = 0; i < lines.length; i++) {
    const t = lines[i].timeSec;
    if (typeof t === 'number' && !Number.isNaN(t)) {
      hasAnyTimestamp = true;
      if (t <= tNow + leadTimeSec && t >= bestTime) {
        bestTime = t;
        bestIdx = i;
      }
    }
  }

  if (hasAnyTimestamp) {
    return bestIdx;
  }

  const fallbackIdx = lines.findIndex((l) => l.blockIndex >= fallbackBlockIndex);
  return fallbackIdx >= 0 ? fallbackIdx : 0;
}

/**
 * Given audio playback time in seconds, returns the index of the latest block
 * whose `startTimeSec` or first line timestamp is <= currentTimeSec + leadTimeSec (or null).
 */
export function findBlockIndexForTime(
  blocks: SlideBlock[],
  currentTimeSec: number,
  leadTimeSec = TIMED_LYRICS_LEAD_TIME_SEC
): number | null {
  const flat = flattenSongTimedLines(blocks);
  let bestBlockIdx: number | null = null;
  let bestTime = -1;

  for (const line of flat) {
    if (typeof line.timeSec === 'number' && !Number.isNaN(line.timeSec)) {
      if (line.timeSec <= currentTimeSec + leadTimeSec && line.timeSec >= bestTime) {
        bestTime = line.timeSec;
        bestBlockIdx = line.blockIndex;
      }
    }
  }
  return bestBlockIdx;
}

/**
 * Parses an `.lrc` synced lyrics file into SlideBlock[] with per-line timestamps.
 */
export function parseLrcToBlocks(lrcText: string): SlideBlock[] {
  const blocks: SlideBlock[] = [];
  const lines = lrcText.split(/\r?\n/);

  for (const line of lines) {
    const match = line.match(/^\[(\d+):(\d{1,2}(?:\.\d+)?)\]\s*(.*)$/);
    if (!match) continue;
    const mins = Number.parseInt(match[1], 10);
    const secs = Number.parseFloat(match[2]);
    const text = match[3].trim();
    if (!text) continue;

    const startTimeSec = Math.round((mins * 60 + secs) * 10) / 10;
    blocks.push({
      id: `lrc-${blocks.length}-${Date.now()}`,
      label: formatTimestamp(startTimeSec),
      lines: [text],
      startTimeSec,
      lineTimingsSec: [startTimeSec]
    });
  }

  return blocks;
}
