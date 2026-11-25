import React, { useLayoutEffect, useRef, useState } from 'react';
import { TIMED_LYRICS_LEAD_TIME_SEC, type TimedLyricLine } from '../utils/timedLyrics';

interface TimedLyricsScrollerProps {
  lines: TimedLyricLine[];
  activeLineIndex: number;
  audioCurrentTimeSec?: number;
  background: string;
  compact?: boolean;
  textColor?: string;
  highlightColor?: string;
  outlineWidth?: number;
  outlineColor?: string;
  highlightOutlineWidth?: number;
  highlightOutlineColor?: string;
  bgDim?: number;
  title?: string;
  titleColor?: string;
}

const COUNT_IN_DOT_COUNT = 5;

/**
 * Continuously scrolls song lyrics vertically based on per-line timestamps,
 * keeping the active line centered and highlighted.
 */
export const TimedLyricsScroller: React.FC<TimedLyricsScrollerProps> = React.memo(({
  lines,
  activeLineIndex,
  audioCurrentTimeSec,
  background,
  compact = false,
  textColor = '#ffffff',
  highlightColor,
  outlineWidth = 0,
  outlineColor = '#000000',
  highlightOutlineWidth = 0,
  highlightOutlineColor = '#000000',
  bgDim = 0,
  title,
  titleColor = '#cbd5e1'
}) => {
  const dimAlpha = Math.min(0.85, Math.max(0, bgDim / 100));
  const viewportRef = useRef<HTMLDivElement>(null);
  const activeLineRef = useRef<HTMLDivElement>(null);
  const measureRef = useRef<HTMLSpanElement>(null);
  const [translateY, setTranslateY] = useState<number>(0);
  const [fontSize, setFontSize] = useState<number>(compact ? 14 : 62);

  const scrollTargetIndex = activeLineIndex >= 0 ? activeLineIndex : 0;
  const resolvedDotColor = highlightColor || '#93c5fd';
  const resolvedActiveColor = highlightColor || textColor;
  const inactiveStrokePx =
    outlineWidth > 0 ? (compact ? Math.max(0.5, outlineWidth * 0.35) : outlineWidth) : 0;
  const highlightStrokePx =
    highlightOutlineWidth > 0
      ? compact
        ? Math.max(0.5, highlightOutlineWidth * 0.35)
        : highlightOutlineWidth
      : 0;
  const longestLine = lines.reduce(
    (longest, line) => (line.text.length > longest.length ? line.text : longest),
    ''
  );

  // Compute 5 count-in dots above the very first line before it becomes active.
  // Finish the last dot slightly before effectiveStartSec so all dots are visibly gone before line 1 activates.
  const firstLineTimeSec = lines[0]?.timeSec;
  const effectiveStartSec =
    typeof firstLineTimeSec === 'number' && !Number.isNaN(firstLineTimeSec)
      ? Math.max(0, firstLineTimeSec - TIMED_LYRICS_LEAD_TIME_SEC)
      : undefined;
  const endBufferSec =
    typeof effectiveStartSec === 'number' ? Math.min(1.0, effectiveStartSec * 0.2) : 0;
  const dotFinishSec =
    typeof effectiveStartSec === 'number' ? Math.max(0, effectiveStartSec - endBufferSec) : undefined;
  let visibleCountInDots = 0;
  if (
    activeLineIndex < 0 &&
    typeof dotFinishSec === 'number' &&
    dotFinishSec > 0
  ) {
    const tNow = audioCurrentTimeSec ?? 0;
    const remaining = dotFinishSec - tNow;
    if (remaining > 0.05) {
      // 1 second per dot when available intro >= 5s; proportionally faster for shorter intros.
      const stepSec =
        dotFinishSec >= COUNT_IN_DOT_COUNT ? 1 : dotFinishSec / COUNT_IN_DOT_COUNT;
      visibleCountInDots = Math.min(
        COUNT_IN_DOT_COUNT,
        Math.max(0, Math.ceil(remaining / stepSec))
      );
    }
  }

  // Auto-adjust font size so the widest lyric line maximizes the viewport width without clipping.
  useLayoutEffect(() => {
    const fitWidth = () => {
      const viewport = viewportRef.current;
      const measureEl = measureRef.current;
      if (!viewport || !measureEl || !longestLine) return;

      const style = window.getComputedStyle(viewport);
      const padLeft = Number.parseFloat(style.paddingLeft) || 0;
      const padRight = Number.parseFloat(style.paddingRight) || 0;
      // Reserve headroom for the active line's scale(1.06) transform.
      const availableWidth = (viewport.clientWidth - padLeft - padRight) / 1.07;
      if (availableWidth <= 0 || viewport.clientHeight <= 0) return;

      const minSize = compact ? 10 : 20;
      const maxCap = compact ? 22 : 76;
      const refDim = Math.min(viewport.clientHeight, viewport.clientWidth);
      const maxSize = Math.max(minSize, Math.min(maxCap, Math.round(refDim * 0.085)));

      let low = minSize;
      let high = maxSize;
      let best = minSize;
      while (low <= high) {
        const mid = Math.floor((low + high) / 2);
        measureEl.style.fontSize = `${mid}px`;
        if (measureEl.offsetWidth <= availableWidth) {
          best = mid;
          low = mid + 1;
        } else {
          high = mid - 1;
        }
      }
      setFontSize(best);
    };

    fitWidth();
    const observer = new ResizeObserver(() => fitWidth());
    if (viewportRef.current) observer.observe(viewportRef.current);
    return () => observer.disconnect();
  }, [longestLine, compact]);

  useLayoutEffect(() => {
    const updateOffset = () => {
      const viewport = viewportRef.current;
      const activeEl = activeLineRef.current;
      if (!viewport || !activeEl) return;
      const centerY = viewport.clientHeight / 2;
      const targetCenterY = activeEl.offsetTop + activeEl.offsetHeight / 2;
      setTranslateY(centerY - targetCenterY);
    };

    updateOffset();

    const observer = new ResizeObserver(() => updateOffset());
    if (viewportRef.current) observer.observe(viewportRef.current);
    return () => observer.disconnect();
  }, [scrollTargetIndex, lines.length, compact, fontSize]);

  return (
    <div
      style={{
        width: '100%',
        height: '100%',
        containerType: 'size',
        background,
        color: '#ffffff',
        overflow: 'hidden',
        position: 'relative',
        display: 'flex',
        flexDirection: 'column'
      }}
    >
      {dimAlpha > 0 && (
        <div
          aria-hidden="true"
          style={{
            position: 'absolute',
            inset: 0,
            background: `rgba(0, 0, 0, ${dimAlpha})`,
            pointerEvents: 'none',
            zIndex: 0
          }}
        />
      )}
      <div
        ref={viewportRef}
        style={{
          flex: 1,
          minHeight: 0,
          width: '100%',
          position: 'relative',
          zIndex: 1,
          overflow: 'hidden',
          padding: compact ? '0 12px' : '0 3cqw',
          maskImage:
            'linear-gradient(to bottom, transparent 0%, black 18%, black 82%, transparent 100%)',
          WebkitMaskImage:
            'linear-gradient(to bottom, transparent 0%, black 18%, black 82%, transparent 100%)'
        }}
      >
        {/* Offscreen probe for measuring the widest lyric line */}
        <span
          ref={measureRef}
          aria-hidden="true"
          style={{
            position: 'absolute',
            visibility: 'hidden',
            pointerEvents: 'none',
            whiteSpace: 'nowrap',
            fontWeight: 800,
            lineHeight: 1.24
          }}
        >
          {longestLine}
        </span>
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: compact ? '8px' : '3.2cqh',
            transform: `translate3d(0, ${translateY}px, 0)`,
            transition: 'transform 420ms cubic-bezier(0.22, 1, 0.36, 1)',
            willChange: 'transform'
          }}
        >
          {lines.map((line, idx) => {
            const isActive = activeLineIndex >= 0 && idx === activeLineIndex;
            const isPast = activeLineIndex >= 0 && idx < activeLineIndex;
            const isScrollTarget = idx === scrollTargetIndex;
            // Keep at most 5 lines visible around the centered target line (2 above, active, 2 below).
            const isVisibleWindow = Math.abs(idx - scrollTargetIndex) <= 2;
            const lineStrokePx = isActive ? highlightStrokePx : inactiveStrokePx;
            const lineStrokeColor = isActive ? highlightOutlineColor : outlineColor;
            return (
              <div
                key={line.key}
                ref={isScrollTarget ? activeLineRef : undefined}
                style={{
                  position: 'relative',
                  textAlign: 'center',
                  fontSize: `${fontSize}px`,
                  lineHeight: 1.24,
                  fontWeight: isActive ? 800 : 600,
                  color: isActive ? resolvedActiveColor : textColor,
                  visibility: isVisibleWindow ? 'visible' : 'hidden',
                  opacity: !isVisibleWindow || isPast ? 0 : isActive ? 1 : 0.5,
                  transform: isActive ? 'scale(1.06)' : 'scale(0.96)',
                  WebkitTextStroke:
                    lineStrokePx > 0 ? `${lineStrokePx}px ${lineStrokeColor}` : undefined,
                  paintOrder: lineStrokePx > 0 ? 'stroke fill' : undefined,
                  textShadow: isActive
                    ? `0 0 28px ${resolvedDotColor}80, 0 4px 20px rgba(0, 0, 0, 0.85)`
                    : '0 2px 12px rgba(0, 0, 0, 0.65)',
                  transition: 'opacity 280ms ease, transform 320ms ease, color 280ms ease',
                  maxWidth: '100%'
                }}
              >
                {idx === 0 && typeof dotFinishSec === 'number' && dotFinishSec > 0 && (
                  <div
                    aria-hidden="true"
                    style={{
                      position: 'absolute',
                      bottom: '100%',
                      left: '50%',
                      transform: 'translateX(-50%)',
                      marginBottom: compact ? '6px' : '2.2cqh',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: compact ? '6px' : '1.8cqh',
                      pointerEvents: 'none',
                      opacity: visibleCountInDots > 0 ? 1 : 0,
                      transition: 'opacity 220ms ease'
                    }}
                  >
                    {Array.from({ length: COUNT_IN_DOT_COUNT }).map((_, dotIdx) => {
                      const dotVisible = dotIdx < visibleCountInDots;
                      return (
                        <span
                          key={dotIdx}
                          style={{
                            width: compact ? '7px' : '2.1cqh',
                            height: compact ? '7px' : '2.1cqh',
                            borderRadius: '999px',
                            background: resolvedDotColor,
                            boxShadow: dotVisible ? `0 0 14px ${resolvedDotColor}` : 'none',
                            opacity: dotVisible ? 1 : 0,
                            transform: dotVisible ? 'scale(1)' : 'scale(0.35)',
                            transition: 'opacity 180ms ease, transform 180ms ease'
                          }}
                        />
                      );
                    })}
                  </div>
                )}
                {line.text}
              </div>
            );
          })}
        </div>
      </div>
      {title && (
        <div
          style={{
            flexShrink: 0,
            padding: compact ? '4px 18px 14px' : '1.2cqh 4cqw 5cqh',
            fontSize: compact ? '1.02rem' : 'min(4.8cqh, 4.8cqw)',
            fontWeight: 600,
            color: titleColor || '#cbd5e1',
            letterSpacing: '0.04em',
            textAlign: 'center',
            position: 'relative',
            zIndex: 1
          }}
        >
          {title}
        </div>
      )}
    </div>
  );
});
