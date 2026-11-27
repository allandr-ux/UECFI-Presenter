import React, { useEffect, useRef } from 'react';
import type {
  ParticipantStageConfig,
  RemoteParticipant,
  StudioBoxRect
} from '../../shared/types';
import { cn } from '../utils/cn';

export const DEFAULT_STUDIO_BACKGROUND = 'linear-gradient(135deg, #0f172a 0%, #1e293b 100%)';

export const DEFAULT_PRESENTATION_BOX: StudioBoxRect = {
  x: 2.5,
  y: 4,
  width: 69,
  height: 67,
  borderRadius: 16
};

export const DEFAULT_PARTICIPANT_BOX: StudioBoxRect = {
  x: 72.5,
  y: 72,
  width: 25,
  height: 24,
  borderRadius: 16
};

interface VideoTileProps {
  stream?: MediaStream;
  participant?: RemoteParticipant;
  enableAudio: boolean;
  compact?: boolean;
  scale?: number;
  borderRadius?: number;
  frameless?: boolean;
  objectFit?: 'cover' | 'contain';
  showNameplate?: boolean;
}

export const ParticipantVideoTile: React.FC<VideoTileProps> = ({
  stream,
  participant,
  enableAudio,
  compact = false,
  scale,
  borderRadius,
  frameless = false,
  objectFit = 'cover',
  showNameplate = false
}) => {
  const s = scale ?? (compact ? 0.35 : 1);
  const videoRef = useRef<HTMLVideoElement | null>(null);

  useEffect(() => {
    const el = videoRef.current;
    if (!el) return;
    if (el.srcObject !== (stream ?? null)) {
      el.srcObject = stream ?? null;
    }
    if (stream) {
      el.play().catch(() => {});
    }
  }, [stream]);

  const isMuted = participant ? !participant.audioEnabled || participant.mutedByOperator : false;
  const isVideoHidden = participant ? !participant.videoEnabled || participant.videoHiddenByOperator : false;

  return (
    <div
      className={cn(
        'relative h-full w-full overflow-hidden bg-black',
        frameless
          ? 'border-0 shadow-none'
          : 'border-2 border-sky-400/45 shadow-[0_16px_40px_rgba(0,0,0,0.55)]'
      )}
      style={{
        borderRadius: frameless
          ? 0
          : borderRadius !== undefined
            ? `${borderRadius}px`
            : compact
              ? '12px'
              : '16px',
        transition: frameless
          ? 'border-radius 380ms cubic-bezier(0.22, 1, 0.36, 1), border-color 280ms ease, box-shadow 280ms ease'
          : 'border-radius 520ms cubic-bezier(0.4, 0, 0.2, 1), border-color 320ms ease, box-shadow 320ms ease'
      }}
    >
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted={!enableAudio || isMuted}
        className={cn(
          'h-full w-full [backface-visibility:hidden] [transform:translateZ(0)]',
          objectFit === 'contain' ? 'object-contain' : 'object-cover',
          isVideoHidden || !stream ? 'opacity-15' : 'opacity-100'
        )}
      />
      {(isVideoHidden || !stream) && (
        <div
          className={cn(
            'absolute inset-0 flex items-center justify-center font-semibold text-slate-400',
            compact ? 'text-[0.8rem]' : 'text-[1.4rem]'
          )}
        >
          {stream ? 'Camera Off' : 'Connecting video...'}
        </div>
      )}
      {showNameplate && participant && (
        <div
          className="absolute flex max-w-[46%] flex-col bg-slate-950/86 text-slate-50 backdrop-blur-sm"
          style={{
            left: `${36 * s}px`,
            bottom: `${36 * s}px`,
            padding: `${14 * s}px ${24 * s}px`,
            borderRadius: `${12 * s}px`,
            borderLeft: `${Math.max(1.5, 5 * s)}px solid #38bdf8`,
            boxShadow: `0 ${10 * s}px ${28 * s}px rgba(0, 0, 0, 0.45)`,
            gap: `${3 * s}px`
          }}
        >
          {participant.title && (
            <div className="font-semibold leading-[1.15] text-blue-300" style={{ fontSize: `${18 * s}px` }}>
              {participant.title}
            </div>
          )}
          <div className="font-bold leading-[1.2]" style={{ fontSize: `${28 * s}px` }}>
            {participant.name}
          </div>
          {participant.centroOrPosition && (
            <div className="font-medium leading-[1.2] text-slate-300" style={{ fontSize: `${18 * s}px` }}>
              {participant.centroOrPosition}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

interface ParticipantOverlayProps {
  stageConfig?: ParticipantStageConfig;
  participants?: RemoteParticipant[];
  streams?: Map<string, MediaStream>;
  enableAudio?: boolean;
  compact?: boolean;
  scale?: number;
}

/**
 * Renders live remote participant video feeds on Main Screen and Stage View
 * in Full-screen, Picture-in-Picture (PiP), or Grid layout.
 */
export const ParticipantOverlay: React.FC<ParticipantOverlayProps> = ({
  stageConfig,
  participants = [],
  streams,
  enableAudio = false,
  compact = false,
  scale
}) => {
  const liveIds = stageConfig?.liveParticipantIds ?? [];
  if (liveIds.length === 0) return null;

  const participantMap = new Map(participants.map((p) => [p.id, p]));
  const layout = stageConfig?.layout ?? 'custom';
  const showNameplate = Boolean(stageConfig?.showNameplate);

  const isCustom = layout === 'custom';
  const box = stageConfig?.studioParticipantBox ?? DEFAULT_PARTICIPANT_BOX;
  const primaryId = liveIds[0];
  const showBuiltInFullNameplate =
    !isCustom && primaryId !== 'mainRoomCamera' && stageConfig?.showNameplate !== false;

  const boxTiming = isCustom
    ? '520ms cubic-bezier(0.4, 0, 0.2, 1)'
    : '380ms cubic-bezier(0.22, 1, 0.36, 1)';

  return (
    <div
      style={{
        position: 'absolute',
        left: isCustom ? `${box.x}%` : '0%',
        top: isCustom ? `${box.y}%` : '0%',
        width: isCustom ? `${box.width}%` : '100%',
        height: isCustom ? `${box.height}%` : '100%',
        zIndex: 40,
        background: isCustom ? 'transparent' : '#000',
        willChange: 'left, top, width, height',
        transition: `left ${boxTiming}, top ${boxTiming}, width ${boxTiming}, height ${boxTiming}, background-color 280ms ease`
      }}
    >
      <ParticipantVideoTile
        key={primaryId}
        stream={streams?.get(primaryId)}
        participant={participantMap.get(primaryId)}
        enableAudio={enableAudio}
        compact={compact}
        scale={scale}
        frameless={!isCustom}
        borderRadius={isCustom ? (box.borderRadius ?? 16) : 0}
        objectFit={isCustom || stageConfig?.fullCropSides !== false ? 'cover' : 'contain'}
        showNameplate={showBuiltInFullNameplate}
      />
    </div>
  );
};
