import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { CanvasElement } from '../../shared/types';
import { getElementAnimationStyle, getSmokeVector } from '../utils/canvasAnimations';
import { CanvasFrameGraphic, getCroppedImageStyle } from './CanvasFrameGraphic';
import { CanvasLineGraphic, STAGE_VIRTUAL_H, STAGE_VIRTUAL_W } from './CanvasLineGraphic';
import { CanvasShapeGraphic } from './CanvasShapeGraphic';
import { applyListPrefix, buildTextEffectsCss, buildShimmerStarsStyle } from '../utils/textEffects';
import { extractPrimaryFontFamily, FONT_CATALOG } from '../fonts';
import { ensureFontLoaded } from '../utils/fontLoader';
import { CanvasThreeDModel } from './CanvasThreeDModel';
import { CanvasThreeDObject } from './CanvasThreeDObject';

interface CanvasSlideStageProps {
  elements: CanvasElement[];
  background: string;
  liveParticipant?: {
    title?: string;
    name?: string;
    centroOrPosition?: string;
  };
}

/**
 * Renders Canva-style positioned elements with an edge-to-edge background
 * and a centered 16:9 Safe Area so slides never clip on 4:3, 16:10, or 21:9 screens.
 */
export const CanvasSlideStage: React.FC<CanvasSlideStageProps> = ({
  elements,
  background,
  liveParticipant
}) => {
  const outerRef = useRef<HTMLDivElement>(null);
  const [stageSize, setStageSize] = useState({ width: 960, height: 540 });

  useLayoutEffect(() => {
    const el = outerRef.current;
    if (!el) return;

    const update = () => {
      const w = el.clientWidth;
      const h = el.clientHeight;
      if (w <= 0 || h <= 0) return;
      const targetRatio = 16 / 9;
      if (w / h > targetRatio) {
        setStageSize({ width: h * targetRatio, height: h });
      } else {
        setStageSize({ width: w, height: w / targetRatio });
      }
    };

    update();
    const observer = new ResizeObserver(update);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const scale = stageSize.height / 1080;
  const sorted = [...elements].sort((a, b) => a.zIndex - b.zIndex);

  useEffect(() => {
    for (const el of elements) {
      if (el.kind === 'text' && el.fontFamily) {
        const family = extractPrimaryFontFamily(el.fontFamily);
        const entry = FONT_CATALOG.find((f) => f.family === family);
        if (entry?.googleSpec) {
          void ensureFontLoaded(entry.family, entry.googleSpec);
        }
      }
    }
  }, [elements]);

  return (
    <div
      ref={outerRef}
      style={{
        width: '100%',
        height: '100%',
        background,
        backgroundSize: 'cover',
        backgroundPosition: 'center',
        position: 'relative',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        overflow: 'hidden'
      }}
    >
      {/* Safe Area Stage (16:9 contained inside any display aspect ratio) */}
      <div
        style={{
          width: `${stageSize.width}px`,
          height: `${stageSize.height}px`,
          position: 'relative',
          flexShrink: 0
        }}
      >
        <svg
          width="0"
          height="0"
          aria-hidden="true"
          style={{ position: 'absolute', pointerEvents: 'none' }}
        >
          <defs>
            <filter id="uecfi-vapor-haze-filter" x="-40%" y="-80%" width="180%" height="260%">
              <feTurbulence
                type="fractalNoise"
                baseFrequency="0.012 0.05"
                numOctaves="2"
                seed="7"
                result="n"
              >
                <animate
                  attributeName="baseFrequency"
                  values="0.012 0.05;0.02 0.09;0.012 0.05"
                  dur="7s"
                  repeatCount="indefinite"
                />
              </feTurbulence>
              <feDisplacementMap in="SourceGraphic" in2="n" scale="0" xChannelSelector="R" yChannelSelector="G">
                <animate
                  attributeName="scale"
                  values="0;0;90;0;0"
                  keyTimes="0;.3;.55;.8;1"
                  dur="7s"
                  repeatCount="indefinite"
                />
              </feDisplacementMap>
            </filter>
          </defs>
        </svg>
        {sorted.map((item) => {
          if (item.kind === 'line') {
            return (
              <svg
                key={item.id}
                viewBox={`0 0 ${STAGE_VIRTUAL_W} ${STAGE_VIRTUAL_H}`}
                preserveAspectRatio="none"
                style={{
                  position: 'absolute',
                  inset: 0,
                  width: '100%',
                  height: '100%',
                  zIndex: item.zIndex,
                  opacity: item.opacity ?? 1,
                  pointerEvents: 'none',
                  overflow: 'visible',
                  ...getElementAnimationStyle(item)
                }}
              >
                <CanvasLineGraphic element={item} />
              </svg>
            );
          }
          const isVectorShape =
            item.kind === 'shape' &&
            item.shapeType &&
            item.shapeType !== 'rectangle' &&
            item.shapeType !== 'roundedRect';
          return (
          <div
            key={item.id}
            style={{
              position: 'absolute',
              left: `${item.x}%`,
              top: `${item.y}%`,
              width: `${item.width}%`,
              height: `${item.height}%`,
              zIndex: item.zIndex,
              opacity: item.opacity ?? 1,
              background: isVectorShape ? 'transparent' : item.backgroundColor || 'transparent',
              borderRadius: isVectorShape ? undefined : `${(item.borderRadius ?? 0) * scale}px`,
              overflow:
                item.kind === 'text' ||
                isVectorShape ||
                item.animation === 'glow' ||
                item.animation === 'vaporHaze' ||
                item.animation === 'wobble3d'
                  ? 'visible'
                  : 'hidden',
              transform: item.rotation ? `rotate(${item.rotation}deg)` : undefined,
              display: 'flex',
              alignItems: 'center',
              justifyContent:
                item.textAlign === 'left'
                  ? 'flex-start'
                  : item.textAlign === 'right'
                    ? 'flex-end'
                    : 'center'
            }}
          >
            <div
              style={{
                width: '100%',
                height: '100%',
                display: 'flex',
                alignItems: 'center',
                justifyContent:
                  item.textAlign === 'left'
                    ? 'flex-start'
                    : item.textAlign === 'right'
                      ? 'flex-end'
                      : 'center',
                ...getElementAnimationStyle(item)
              }}
            >
            <div
              style={{
                width: '100%',
                height: '100%',
                display: 'flex',
                alignItems: 'center',
                justifyContent:
                  item.textAlign === 'left'
                    ? 'flex-start'
                    : item.textAlign === 'right'
                      ? 'flex-end'
                      : 'center',
                ...(item.animation === 'vaporHaze'
                  ? { filter: 'url(#uecfi-vapor-haze-filter)' }
                  : {}),
                ...(item.textEffect === 'threeDGlow' || item.animation === 'wobble3d'
                  ? { transformStyle: 'preserve-3d' }
                  : {})
              }}
            >
            {isVectorShape && item.shapeType && (
              <div
                style={{
                  width: '100%',
                  height: '100%',
                  transform:
                    item.flipX || item.flipY
                      ? `scale(${item.flipX ? -1 : 1}, ${item.flipY ? -1 : 1})`
                      : undefined
                }}
              >
                <CanvasShapeGraphic
                  shapeType={item.shapeType}
                  fill={item.backgroundColor || '#1e293b'}
                />
              </div>
            )}

            {item.kind === 'participantWidget' && liveParticipant && (
              <div
                style={{
                  width: '100%',
                  height: '100%',
                  display: 'flex',
                  flexDirection: 'column',
                  justifyContent: 'center',
                  alignItems:
                    item.textAlign === 'right'
                      ? 'flex-end'
                      : item.textAlign === 'center'
                        ? 'center'
                        : 'flex-start',
                  textAlign: item.textAlign ?? 'left',
                  padding: `${16 * scale}px ${22 * scale}px`,
                  borderLeft: item.widgetAccentColor
                    ? `${Math.max(2, 6 * scale)}px solid ${item.widgetAccentColor}`
                    : undefined,
                  fontFamily: item.fontFamily || "'Inter', sans-serif",
                  gap: `${4 * scale}px`
                }}
              >
                {item.widgetInlineTitle ? (
                  <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'baseline', gap: `${8 * scale}px`, lineHeight: 1.18 }}>
                    {liveParticipant?.title && (
                      <span
                        style={{
                          color: item.widgetTitleColor || '#93c5fd',
                          fontSize: `${(item.widgetTitleSize ?? 34) * scale}px`,
                          fontWeight: 600
                        }}
                      >
                        {liveParticipant.title}
                      </span>
                    )}
                    <span
                      style={{
                        color: item.widgetNameColor || '#f8fafc',
                        fontSize: `${(item.widgetNameSize ?? 46) * scale}px`,
                        fontWeight: 800
                      }}
                    >
                      {liveParticipant?.name ?? ''}
                    </span>
                  </div>
                ) : (
                  <>
                    {liveParticipant?.title && (
                      <div
                        style={{
                          color: item.widgetTitleColor || '#93c5fd',
                          fontSize: `${(item.widgetTitleSize ?? 28) * scale}px`,
                          fontWeight: 600,
                          lineHeight: 1.15
                        }}
                      >
                        {liveParticipant.title}
                      </div>
                    )}
                    {liveParticipant?.name && (
                      <div
                        style={{
                          color: item.widgetNameColor || '#f8fafc',
                          fontSize: `${(item.widgetNameSize ?? 46) * scale}px`,
                          fontWeight: 800,
                          lineHeight: 1.15
                        }}
                      >
                        {liveParticipant.name}
                      </div>
                    )}
                  </>
                )}
                {liveParticipant?.centroOrPosition && (
                  <div
                    style={{
                      color: item.widgetCentroColor || '#cbd5e1',
                      fontSize: `${(item.widgetCentroSize ?? 26) * scale}px`,
                      fontWeight: 500,
                      lineHeight: 1.2
                    }}
                  >
                    {liveParticipant.centroOrPosition}
                  </div>
                )}
              </div>
            )}

            {item.kind === 'text' && (() => {
              const textEffect = item.textEffect ?? 'none';
              const isPrismSpin = textEffect === 'prismSpin';
              const isShimmer = textEffect === 'shimmer';
              const isRainbow = textEffect === 'rainbow';
              const isRainbowRipple = textEffect === 'rainbowRipple';
              const isOverride = textEffect === 'override';
              const isVoltage = textEffect === 'voltage';
              const isThreeDGlow = textEffect === 'threeDGlow';
              const isTrace = textEffect === 'trace';
              const isThreeDExtrude = textEffect === 'threeDExtrude';
              const isPopArt = textEffect === 'popArt';
              const isRetroStack = textEffect === 'retroStack';
              const isSlideStripes = textEffect === 'slideStripes';
              const isBlock3d = textEffect === 'block3d';
              const isAmazingPop = textEffect === 'amazingPop';
              const isStrokeDraw = item.animation === 'strokeDraw';
              const isGradientText =
                !isPrismSpin &&
                !isShimmer &&
                !isRainbow &&
                !isRainbowRipple &&
                !isOverride &&
                !isVoltage &&
                !isThreeDGlow &&
                !isTrace &&
                !isThreeDExtrude &&
                !isPopArt &&
                !isRetroStack &&
                !isSlideStripes &&
                !isBlock3d &&
                !isAmazingPop &&
                (item.color || '').includes('gradient(');
              const hasOutline = Boolean(item.outlineWidth && item.outlineWidth > 0);
              const { textShadow: glowShadow, filter: glowFilter } = buildTextEffectsCss(
                item,
                scale
              );
              const isSmokeDissolve = item.animation === 'smokeDissolve';
              const isMaskRise = item.animation === 'maskRise';
              const isPowerOn = item.animation === 'powerOn';
              const isSquishy = item.animation === 'squishy';
              const isRipple = item.animation === 'ripple';
              const displayText = applyListPrefix(item.text || '', item.listStyle);
              const renderTextBody = () => {
                const raw = displayText;
                if (
                  !isRainbow &&
                  !isRainbowRipple &&
                  !isVoltage &&
                  !isSmokeDissolve &&
                  !isMaskRise &&
                  !isPowerOn &&
                  !isSquishy &&
                  !isRipple
                )
                  return raw;
                const baseDelaySec = item.animationDelay ?? 0;
                const charDurationSec =
                  item.animationDuration ??
                  (isMaskRise ? 0.85 : isPowerOn ? 1.2 : isSquishy ? 1.5 : isRipple ? 1.6 : 1.1);
                const smokeUnit = item.animationUnit ?? (isMaskRise ? 'line' : 'character');
                const smokeDir = item.animationDirection ?? 'up';
                const smokeIntensity = item.animationIntensity ?? 1;

                let effectCharCounter = 0;
                const renderEffectSegment = (segment: string) => {
                  if (!isRainbow && !isRainbowRipple && !isVoltage) return segment;
                  return Array.from(segment).map((ch, i) => {
                    const eIdx = effectCharCounter++;
                    return (
                      <span
                        key={i}
                        className={[
                          isRainbow ? 'uecfi-rainbow-static-char' : '',
                          isRainbowRipple ? 'uecfi-rainbow-char' : '',
                          isVoltage ? 'uecfi-voltage-char' : ''
                        ]
                          .filter(Boolean)
                          .join(' ')}
                        style={{
                          ...(isRainbow || isRainbowRipple
                            ? {
                                ['--char-i' as string]: eIdx,
                                ['--rainbow-hsl' as string]: `hsl(${(eIdx * 42) % 360}, 88%, 66%)`
                              }
                            : {}),
                          ...(isVoltage
                            ? {
                                ['--i' as string]: eIdx,
                                WebkitTextStrokeWidth: `${Math.max(1, 2 * scale)}px`
                              }
                            : {})
                        }}
                      >
                        {ch === ' ' ? '\u00A0' : ch}
                      </span>
                    );
                  });
                };

                if (isMaskRise) {
                  const maskY = smokeDir === 'down' ? '-112%' : '112%';
                  const maskTiming = 'cubic-bezier(0.16, 0.84, 0.3, 1)';

                  if (smokeUnit === 'line') {
                    return raw.split('\n').map((line, lineIdx) => (
                      <span key={lineIdx} className="uecfi-anim-mask uecfi-anim-mask--line">
                        <span
                          className="uecfi-anim-mask-inner"
                          style={{
                            ['--mask-y' as string]: maskY,
                            animationDuration: `${charDurationSec}s`,
                            animationTimingFunction: maskTiming,
                            animationDelay: `${baseDelaySec + lineIdx * 0.14}s`
                          }}
                        >
                          {line ? renderEffectSegment(line) : '\u00A0'}
                        </span>
                      </span>
                    ));
                  }

                  if (smokeUnit === 'word') {
                    let wordIdx = 0;
                    return raw.split('\n').map((line, lineIdx, arr) => (
                      <React.Fragment key={lineIdx}>
                        {line.split(/(\s+)/).map((part, partIdx) => {
                          if (/^\s+$/.test(part)) return <React.Fragment key={partIdx}>{part}</React.Fragment>;
                          if (!part) return null;
                          const idx = wordIdx++;
                          return (
                            <span key={partIdx} className="uecfi-anim-mask">
                              <span
                                className="uecfi-anim-mask-inner"
                                style={{
                                  ['--mask-y' as string]: maskY,
                                  animationDuration: `${charDurationSec}s`,
                                  animationTimingFunction: maskTiming,
                                  animationDelay: `${baseDelaySec + idx * 0.08}s`
                                }}
                              >
                                {renderEffectSegment(part)}
                              </span>
                            </span>
                          );
                        })}
                        {lineIdx < arr.length - 1 && <br />}
                      </React.Fragment>
                    ));
                  }

                  let maskCharIdx = 0;
                  return raw.split('\n').map((line, lineIdx, arr) => (
                    <React.Fragment key={lineIdx}>
                      {Array.from(line).map((ch, chIdx) => {
                        const idx = maskCharIdx++;
                        return (
                          <span key={chIdx} className="uecfi-anim-mask">
                            <span
                              className="uecfi-anim-mask-inner"
                              style={{
                                ['--mask-y' as string]: maskY,
                                animationDuration: `${charDurationSec}s`,
                                animationTimingFunction: maskTiming,
                                animationDelay: `${baseDelaySec + idx * 0.035}s`
                              }}
                            >
                              {renderEffectSegment(ch === ' ' ? '\u00A0' : ch)}
                            </span>
                          </span>
                        );
                      })}
                      {lineIdx < arr.length - 1 && <br />}
                    </React.Fragment>
                  ));
                }

                if (isPowerOn) {
                  if (smokeUnit === 'line') {
                    return raw.split('\n').map((line, lineIdx, arr) => (
                      <React.Fragment key={lineIdx}>
                        <span
                          className="uecfi-anim-poweron-char"
                          style={{
                            ['--poweron-dur' as string]: `${charDurationSec}s`,
                            ['--poweron-delay' as string]: `${baseDelaySec + lineIdx * 0.22}s`,
                            animationDuration: `${charDurationSec}s`,
                            animationDelay: `${baseDelaySec + lineIdx * 0.22}s`
                          }}
                        >
                          {line ? renderEffectSegment(line) : '\u00A0'}
                        </span>
                        {lineIdx < arr.length - 1 && <br />}
                      </React.Fragment>
                    ));
                  }

                  if (smokeUnit === 'word') {
                    let wordIdx = 0;
                    return raw.split('\n').map((line, lineIdx, arr) => (
                      <React.Fragment key={lineIdx}>
                        {line.split(/(\s+)/).map((part, partIdx) => {
                          if (/^\s+$/.test(part)) return <React.Fragment key={partIdx}>{part}</React.Fragment>;
                          if (!part) return null;
                          const idx = wordIdx++;
                          return (
                            <span
                              key={partIdx}
                              className="uecfi-anim-poweron-char"
                              style={{
                                ['--poweron-dur' as string]: `${charDurationSec}s`,
                                ['--poweron-delay' as string]: `${baseDelaySec + idx * 0.18}s`,
                                animationDuration: `${charDurationSec}s`,
                                animationDelay: `${baseDelaySec + idx * 0.18}s`
                              }}
                            >
                              {renderEffectSegment(part)}
                            </span>
                          );
                        })}
                        {lineIdx < arr.length - 1 && <br />}
                      </React.Fragment>
                    ));
                  }

                  let poCharIdx = 0;
                  return raw.split('\n').map((line, lineIdx, arr) => (
                    <React.Fragment key={lineIdx}>
                      {Array.from(line).map((ch, chIdx) => {
                        const idx = poCharIdx++;
                        return (
                          <span
                            key={chIdx}
                            className="uecfi-anim-poweron-char"
                            style={{
                              ['--poweron-dur' as string]: `${charDurationSec}s`,
                              ['--poweron-delay' as string]: `${baseDelaySec + idx * 0.16}s`,
                              animationDuration: `${charDurationSec}s`,
                              animationDelay: `${baseDelaySec + idx * 0.16}s`
                            }}
                          >
                            {renderEffectSegment(ch === ' ' ? '\u00A0' : ch)}
                          </span>
                        );
                      })}
                      {lineIdx < arr.length - 1 && <br />}
                    </React.Fragment>
                  ));
                }

                if (isRipple) {
                  if (smokeUnit === 'line') {
                    return raw.split('\n').map((line, lineIdx, arr) => (
                      <React.Fragment key={lineIdx}>
                        <span
                          className="uecfi-anim-ripple-char"
                          style={{
                            ['--i' as string]: lineIdx,
                            ['--ripple-k' as string]: smokeIntensity,
                            animationDuration: `${charDurationSec}s`,
                            animationDelay: `${lineIdx * -0.18}s`
                          }}
                        >
                          {line ? renderEffectSegment(line) : '\u00A0'}
                        </span>
                        {lineIdx < arr.length - 1 && <br />}
                      </React.Fragment>
                    ));
                  }

                  if (smokeUnit === 'word') {
                    let wordIdx = 0;
                    return raw.split('\n').map((line, lineIdx, arr) => (
                      <React.Fragment key={lineIdx}>
                        {line.split(/(\s+)/).map((part, partIdx) => {
                          if (/^\s+$/.test(part)) return <React.Fragment key={partIdx}>{part}</React.Fragment>;
                          if (!part) return null;
                          const idx = wordIdx++;
                          return (
                            <span
                              key={partIdx}
                              className="uecfi-anim-ripple-char"
                              style={{
                                ['--i' as string]: idx,
                                ['--ripple-k' as string]: smokeIntensity,
                                animationDuration: `${charDurationSec}s`,
                                animationDelay: `${idx * -0.15}s`
                              }}
                            >
                              {renderEffectSegment(part)}
                            </span>
                          );
                        })}
                        {lineIdx < arr.length - 1 && <br />}
                      </React.Fragment>
                    ));
                  }

                  let ripCharIdx = 0;
                  return raw.split('\n').map((line, lineIdx, arr) => (
                    <React.Fragment key={lineIdx}>
                      {Array.from(line).map((ch, chIdx) => {
                        const idx = ripCharIdx++;
                        return (
                          <span
                            key={chIdx}
                            className="uecfi-anim-ripple-char"
                            style={{
                              ['--i' as string]: idx,
                              ['--ripple-k' as string]: smokeIntensity,
                              animationDuration: `${charDurationSec}s`,
                              animationDelay: `${idx * -0.12}s`
                            }}
                          >
                            {renderEffectSegment(ch === ' ' ? '\u00A0' : ch)}
                          </span>
                        );
                      })}
                      {lineIdx < arr.length - 1 && <br />}
                    </React.Fragment>
                  ));
                }

                if (isSquishy) {
                  if (smokeUnit === 'line') {
                    return raw.split('\n').map((line, lineIdx, arr) => (
                      <React.Fragment key={lineIdx}>
                        <span
                          className="uecfi-anim-squishy-char"
                          style={{
                            ['--i' as string]: lineIdx,
                            ['--squishy-k' as string]: smokeIntensity,
                            animationDuration: `${charDurationSec}s`,
                            animationDelay: `${lineIdx * -0.18}s`
                          }}
                        >
                          {line ? renderEffectSegment(line) : '\u00A0'}
                        </span>
                        {lineIdx < arr.length - 1 && <br />}
                      </React.Fragment>
                    ));
                  }

                  if (smokeUnit === 'word') {
                    let wordIdx = 0;
                    return raw.split('\n').map((line, lineIdx, arr) => (
                      <React.Fragment key={lineIdx}>
                        {line.split(/(\s+)/).map((part, partIdx) => {
                          if (/^\s+$/.test(part)) return <React.Fragment key={partIdx}>{part}</React.Fragment>;
                          if (!part) return null;
                          const idx = wordIdx++;
                          return (
                            <span
                              key={partIdx}
                              className="uecfi-anim-squishy-char"
                              style={{
                                ['--i' as string]: idx,
                                ['--squishy-k' as string]: smokeIntensity,
                                animationDuration: `${charDurationSec}s`,
                                animationDelay: `${idx * -0.15}s`
                              }}
                            >
                              {renderEffectSegment(part)}
                            </span>
                          );
                        })}
                        {lineIdx < arr.length - 1 && <br />}
                      </React.Fragment>
                    ));
                  }

                  let sqCharIdx = 0;
                  return raw.split('\n').map((line, lineIdx, arr) => (
                    <React.Fragment key={lineIdx}>
                      {Array.from(line).map((ch, chIdx) => {
                        const idx = sqCharIdx++;
                        return (
                          <span
                            key={chIdx}
                            className="uecfi-anim-squishy-char"
                            style={{
                              ['--i' as string]: idx,
                              ['--squishy-k' as string]: smokeIntensity,
                              animationDuration: `${charDurationSec}s`,
                              animationDelay: `${idx * -0.13}s`
                            }}
                          >
                            {renderEffectSegment(ch === ' ' ? '\u00A0' : ch)}
                          </span>
                        );
                      })}
                      {lineIdx < arr.length - 1 && <br />}
                    </React.Fragment>
                  ));
                }

                if (isSmokeDissolve && smokeUnit === 'line') {
                  return raw.split('\n').map((line, lineIdx, arr) => {
                    const vec = getSmokeVector(lineIdx, smokeDir, smokeIntensity);
                    return (
                      <React.Fragment key={lineIdx}>
                        <span
                          className="uecfi-anim-smoke-char"
                          style={{
                            ['--sx' as string]: vec.x,
                            ['--sy' as string]: vec.y,
                            ['--sr' as string]: vec.r,
                            animationDuration: `${charDurationSec}s`,
                            animationDelay: `${baseDelaySec + lineIdx * 0.16}s`
                          }}
                        >
                          {line ? renderEffectSegment(line) : '\u00A0'}
                        </span>
                        {lineIdx < arr.length - 1 && <br />}
                      </React.Fragment>
                    );
                  });
                }

                if (isSmokeDissolve && smokeUnit === 'word') {
                  let wordIdx = 0;
                  return raw.split('\n').map((line, lineIdx, arr) => (
                    <React.Fragment key={lineIdx}>
                      {line.split(/(\s+)/).map((part, partIdx) => {
                        if (/^\s+$/.test(part)) return <React.Fragment key={partIdx}>{part}</React.Fragment>;
                        if (!part) return null;
                        const idx = wordIdx++;
                        const vec = getSmokeVector(idx, smokeDir, smokeIntensity);
                        return (
                          <span
                            key={partIdx}
                            className="uecfi-anim-smoke-char"
                            style={{
                              ['--sx' as string]: vec.x,
                              ['--sy' as string]: vec.y,
                              ['--sr' as string]: vec.r,
                              animationDuration: `${charDurationSec}s`,
                              animationDelay: `${baseDelaySec + idx * 0.11}s`
                            }}
                          >
                            {renderEffectSegment(part)}
                          </span>
                        );
                      })}
                      {lineIdx < arr.length - 1 && <br />}
                    </React.Fragment>
                  ));
                }

                let charIdx = 0;
                return raw.split('\n').map((line, lineIdx, arr) => (
                  <React.Fragment key={lineIdx}>
                    {Array.from(line).map((ch, chIdx) => {
                      const idx = charIdx++;
                      const vec = getSmokeVector(idx, smokeDir, smokeIntensity);
                      if (isSmokeDissolve && (isRainbowRipple || isVoltage)) {
                        return (
                          <span
                            key={chIdx}
                            className="uecfi-anim-smoke-char"
                            style={{
                              ['--sx' as string]: vec.x,
                              ['--sy' as string]: vec.y,
                              ['--sr' as string]: vec.r,
                              animationDuration: `${charDurationSec}s`,
                              animationDelay: `${baseDelaySec + idx * 0.055}s`
                            }}
                          >
                            {renderEffectSegment(ch === ' ' ? '\u00A0' : ch)}
                          </span>
                        );
                      }
                      return (
                        <span
                          key={chIdx}
                          className={[
                            isRainbow ? 'uecfi-rainbow-static-char' : '',
                            isRainbowRipple ? 'uecfi-rainbow-char' : '',
                            isVoltage ? 'uecfi-voltage-char' : '',
                            isSmokeDissolve ? 'uecfi-anim-smoke-char' : ''
                          ]
                            .filter(Boolean)
                            .join(' ')}
                          style={{
                            ...(isRainbow || isRainbowRipple
                              ? {
                                  ['--char-i' as string]: idx,
                                  ['--rainbow-hsl' as string]: `hsl(${(idx * 42) % 360}, 88%, 66%)`
                                }
                              : {}),
                            ...(isVoltage
                              ? {
                                  ['--i' as string]: idx,
                                  WebkitTextStrokeWidth: `${Math.max(1, 2 * scale)}px`
                                }
                              : {}),
                            ...(isSmokeDissolve
                              ? {
                                  ['--sx' as string]: vec.x,
                                  ['--sy' as string]: vec.y,
                                  ['--sr' as string]: vec.r,
                                  animationDuration: `${charDurationSec}s`,
                                  animationDelay: `${baseDelaySec + idx * 0.055}s`
                                }
                              : {})
                          }}
                        >
                          {ch === ' ' ? '\u00A0' : ch}
                        </span>
                      );
                    })}
                    {lineIdx < arr.length - 1 && <br />}
                  </React.Fragment>
                ));
              };
              const baseTextStyle: React.CSSProperties = {
                width: '100%',
                fontFamily: item.fontFamily || "'Inter', sans-serif",
                fontSize: `${(item.fontSize ?? 56) * scale * (item.textPosition && item.textPosition !== 'normal' ? 0.62 : 1)}px`,
                ...(item.textPosition === 'superscript'
                  ? { position: 'relative', top: '-0.35em' }
                  : item.textPosition === 'subscript'
                    ? { position: 'relative', top: '0.28em' }
                    : {}),
                fontWeight: item.fontWeight ?? '700',
                fontStyle: item.fontStyle ?? 'normal',
                textDecoration: item.textDecoration ?? 'none',
                textTransform: item.textTransform === 'uppercase' ? 'uppercase' : undefined,
                textAlign: item.textAlign ?? 'center',
                lineHeight: item.lineHeight ?? 1.22,
                letterSpacing:
                  typeof item.letterSpacing === 'number'
                    ? `${item.letterSpacing}em`
                    : undefined,
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-word',
                padding: `${12 * scale}px`
              };
              if (isTrace || isStrokeDraw) {
                const fontSizePx =
                  (item.fontSize ?? 56) *
                  scale *
                  (item.textPosition && item.textPosition !== 'normal' ? 0.62 : 1);
                const lineHeightVal = item.lineHeight ?? 1.22;
                const padPx = 12 * scale;
                const lines = displayText.split('\n');
                const svgHeight = Math.ceil(lines.length * fontSizePx * lineHeightVal + padPx * 2);
                const anchor =
                  item.textAlign === 'left'
                    ? 'start'
                    : item.textAlign === 'right'
                      ? 'end'
                      : 'middle';
                const xPos =
                  item.textAlign === 'left'
                    ? padPx
                    : item.textAlign === 'right'
                      ? `calc(100% - ${padPx}px)`
                      : '50%';
                const drawDur = item.animationDuration ?? 3.0;
                const drawDelay = item.animationDelay ?? 0.2;
                const fillDelay = Number((drawDelay + drawDur * 0.9).toFixed(2));
                const dashLen = Math.round(Math.max(320, fontSizePx * 5.2));
                const dashLit = Math.max(24, Math.round(fontSizePx * 0.55));
                const dashGap = Math.max(180, Math.round(fontSizePx * 4.3));
                const inkColor =
                  item.color && !item.color.includes('gradient(') ? item.color : '#ffffff';
                const traceColor =
                  item.color && !item.color.includes('gradient(') ? item.color : '#38e8d6';
                return (
                  <svg
                    width="100%"
                    height={svgHeight}
                    style={{ display: 'block', width: '100%', overflow: 'visible' }}
                  >
                    {lines.map((rawLine, lineIdx) => {
                      const lineText =
                        item.textTransform === 'uppercase' ? rawLine.toUpperCase() : rawLine;
                      const yPos = padPx + (lineIdx + 0.78) * fontSizePx * lineHeightVal;
                      const commonTextProps = {
                        x: xPos,
                        y: yPos,
                        textAnchor: anchor as 'start' | 'middle' | 'end',
                        style: {
                          fontFamily: item.fontFamily || "'Inter', sans-serif",
                          fontSize: `${fontSizePx}px`,
                          fontWeight: item.fontWeight ?? '700',
                          fontStyle: item.fontStyle ?? 'normal',
                          letterSpacing:
                            typeof item.letterSpacing === 'number'
                              ? `${item.letterSpacing}em`
                              : undefined
                        }
                      };
                      if (isTrace) {
                        return (
                          <React.Fragment key={lineIdx}>
                            <text
                              {...commonTextProps}
                              className="uecfi-trace-base"
                              strokeWidth={Math.max(1, 1.5 * scale)}
                            >
                              {lineText}
                            </text>
                            <text
                              {...commonTextProps}
                              aria-hidden="true"
                              className="uecfi-trace-lit"
                              strokeWidth={Math.max(1, 2 * scale)}
                              strokeDasharray={`${dashLit} ${dashGap}`}
                              style={{
                                ...commonTextProps.style,
                                ['--trace-glow' as string]: traceColor,
                                ['--trace-period' as string]: -(dashLit + dashGap)
                              }}
                            >
                              {lineText}
                            </text>
                          </React.Fragment>
                        );
                      }
                      return (
                        <text
                          key={lineIdx}
                          {...commonTextProps}
                          className="uecfi-anim-stroke-draw"
                          strokeWidth={Math.max(1, 2 * scale)}
                          style={{
                            ...commonTextProps.style,
                            ['--stroke-ink' as string]: inkColor,
                            ['--draw-dash' as string]: dashLen,
                            ['--draw-dur' as string]: `${drawDur}s`,
                            ['--draw-delay' as string]: `${drawDelay + lineIdx * 0.4}s`,
                            ['--fill-delay' as string]: `${fillDelay + lineIdx * 0.4}s`
                          }}
                        >
                          {lineText}
                        </text>
                      );
                    })}
                  </svg>
                );
              }
              if (item.animation === 'deconstructed' && !isTrace && !isThreeDGlow) {
                return (
                  <div
                    className="uecfi-deconstructed-stage"
                    style={{
                      ['--decon-dur' as string]: `${item.animationDuration ?? 5}s`
                    }}
                  >
                    <div style={{ ...baseTextStyle, opacity: 0, pointerEvents: 'none' }}>
                      {displayText}
                    </div>
                    {[1, 2, 3, 4].map((sliceNum) => (
                      <div
                        key={sliceNum}
                        aria-hidden="true"
                        className={[
                          `uecfi-deconstructed-slice-${sliceNum}`,
                          isPopArt ? 'uecfi-text-pop-art' : '',
                          isRetroStack ? 'uecfi-text-retro-stack' : '',
                          isThreeDExtrude ? 'uecfi-text-3d-extrude' : '',
                          isOverride ? 'uecfi-text-override' : '',
                          isPrismSpin ? 'uecfi-text-prism-spin' : '',
                          isShimmer ? 'uecfi-text-shimmer' : ''
                        ]
                          .filter(Boolean)
                          .join(' ')}
                        style={{
                          ...baseTextStyle,
                          ...(isPopArt
                            ? {
                                color: 'transparent',
                                WebkitTextFillColor: 'transparent',
                                ...(item.color && !item.color.includes('gradient(')
                                  ? ({ '--pop-art-accent': item.color } as React.CSSProperties)
                                  : {})
                              }
                            : isThreeDExtrude
                              ? {
                                  ...(item.color && !item.color.includes('gradient(')
                                    ? ({ '--extrude-color': item.color } as React.CSSProperties)
                                    : {})
                                }
                              : isPrismSpin || isShimmer
                                ? {
                                    ...(isShimmer && item.color && !item.color.includes('gradient(')
                                      ? ({ '--shimmer-color': item.color } as React.CSSProperties)
                                      : {}),
                                    WebkitBackgroundClip: 'text',
                                    backgroundClip: 'text',
                                    WebkitTextFillColor: 'transparent',
                                    color: 'transparent'
                                  }
                                : { color: item.color || '#ffffff' }),
                          position: 'absolute',
                          inset: 0,
                          pointerEvents: 'none'
                        }}
                      >
                        {displayText}
                      </div>
                    ))}
                  </div>
                );
              }
              if (isThreeDGlow) {
                const layerStyle: React.CSSProperties = {
                  ...baseTextStyle,
                  color: item.color || '#0a0a0a',
                  ['--glow-3d-blur' as string]: `${Math.max(4, 30 * scale)}px`,
                  WebkitTextStroke: hasOutline
                    ? `${item.outlineWidth! * scale}px ${item.outlineColor || '#000000'}`
                    : undefined,
                  paintOrder: hasOutline ? 'stroke fill' : undefined
                };
                return (
                  <div className="uecfi-text-3d-glow-stage" style={{ width: '100%' }}>
                    {Array.from({ length: 10 }, (_, layerIdx) => (
                      <div
                        key={layerIdx}
                        aria-hidden={layerIdx > 0 || undefined}
                        className="uecfi-text-3d-glow-layer"
                        style={{
                          ...layerStyle,
                          ...(layerIdx > 0
                            ? { position: 'absolute', inset: 0, pointerEvents: 'none' }
                            : { position: 'relative' }),
                          transform:
                            layerIdx > 0
                              ? `translateZ(${Number((layerIdx * 5 * scale).toFixed(2))}px)`
                              : undefined
                        }}
                      >
                        {displayText}
                      </div>
                    ))}
                  </div>
                );
              }
              if ((isGradientText || isPrismSpin || isShimmer) && hasOutline) {
                return (
                  <div style={{ position: 'relative', width: '100%' }}>
                    <div
                      aria-hidden="true"
                      style={{
                        ...baseTextStyle,
                        color: 'transparent',
                        WebkitTextStroke: `${item.outlineWidth! * scale}px ${item.outlineColor || '#000000'}`,
                        filter: glowFilter
                      }}
                    >
                      {displayText}
                    </div>
                    <div
                      className={
                        isPrismSpin
                          ? 'uecfi-text-prism-spin'
                          : isShimmer
                            ? 'uecfi-text-shimmer'
                            : undefined
                      }
                      style={{
                        ...baseTextStyle,
                        position: 'absolute',
                        inset: 0,
                        ...(isGradientText ? { backgroundImage: item.color } : {}),
                        ...(isShimmer && item.color && !item.color.includes('gradient(')
                          ? ({ '--shimmer-color': item.color } as React.CSSProperties)
                          : {}),
                        WebkitBackgroundClip: 'text',
                        backgroundClip: 'text',
                        WebkitTextFillColor: 'transparent',
                        color: 'transparent'
                      }}
                    >
                      {displayText}
                      {isShimmer && (
                        <span
                          className="uecfi-shimmer-stars"
                          style={buildShimmerStarsStyle(
                            item.shimmerDensity,
                            item.shimmerGlow,
                            item.color,
                            item.shimmerParticleSize
                          )}
                          aria-hidden="true"
                        />
                      )}
                    </div>
                  </div>
                );
              }
              return (
                <div
                  data-text={isOverride ? displayText : undefined}
                  className={
                    isPrismSpin
                      ? 'uecfi-text-prism-spin'
                      : isShimmer
                        ? 'uecfi-text-shimmer'
                        : isRainbow
                          ? 'uecfi-text-rainbow'
                          : isRainbowRipple
                            ? 'uecfi-text-rainbow-ripple'
                            : isOverride
                              ? 'uecfi-text-override'
                              : isVoltage
                                ? 'uecfi-text-voltage'
                                : isThreeDExtrude
                                  ? 'uecfi-text-3d-extrude'
                                  : isPopArt
                                    ? 'uecfi-text-pop-art'
                                    : isRetroStack
                                      ? 'uecfi-text-retro-stack'
                                      : isSlideStripes
                                        ? 'uecfi-text-slide-stripes'
                                        : isBlock3d
                                          ? 'uecfi-text-block-3d'
                                          : isAmazingPop
                                            ? 'uecfi-text-amazing-pop'
                                            : undefined
                  }
                  style={{
                    ...baseTextStyle,
                    ...(isGradientText || isPrismSpin || isShimmer || isSlideStripes
                      ? {
                          ...(isGradientText ? { backgroundImage: item.color } : {}),
                          ...(isShimmer && item.color && !item.color.includes('gradient(')
                            ? ({ '--shimmer-color': item.color } as React.CSSProperties)
                            : {}),
                          WebkitBackgroundClip: 'text',
                          backgroundClip: 'text',
                          WebkitTextFillColor: 'transparent',
                          color: 'transparent',
                          filter: glowFilter
                        }
                      : isRainbow || isRainbowRipple
                        ? {
                            textShadow: glowShadow
                          }
                        : isVoltage
                          ? {
                              color: 'transparent',
                              WebkitTextFillColor: 'transparent',
                              ...(item.color && !item.color.includes('gradient(')
                                ? ({ '--voltage-color': item.color } as React.CSSProperties)
                                : {})
                            }
                          : isThreeDExtrude
                            ? {
                                ...(item.color && !item.color.includes('gradient(')
                                  ? ({ '--extrude-color': item.color } as React.CSSProperties)
                                  : {})
                              }
                            : isPopArt
                              ? {
                                  color: 'transparent',
                                  WebkitTextFillColor: 'transparent',
                                  ...(item.color && !item.color.includes('gradient(')
                                    ? ({ '--pop-art-accent': item.color } as React.CSSProperties)
                                    : {})
                                }
                              : isAmazingPop
                                ? {
                                    ...(item.color && !item.color.includes('gradient(')
                                      ? ({ '--amazing-accent': item.color } as React.CSSProperties)
                                      : {})
                                  }
                                : isOverride
                            ? {
                                color: item.color || '#f4f6ff',
                                ...(glowShadow && glowShadow !== 'none'
                                  ? { textShadow: glowShadow }
                                  : {})
                              }
                            : {
                                color: item.color || '#ffffff',
                                textShadow: glowShadow
                              }),
                    WebkitTextStroke: hasOutline
                      ? `${item.outlineWidth! * scale}px ${item.outlineColor || '#000000'}`
                      : undefined,
                    paintOrder: hasOutline ? 'stroke fill' : undefined
                  }}
                >
                  {renderTextBody()}
                  {isShimmer && (
                    <span
                      className="uecfi-shimmer-stars"
                      style={buildShimmerStarsStyle(
                        item.shimmerDensity,
                        item.shimmerGlow,
                        item.color,
                        item.shimmerParticleSize
                      )}
                      aria-hidden="true"
                    />
                  )}
                </div>
              );
            })()}

            {item.kind === 'divider' && (
              <div
                style={{
                  width: '100%',
                  height: `${Math.max(1, (item.thickness ?? 4) * scale)}px`,
                  backgroundColor: item.color || '#ffffff',
                  borderRadius: '999px'
                }}
              />
            )}

            {item.kind === 'frame' && (
              <CanvasFrameGraphic
                frameShape={item.frameShape}
                imageSrc={item.imageSrc}
                borderRadius={
                  (item.borderRadius ?? (item.frameShape === 'rounded' ? 32 : 0)) * scale
                }
                imageScale={item.imageScale}
                imageOffsetX={item.imageOffsetX}
                imageOffsetY={item.imageOffsetY}
                imageRotation={item.imageRotation}
                flipX={item.flipX}
                flipY={item.flipY}
              />
            )}

            {item.kind === 'image' && item.imageSrc && (
              item.threeD?.enabled ? (
                <CanvasThreeDObject
                  imageSrc={item.imageSrc}
                  config={item.threeD}
                  flipX={item.flipX}
                  flipY={item.flipY}
                />
              ) : (
                <div style={{ width: '100%', height: '100%', position: 'relative', overflow: 'hidden' }}>
                  <img src={item.imageSrc} alt="" style={getCroppedImageStyle(item)} />
                </div>
              )
            )}

            {item.kind === 'model3d' && item.modelSrc && (
              <CanvasThreeDModel
                modelSrc={item.modelSrc}
                config={item.threeD}
                flipX={item.flipX}
                flipY={item.flipY}
              />
            )}
            </div>
            </div>
          </div>
          );
        })}
      </div>
    </div>
  );
};
