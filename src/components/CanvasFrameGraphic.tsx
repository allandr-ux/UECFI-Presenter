import React, { useEffect, useId, useRef, useState } from 'react';
import type { FrameVariant } from '../../shared/types';
import framePlaceholderImg from '../assets/frame-placeholder.png';

/** Caches natural aspect ratios (width / height) of loaded frame images by src. */
export const frameImageAspectCache = new Map<string, number>();

export function getFrameCoverDimensions(
  frameW: number,
  frameH: number,
  imgAspect: number
): { coverW: number; coverH: number; coverWPct: number; coverHPct: number } {
  const safeW = Math.max(1, frameW);
  const safeH = Math.max(1, frameH);
  const frameAspect = safeW / safeH;
  const safeImgAspect = imgAspect > 0 && Number.isFinite(imgAspect) ? imgAspect : frameAspect;

  if (safeImgAspect >= frameAspect) {
    const coverWPct = (safeImgAspect / frameAspect) * 100;
    return {
      coverW: safeH * safeImgAspect,
      coverH: safeH,
      coverWPct,
      coverHPct: 100
    };
  }
  const coverHPct = (frameAspect / safeImgAspect) * 100;
  return {
    coverW: safeW,
    coverH: safeW / safeImgAspect,
    coverWPct: 100,
    coverHPct
  };
}

/**
 * Clamps inner frame image scale and pan offsets so the rotated, scaled image
 * always completely covers the frame without exposing any empty background.
 */
export function clampFrameImageTransform(params: {
  frameShape: FrameVariant;
  frameW: number;
  frameH: number;
  imgAspect: number;
  scale: number;
  offsetX: number;
  offsetY: number;
  rotation: number;
}): { scale: number; offsetX: number; offsetY: number; minScale: number } {
  const { frameShape, frameW, frameH, imgAspect, scale, offsetX, offsetY, rotation } = params;
  const safeW = Math.max(1, frameW);
  const safeH = Math.max(1, frameH);
  const halfW = safeW / 2;
  const halfH = safeH / 2;

  const rad = (rotation * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  const absCos = Math.abs(cos);
  const absSin = Math.abs(sin);

  // Ellipse/circle support function vs bounding-box support for polygonal/rect frames
  const isElliptical = frameShape === 'circle' || frameShape === 'oval';
  const reqHalfW = isElliptical
    ? Math.hypot(halfW * absCos, halfH * absSin)
    : halfW * absCos + halfH * absSin;
  const reqHalfH = isElliptical
    ? Math.hypot(halfW * absSin, halfH * absCos)
    : halfW * absSin + halfH * absCos;

  const { coverW, coverH } = getFrameCoverDimensions(safeW, safeH, imgAspect);
  const baseHalfW = coverW / 2;
  const baseHalfH = coverH / 2;

  const minScale = Math.max(1, reqHalfW / baseHalfW, reqHalfH / baseHalfH);
  const clampedScale = Math.min(4, Math.max(minScale, scale));

  const imgHalfW = baseHalfW * clampedScale;
  const imgHalfH = baseHalfH * clampedScale;
  const maxLocalX = Math.max(0, imgHalfW - reqHalfW);
  const maxLocalY = Math.max(0, imgHalfH - reqHalfH);

  // Convert frame-% offset to px, rotate into image local space, clamp, then rotate back
  const oxPx = (offsetX / 100) * safeW;
  const oyPx = (offsetY / 100) * safeH;
  const localX = oxPx * cos + oyPx * sin;
  const localY = -oxPx * sin + oyPx * cos;

  const clampedLocalX = Math.max(-maxLocalX, Math.min(maxLocalX, localX));
  const clampedLocalY = Math.max(-maxLocalY, Math.min(maxLocalY, localY));

  const clampedOxPx = clampedLocalX * cos - clampedLocalY * sin;
  const clampedOyPx = clampedLocalX * sin + clampedLocalY * cos;

  return {
    scale: Number(clampedScale.toFixed(3)),
    offsetX: Number(((clampedOxPx / safeW) * 100).toFixed(2)),
    offsetY: Number(((clampedOyPx / safeH) * 100).toFixed(2)),
    minScale
  };
}

/**
 * Computes CSS positioning for non-destructively cropped `image` elements so the
 * hidden edges stay masked by an `overflow: hidden` wrapper without stretching.
 */
export function getCroppedImageStyle(el: {
  cropTop?: number;
  cropRight?: number;
  cropBottom?: number;
  cropLeft?: number;
  flipX?: boolean;
  flipY?: boolean;
}): React.CSSProperties {
  const cT = el.cropTop ?? 0;
  const cR = el.cropRight ?? 0;
  const cB = el.cropBottom ?? 0;
  const cL = el.cropLeft ?? 0;
  const fw = Math.max(0.05, 1 - cL - cR);
  const fh = Math.max(0.05, 1 - cT - cB);
  const flip = el.flipX || el.flipY ? `scale(${el.flipX ? -1 : 1}, ${el.flipY ? -1 : 1})` : undefined;

  if (cT === 0 && cR === 0 && cB === 0 && cL === 0) {
    return {
      width: '100%',
      height: '100%',
      objectFit: 'contain',
      pointerEvents: 'none',
      transform: flip
    };
  }

  return {
    position: 'absolute',
    left: `${-(cL / fw) * 100}%`,
    top: `${-(cT / fh) * 100}%`,
    width: `${(1 / fw) * 100}%`,
    height: `${(1 / fh) * 100}%`,
    maxWidth: 'none',
    maxHeight: 'none',
    objectFit: 'fill',
    pointerEvents: 'none',
    transform: flip,
    transformOrigin: 'center center'
  };
}

export interface FramePresetOption {
  id: FrameVariant;
  label: string;
  aspect: number; // Preferred width/height ratio in pixels
}

export const FRAME_OPTIONS: FramePresetOption[] = [
  { id: 'circle', label: 'Circle', aspect: 1 },
  { id: 'square', label: 'Square', aspect: 1 },
  { id: 'rounded', label: 'Rounded Box', aspect: 4 / 3 },
  { id: 'arch', label: 'Arch', aspect: 0.8 },
  { id: 'oval', label: 'Oval', aspect: 1.35 },
  { id: 'heart', label: 'Heart', aspect: 1 },
  { id: 'star', label: 'Star', aspect: 1 },
  { id: 'hexagon', label: 'Hexagon', aspect: 1 },
  { id: 'diamond', label: 'Diamond', aspect: 1 }
];

function renderClipGeometry(shape: FrameVariant): React.ReactNode {
  switch (shape) {
    case 'circle':
      return <circle cx="0.5" cy="0.5" r="0.5" />;
    case 'oval':
      return <ellipse cx="0.5" cy="0.5" rx="0.5" ry="0.48" />;
    case 'square':
    case 'rounded':
      return <rect x="0" y="0" width="1" height="1" />;
    case 'arch':
      return <path d="M0.04,1 L0.04,0.45 A0.46,0.45 0 0,1 0.96,0.45 L0.96,1 Z" />;
    case 'heart':
      return (
        <path d="M0.5,0.93 C0.5,0.93 0.04,0.63 0.04,0.32 C0.04,0.14 0.18,0.04 0.33,0.04 C0.42,0.04 0.47,0.09 0.5,0.16 C0.53,0.09 0.58,0.04 0.67,0.04 C0.82,0.04 0.96,0.14 0.96,0.32 C0.96,0.63 0.5,0.93 0.5,0.93 Z" />
      );
    case 'star':
      return (
        <polygon points="0.5,0.03 0.62,0.36 0.97,0.38 0.70,0.60 0.79,0.94 0.5,0.75 0.21,0.94 0.30,0.60 0.03,0.38 0.38,0.36" />
      );
    case 'hexagon':
      return <polygon points="0.5,0.02 0.95,0.26 0.95,0.74 0.5,0.98 0.05,0.74 0.05,0.26" />;
    case 'diamond':
      return <polygon points="0.5,0.02 0.98,0.5 0.5,0.98 0.02,0.5" />;
  }
}

interface CanvasFrameGraphicProps {
  frameShape?: FrameVariant;
  imageSrc?: string;
  borderRadius?: number; // Scaled pixel corner radius for square/rounded frames
  imageScale?: number;
  imageOffsetX?: number;
  imageOffsetY?: number;
  imageRotation?: number;
  flipX?: boolean;
  flipY?: boolean;
  isDropTarget?: boolean;
  isEditingCrop?: boolean;
}

/**
 * Renders a Canva-style photo Frame:
 * - Clips its contents to `frameShape` via CSS borderRadius (for square/rounded) or normalized SVG clipPath.
 * - Supports independent inner image pan/scale/rotation (`imageOffsetX/Y`, `imageScale`, `imageRotation`).
 * - When `isEditingCrop` is true, renders the full unclipped image at 45% opacity behind the clipped frame.
 */
export const CanvasFrameGraphic: React.FC<CanvasFrameGraphicProps> = ({
  frameShape = 'circle',
  imageSrc,
  borderRadius,
  imageScale = 1,
  imageOffsetX = 0,
  imageOffsetY = 0,
  imageRotation = 0,
  flipX,
  flipY,
  isDropTarget = false,
  isEditingCrop = false
}) => {
  const rawId = useId();
  const clipId = `uecfi-frame-${rawId.replace(/[^a-zA-Z0-9_-]/g, '')}`;
  const containerRef = useRef<HTMLDivElement>(null);
  const [frameSize, setFrameSize] = useState<{ width: number; height: number }>({
    width: 100,
    height: 100
  });
  const [imgAspect, setImgAspect] = useState<number | null>(() =>
    imageSrc ? (frameImageAspectCache.get(imageSrc) ?? null) : null
  );

  useEffect(() => {
    setImgAspect(imageSrc ? (frameImageAspectCache.get(imageSrc) ?? null) : null);
  }, [imageSrc]);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const updateSize = () => {
      const w = el.clientWidth;
      const h = el.clientHeight;
      if (w > 0 && h > 0) {
        setFrameSize((prev) => (prev.width === w && prev.height === h ? prev : { width: w, height: h }));
      }
    };
    updateSize();
    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(updateSize);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const isRectFrame = frameShape === 'square' || frameShape === 'rounded';
  const resolvedRadius = borderRadius ?? (frameShape === 'rounded' ? 12 : 0);
  const frameAspect = frameSize.width / Math.max(1, frameSize.height);
  const effectiveImgAspect = imgAspect ?? frameAspect;
  const { coverWPct, coverHPct } = getFrameCoverDimensions(
    frameSize.width,
    frameSize.height,
    effectiveImgAspect
  );
  const clamped = imageSrc
    ? clampFrameImageTransform({
        frameShape,
        frameW: frameSize.width,
        frameH: frameSize.height,
        imgAspect: effectiveImgAspect,
        scale: imageScale,
        offsetX: imageOffsetX,
        offsetY: imageOffsetY,
        rotation: imageRotation
      })
    : { scale: 1, offsetX: 0, offsetY: 0, minScale: 1 };
  const innerTransform = `translate(${clamped.offsetX}%, ${clamped.offsetY}%) rotate(${imageRotation}deg) scale(${clamped.scale})`;

  const handleImgLoad = (e: React.SyntheticEvent<HTMLImageElement>) => {
    if (!imageSrc) return;
    const { naturalWidth, naturalHeight } = e.currentTarget;
    if (naturalWidth > 0 && naturalHeight > 0) {
      const ratio = naturalWidth / naturalHeight;
      frameImageAspectCache.set(imageSrc, ratio);
      setImgAspect(ratio);
    }
  };

  const renderTransformedImage = (opacity: number, recordLoad: boolean) => (
    <div
      style={{
        position: 'absolute',
        inset: 0,
        transform: innerTransform,
        transformOrigin: 'center center',
        pointerEvents: 'none'
      }}
    >
      <img
        src={imageSrc}
        alt=""
        onLoad={recordLoad ? handleImgLoad : undefined}
        style={{
          position: 'absolute',
          left: '50%',
          top: '50%',
          width: `${coverWPct}%`,
          height: `${coverHPct}%`,
          maxWidth: 'none',
          maxHeight: 'none',
          transform: 'translate(-50%, -50%)',
          display: 'block',
          opacity,
          pointerEvents: 'none'
        }}
      />
    </div>
  );

  return (
    <div
      ref={containerRef}
      style={{
        width: '100%',
        height: '100%',
        position: 'relative',
        overflow: isEditingCrop ? 'visible' : 'hidden'
      }}
    >
      {!isRectFrame && (
        <svg
          width="0"
          height="0"
          aria-hidden="true"
          style={{ position: 'absolute', width: 0, height: 0, pointerEvents: 'none' }}
        >
          <defs>
            <clipPath id={clipId} clipPathUnits="objectBoundingBox">
              {renderClipGeometry(frameShape)}
            </clipPath>
          </defs>
        </svg>
      )}

      {/* Ghosted unclipped image shown while double-click crop editing */}
      {isEditingCrop && imageSrc && (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            transform: flipX || flipY ? `scale(${flipX ? -1 : 1}, ${flipY ? -1 : 1})` : undefined,
            pointerEvents: 'none',
            zIndex: 0
          }}
        >
          {renderTransformedImage(0.42, false)}
        </div>
      )}

      <div
        style={{
          width: '100%',
          height: '100%',
          ...(isRectFrame
            ? { borderRadius: `${resolvedRadius}px` }
            : {
                clipPath: `url(#${clipId})`,
                WebkitClipPath: `url(#${clipId})`
              }),
          transform: flipX || flipY ? `scale(${flipX ? -1 : 1}, ${flipY ? -1 : 1})` : undefined,
          background: '#bfe3ff',
          position: 'relative',
          overflow: 'hidden',
          zIndex: 1
        }}
      >
        {imageSrc ? (
          renderTransformedImage(1, true)
        ) : (
          <img
            src={framePlaceholderImg}
            alt=""
            style={{
              width: '100%',
              height: '100%',
              objectFit: 'cover',
              display: 'block',
              pointerEvents: 'none'
            }}
          />
        )}

        {isDropTarget && (
          <div
            style={{
              position: 'absolute',
              inset: 0,
              background: 'rgba(56, 189, 248, 0.28)',
              border: '3px solid #38bdf8',
              pointerEvents: 'none'
            }}
          />
        )}
      </div>
    </div>
  );
};
