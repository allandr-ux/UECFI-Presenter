import React, { useLayoutEffect, useRef, useState } from 'react';
import type { CanvasElement } from '../../shared/types';
import { getElementAnimationStyle } from '../utils/canvasAnimations';
import { CanvasFrameGraphic, getCroppedImageStyle } from './CanvasFrameGraphic';
import { CanvasShapeGraphic } from './CanvasShapeGraphic';
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
        {sorted.map((item) => {
          const isVectorShape =
            item.kind === 'shape' && item.shapeType && item.shapeType !== 'rectangle';
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
              backgroundColor: isVectorShape ? 'transparent' : item.backgroundColor || 'transparent',
              borderRadius: isVectorShape ? undefined : `${(item.borderRadius ?? 0) * scale}px`,
              overflow: isVectorShape || item.animation === 'glow' ? 'visible' : 'hidden',
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

            {item.kind === 'text' && (
              <div
                style={{
                  width: '100%',
                  color: item.color || '#ffffff',
                  fontFamily: item.fontFamily || "'Inter', sans-serif",
                  fontSize: `${(item.fontSize ?? 56) * scale}px`,
                  fontWeight: item.fontWeight ?? '700',
                  fontStyle: item.fontStyle ?? 'normal',
                  textDecoration: item.textDecoration ?? 'none',
                  textAlign: item.textAlign ?? 'center',
                  lineHeight: item.lineHeight ?? 1.22,
                  letterSpacing:
                    typeof item.letterSpacing === 'number'
                      ? `${item.letterSpacing}em`
                      : undefined,
                  whiteSpace: 'pre-wrap',
                  wordBreak: 'break-word',
                  padding: `${12 * scale}px`,
                  WebkitTextStroke:
                    item.outlineWidth && item.outlineWidth > 0
                      ? `${item.outlineWidth * scale}px ${item.outlineColor || '#000000'}`
                      : undefined,
                  paintOrder: item.outlineWidth && item.outlineWidth > 0 ? 'stroke fill' : undefined,
                  textShadow: '0 2px 14px rgba(0, 0, 0, 0.45)'
                }}
              >
                {item.text || ''}
              </div>
            )}

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
          );
        })}
      </div>
    </div>
  );
};
