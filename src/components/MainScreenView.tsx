import React from 'react';
import type { LiveState } from '../../shared/types';
import { useTerminology } from '../hooks/useTerminology';
import { AutoFitText } from './AutoFitText';
import { CanvasSlideStage } from './CanvasSlideStage';
import { TimedLyricsScroller } from './TimedLyricsScroller';
import { findActiveTimedLineIndex, flattenSongTimedLines } from '../utils/timedLyrics';

interface MainScreenViewProps {
  liveState: LiveState | null;
  compact?: boolean;
}

/**
 * Strips the trailing "(Bible Title)" from a verse block label for presentation
 * display and extracts the leading verse number (e.g. "Genesis 1:1 (KJV)" ->
 * { reference: "Genesis 1:1", verseNumber: "1" }).
 */
function parseVerseDisplay(label?: string): { reference: string; verseNumber: string | null } {
  if (!label) return { reference: '', verseNumber: null };
  const reference = label.replace(/^(.*?\b\d+:\d+(?:-\d+)?)\s*\(.*\)$/, '$1').trim();
  const verseMatch = reference.match(/:(\d+)/);
  return {
    reference,
    verseNumber: verseMatch ? verseMatch[1] : null
  };
}

/**
 * Renders the congregation-facing Main Screen output.
 * Supports Slide Mode, Teleprompter Mode, Clear Text, Blackout, and Show Logo.
 */
export const MainScreenView: React.FC<MainScreenViewProps> = ({ liveState, compact = false }) => {
  const t = useTerminology();

  if (!liveState || liveState.override === 'blackout') {
    return (
      <div
        style={{
          width: '100%',
          height: '100%',
          background: '#000000',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center'
        }}
      />
    );
  }

  // Show custom Logo Slide or default standby screen when Show Logo is active or no item is projected yet.
  if (liveState.override === 'showLogo' || (!liveState.activeItem && liveState.override !== 'clearText')) {
    const customLogoBlock = liveState.logoSlide?.blocks?.[0];
    if (customLogoBlock?.canvasElements && customLogoBlock.canvasElements.length > 0) {
      return (
        <CanvasSlideStage
          elements={customLogoBlock.canvasElements}
          background={
            liveState.logoSlide?.themeBackground ||
            'radial-gradient(circle at center, #1e293b 0%, #020617 100%)'
          }
        />
      );
    }

    return (
      <div
        style={{
          width: '100%',
          height: '100%',
          containerType: 'size',
          background: 'radial-gradient(circle at center, #1e293b 0%, #020617 100%)',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          color: '#f8fafc',
          textAlign: 'center',
          padding: compact ? '16px' : '4.5cqh'
        }}
      >
        <div
          style={{
            fontSize: compact ? '1.25rem' : 'min(6.4cqh, 5cqw)',
            fontWeight: 800,
            letterSpacing: '0.08em',
            textTransform: 'uppercase'
          }}
        >
          {t.appName}
        </div>
        <div
          style={{
            marginTop: compact ? '6px' : '1.5cqh',
            fontSize: compact ? '0.75rem' : 'min(2.6cqh, 2.2cqw)',
            color: '#94a3b8'
          }}
        >
          {liveState.programName}
        </div>
      </div>
    );
  }

  const item = liveState.activeItem;
  const activeBlockPreview = item?.blocks[liveState.activeBlockIndex] ?? item?.blocks[0];
  const background =
    activeBlockPreview?.background ||
    item?.themeBackground ||
    'linear-gradient(135deg, #0f172a 0%, #1e293b 100%)';

  if (liveState.override === 'clearText' || !item) {
    return (
      <div
        style={{
          width: '100%',
          height: '100%',
          background,
          backgroundSize: 'cover',
          backgroundPosition: 'center',
          transition: 'background 300ms ease'
        }}
      />
    );
  }

  const blocks = item.blocks;
  const activeBlock = blocks[liveState.activeBlockIndex] ?? blocks[0];
  const verseMaxPx = liveState.verseMaxFontSize ?? 72;
  const dualVerseMaxPx = Math.round(verseMaxPx * 0.82);

  // Canva-style Slide Rendering (Edge-to-edge background + 16:9 Safe Area)
  if (
    activeBlock?.canvasElements &&
    (activeBlock.canvasElements.length > 0 || item.type === 'slide')
  ) {
    return (
      <CanvasSlideStage
        elements={activeBlock.canvasElements}
        background={background}
      />
    );
  }

  const isStackedVerse =
    item?.type === 'verse' &&
    Boolean(activeBlock?.secondaryLines && activeBlock.secondaryLines.length > 0) &&
    liveState.bibleLayout === 'stacked';
  const verseDimAlpha = Math.min(
    0.85,
    Math.max(0, ((isStackedVerse ? item?.verseStackedBgDim : item?.verseBgDim) ?? 0) / 100)
  );

  // Stacked Dual-Bible Verse Rendering (Primary on top, Secondary on bottom)
  if (isStackedVerse && item && activeBlock?.secondaryLines) {
    const primaryParsed = parseVerseDisplay(activeBlock.label);
    const secondaryParsed = parseVerseDisplay(activeBlock.secondaryLabel);
    const stackedBackground = item.verseStackedThemeBackground || background;

    return (
      <div
        style={{
          width: '100%',
          height: '100%',
          containerType: 'size',
          background: stackedBackground,
          color: '#ffffff',
          display: 'grid',
          gridTemplateColumns: '1fr',
          gridTemplateRows: '1fr 1fr',
          gap: compact ? '10px' : '2.4cqh',
          padding: compact ? '14px' : '5cqh 3.5cqw',
          alignItems: 'center',
          textAlign: 'center',
          position: 'relative',
          overflow: 'hidden'
        }}
      >
        {verseDimAlpha > 0 && (
          <div
            aria-hidden="true"
            style={{
              position: 'absolute',
              inset: 0,
              background: `rgba(0, 0, 0, ${verseDimAlpha})`,
              pointerEvents: 'none',
              zIndex: 0
            }}
          />
        )}
        {/* Primary Bible */}
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: compact ? '4px' : '1.2cqh',
            paddingBottom: compact ? '6px' : '2cqh',
            borderBottom: '1px solid rgba(255,255,255,0.2)',
            height: '100%',
            minHeight: 0,
            position: 'relative',
            zIndex: 1,
            overflow: 'visible'
          }}
        >
          {primaryParsed.reference && (
            <div
              style={{
                flexShrink: 0,
                fontSize: compact ? '0.9rem' : 'min(3.6cqh, 3.6cqw)',
                fontWeight: 700,
                color: item.verseStackedPrimaryRefColor || '#93c5fd',
                letterSpacing: '0.04em'
              }}
            >
              {primaryParsed.reference}
            </div>
          )}
          <div style={{ flex: 1, minHeight: 0 }}>
            <AutoFitText
              lines={activeBlock.lines}
              verseNumber={primaryParsed.verseNumber}
              minSize={compact ? 8 : 16}
              maxSize={compact ? 22 : dualVerseMaxPx}
              lineHeight={1.24}
              style={{
                textAlign: 'center',
                fontWeight: 700,
                color: item.verseStackedPrimaryTextColor || '#ffffff',
                textShadow: '0 2px 16px rgba(0, 0, 0, 0.7)'
              }}
            />
          </div>
        </div>

        {/* Secondary Bible */}
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: compact ? '4px' : '1.2cqh',
            height: '100%',
            minHeight: 0,
            position: 'relative',
            zIndex: 1,
            overflow: 'visible'
          }}
        >
          {secondaryParsed.reference && (
            <div
              style={{
                flexShrink: 0,
                fontSize: compact ? '0.9rem' : 'min(3.6cqh, 3.6cqw)',
                fontWeight: 700,
                color: item.verseStackedSecondaryRefColor || '#86efac',
                letterSpacing: '0.04em'
              }}
            >
              {secondaryParsed.reference}
            </div>
          )}
          <div style={{ flex: 1, minHeight: 0 }}>
            <AutoFitText
              lines={activeBlock.secondaryLines}
              verseNumber={secondaryParsed.verseNumber}
              minSize={compact ? 8 : 16}
              maxSize={compact ? 22 : dualVerseMaxPx}
              lineHeight={1.24}
              style={{
                textAlign: 'center',
                fontWeight: 600,
                color: item.verseStackedSecondaryTextColor || '#f1f5f9',
                textShadow: '0 2px 16px rgba(0, 0, 0, 0.7)'
              }}
            />
          </div>
        </div>
      </div>
    );
  }

  // Single-Bible Verse Rendering (Primary or Secondary): auto-scale up to verseMaxPx
  if (item.type === 'verse' && activeBlock) {
    const useSecondary =
      liveState.bibleLayout === 'secondary' &&
      activeBlock.secondaryLines &&
      activeBlock.secondaryLines.length > 0;
    const verseLines = useSecondary ? activeBlock.secondaryLines! : activeBlock.lines;
    const verseLabel = useSecondary ? activeBlock.secondaryLabel : activeBlock.label;
    const parsed = parseVerseDisplay(verseLabel);

    return (
      <div
        style={{
          width: '100%',
          height: '100%',
          containerType: 'size',
          background,
          color: '#ffffff',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          textAlign: 'center',
          padding: compact ? '14px 18px' : '5cqh 4cqw',
          gap: compact ? '6px' : '2.4cqh',
          position: 'relative',
          overflow: 'hidden'
        }}
      >
        {verseDimAlpha > 0 && (
          <div
            aria-hidden="true"
            style={{
              position: 'absolute',
              inset: 0,
              background: `rgba(0, 0, 0, ${verseDimAlpha})`,
              pointerEvents: 'none',
              zIndex: 0
            }}
          />
        )}
        <div style={{ flex: 1, width: '100%', minHeight: 0, position: 'relative', zIndex: 1 }}>
          <AutoFitText
            lines={verseLines}
            verseNumber={parsed.verseNumber}
            minSize={compact ? 8 : 18}
            maxSize={compact ? 26 : verseMaxPx}
            lineHeight={1.22}
            style={{
              fontWeight: 700,
              color: item.verseTextColor || '#ffffff',
              textAlign: 'center',
              textShadow: '0 4px 24px rgba(0, 0, 0, 0.7)'
            }}
          />
        </div>
        {parsed.reference && (
          <div
            style={{
              flexShrink: 0,
              fontSize: compact ? '1.02rem' : 'min(4.8cqh, 4.8cqw)',
              fontWeight: 600,
              color: item.verseRefColor || '#cbd5e1',
              letterSpacing: '0.04em',
              position: 'relative',
              zIndex: 1
            }}
          >
            {parsed.reference}
          </div>
        )}
      </div>
    );
  }

  // Audio-Synced / Timed Lyrics Rendering: continuous scrolling with active line highlight
  if (item.type === 'song' && liveState.lyricsMode === 'timed') {
    const timedLines = flattenSongTimedLines(blocks);
    if (timedLines.length > 0) {
      const activeLineIdx = findActiveTimedLineIndex(
        timedLines,
        liveState.audioCurrentTimeSec,
        liveState.activeBlockIndex
      );
      return (
        <TimedLyricsScroller
          lines={timedLines}
          activeLineIndex={activeLineIdx}
          audioCurrentTimeSec={activeLineIdx < 0 ? liveState.audioCurrentTimeSec : undefined}
          background={background}
          compact={compact}
          textColor={item.songTextColor}
          highlightColor={item.songHighlightColor}
          outlineWidth={item.songOutlineWidth}
          outlineColor={item.songOutlineColor}
          highlightOutlineWidth={item.songHighlightOutlineWidth}
          highlightOutlineColor={item.songHighlightOutlineColor}
          bgDim={item.songBgDim}
          title={item.title}
          titleColor={item.songTitleColor}
        />
      );
    }
  }

  // Slide Mode (default): centered, clean congregation projection
  return (
    <div
      style={{
        width: '100%',
        height: '100%',
        containerType: 'size',
        background,
        color: '#ffffff',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        textAlign: 'center',
        padding: compact ? '14px 18px' : item.type === 'song' ? '5cqh 3cqw' : '5cqh 4cqw',
        gap: compact ? '6px' : '2.4cqh',
        position: 'relative',
        overflow: 'hidden'
      }}
    >
      {item.type === 'song' ? (
        (() => {
          const songDimAlpha = Math.min(0.85, Math.max(0, (item.songBgDim ?? 0) / 100));
          const outlinePx =
            item.songOutlineWidth && item.songOutlineWidth > 0
              ? compact
                ? Math.max(0.5, item.songOutlineWidth * 0.35)
                : item.songOutlineWidth
              : 0;
          return (
            <>
              {songDimAlpha > 0 && (
                <div
                  aria-hidden="true"
                  style={{
                    position: 'absolute',
                    inset: 0,
                    background: `rgba(0, 0, 0, ${songDimAlpha})`,
                    pointerEvents: 'none',
                    zIndex: 0
                  }}
                />
              )}
              <div style={{ flex: 1, width: '100%', minHeight: 0, position: 'relative', zIndex: 1 }}>
                <AutoFitText
                  lines={activeBlock?.lines ?? []}
                  minSize={compact ? 10 : 18}
                  maxSize={compact ? 26 : 88}
                  lineHeight={1.22}
                  noWrap
                  style={{
                    textAlign: 'center',
                    fontWeight: 700,
                    color: item.songTextColor || '#ffffff',
                    WebkitTextStroke:
                      outlinePx > 0 ? `${outlinePx}px ${item.songOutlineColor || '#000000'}` : undefined,
                    paintOrder: outlinePx > 0 ? 'stroke fill' : undefined,
                    textShadow: '0 4px 24px rgba(0, 0, 0, 0.7)'
                  }}
                />
              </div>
            </>
          );
        })()
      ) : item.type === 'programItem' ? (
        (() => {
          const docDimAlpha = Math.min(0.85, Math.max(0, (item.docBgDim ?? 0) / 100));
          const docOutlinePx =
            item.docOutlineWidth && item.docOutlineWidth > 0
              ? compact
                ? Math.max(0.5, item.docOutlineWidth * 0.35)
                : item.docOutlineWidth
              : 0;
          return (
            <>
              {docDimAlpha > 0 && (
                <div
                  aria-hidden="true"
                  style={{
                    position: 'absolute',
                    inset: 0,
                    background: `rgba(0, 0, 0, ${docDimAlpha})`,
                    pointerEvents: 'none',
                    zIndex: 0
                  }}
                />
              )}
              <div style={{ flex: 1, width: '100%', minHeight: 0, position: 'relative', zIndex: 1 }}>
                <AutoFitText
                  lines={activeBlock?.lines ?? []}
                  minSize={compact ? 10 : 18}
                  maxSize={compact ? 26 : (item.docMaxFontSize ?? 72)}
                  lineHeight={1.24}
                  bulletStyle={item.docBulletStyle ?? 'accent'}
                  bulletColor={item.docBulletColor || '#93c5fd'}
                  style={{
                    textAlign: 'center',
                    fontWeight: 700,
                    color: item.docTextColor || '#ffffff',
                    WebkitTextStroke:
                      docOutlinePx > 0
                        ? `${docOutlinePx}px ${item.docOutlineColor || '#000000'}`
                        : undefined,
                    paintOrder: docOutlinePx > 0 ? 'stroke fill' : undefined,
                    textShadow: '0 4px 24px rgba(0, 0, 0, 0.7)'
                  }}
                />
              </div>
            </>
          );
        })()
      ) : (
        <div
          style={{
            flex: 1,
            width: '100%',
            minHeight: 0,
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'center',
            gap: compact ? '5px' : '1.6cqh',
            fontSize: compact ? '1rem' : '6.8cqh',
            fontWeight: 700,
            lineHeight: 1.25,
            textShadow: '0 4px 24px rgba(0, 0, 0, 0.7)'
          }}
        >
          {activeBlock?.lines.map((line, i) => (
            <div key={i}>{line}</div>
          ))}
        </div>
      )}

      {item.title && (
        <div
          style={{
            flexShrink: 0,
            fontSize: compact ? '1.02rem' : 'min(4.8cqh, 4.8cqw)',
            fontWeight: 600,
            color:
              item.type === 'song'
                ? item.songTitleColor || '#cbd5e1'
                : item.type === 'programItem'
                  ? item.docTitleColor || '#cbd5e1'
                  : '#cbd5e1',
            letterSpacing: '0.04em',
            position: 'relative',
            zIndex: 1
          }}
        >
          {item.title}
        </div>
      )}
    </div>
  );
};
