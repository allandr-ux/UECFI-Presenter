import React, { useEffect, useId, useRef, useState } from 'react';
import QRCode from 'qrcode';
import {
  Camera,
  CameraOff,
  Copy,
  LayoutTemplate,
  Maximize2,
  Mic,
  MicOff,
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
  activeOverflowAngleId?: string;
  onSelectOverflowAngle?: (angleId: string) => void;
  onUpdateOverflowAngles?: (angles: OverflowCameraAngle[]) => void;
  onUpdateOverflowConfig?: (next: Partial<OverflowStageConfig>) => void;
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
  activeOverflowAngleId = '',
  onSelectOverflowAngle,
  onUpdateOverflowAngles,
  onUpdateOverflowConfig,
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
  const dialogRef = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const [activeTab, setActiveTab] = useState<'guests' | 'overflow'>('guests');
  const [overflowQrDataUrl, setOverflowQrDataUrl] = useState('');
  const [overflowStudioCopied, setOverflowStudioCopied] = useState(false);

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

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) {
      dialog.showModal();
    } else if (!open && dialog.open) {
      dialog.close();
    }
  }, [open]);

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

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby={titleId}
      onClose={onClose}
      style={{ maxWidth: '720px', width: '92vw' }}
    >
      <div style={{ padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: '18px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <Users size={18} color="#38bdf8" />
            <h2 id={titleId} style={{ margin: 0, fontSize: '1.1rem', fontWeight: 700 }}>
              Video Feeds
            </h2>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <button
              type="button"
              onClick={() => {
                onClose();
                onOpenSetup();
              }}
              style={{
                padding: '6px 10px',
                borderRadius: '8px',
                border: '1px solid var(--border-subtle)',
                background: 'var(--bg-panel-elevated)',
                fontSize: '0.78rem',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px'
              }}
            >
              <Settings2 size={13} /> Invite QR & Relay
            </button>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close"
              style={{
                background: 'transparent',
                border: '1px solid var(--border-subtle)',
                borderRadius: '8px',
                padding: '6px',
                display: 'inline-flex'
              }}
            >
              <X size={16} />
            </button>
          </div>
        </div>

        {/* Tabs */}
        <div style={{ display: 'flex', gap: '6px', borderBottom: '1px solid var(--border-subtle)', paddingBottom: '10px' }}>
          <button
            type="button"
            onClick={() => setActiveTab('guests')}
            style={{
              padding: '6px 12px',
              borderRadius: '8px',
              border: '1px solid var(--border-subtle)',
              background: activeTab === 'guests' ? '#2563eb' : 'var(--bg-panel-elevated)',
              color: activeTab === 'guests' ? '#fff' : 'var(--text-primary)',
              fontSize: '0.82rem',
              fontWeight: 600,
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px'
            }}
          >
            <Users size={14} /> Remote Guests ({participants.length})
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('overflow')}
            style={{
              padding: '6px 12px',
              borderRadius: '8px',
              border: '1px solid var(--border-subtle)',
              background: activeTab === 'overflow' ? '#059669' : 'var(--bg-panel-elevated)',
              color: activeTab === 'overflow' ? '#fff' : 'var(--text-primary)',
              fontSize: '0.82rem',
              fontWeight: 600,
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px'
            }}
          >
            <Camera size={14} /> Overflow Camera {overflowConfig?.enabled ? '• ON' : ''}
          </button>
        </div>

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

          {stageConfig.layout === 'custom' && (
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
        {onUpdateReturnFeedConfig && (
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
                Main Room Return Feed (Sent to Remote Speakers)
              </span>
              <label style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '0.75rem', color: 'var(--text-secondary)', cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={returnFeedConfig.sendVideo}
                  onChange={(e) => onUpdateReturnFeedConfig({ sendVideo: e.target.checked })}
                />
                Send Main Room Camera
              </label>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: '10px' }}>
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

              <label style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '0.75rem', color: 'var(--text-secondary)', cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={returnFeedConfig.autoMuteWhenLive}
                  onChange={(e) => onUpdateReturnFeedConfig({ autoMuteWhenLive: e.target.checked })}
                />
                Auto-mute when speaker is LIVE
              </label>

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
                )}

                {onSelectMonitorOutputDevice && (
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
                )}

                <span style={{ fontSize: '0.71rem', color: 'var(--text-muted)' }}>
                  2-way private audio with whispered speakers while LIVE audio stays on System Default.
                </span>
              </div>
            )}
          </section>
        )}

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
                    onChange={(e) => onUpdateOverflowConfig({ enabled: e.target.checked })}
                  />
                  Enable Main Room Camera
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
                    Switch Overflow between Remote Guest (when live) and Main Room Camera
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
                      { id: 'camera', label: 'Room Cam' },
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
                      onClick={() => onUpdateOverflowConfig({ layout: 'full' })}
                      style={{
                        padding: '5px 10px',
                        borderRadius: '7px',
                        border: '1px solid var(--border-subtle)',
                        background: overflowConfig.layout === 'full' ? '#2563eb' : 'transparent',
                        color: overflowConfig.layout === 'full' ? '#fff' : 'var(--text-primary)',
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
                      onClick={() => onUpdateOverflowConfig({ layout: 'custom' })}
                      style={{
                        padding: '5px 10px',
                        borderRadius: '7px',
                        border: '1px solid var(--border-subtle)',
                        background: overflowConfig.layout === 'custom' ? '#2563eb' : 'transparent',
                        color: overflowConfig.layout === 'custom' ? '#fff' : 'var(--text-primary)',
                        fontSize: '0.78rem',
                        fontWeight: 600,
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '5px'
                      }}
                    >
                      <LayoutTemplate size={13} /> Studio
                    </button>
                    {overflowConfig.layout === 'full' && (
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
                          checked={overflowConfig.fullCropSides !== false}
                          onChange={(e) =>
                            onUpdateOverflowConfig({ fullCropSides: e.target.checked })
                          }
                        />
                        Crop Sides (Fill)
                      </label>
                    )}
                    {overflowConfig.layout === 'custom' && onOpenOverflowStudioEditor && (
                      <button
                        type="button"
                        onClick={() => {
                          onClose();
                          onOpenOverflowStudioEditor();
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
                    {onCopyParticipantsStudioToOverflow && (
                      <button
                        type="button"
                        onClick={() => {
                          onCopyParticipantsStudioToOverflow();
                          setOverflowStudioCopied(true);
                          setTimeout(() => setOverflowStudioCopied(false), 2000);
                        }}
                        style={{
                          padding: '5px 10px',
                          borderRadius: '7px',
                          border: '1px solid var(--border-subtle)',
                          background: overflowStudioCopied ? 'rgba(34, 197, 94, 0.18)' : 'transparent',
                          color: overflowStudioCopied ? '#4ade80' : 'var(--text-primary)',
                          fontSize: '0.76rem',
                          fontWeight: 600,
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '5px'
                        }}
                      >
                        <Copy size={12} /> {overflowStudioCopied ? 'Copied!' : 'Copy Guests Studio'}
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
                      Main room camera never appears on the Main Screen, and is automatically overridden whenever a remote guest is Live.
                    </div>
                  </div>
                </div>
              </div>
            </section>
          )
        )}
      </div>
    </dialog>
  );
};
