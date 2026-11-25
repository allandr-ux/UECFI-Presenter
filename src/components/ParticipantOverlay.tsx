import React, { useEffect, useRef } from 'react';
import type {
  ParticipantStageConfig,
  RemoteParticipant,
  StudioBoxRect
} from '../../shared/types';

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
      style={{
        position: 'relative',
        width: '100%',
        height: '100%',
        background: '#000',
        borderRadius: frameless
          ? 0
          : borderRadius !== undefined
            ? `${borderRadius}px`
            : compact
              ? '12px'
              : '16px',
        overflow: 'hidden',
        border: frameless ? 'none' : '2px solid rgba(56, 189, 248, 0.45)',
        boxShadow: frameless ? 'none' : '0 16px 40px rgba(0, 0, 0, 0.55)'
      }}
    >
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted={!enableAudio || isMuted}
        style={{
          width: '100%',
          height: '100%',
          objectFit,
          transform: 'translateZ(0)',
          backfaceVisibility: 'hidden',
          opacity: isVideoHidden || !stream ? 0.15 : 1
        }}
      />
      {(isVideoHidden || !stream) && (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#94a3b8',
            fontSize: compact ? '0.8rem' : '1.4rem',
            fontWeight: 600
          }}
        >
          {stream ? 'Camera Off' : 'Connecting video...'}
        </div>
      )}
      {showNameplate && participant && (
        <div
          style={{
            position: 'absolute',
            left: `${36 * s}px`,
            bottom: `${36 * s}px`,
            maxWidth: '46%',
            padding: `${14 * s}px ${24 * s}px`,
            borderRadius: `${12 * s}px`,
            background: 'rgba(2, 6, 23, 0.86)',
            backdropFilter: 'blur(8px)',
            borderLeft: `${Math.max(1.5, 5 * s)}px solid #38bdf8`,
            boxShadow: `0 ${10 * s}px ${28 * s}px rgba(0, 0, 0, 0.45)`,
            color: '#f8fafc',
            display: 'flex',
            flexDirection: 'column',
            gap: `${3 * s}px`
          }}
        >
          {participant.title && (
            <div style={{ fontSize: `${18 * s}px`, color: '#93c5fd', fontWeight: 600, lineHeight: 1.15 }}>
              {participant.title}
            </div>
          )}
          <div style={{ fontSize: `${28 * s}px`, fontWeight: 700, lineHeight: 1.2 }}>
            {participant.name}
          </div>
          {participant.centroOrPosition && (
            <div style={{ fontSize: `${18 * s}px`, color: '#cbd5e1', fontWeight: 500, lineHeight: 1.2 }}>
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

  if (layout === 'custom') {
    const box = stageConfig?.studioParticipantBox ?? DEFAULT_PARTICIPANT_BOX;
    const primaryId = liveIds[0];
    return (
      <div
        style={{
          position: 'absolute',
          left: `${box.x}%`,
          top: `${box.y}%`,
          width: `${box.width}%`,
          height: `${box.height}%`,
          zIndex: 40
        }}
      >
        <ParticipantVideoTile
          key={primaryId}
          stream={streams?.get(primaryId)}
          participant={participantMap.get(primaryId)}
          enableAudio={enableAudio}
          compact={compact}
          scale={scale}
          borderRadius={box.borderRadius ?? 16}
          showNameplate={false}
        />
      </div>
    );
  }

  const primaryId = liveIds[0];
  const showBuiltInFullNameplate =
    primaryId !== 'mainRoomCamera' && stageConfig?.showNameplate !== false;

  return (
    <div
      style={{
        position: 'absolute',
        inset: 0,
        zIndex: 40,
        background: '#000'
      }}
    >
      <ParticipantVideoTile
        key={primaryId}
        stream={streams?.get(primaryId)}
        participant={participantMap.get(primaryId)}
        enableAudio={enableAudio}
        compact={compact}
        scale={scale}
        frameless
        objectFit={stageConfig?.fullCropSides !== false ? 'cover' : 'contain'}
        showNameplate={showBuiltInFullNameplate}
      />
    </div>
  );
};
