import React, { useLayoutEffect, useRef, useState } from 'react';

interface AutoFitTextProps {
  lines: string[];
  verseNumber?: string | null;
  minSize?: number;
  maxSize?: number;
  /**
   * Optional reference container height (in px) for unscaled views such as StageView.
   * When omitted (the default inside FittedMainScreenFrame / ScaledMainScreenPreview),
   * minSize and maxSize are used directly in the normalized 1080p virtual stage space.
   */
  referenceHeight?: number;
  lineHeight?: number;
  noWrap?: boolean;
  bulletStyle?: 'accent' | 'pill' | 'superscript' | 'plain';
  bulletColor?: string;
  style?: React.CSSProperties;
}

const DOC_BULLET_RE = /^([•●▪◦\-*]|\d+[.)]|[a-zA-Z][.)])\s+(.+)$/;

/**
 * Automatically scales font size via binary search so text
 * is as large as possible while never overflowing its container.
 */
export const AutoFitText: React.FC<AutoFitTextProps> = ({
  lines,
  verseNumber,
  minSize = 12,
  maxSize = 140,
  referenceHeight,
  lineHeight = 1.22,
  noWrap = false,
  bulletStyle,
  bulletColor = '#93c5fd',
  style
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const textRef = useRef<HTMLDivElement>(null);
  const [fontSize, setFontSize] = useState<number>(maxSize);

  const joinedKey = lines.join('\n');

  useLayoutEffect(() => {
    const container = containerRef.current;
    const textEl = textRef.current;
    if (!container || !textEl) return;

    const fit = () => {
      const maxW = container.clientWidth;
      const maxH = container.clientHeight;
      if (maxW <= 0 || maxH <= 0) return;

      // Inside FittedMainScreenFrame / ScaledMainScreenPreview, the virtual stage already
      // normalizes for resolution and aspect ratio, so minSize and maxSize are used directly.
      // Only views rendered in raw device pixels (like StageView) opt in via referenceHeight.
      let effectiveMin = minSize;
      let effectiveMax = maxSize;
      if (referenceHeight && referenceHeight > 0) {
        const heightScale = Math.max(0.65, maxH / referenceHeight);
        effectiveMax = Math.round(maxSize * heightScale);
        effectiveMin = Math.max(12, Math.round(minSize * Math.min(1, heightScale)));
      }

      let low = Math.min(effectiveMin, effectiveMax);
      let high = Math.max(effectiveMin, effectiveMax);
      let best = low;

      // Binary search for the largest font size that fits without overflow
      while (low <= high) {
        const mid = Math.floor((low + high) / 2);
        textEl.style.fontSize = `${mid}px`;

        if (textEl.scrollHeight <= maxH + 1 && textEl.scrollWidth <= maxW + 1) {
          best = mid;
          low = mid + 1;
        } else {
          high = mid - 1;
        }
      }

      textEl.style.fontSize = `${best}px`;
      setFontSize(best);
    };

    fit();

    const observer = new ResizeObserver(() => fit());
    observer.observe(container);
    return () => observer.disconnect();
  }, [joinedKey, verseNumber, minSize, maxSize, referenceHeight, lineHeight, noWrap, bulletStyle, bulletColor]);

  return (
    <div
      ref={containerRef}
      style={{
        width: '100%',
        height: '100%',
        minHeight: 0,
        minWidth: 0,
        overflow: 'visible',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        ...style
      }}
    >
      <div
        ref={textRef}
        style={{
          fontSize: `${fontSize}px`,
          lineHeight,
          width: '100%',
          whiteSpace: noWrap ? 'nowrap' : undefined,
          overflowWrap: noWrap ? undefined : 'break-word',
          wordBreak: noWrap ? undefined : 'break-word'
        }}
      >
        {lines.map((line, i) => {
          const bulletMatch =
            bulletStyle && bulletStyle !== 'plain' ? line.match(DOC_BULLET_RE) : null;
          return (
            <div key={i}>
              {i === 0 && verseNumber && (
                <sup
                  style={{
                    color: '#fbbf24',
                    fontWeight: 800,
                    fontSize: '0.58em',
                    lineHeight: 0,
                    verticalAlign: 'super',
                    marginRight: '0.24em'
                  }}
                >
                  {verseNumber}
                </sup>
              )}
              {bulletMatch ? (
                bulletStyle === 'superscript' ? (
                  <>
                    <sup
                      style={{
                        color: bulletColor,
                        fontWeight: 800,
                        fontSize: '0.58em',
                        lineHeight: 0,
                        verticalAlign: 'super',
                        marginRight: '0.28em'
                      }}
                    >
                      {bulletMatch[1]}
                    </sup>
                    {bulletMatch[2]}
                  </>
                ) : (
                  <>
                    <span
                      style={
                        bulletStyle === 'pill'
                          ? {
                              display: 'inline-flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              color: bulletColor,
                              background: `${bulletColor}24`,
                              border: `1.5px solid ${bulletColor}`,
                              borderRadius: '0.36em',
                              padding: '0.02em 0.36em',
                              marginRight: '0.36em',
                              fontWeight: 800,
                              fontSize: '0.84em',
                              lineHeight: 1.1,
                              verticalAlign: 'baseline'
                            }
                          : {
                              color: bulletColor,
                              fontWeight: 800,
                              marginRight: '0.32em'
                            }
                      }
                    >
                      {bulletMatch[1]}
                    </span>
                    {bulletMatch[2]}
                  </>
                )
              ) : (
                line
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};
