import React, { useLayoutEffect, useRef, useState } from 'react';
import type { LiveState } from '../../shared/types';
import { CanvasSlideStage } from './CanvasSlideStage';
import { MainScreenView } from './MainScreenView';
import { MAIN_ROOM_CAMERA_ID } from '../utils/overflowState';
import {
  DEFAULT_PRESENTATION_BOX,
  DEFAULT_STUDIO_BACKGROUND,
  ParticipantOverlay
} from './ParticipantOverlay';

interface ScaledMainScreenPreviewProps {
  liveState: LiveState | null;
  participantStreams?: Map<string, MediaStream>;
  enableParticipantAudio?: boolean;
}

const BASE_WIDTH = 1920;
const BASE_HEIGHT = 1080;
const BASE_AREA = BASE_WIDTH * BASE_HEIGHT;
const BASE_ASPECT = BASE_WIDTH / BASE_HEIGHT;

/**
 * Computes an aspect-adaptive virtual stage anchored to the 1920x1080 reference coordinate space.
 * - On 16:9 screens (720p, 1080p, 4K), the virtual stage is exactly 1920x1080.
 * - On wider aspect ratios (20:9 landscape phones, 21:9 ultrawide), virtual height stays 1080
 *   and virtual width expands to match the aspect ratio.
 * - On narrower/taller aspect ratios (16:10 tablets, 4:3 projectors, or portrait), the virtual
 *   stage preserves the 1920x1080 reference area (with a 0.4 aspect floor so ultra-tall >21:9
 *   portrait phones don't narrow the virtual width below ~910px).
 * - Dimensions are kept unrounded so virtualWidth * scale === containerWidth and
 *   virtualHeight * scale === containerHeight without a ~1px subpixel gap at the bottom edge.
 */
export function computeVirtualStage(containerWidth: number, containerHeight: number) {
  const aspect = containerWidth / containerHeight;
  let virtualWidth: number;
  let virtualHeight: number;

  if (aspect >= BASE_ASPECT) {
    virtualHeight = BASE_HEIGHT;
    virtualWidth = BASE_HEIGHT * aspect;
  } else {
    const clampedAspect = Math.max(0.4, aspect);
    virtualWidth = Math.sqrt(BASE_AREA * clampedAspect);
    virtualHeight = virtualWidth / aspect;
  }

  return {
    width: virtualWidth,
    height: virtualHeight,
    scale: containerWidth / virtualWidth
  };
}

/**
 * Renders MainScreenView inside an aspect-adaptive 1080p reference coordinate frame so
 * typography and layouts look proportionally identical across all resolutions, pixel densities,
 * and aspect ratios (16:9, 16:10, 4:3, 21:9, and portrait)—used by the physical Main Screen
 * output window, the Operator Live Monitor & Content Grid previews, and the Remote Viewer.
 */
export const FittedMainScreenFrame: React.FC<ScaledMainScreenPreviewProps> = ({
  liveState,
  participantStreams,
  enableParticipantAudio = false
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [containerSize, setContainerSize] = useState({ width: 384, height: 216 });
  const [stage, setStage] = useState(() => ({
    width: BASE_WIDTH,
    height: BASE_HEIGHT,
    scale: 0.2
  }));

  useLayoutEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const update = () => {
      if (el.clientWidth > 0 && el.clientHeight > 0) {
        setContainerSize({ width: el.clientWidth, height: el.clientHeight });
        setStage(computeVirtualStage(el.clientWidth, el.clientHeight));
      }
    };

    update();
    const observer = new ResizeObserver(update);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const hasLiveParticipant =
    liveState?.override !== 'blackout' &&
    (liveState?.participants?.liveParticipantIds?.length ?? 0) > 0;
  const isStudioMode =
    hasLiveParticipant && liveState?.participants?.layout === 'custom';
  const boxTiming = isStudioMode
    ? '520ms cubic-bezier(0.4, 0, 0.2, 1)'
    : '380ms cubic-bezier(0.22, 1, 0.36, 1)';

  const presBox = liveState?.participants?.studioPresentationBox ?? DEFAULT_PRESENTATION_BOX;
  const studioBg = liveState?.participants?.studioBackground || DEFAULT_STUDIO_BACKGROUND;
  const primaryId = liveState?.participants?.liveParticipantIds?.[0];
  const liveParticipant =
    primaryId && primaryId !== MAIN_ROOM_CAMERA_ID
      ? liveState?.participantList?.find((p) => p.id === primaryId)
      : undefined;
  const studioElements = liveState?.participants?.studioElements ?? [];

  const cw = containerSize.width || 384;
  const ch = containerSize.height || 216;
  const studioW = cw / ch > BASE_ASPECT ? ch * BASE_ASPECT : cw;
  const studioH = cw / ch > BASE_ASPECT ? ch : cw / BASE_ASPECT;
  const studioScale = studioH / BASE_HEIGHT;

  const presBoxW = studioW * (presBox.width / 100);
  const presBoxH = studioH * (presBox.height / 100);
  const presScale = Math.min(presBoxW / BASE_WIDTH, presBoxH / BASE_HEIGHT) || 0.1;
  const presW = presBoxW / presScale;
  const presH = presBoxH / presScale;

  return (
    <div
      ref={containerRef}
      style={{
        width: '100%',
        height: '100%',
        position: 'relative',
        overflow: 'hidden',
        background: isStudioMode ? studioBg : '#000',
        backgroundSize: 'cover',
        backgroundPosition: 'center',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        transition: 'background 280ms ease'
      }}
    >
      {/* Full-screen virtual stage when no live participant is active (preserves non-16:9 fill) */}
      {!hasLiveParticipant && (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            pointerEvents: 'none'
          }}
        >
          <div
            style={{
              width: `${stage.width}px`,
              height: `${stage.height}px`,
              transform: `scale(${stage.scale})`,
              transformOrigin: 'top left',
              pointerEvents: 'none',
              position: 'relative'
            }}
          >
            <MainScreenView liveState={liveState} />
          </div>
        </div>
      )}

      {/* Unified stage wrapper keeps MainScreenView, CanvasSlideStage, and ParticipantOverlay mounted across Full <-> Studio transitions */}
      <div
        style={{
          width: isStudioMode ? `${studioW}px` : '100%',
          height: isStudioMode ? `${studioH}px` : '100%',
          position: 'relative',
          flexShrink: 0,
          pointerEvents: 'none',
          transition: `width ${boxTiming}, height ${boxTiming}`
        }}
      >
        {hasLiveParticipant && studioElements.length > 0 && (
          <div
            style={{
              position: 'absolute',
              inset: 0,
              pointerEvents: 'none',
              opacity: isStudioMode ? 1 : 0,
              transition: 'opacity 280ms ease'
            }}
          >
            <CanvasSlideStage
              elements={studioElements}
              background="transparent"
              liveParticipant={liveParticipant}
            />
          </div>
        )}

        {/* Presentation Box stays mounted in place and fades in after the camera shrinks into Studio */}
        {hasLiveParticipant && (
          <div
            style={{
              position: 'absolute',
              left: `${presBox.x}%`,
              top: `${presBox.y}%`,
              width: `${presBox.width}%`,
              height: `${presBox.height}%`,
              borderRadius: `${Math.round((presBox.borderRadius ?? 16) * studioScale)}px`,
              overflow: 'hidden',
              boxShadow: '0 16px 40px rgba(0, 0, 0, 0.45)',
              pointerEvents: 'none',
              zIndex: 20,
              opacity: isStudioMode ? 1 : 0,
              transition: isStudioMode ? 'opacity 220ms ease 280ms' : 'opacity 140ms ease'
            }}
          >
            <div
              style={{
                width: `${presW}px`,
                height: `${presH}px`,
                transform: `scale(${presScale})`,
                transformOrigin: 'top left'
              }}
            >
              <MainScreenView liveState={liveState} />
            </div>
          </div>
        )}

        {/* Participant Video Box (outside CSS scale transform for flicker-free WebRTC) */}
        {hasLiveParticipant && (
          <ParticipantOverlay
            stageConfig={liveState?.participants}
            participants={liveState?.participantList}
            streams={participantStreams}
            enableAudio={enableParticipantAudio}
            compact={(isStudioMode ? studioScale : stage.scale) < 0.7}
            scale={isStudioMode ? undefined : stage.scale}
          />
        )}
      </div>
    </div>
  );
};

export const ScaledMainScreenPreview = FittedMainScreenFrame;
