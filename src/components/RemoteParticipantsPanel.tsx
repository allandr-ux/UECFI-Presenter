import React, { useEffect, useId, useRef, useState } from 'react';
import QRCode from 'qrcode';
import {
  Camera,
  CameraOff,
  ChevronDown,
  ChevronUp,
  Copy,
  HelpCircle,
  LayoutTemplate,
  Maximize2,
  Megaphone,
  Mic,
  MicOff,
  Minus,
  Monitor,
  Radio,
  Settings2,
  Sliders,
  Trash2,
  UserCheck,
  UserMinus,
  Users,
  Volume2,
  VolumeX,
  X
} from 'lucide-react';
import type {
  DisplayInfo,
  OverflowCameraAngle,
  OverflowStageConfig,
  ParticipantLayoutMode,
  ParticipantModerationAction,
  ParticipantStageConfig,
  RemoteConnectionInfo,
  RemoteParticipant,
  RemoteReturnFeedConfig
} from '../../shared/types';

interface PreviewVideoProps {
  stream?: MediaStream;
  videoOff: boolean;
}

const MutedPreviewVideo: React.FC<PreviewVideoProps> = ({ stream, videoOff }) => {
  const ref = useRef<HTMLVideoElement | null>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (el.srcObject !== (stream ?? null)) {
      el.srcObject = stream ?? null;
    }
    if (stream) {
      el.play().catch(() => {});
    }
  }, [stream]);

  return (
    <div
      style={{
        position: 'relative',
        width: '128px',
        height: '72px',
        borderRadius: '8px',
        overflow: 'hidden',
        background: '#020617',
        border: '1px solid var(--border-subtle)',
        flexShrink: 0
      }}
    >
      <video
        ref={ref}
        autoPlay
        playsInline
        muted
        style={{
          width: '100%',
          height: '100%',
          objectFit: 'cover',
          opacity: videoOff || !stream ? 0.2 : 1
        }}
      />
      {(videoOff || !stream) && (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: '0.68rem',
            color: 'var(--text-secondary)'
          }}
        >
          {stream ? 'Cam Off' : 'Connecting'}
        </div>
      )}
    </div>
  );
};

interface RemoteParticipantsPanelProps {
  open: boolean;
  onClose: () => void;
  onToggleOpen?: () => void;
  onOpenSetup: () => void;
  onOpenStudioEditor: () => void;
  participants: RemoteParticipant[];
  stageConfig: ParticipantStageConfig;
  streams: Map<string, MediaStream>;
  onModerate: (participantId: string, action: ParticipantModerationAction, value?: boolean) => void;
  onUpdateParticipantInfo: (
    participantId: string,
    info: { title?: string; name?: string; centroOrPosition?: string }
  ) => void;
  onUpdateStageConfig: (next: Partial<ParticipantStageConfig>) => void;
  onClearAllLive: () => void;
  overflowConfig?: OverflowStageConfig;
  overflowCameras?: Array<{ deviceId: string; label: string }>;
  overflowAngles?: OverflowCameraAngle[];
  overflowCameraStreams?: Map<string, MediaStream>;
  mainRoomPreviewStream?: MediaStream | null;
  activeOverflowAngleId?: string;
  onSelectOverflowAngle?: (angleId: string) => void;
  onUpdateOverflowAngles?: (angles: OverflowCameraAngle[]) => void;
  onUpdateOverflowConfig?: (next: Partial<OverflowStageConfig>) => void;
  previewCamerasOn?: boolean;
  onTogglePreviewCameras?: () => void;
  onOpenOverflowStudioEditor?: () => void;
  onCopyParticipantsStudioToOverflow?: () => void;
  displays?: DisplayInfo[];
  remoteInfo?: RemoteConnectionInfo | null;
  overflowScreenOpen?: boolean;
  onSelectOverflowDisplay?: (displayId: number) => void;
  onCloseOverflowScreen?: () => void;
  returnAudioDevices?: Array<{ deviceId: string; label: string }>;
  returnFeedConfig?: RemoteReturnFeedConfig;
  returnAudioManualUnmute?: boolean;
  onToggleReturnAudioManualUnmute?: () => void;
  onUpdateReturnFeedConfig?: (next: Partial<RemoteReturnFeedConfig>) => void;
  monitoredParticipantIds?: string[];
  onToggleMonitorParticipant?: (participantId: string) => void;
  audioOutputDevices?: Array<{ deviceId: string; label: string }>;
  monitorOutputDeviceId?: string;
  onSelectMonitorOutputDevice?: (deviceId: string) => void;
  whisperInputDeviceId?: string;
  onSelectWhisperInputDevice?: (deviceId: string) => void;
}

export const RemoteParticipantsPanel: React.FC<RemoteParticipantsPanelProps> = ({
  open,
  onClose,
  onToggleOpen,
  onOpenSetup,
  onOpenStudioEditor,
  participants,
  stageConfig,
  streams,
  onModerate,
  onUpdateParticipantInfo,
  onUpdateStageConfig,
  onClearAllLive,
  overflowConfig,
  overflowCameras = [],
  overflowAngles = [],
  overflowCameraStreams,
  mainRoomPreviewStream = null,
  activeOverflowAngleId = '',
  onSelectOverflowAngle,
  onUpdateOverflowAngles,
  onUpdateOverflowConfig,
  previewCamerasOn = false,
  onTogglePreviewCameras,
  onOpenOverflowStudioEditor,
  onCopyParticipantsStudioToOverflow,
  displays = [],
  remoteInfo = null,
  overflowScreenOpen = false,
  onSelectOverflowDisplay,
  onCloseOverflowScreen,
  returnAudioDevices = [],
  returnFeedConfig = { sendVideo: true, audioDeviceId: '', autoMuteWhenLive: true },
  returnAudioManualUnmute = false,
  onToggleReturnAudioManualUnmute,
  onUpdateReturnFeedConfig,
  monitoredParticipantIds = [],
  onToggleMonitorParticipant,
  audioOutputDevices = [],
  monitorOutputDeviceId = '',
  onSelectMonitorOutputDevice,
  whisperInputDeviceId = 'default',
  onSelectWhisperInputDevice
}) => {
  const titleId = useId();
  const [activeTab, setActiveTab] = useState<'guests' | 'overflow'>('guests');
  const [overflowQrDataUrl, setOverflowQrDataUrl] = useState('');
  const [activeReturnFeedHelp, setActiveReturnFeedHelp] = useState<string | null>(null);
  const [minimized, setMinimized] = useState(false);

  const overflowUrl = remoteInfo?.localUrl
    ? `${remoteInfo.localUrl}&viewMode=overflow`
    : 'http://localhost:4850/?view=remote&viewMode=overflow';

  useEffect(() => {
    QRCode.toDataURL(overflowUrl, {
      width: 160,
      margin: 1,
      color: { dark: '#0f172a', light: '#f8fafc' }
    })
      .then(setOverflowQrDataUrl)
      .catch(() => setOverflowQrDataUrl(''));
  }, [overflowUrl]);

  const liveParticipants = participants.filter((p) => p.status === 'live');
  const greenRoomParticipants = participants.filter((p) => p.status === 'greenRoom');

  const renderCard = (p: RemoteParticipant) => {
    const isLive = p.status === 'live';
    const isMuted = !p.audioEnabled || p.mutedByOperator;
    const isVideoOff = !p.videoEnabled || p.videoHiddenByOperator;

    return (
      <div
        key={p.id}
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: '10px',
          padding: '10px 12px',
          borderRadius: '10px',
          background: 'var(--bg-panel-elevated)',
          border: `1px solid ${isLive ? 'rgba(239, 68, 68, 0.55)' : 'var(--border-subtle)'}`
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
          <MutedPreviewVideo stream={streams.get(p.id)} videoOff={isVideoOff} />

          <div style={{ flex: 1, minWidth: '160px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
              <strong style={{ fontSize: '0.9rem', color: 'var(--text-primary)' }}>
                {p.title ? `${p.title} ` : ''}
                {p.name}
              </strong>
              <span
                style={{
                  fontSize: '0.68rem',
                  fontWeight: 700,
                  padding: '2px 7px',
                  borderRadius: '999px',
                  background: p.source === 'online' ? 'rgba(168, 85, 247, 0.2)' : 'rgba(56, 189, 248, 0.18)',
                  color: p.source === 'online' ? '#d8b4fe' : '#7dd3fc'
                }}
              >
                {p.source === 'online' ? 'Internet' : 'LAN'}
              </span>
            </div>
            {p.centroOrPosition && (
              <div style={{ fontSize: '0.76rem', color: '#93c5fd', marginTop: '2px' }}>
                {p.centroOrPosition}
              </div>
            )}
            <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: '4px' }}>
              {isMuted ? 'Mic muted' : 'Mic active'} • {isVideoOff ? 'Camera off' : 'Camera on'}
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
            <button
              type="button"
              onClick={() => onModerate(p.id, isLive ? 'MOVE_TO_GREEN_ROOM' : 'PUT_LIVE')}
              style={{
                padding: '6px 10px',
                borderRadius: '8px',
                border: 'none',
                background: isLive ? '#334155' : '#2563eb',
                color: '#fff',
                fontSize: '0.78rem',
                fontWeight: 600,
                display: 'inline-flex',
                alignItems: 'center',
                gap: '5px'
              }}
            >
              {isLive ? <UserMinus size={13} /> : <UserCheck size={13} />}
              {isLive ? 'To Green Room' : 'Put On Screen'}
            </button>

            {onToggleMonitorParticipant && (
              <button
                type="button"
                title={
                  monitoredParticipantIds.includes(p.id)
                    ? 'End 2-way Whisper with this speaker'
                    : 'Start 2-way Whisper (hear speaker in your Whisper Output & talk via your Whisper Input mic)'
                }
                onClick={() => onToggleMonitorParticipant(p.id)}
                style={{
                  padding: '6px 9px',
                  borderRadius: '8px',
                  border: monitoredParticipantIds.includes(p.id)
                    ? '1px solid rgba(56, 189, 248, 0.55)'
                    : '1px solid var(--border-subtle)',
                  background: monitoredParticipantIds.includes(p.id)
                    ? 'rgba(14, 165, 233, 0.22)'
                    : 'transparent',
                  color: monitoredParticipantIds.includes(p.id)
                    ? '#7dd3fc'
                    : 'var(--text-primary)',
                  fontSize: '0.75rem',
                  fontWeight: 600,
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '4px'
                }}
              >
                {monitoredParticipantIds.includes(p.id) ? (
                  <Volume2 size={14} />
                ) : (
                  <VolumeX size={14} />
                )}
                {monitoredParticipantIds.includes(p.id) ? 'Whispering' : 'Whisper'}
              </button>
            )}

            <button
              type="button"
              title={p.mutedByOperator ? 'Unmute participant' : 'Mute participant'}
              onClick={() => onModerate(p.id, 'SET_MUTED', !p.mutedByOperator)}
              style={{
                padding: '6px 8px',
                borderRadius: '8px',
                border: '1px solid var(--border-subtle)',
                background: p.mutedByOperator ? 'rgba(220, 38, 38, 0.2)' : 'transparent',
                color: p.mutedByOperator ? '#fca5a5' : 'var(--text-primary)',
                display: 'inline-flex',
                alignItems: 'center'
              }}
            >
              {p.mutedByOperator ? <MicOff size={14} /> : <Mic size={14} />}
            </button>

            <button
              type="button"
              title={p.videoHiddenByOperator ? 'Show participant video' : 'Hide participant video'}
              onClick={() => onModerate(p.id, 'SET_VIDEO_HIDDEN', !p.videoHiddenByOperator)}
              style={{
                padding: '6px 8px',
                borderRadius: '8px',
                border: '1px solid var(--border-subtle)',
                background: p.videoHiddenByOperator ? 'rgba(220, 38, 38, 0.2)' : 'transparent',
                color: p.videoHiddenByOperator ? '#fca5a5' : 'var(--text-primary)',
                display: 'inline-flex',
                alignItems: 'center'
              }}
            >
              {p.videoHiddenByOperator ? <CameraOff size={14} /> : <Camera size={14} />}
            </button>

            <button
              type="button"
              title="Disconnect participant"
              onClick={() => onModerate(p.id, 'KICK')}
              style={{
                padding: '6px 8px',
                borderRadius: '8px',
                border: '1px solid rgba(239, 68, 68, 0.35)',
                background: 'transparent',
                color: '#f87171',
                display: 'inline-flex',
                alignItems: 'center'
              }}
            >
              <Trash2 size={14} />
            </button>
          </div>
        </div>

        {/* Editable Title, Name, Centro / Position */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'minmax(110px, 0.8fr) minmax(140px, 1fr) minmax(150px, 1.1fr)',
            gap: '8px'
          }}
        >
          <input
            type="text"
            placeholder="Title"
            aria-label="Participant Title"
            value={p.title ?? ''}
            onChange={(e) => onUpdateParticipantInfo(p.id, { title: e.target.value })}
            style={{
              padding: '6px 8px',
              borderRadius: '7px',
              border: '1px solid var(--border-subtle)',
              background: 'var(--bg-app)',
              color: 'var(--text-primary)',
              fontSize: '0.78rem'
            }}
          />
          <input
            type="text"
            placeholder="Name"
            aria-label="Participant Name"
            value={p.name}
            onChange={(e) => onUpdateParticipantInfo(p.id, { name: e.target.value })}
            style={{
              padding: '6px 8px',
              borderRadius: '7px',
              border: '1px solid var(--border-subtle)',
              background: 'var(--bg-app)',
              color: 'var(--text-primary)',
              fontSize: '0.78rem'
            }}
          />
          <input
            type="text"
            placeholder="Centro / Position"
            aria-label="Participant Centro or Position"
            value={p.centroOrPosition ?? ''}
            onChange={(e) => onUpdateParticipantInfo(p.id, { centroOrPosition: e.target.value })}
            style={{
              padding: '6px 8px',
              borderRadius: '7px',
              border: '1px solid var(--border-subtle)',
              background: 'var(--bg-app)',
              color: 'var(--text-primary)',
              fontSize: '0.78rem'
            }}
          />
        </div>
      </div>
    );
  };

  const handleToggle = () => {
    if (minimized) {
      setMinimized(false);
      return;
    }
    if (onToggleOpen) {
      onToggleOpen();
    } else if (open) {
      onClose();
    }
  };

  const selectTabOnly = (tab: 'guests' | 'overflow') => {
    setActiveTab(tab);
  };

  return (
    <section
      aria-labelledby={titleId}
      style={{
        flexShrink: 0,
        background: 'var(--bg-panel)',
        borderTop: '1px solid var(--border-subtle)',
        display: 'flex',
        flexDirection: 'column'
      }}
    >
      {/* Collapsible Header + Tab Bar */}
      <div
        onClick={handleToggle}
        style={{
          padding: '8px 14px',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          gap: '10px',
          cursor: 'pointer',
          userSelect: 'none',
          background: open ? 'rgba(15, 23, 42, 0.55)' : 'var(--bg-panel)'
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
          <Users size={15} color="#38bdf8" />
          <h2 id={titleId} style={{ margin: 0, fontSize: '0.84rem', fontWeight: 700 }}>
            Video Feeds
          </h2>
          {open && (
            <div
              onClick={(e) => e.stopPropagation()}
              style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', marginLeft: '6px' }}
            >
              <button
                type="button"
                onClick={() => selectTabOnly('guests')}
                style={{
                  padding: '4px 10px',
                  borderRadius: '7px',
                  border: '1px solid var(--border-subtle)',
                  background:
                    activeTab === 'guests' ? '#2563eb' : 'var(--bg-panel-elevated)',
                  color: activeTab === 'guests' ? '#fff' : 'var(--text-primary)',
                  fontSize: '0.76rem',
                  fontWeight: 600,
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '5px'
                }}
              >
                <Users size={12} /> Green Room ({participants.length})
              </button>
              <button
                type="button"
                onClick={() => selectTabOnly('overflow')}
                style={{
                  padding: '4px 10px',
                  borderRadius: '7px',
                  border: '1px solid var(--border-subtle)',
                  background:
                    activeTab === 'overflow' ? '#059669' : 'var(--bg-panel-elevated)',
                  color: activeTab === 'overflow' ? '#fff' : 'var(--text-primary)',
                  fontSize: '0.76rem',
                  fontWeight: 600,
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '5px'
                }}
              >
                <Camera size={12} /> Centro Cam {overflowConfig?.enabled ? '• ON' : ''}
              </button>
            </div>
          )}
        </div>

        <div
          onClick={(e) => e.stopPropagation()}
          style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
        >
          {(overflowAngles.length > 0 || overflowCameras.length > 0) &&
            onTogglePreviewCameras && (
              <button
                type="button"
                onClick={onTogglePreviewCameras}
                style={{
                  padding: '4px 9px',
                  borderRadius: '7px',
                  border: '1px solid',
                  borderColor: previewCamerasOn
                    ? 'rgba(56, 189, 248, 0.55)'
                    : 'var(--border-subtle)',
                  background: previewCamerasOn
                    ? 'rgba(14, 165, 233, 0.2)'
                    : 'var(--bg-panel-elevated)',
                  color: previewCamerasOn ? '#7dd3fc' : 'var(--text-primary)',
                  fontSize: '0.75rem',
                  fontWeight: 600,
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '5px'
                }}
                title={
                  previewCamerasOn
                    ? 'Stop local camera previews (when no camera is live)'
                    : 'Turn on all camera previews without going live'
                }
              >
                <Camera size={12} /> Preview Cams
              </button>
            )}
          <button
            type="button"
            onClick={onOpenSetup}
            style={{
              padding: '4px 9px',
              borderRadius: '7px',
              border: '1px solid var(--border-subtle)',
              background: 'var(--bg-panel-elevated)',
              fontSize: '0.75rem',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '5px'
            }}
            title="Open Settings (Displays, Local Remote, Online Relay)"
          >
            <Settings2 size={12} /> Relay &amp; QR
          </button>
          <button
            type="button"
            onClick={handleToggle}
            aria-label={open ? 'Collapse Video Feeds' : 'Expand Video Feeds'}
            aria-expanded={open}
            style={{
              background: 'var(--bg-panel-elevated)',
              border: '1px solid var(--border-subtle)',
              borderRadius: '7px',
              padding: '4px 7px',
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}
          >
            {open ? <ChevronDown size={15} /> : <ChevronUp size={15} />}
          </button>
          <button
            type="button"
            onClick={() => {
              if (minimized) {
                setMinimized(false);
              } else {
                setMinimized(true);
                if (open) onClose();
              }
            }}
            aria-label={minimized ? 'Restore Video Feeds' : 'Minimize Video Feeds'}
            title={minimized ? 'Show Video Feeds' : 'Minimize Video Feeds (top bar only)'}
            style={{
              background: minimized ? 'rgba(56, 189, 248, 0.18)' : 'var(--bg-panel-elevated)',
              border: '1px solid',
              borderColor: minimized ? 'rgba(56, 189, 248, 0.5)' : 'var(--border-subtle)',
              color: minimized ? '#7dd3fc' : 'var(--text-primary)',
              borderRadius: '7px',
              padding: '4px 7px',
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}
          >
            {minimized ? <Maximize2 size={15} /> : <Minus size={15} />}
          </button>
        </div>
      </div>

      {!minimized &&
        !open &&
        (participants.length > 0 || overflowAngles.length > 0 || overflowCameras.length > 0) && (
          <div
            style={{
              padding: '10px 14px',
              borderTop: '1px solid var(--border-subtle)',
              display: 'flex',
              alignItems: 'stretch',
              gap: '10px',
              overflowX: 'auto'
            }}
          >
            {/* Auto Toggle (first item before all camera & guest feeds) */}
            {(() => {
              const isAuto = (overflowConfig?.feedSource ?? 'auto') === 'auto';
              return (
                <button
                  type="button"
                  onClick={() => {
                    if (isAuto) {
                      onUpdateOverflowConfig?.({
                        feedSource: overflowConfig?.enabled ? 'camera' : 'remote'
                      });
                    } else {
                      onUpdateOverflowConfig?.({ feedSource: 'auto' });
                    }
                  }}
                  title={
                    isAuto
                      ? 'Auto: Overflow follows Live guest speakers and falls back to Centro Cam'
                      : 'Manual: Click to re-enable Auto switching'
                  }
                  style={{
                    flexShrink: 0,
                    width: '68px',
                    padding: '8px 6px',
                    borderRadius: '10px',
                    border: '1px solid',
                    borderColor: isAuto ? '#3b82f6' : 'var(--border-subtle)',
                    background: isAuto ? 'rgba(37, 99, 235, 0.22)' : 'var(--bg-panel-elevated)',
                    color: isAuto ? '#93c5fd' : 'var(--text-secondary)',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '6px'
                  }}
                >
                  <Radio size={16} />
                  <span style={{ fontSize: '0.74rem', fontWeight: 700 }}>Auto</span>
                  <span
                    style={{
                      fontSize: '0.62rem',
                      fontWeight: 700,
                      padding: '1px 6px',
                      borderRadius: '999px',
                      background: isAuto ? '#2563eb' : 'rgba(148, 163, 184, 0.16)',
                      color: isAuto ? '#fff' : 'var(--text-muted)'
                    }}
                  >
                    {isAuto ? 'ON' : 'MANUAL'}
                  </span>
                </button>
              );
            })()}

            {/* All Centro Cam Feeds */}
            {(overflowAngles.length > 0
              ? overflowAngles
              : overflowCameras.map((c, i) => ({
                  id: `cam-${i}-${c.deviceId}`,
                  label: c.label,
                  deviceId: c.deviceId
                }))
            ).map((cam) => {
              const isSelected =
                overflowAngles.length > 0
                  ? cam.id === activeOverflowAngleId
                  : overflowCameras[0]?.deviceId === cam.deviceId;
              const isLive = Boolean(overflowConfig?.enabled && isSelected);
              const isStandbyForLiveGuest =
                isLive &&
                liveParticipants.length > 0 &&
                (overflowConfig?.feedSource ?? 'auto') !== 'camera';
              const streamKey = cam.deviceId || '__default__';
              const camStream =
                overflowCameraStreams?.get(streamKey) ??
                (isSelected ? mainRoomPreviewStream ?? undefined : undefined);

              const handleToggleCam = () => {
                if (isLive) {
                  // If a live guest's video was manually overridden with Centro Cam,
                  // turning Centro Cam off restores Auto mode so the guest resumes.
                  onUpdateOverflowConfig?.({
                    enabled: false,
                    ...(overflowConfig?.feedSource === 'camera' ? { feedSource: 'auto' } : {})
                  });
                  return;
                }
                const hasLiveGuest = liveParticipants.length > 0;
                if (overflowAngles.length === 0) {
                  onUpdateOverflowAngles?.([cam]);
                }
                onSelectOverflowAngle?.(cam.id);
                onUpdateOverflowConfig?.({
                  enabled: true,
                  ...(hasLiveGuest ? { feedSource: 'camera' } : {})
                });
              };

              return (
                <div
                  key={`collapsed-cam-${cam.id}`}
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '6px',
                    padding: '6px',
                    borderRadius: '10px',
                    background: 'var(--bg-panel-elevated)',
                    border: `1px solid ${isLive ? '#10b981' : 'var(--border-subtle)'}`,
                    flexShrink: 0,
                    width: '142px'
                  }}
                >
                  <div style={{ position: 'relative' }}>
                    <MutedPreviewVideo stream={camStream} videoOff={!camStream} />
                    <span
                      style={{
                        position: 'absolute',
                        top: '4px',
                        left: '4px',
                        padding: '1px 5px',
                        borderRadius: '4px',
                        fontSize: '0.62rem',
                        fontWeight: 700,
                        background: isStandbyForLiveGuest
                          ? 'rgba(217, 119, 6, 0.9)'
                          : isLive
                            ? '#059669'
                            : 'rgba(15, 23, 42, 0.85)',
                        color: '#fff'
                      }}
                    >
                      {isStandbyForLiveGuest ? 'STANDBY' : isLive ? 'ACTIVE' : 'OFF'}
                    </span>
                  </div>
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      gap: '6px'
                    }}
                  >
                    <span
                      style={{
                        fontSize: '0.74rem',
                        fontWeight: 600,
                        color: 'var(--text-primary)',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                        flex: 1
                      }}
                      title={cam.label}
                    >
                      {cam.label || 'Camera'}
                    </span>
                    {isStandbyForLiveGuest && (
                      <button
                        type="button"
                        onClick={() =>
                          onUpdateOverflowConfig?.({ enabled: true, feedSource: 'camera' })
                        }
                        title="Switch Overflow back to this Centro Cam"
                        style={{
                          padding: '2px 6px',
                          borderRadius: '5px',
                          border: 'none',
                          background: '#2563eb',
                          color: '#fff',
                          fontSize: '0.68rem',
                          fontWeight: 700,
                          flexShrink: 0
                        }}
                      >
                        Show
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={handleToggleCam}
                      style={{
                        padding: '2px 7px',
                        borderRadius: '5px',
                        border: 'none',
                        background: isLive ? 'rgba(239, 68, 68, 0.22)' : '#059669',
                        color: isLive ? '#fca5a5' : '#fff',
                        fontSize: '0.68rem',
                        fontWeight: 700,
                        flexShrink: 0
                      }}
                    >
                      {isLive ? 'Off' : 'On'}
                    </button>
                  </div>
                </div>
              );
            })}

            {/* Visual divider between Centro Cameras and Guest Speakers when both are present */}
            {(overflowAngles.length > 0 || overflowCameras.length > 0) &&
              participants.length > 0 && (
                <div
                  aria-hidden="true"
                  style={{
                    width: '1px',
                    alignSelf: 'stretch',
                    margin: '4px 2px',
                    background: 'var(--border-subtle)',
                    flexShrink: 0
                  }}
                />
              )}

            {/* All Green Room / Remote Speaker Feeds */}
            {participants.map((p) => {
              const isLive = p.status === 'live';
              const isVideoOff = !p.videoEnabled || p.videoHiddenByOperator;
              const stream = streams.get(p.id);
              return (
                <div
                  key={`collapsed-${p.id}`}
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '6px',
                    padding: '6px',
                    borderRadius: '10px',
                    background: 'var(--bg-panel-elevated)',
                    border: `1px solid ${isLive ? 'rgba(239, 68, 68, 0.65)' : 'var(--border-subtle)'}`,
                    flexShrink: 0,
                    width: '142px'
                  }}
                >
                  <div style={{ position: 'relative' }}>
                    <MutedPreviewVideo stream={stream} videoOff={isVideoOff} />
                    {isLive && (
                      <span
                        style={{
                          position: 'absolute',
                          top: '4px',
                          left: '4px',
                          padding: '1px 5px',
                          borderRadius: '4px',
                          fontSize: '0.62rem',
                          fontWeight: 700,
                          background: '#dc2626',
                          color: '#fff'
                        }}
                      >
                        LIVE
                      </span>
                    )}
                    <div
                      style={{
                        position: 'absolute',
                        bottom: '4px',
                        right: '4px',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '4px'
                      }}
                    >
                      {returnFeedConfig?.audioDeviceId &&
                        returnFeedConfig?.autoMuteWhenLive &&
                        onToggleReturnAudioManualUnmute && (
                          <button
                            type="button"
                            title={
                              returnAudioManualUnmute
                                ? 'Return Audio: Live (Re-mute)'
                                : 'Return Audio: Auto-Muted (Unmute)'
                            }
                            onClick={onToggleReturnAudioManualUnmute}
                            style={{
                              padding: '3px 5px',
                              borderRadius: '5px',
                              border: '1px solid rgba(148, 163, 184, 0.3)',
                              background: returnAudioManualUnmute
                                ? 'rgba(5, 150, 105, 0.88)'
                                : 'rgba(217, 119, 6, 0.88)',
                              color: '#fff',
                              display: 'inline-flex',
                              alignItems: 'center'
                            }}
                          >
                            <Megaphone size={11} />
                          </button>
                        )}
                      {onToggleMonitorParticipant && (
                        <button
                          type="button"
                          title={
                            monitoredParticipantIds.includes(p.id)
                              ? 'End 2-way Whisper'
                              : 'Start 2-way Whisper'
                          }
                          onClick={() => onToggleMonitorParticipant(p.id)}
                          style={{
                            padding: '3px 5px',
                            borderRadius: '5px',
                            border: '1px solid rgba(148, 163, 184, 0.3)',
                            background: monitoredParticipantIds.includes(p.id)
                              ? 'rgba(14, 165, 233, 0.85)'
                              : 'rgba(15, 23, 42, 0.78)',
                            color: '#fff',
                            display: 'inline-flex',
                            alignItems: 'center'
                          }}
                        >
                          {monitoredParticipantIds.includes(p.id) ? (
                            <Volume2 size={11} />
                          ) : (
                            <VolumeX size={11} />
                          )}
                        </button>
                      )}
                      <button
                        type="button"
                        title={p.mutedByOperator ? 'Unmute participant' : 'Mute participant'}
                        onClick={() => onModerate(p.id, 'SET_MUTED', !p.mutedByOperator)}
                        style={{
                          padding: '3px 5px',
                          borderRadius: '5px',
                          border: '1px solid rgba(148, 163, 184, 0.3)',
                          background: p.mutedByOperator
                            ? 'rgba(220, 38, 38, 0.85)'
                            : 'rgba(15, 23, 42, 0.78)',
                          color: '#fff',
                          display: 'inline-flex',
                          alignItems: 'center'
                        }}
                      >
                        {p.mutedByOperator ? <MicOff size={11} /> : <Mic size={11} />}
                      </button>
                      <button
                        type="button"
                        title={
                          p.videoHiddenByOperator
                            ? 'Show participant video'
                            : 'Hide participant video'
                        }
                        onClick={() => onModerate(p.id, 'SET_VIDEO_HIDDEN', !p.videoHiddenByOperator)}
                        style={{
                          padding: '3px 5px',
                          borderRadius: '5px',
                          border: '1px solid rgba(148, 163, 184, 0.3)',
                          background: p.videoHiddenByOperator
                            ? 'rgba(220, 38, 38, 0.85)'
                            : 'rgba(15, 23, 42, 0.78)',
                          color: '#fff',
                          display: 'inline-flex',
                          alignItems: 'center'
                        }}
                      >
                        {p.videoHiddenByOperator ? <CameraOff size={11} /> : <Camera size={11} />}
                      </button>
                    </div>
                  </div>
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      gap: '6px'
                    }}
                  >
                    <span
                      style={{
                        fontSize: '0.74rem',
                        fontWeight: 600,
                        color: 'var(--text-primary)',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                        flex: 1
                      }}
                      title={p.name}
                    >
                      {p.name}
                    </span>
                    {isLive && overflowConfig?.feedSource === 'camera' && onUpdateOverflowConfig && (
                      <button
                        type="button"
                        onClick={() => onUpdateOverflowConfig({ feedSource: 'auto' })}
                        title="Switch Overflow back to this guest's camera without turning off Centro Cam"
                        style={{
                          padding: '2px 6px',
                          borderRadius: '5px',
                          border: 'none',
                          background: '#2563eb',
                          color: '#fff',
                          fontSize: '0.68rem',
                          fontWeight: 700,
                          flexShrink: 0
                        }}
                      >
                        Show
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() =>
                        onModerate(p.id, isLive ? 'MOVE_TO_GREEN_ROOM' : 'PUT_LIVE')
                      }
                      style={{
                        padding: '2px 7px',
                        borderRadius: '5px',
                        border: 'none',
                        background: isLive ? 'rgba(239, 68, 68, 0.22)' : '#16a34a',
                        color: isLive ? '#fca5a5' : '#fff',
                        fontSize: '0.68rem',
                        fontWeight: 700,
                        flexShrink: 0
                      }}
                    >
                      {isLive ? 'Off' : 'Go Live'}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}

      {!minimized && open && (
        <div
          style={{
            padding: '14px 16px',
            maxHeight: '42vh',
            overflowY: 'auto',
            borderTop: '1px solid var(--border-subtle)',
            display: 'flex',
            flexDirection: 'column',
            gap: '16px'
          }}
        >

        {activeTab === 'guests' ? (
          <>
        {/* Stage Layout Controls */}
        <section
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '10px',
            padding: '10px 12px',
            borderRadius: '10px',
            background: 'var(--bg-panel-elevated)',
            border: '1px solid var(--border-subtle)'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', marginRight: '4px' }}>
              Screen Layout:
            </span>
            {(
              [
                { id: 'full', label: 'Full', icon: <Maximize2 size={13} /> },
                { id: 'custom', label: 'Studio', icon: <LayoutTemplate size={13} /> }
              ] as Array<{ id: ParticipantLayoutMode; label: string; icon: React.ReactNode }>
            ).map((opt) => (
              <button
                key={opt.id}
                type="button"
                onClick={() => onUpdateStageConfig({ layout: opt.id })}
                style={{
                  padding: '5px 10px',
                  borderRadius: '7px',
                  border: '1px solid var(--border-subtle)',
                  background: stageConfig.layout === opt.id ? '#2563eb' : 'transparent',
                  color: stageConfig.layout === opt.id ? '#fff' : 'var(--text-primary)',
                  fontSize: '0.78rem',
                  fontWeight: 600,
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '5px'
                }}
              >
                {opt.icon}
                {opt.label}
              </button>
            ))}
          </div>

          {stageConfig.layout === 'full' && (
            <label
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                fontSize: '0.76rem',
                color: 'var(--text-secondary)',
                cursor: 'pointer'
              }}
            >
              <input
                type="checkbox"
                checked={stageConfig.fullCropSides !== false}
                onChange={(e) => onUpdateStageConfig({ fullCropSides: e.target.checked })}
              />
              Crop Sides (Fill)
            </label>
          )}

          <button
            type="button"
            onClick={() => {
              onClose();
              onOpenStudioEditor();
            }}
            style={{
              padding: '5px 10px',
              borderRadius: '7px',
              border: '1px solid rgba(56, 189, 248, 0.5)',
              background: 'rgba(56, 189, 248, 0.14)',
              color: '#7dd3fc',
              fontSize: '0.78rem',
              fontWeight: 600,
              display: 'inline-flex',
              alignItems: 'center',
              gap: '5px'
            }}
          >
            <Sliders size={13} /> Customize Studio
          </button>

          {liveParticipants.length > 0 && (
            <button
              type="button"
              onClick={onClearAllLive}
              style={{
                padding: '5px 10px',
                borderRadius: '7px',
                border: '1px solid rgba(239, 68, 68, 0.4)',
                background: 'rgba(220, 38, 38, 0.14)',
                color: '#fca5a5',
                fontSize: '0.76rem',
                fontWeight: 600
              }}
            >
              Clear Screen
            </button>
          )}

          <label
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              fontSize: '0.76rem',
              color: 'var(--text-secondary)',
              cursor: 'pointer'
            }}
          >
            <input
              type="checkbox"
              checked={Boolean(stageConfig.showNameplate)}
              onChange={(e) => onUpdateStageConfig({ showNameplate: e.target.checked })}
            />
            Show Nameplate
          </label>
        </section>

        {/* Return Feed to Remote Speakers (Main Room Camera + Audio) */}
        {onUpdateReturnFeedConfig &&
          (() => {
            const RETURN_FEED_HELP: Record<string, { title: string; text: string }> = {
              sendVideo: {
                title: 'Send Centro Cam',
                text: 'Streams the active Centro Cam video feed to remote speakers so they can see the congregation or pulpit.'
              },
              returnAudio: {
                title: 'Return Audio',
                text: 'Selects the Centro audio input (e.g. soundboard or USB interface) sent to remote speakers so they can hear the room.'
              },
              autoMute: {
                title: 'Auto-mute when speaker is LIVE',
                text: 'Automatically mutes Centro Return Audio while a remote speaker is LIVE to prevent echo/feedback. Can be overridden with the Megaphone button or Android pulpit mic.'
              },
              whisperInput: {
                title: 'Whisper Input (Mic)',
                text: 'Operator headset microphone used for private 2-way backstage Whisper conversations with a selected Green Room guest.'
              },
              whisperOutput: {
                title: 'Whisper Output',
                text: 'Audio output (e.g. operator headphones) where you hear a guest’s private 2-way Whisper audio without sending it to the House PA.'
              }
            };

            const renderHelpBtn = (key: keyof typeof RETURN_FEED_HELP) => {
              const info = RETURN_FEED_HELP[key];
              const isOpen = activeReturnFeedHelp === key;
              return (
                <button
                  type="button"
                  title={info.text}
                  aria-label={`Help: ${info.title}`}
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    setActiveReturnFeedHelp((prev) => (prev === key ? null : key));
                  }}
                  style={{
                    padding: 0,
                    width: '16px',
                    height: '16px',
                    borderRadius: '999px',
                    border: 'none',
                    background: isOpen ? 'rgba(56, 189, 248, 0.25)' : 'transparent',
                    color: isOpen ? '#38bdf8' : 'var(--text-muted)',
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    cursor: 'pointer',
                    flexShrink: 0
                  }}
                >
                  <HelpCircle size={13} />
                </button>
              );
            };

            return (
              <section
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '8px',
                  padding: '10px 12px',
                  borderRadius: '10px',
                  background: 'var(--bg-panel-elevated)',
                  border: '1px solid var(--border-subtle)'
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px' }}>
                  <span style={{ fontSize: '0.78rem', fontWeight: 700, color: 'var(--text-primary)' }}>
                    Centro Cam Return Feed (Sent to Remote Speakers)
                  </span>
                  <div style={{ display: 'inline-flex', alignItems: 'center', gap: '5px' }}>
                    <label style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '0.75rem', color: 'var(--text-secondary)', cursor: 'pointer' }}>
                      <input
                        type="checkbox"
                        checked={returnFeedConfig.sendVideo}
                        onChange={(e) => onUpdateReturnFeedConfig({ sendVideo: e.target.checked })}
                      />
                      Send Centro Cam
                    </label>
                    {renderHelpBtn('sendVideo')}
                  </div>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: '10px' }}>
                  <div style={{ display: 'inline-flex', alignItems: 'center', gap: '5px' }}>
                    <label style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                      Return Audio:
                      <select
                        value={returnFeedConfig.audioDeviceId}
                        onChange={(e) => onUpdateReturnFeedConfig({ audioDeviceId: e.target.value })}
                        style={{
                          padding: '4px 8px',
                          borderRadius: '6px',
                          border: '1px solid var(--border-subtle)',
                          background: 'var(--bg-app)',
                          color: 'var(--text-primary)',
                          fontSize: '0.76rem'
                        }}
                      >
                        <option value="">Off (Muted)</option>
                        <option value="default">Default Microphone</option>
                        {returnAudioDevices.map((mic) => (
                          <option key={mic.deviceId} value={mic.deviceId}>
                            {mic.label}
                          </option>
                        ))}
                      </select>
                    </label>
                    {renderHelpBtn('returnAudio')}
                  </div>

                  <div style={{ display: 'inline-flex', alignItems: 'center', gap: '5px' }}>
                    <label style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '0.75rem', color: 'var(--text-secondary)', cursor: 'pointer' }}>
                      <input
                        type="checkbox"
                        checked={returnFeedConfig.autoMuteWhenLive}
                        onChange={(e) => onUpdateReturnFeedConfig({ autoMuteWhenLive: e.target.checked })}
                      />
                      Auto-mute when speaker is LIVE
                    </label>
                    {renderHelpBtn('autoMute')}
                  </div>

                  {liveParticipants.length > 0 &&
                    returnFeedConfig.audioDeviceId &&
                    returnFeedConfig.autoMuteWhenLive &&
                    onToggleReturnAudioManualUnmute && (
                      <button
                        type="button"
                        onClick={onToggleReturnAudioManualUnmute}
                        style={{
                          padding: '4px 10px',
                          borderRadius: '6px',
                          border: '1px solid var(--border-subtle)',
                          background: returnAudioManualUnmute
                            ? 'rgba(5, 150, 105, 0.22)'
                            : 'rgba(245, 158, 11, 0.18)',
                          color: returnAudioManualUnmute ? '#6ee7b7' : '#fcd34d',
                          fontSize: '0.74rem',
                          fontWeight: 700,
                          cursor: 'pointer'
                        }}
                      >
                        {returnAudioManualUnmute
                          ? 'Return Audio: Live (Re-mute)'
                          : 'Return Audio: Auto-Muted (Unmute)'}
                      </button>
                    )}
                </div>

                {(onSelectMonitorOutputDevice || onSelectWhisperInputDevice) && (
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      flexWrap: 'wrap',
                      gap: '10px',
                      paddingTop: '6px',
                      borderTop: '1px solid var(--border-subtle)'
                    }}
                  >
                    {onSelectWhisperInputDevice && (
                      <div style={{ display: 'inline-flex', alignItems: 'center', gap: '5px' }}>
                        <label
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '6px',
                            fontSize: '0.75rem',
                            color: 'var(--text-secondary)'
                          }}
                        >
                          Whisper Input (Mic):
                          <select
                            value={whisperInputDeviceId}
                            onChange={(e) => onSelectWhisperInputDevice(e.target.value)}
                            style={{
                              padding: '4px 8px',
                              borderRadius: '6px',
                              border: '1px solid var(--border-subtle)',
                              background: 'var(--bg-app)',
                              color: 'var(--text-primary)',
                              fontSize: '0.76rem'
                            }}
                          >
                            <option value="">Off (Listen Only)</option>
                            <option value="default">Default Microphone</option>
                            {returnAudioDevices.map((mic) => (
                              <option key={mic.deviceId} value={mic.deviceId}>
                                {mic.label}
                              </option>
                            ))}
                          </select>
                        </label>
                        {renderHelpBtn('whisperInput')}
                      </div>
                    )}

                    {onSelectMonitorOutputDevice && (
                      <div style={{ display: 'inline-flex', alignItems: 'center', gap: '5px' }}>
                        <label
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '6px',
                            fontSize: '0.75rem',
                            color: 'var(--text-secondary)'
                          }}
                        >
                          Whisper Output:
                          <select
                            value={monitorOutputDeviceId}
                            onChange={(e) => onSelectMonitorOutputDevice(e.target.value)}
                            style={{
                              padding: '4px 8px',
                              borderRadius: '6px',
                              border: '1px solid var(--border-subtle)',
                              background: 'var(--bg-app)',
                              color: 'var(--text-primary)',
                              fontSize: '0.76rem'
                            }}
                          >
                            <option value="">System Default</option>
                            {audioOutputDevices.map((out) => (
                              <option key={out.deviceId} value={out.deviceId}>
                                {out.label}
                              </option>
                            ))}
                          </select>
                        </label>
                        {renderHelpBtn('whisperOutput')}
                      </div>
                    )}

                    <span style={{ fontSize: '0.71rem', color: 'var(--text-muted)' }}>
                      2-way private audio with whispered speakers while LIVE audio stays on System Default.
                    </span>
                  </div>
                )}

                {activeReturnFeedHelp && RETURN_FEED_HELP[activeReturnFeedHelp] && (
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'flex-start',
                      justifyContent: 'space-between',
                      gap: '10px',
                      padding: '8px 10px',
                      borderRadius: '8px',
                      background: 'rgba(14, 165, 233, 0.12)',
                      border: '1px solid rgba(56, 189, 248, 0.35)',
                      fontSize: '0.74rem',
                      color: '#bae6fd'
                    }}
                  >
                    <div>
                      <strong style={{ color: '#e0f2fe' }}>
                        {RETURN_FEED_HELP[activeReturnFeedHelp].title}:{' '}
                      </strong>
                      {RETURN_FEED_HELP[activeReturnFeedHelp].text}
                    </div>
                    <button
                      type="button"
                      onClick={() => setActiveReturnFeedHelp(null)}
                      aria-label="Close help"
                      style={{
                        border: 'none',
                        background: 'transparent',
                        color: '#7dd3fc',
                        cursor: 'pointer',
                        padding: '0 2px',
                        flexShrink: 0
                      }}
                    >
                      <X size={13} />
                    </button>
                  </div>
                )}
              </section>
            );
          })()}

        {/* Live On Screen */}
        <section style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.82rem', fontWeight: 700, color: '#fca5a5' }}>
            <Radio size={14} />
            <span>Live On Screen ({liveParticipants.length})</span>
          </div>
          {liveParticipants.length === 0 ? (
            <div style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', padding: '8px 0' }}>
              No participants are currently live on screen.
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {liveParticipants.map(renderCard)}
            </div>
          )}
        </section>

        {/* Green Room */}
        <section style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          <div style={{ fontSize: '0.82rem', fontWeight: 700, color: '#fde047' }}>
            Green Room — Waiting ({greenRoomParticipants.length})
          </div>
          {greenRoomParticipants.length === 0 ? (
            <div style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', padding: '8px 0' }}>
              No guests waiting in the Green Room. Share the Invite QR &amp; Relay link to invite speakers.
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {greenRoomParticipants.map(renderCard)}
            </div>
          )}
        </section>
          </>
        ) : (
          overflowConfig &&
          onUpdateOverflowConfig && (
            <section style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px' }}>
                <span style={{ fontSize: '0.84rem', color: 'var(--text-secondary)' }}>
                  Main Congregation Room Camera (Muted — Sound System Handles Audio)
                </span>
                <label style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '0.82rem', fontWeight: 600, cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={overflowConfig.enabled}
                    onChange={(e) =>
                      onUpdateOverflowConfig({
                        enabled: e.target.checked,
                        ...(!e.target.checked && overflowConfig.feedSource === 'camera'
                          ? { feedSource: 'auto' }
                          : {})
                      })
                    }
                  />
                  Enable Centro Cam
                </label>
              </div>

              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: '10px',
                  padding: '10px 12px',
                  borderRadius: '10px',
                  background: 'var(--bg-panel-elevated)',
                  border: '1px solid var(--border-subtle)'
                }}
              >
                <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                  <span style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--text-primary)' }}>
                    Overflow Feed Source
                  </span>
                  <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                    Switch Overflow between Remote Guest (when live) and Centro Cam
                  </span>
                </div>
                <div
                  style={{
                    display: 'inline-flex',
                    background: 'var(--bg-app)',
                    borderRadius: '8px',
                    padding: '3px',
                    border: '1px solid var(--border-subtle)',
                    flexShrink: 0
                  }}
                >
                  {(
                    [
                      { id: 'auto', label: 'Auto' },
                      { id: 'camera', label: 'Centro Cam' },
                      { id: 'remote', label: 'Remote' }
                    ] as const
                  ).map((opt) => {
                    const active = (overflowConfig.feedSource ?? 'auto') === opt.id;
                    return (
                      <button
                        key={`modal-overflow-src-${opt.id}`}
                        type="button"
                        onClick={() =>
                          onUpdateOverflowConfig({
                            feedSource: opt.id,
                            ...(opt.id === 'camera' ? { enabled: true } : {})
                          })
                        }
                        style={{
                          padding: '5px 10px',
                          borderRadius: '6px',
                          border: 'none',
                          fontSize: '0.76rem',
                          fontWeight: 600,
                          background: active ? '#2563eb' : 'transparent',
                          color: active ? '#fff' : 'var(--text-secondary)'
                        }}
                      >
                        {opt.label}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div
                style={{
                  background: 'var(--bg-panel-elevated)',
                  border: '1px solid var(--border-subtle)',
                  borderRadius: '12px',
                  padding: '12px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '12px'
                }}
              >
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: '0.78rem', fontWeight: 700, color: 'var(--text-secondary)' }}>
                      Camera Angles ({overflowAngles.length})
                    </span>
                    {onUpdateOverflowAngles && (
                      <button
                        type="button"
                        onClick={() => {
                          const nextNum = overflowAngles.length + 1;
                          const newAngle: OverflowCameraAngle = {
                            id: `angle_${Date.now()}_${Math.random().toString(36).slice(2, 5)}`,
                            label: `Angle ${nextNum}`,
                            deviceId: overflowCameras[0]?.deviceId ?? ''
                          };
                          onUpdateOverflowAngles([...overflowAngles, newAngle]);
                        }}
                        style={{
                          padding: '4px 9px',
                          borderRadius: '6px',
                          border: '1px solid var(--border-subtle)',
                          background: 'var(--bg-app)',
                          fontSize: '0.74rem',
                          fontWeight: 600
                        }}
                      >
                        + Add Angle
                      </button>
                    )}
                  </div>

                  {overflowAngles.map((angle) => {
                    const isActive = angle.id === activeOverflowAngleId;
                    return (
                      <div
                        key={angle.id}
                        style={{
                          display: 'grid',
                          gridTemplateColumns: 'minmax(110px, 0.8fr) 1fr auto auto',
                          gap: '6px',
                          alignItems: 'center'
                        }}
                      >
                        <input
                          type="text"
                          placeholder="Angle Name (e.g. Wide)"
                          value={angle.label}
                          onChange={(e) => {
                            onUpdateOverflowAngles?.(
                              overflowAngles.map((a) =>
                                a.id === angle.id ? { ...a, label: e.target.value } : a
                              )
                            );
                          }}
                          style={{
                            padding: '5px 8px',
                            borderRadius: '7px',
                            border: '1px solid var(--border-subtle)',
                            background: 'var(--bg-app)',
                            color: 'var(--text-primary)',
                            fontSize: '0.76rem'
                          }}
                        />
                        <select
                          value={angle.deviceId}
                          onChange={(e) => {
                            onUpdateOverflowAngles?.(
                              overflowAngles.map((a) =>
                                a.id === angle.id ? { ...a, deviceId: e.target.value } : a
                              )
                            );
                          }}
                          style={{
                            padding: '5px 8px',
                            borderRadius: '7px',
                            border: '1px solid var(--border-subtle)',
                            background: 'var(--bg-app)',
                            color: 'var(--text-primary)',
                            fontSize: '0.76rem'
                          }}
                        >
                          {overflowCameras.length === 0 ? (
                            <option value="">Default Camera</option>
                          ) : (
                            overflowCameras.map((cam) => (
                              <option key={cam.deviceId} value={cam.deviceId}>
                                {cam.label || 'Camera'}
                              </option>
                            ))
                          )}
                        </select>
                        <button
                          type="button"
                          onClick={() => onSelectOverflowAngle?.(angle.id)}
                          style={{
                            padding: '5px 9px',
                            borderRadius: '7px',
                            border: 'none',
                            background: isActive ? '#059669' : '#334155',
                            color: '#fff',
                            fontSize: '0.74rem',
                            fontWeight: 600
                          }}
                        >
                          {isActive ? 'Active' : 'Use'}
                        </button>
                        {overflowAngles.length > 1 && onUpdateOverflowAngles && (
                          <button
                            type="button"
                            title="Remove angle"
                            onClick={() => {
                              const remaining = overflowAngles.filter((a) => a.id !== angle.id);
                              onUpdateOverflowAngles(remaining);
                              if (isActive && remaining[0]) {
                                onSelectOverflowAngle?.(remaining[0].id);
                              }
                            }}
                            style={{
                              padding: '5px 6px',
                              borderRadius: '7px',
                              border: '1px solid rgba(239, 68, 68, 0.35)',
                              background: 'transparent',
                              color: '#f87171',
                              display: 'inline-flex'
                            }}
                          >
                            <Trash2 size={13} />
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>

                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', alignItems: 'center', justifyContent: 'space-between' }}>

                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                    <button
                      type="button"
                      onClick={() => onUpdateStageConfig({ layout: 'full' })}
                      style={{
                        padding: '5px 10px',
                        borderRadius: '7px',
                        border: '1px solid var(--border-subtle)',
                        background: stageConfig.layout === 'full' ? '#2563eb' : 'transparent',
                        color: stageConfig.layout === 'full' ? '#fff' : 'var(--text-primary)',
                        fontSize: '0.78rem',
                        fontWeight: 600,
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '5px'
                      }}
                    >
                      <Maximize2 size={13} /> Full
                    </button>
                    <button
                      type="button"
                      onClick={() => onUpdateStageConfig({ layout: 'custom' })}
                      style={{
                        padding: '5px 10px',
                        borderRadius: '7px',
                        border: '1px solid var(--border-subtle)',
                        background: stageConfig.layout === 'custom' ? '#2563eb' : 'transparent',
                        color: stageConfig.layout === 'custom' ? '#fff' : 'var(--text-primary)',
                        fontSize: '0.78rem',
                        fontWeight: 600,
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '5px'
                      }}
                    >
                      <LayoutTemplate size={13} /> Studio
                    </button>
                    {stageConfig.layout === 'full' && (
                      <label
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '6px',
                          fontSize: '0.76rem',
                          color: 'var(--text-secondary)',
                          cursor: 'pointer'
                        }}
                      >
                        <input
                          type="checkbox"
                          checked={stageConfig.fullCropSides !== false}
                          onChange={(e) =>
                            onUpdateStageConfig({ fullCropSides: e.target.checked })
                          }
                        />
                        Crop Sides (Fill)
                      </label>
                    )}
                    {onOpenStudioEditor && (
                      <button
                        type="button"
                        onClick={() => {
                          onClose();
                          onOpenStudioEditor();
                        }}
                        style={{
                          padding: '5px 10px',
                          borderRadius: '7px',
                          border: '1px solid rgba(56, 189, 248, 0.5)',
                          background: 'rgba(56, 189, 248, 0.14)',
                          color: '#7dd3fc',
                          fontSize: '0.78rem',
                          fontWeight: 600,
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '5px'
                        }}
                      >
                        <Sliders size={13} /> Customize Studio
                      </button>
                    )}
                  </div>
                </div>

                {displays.length > 0 && onSelectOverflowDisplay && (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', alignItems: 'center' }}>
                    <span style={{ fontSize: '0.76rem', color: 'var(--text-secondary)' }}>HDMI Display:</span>
                    {displays.map((d) => (
                      <button
                        key={`overflow-${d.id}`}
                        type="button"
                        onClick={() => onSelectOverflowDisplay(d.id)}
                        style={{
                          padding: '5px 10px',
                          borderRadius: '7px',
                          border: '1px solid var(--border-subtle)',
                          background: 'var(--bg-app)',
                          fontSize: '0.76rem',
                          fontWeight: 600,
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '5px'
                        }}
                      >
                        <Monitor size={12} /> {d.label}
                      </button>
                    ))}
                    {overflowScreenOpen && onCloseOverflowScreen && (
                      <button
                        type="button"
                        onClick={onCloseOverflowScreen}
                        style={{
                          padding: '5px 10px',
                          borderRadius: '7px',
                          border: 'none',
                          background: '#dc2626',
                          color: '#fff',
                          fontSize: '0.76rem',
                          fontWeight: 600
                        }}
                      >
                        Close Overflow Screen
                      </button>
                    )}
                  </div>
                )}

                <div style={{ display: 'flex', alignItems: 'center', gap: '14px', flexWrap: 'wrap' }}>
                  {overflowQrDataUrl && (
                    <img
                      src={overflowQrDataUrl}
                      alt="Overflow Room QR Code"
                      style={{
                        width: 112,
                        height: 112,
                        borderRadius: '8px',
                        background: '#f8fafc',
                        padding: '4px',
                        flexShrink: 0
                      }}
                    />
                  )}
                  <div style={{ flex: 1, minWidth: '200px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    <div style={{ fontSize: '0.76rem', color: 'var(--text-secondary)' }}>
                      LAN Browser Overflow URL:
                    </div>
                    <code
                      style={{
                        display: 'block',
                        padding: '7px 10px',
                        borderRadius: '8px',
                        background: 'var(--bg-app)',
                        border: '1px solid var(--border-subtle)',
                        fontSize: '0.75rem',
                        wordBreak: 'break-all',
                        color: '#6ee7b7'
                      }}
                    >
                      {overflowUrl}
                    </code>
                    <div style={{ fontSize: '0.73rem', color: 'var(--text-muted)' }}>
                      Centro Cam never appears on the Main Screen, and is automatically overridden whenever a remote guest is Live.
                    </div>
                  </div>
                </div>
              </div>
            </section>
          )
        )}
        </div>
      )}
    </section>
  );
};
