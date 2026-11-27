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
import { cn } from '../utils/cn';

interface PreviewVideoProps {
  stream?: MediaStream;
  videoOff: boolean;
  offlineLabel?: string;
}

const MutedPreviewVideo: React.FC<PreviewVideoProps> = ({
  stream,
  videoOff,
  offlineLabel = 'Connecting'
}) => {
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
    <div className="relative h-[72px] w-32 shrink-0 overflow-hidden rounded-lg border border-subtle bg-slate-950">
      <video
        ref={ref}
        autoPlay
        playsInline
        muted
        className={cn(
          'h-full w-full object-cover',
          videoOff || !stream ? 'opacity-20' : 'opacity-100'
        )}
      />
      {(videoOff || !stream) && (
        <div className="absolute inset-0 flex items-center justify-center text-[0.68rem] text-text-secondary">
          {stream ? 'Cam Off' : offlineLabel}
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
        className={cn(
          'flex flex-col gap-2.5 rounded-[10px] border bg-panel-elevated px-3 py-2.5',
          isLive ? 'border-red-500/55' : 'border-subtle'
        )}
      >
        <div className="flex flex-wrap items-center gap-3">
          <MutedPreviewVideo stream={streams.get(p.id)} videoOff={isVideoOff} />

          <div className="min-w-[160px] flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <strong className="text-[0.9rem] text-text-primary">
                {p.title ? `${p.title} ` : ''}
                {p.name}
              </strong>
              <span
                className={cn(
                  'rounded-full px-[7px] py-0.5 text-[0.68rem] font-bold',
                  p.source === 'online'
                    ? 'bg-purple-500/20 text-purple-300'
                    : 'bg-sky-400/18 text-sky-300'
                )}
              >
                {p.source === 'online' ? 'Internet' : 'LAN'}
              </span>
            </div>
            {p.centroOrPosition && (
              <div className="mt-0.5 text-[0.76rem] text-blue-300">
                {p.centroOrPosition}
              </div>
            )}
            <div className="mt-1 text-[0.75rem] text-text-secondary">
              {isMuted ? 'Mic muted' : 'Mic active'} • {isVideoOff ? 'Camera off' : 'Camera on'}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-1.5">
            <button
              type="button"
              onClick={() => onModerate(p.id, isLive ? 'MOVE_TO_GREEN_ROOM' : 'PUT_LIVE')}
              className={cn(
                'inline-flex items-center gap-[5px] rounded-lg border-0 px-2.5 py-1.5 text-[0.78rem] font-semibold text-white transition-colors',
                isLive ? 'bg-slate-700 hover:bg-slate-600' : 'bg-blue-600 hover:bg-blue-500'
              )}
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
                className={cn(
                  'inline-flex items-center gap-1 rounded-lg border px-[9px] py-1.5 text-[0.75rem] font-semibold transition-colors',
                  monitoredParticipantIds.includes(p.id)
                    ? 'border-sky-400/55 bg-sky-500/22 text-sky-300'
                    : 'border-subtle bg-transparent text-text-primary hover:bg-hover'
                )}
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
              className={cn(
                'inline-flex items-center rounded-lg border border-subtle px-2 py-1.5 transition-colors',
                p.mutedByOperator
                  ? 'bg-red-600/20 text-red-300'
                  : 'bg-transparent text-text-primary hover:bg-hover'
              )}
            >
              {p.mutedByOperator ? <MicOff size={14} /> : <Mic size={14} />}
            </button>

            <button
              type="button"
              title={p.videoHiddenByOperator ? 'Show participant video' : 'Hide participant video'}
              onClick={() => onModerate(p.id, 'SET_VIDEO_HIDDEN', !p.videoHiddenByOperator)}
              className={cn(
                'inline-flex items-center rounded-lg border border-subtle px-2 py-1.5 transition-colors',
                p.videoHiddenByOperator
                  ? 'bg-red-600/20 text-red-300'
                  : 'bg-transparent text-text-primary hover:bg-hover'
              )}
            >
              {p.videoHiddenByOperator ? <CameraOff size={14} /> : <Camera size={14} />}
            </button>

            <button
              type="button"
              title="Disconnect participant"
              onClick={() => onModerate(p.id, 'KICK')}
              className="inline-flex items-center rounded-lg border border-red-500/35 bg-transparent px-2 py-1.5 text-red-400 transition-colors hover:bg-red-500/15"
            >
              <Trash2 size={14} />
            </button>
          </div>
        </div>

        {/* Editable Title, Name, Centro / Position */}
        <div className="grid grid-cols-[minmax(110px,0.8fr)_minmax(140px,1fr)_minmax(150px,1.1fr)] gap-2">
          <input
            type="text"
            placeholder="Title"
            aria-label="Participant Title"
            value={p.title ?? ''}
            onChange={(e) => onUpdateParticipantInfo(p.id, { title: e.target.value })}
            className="rounded-[7px] border border-subtle bg-app px-2 py-1.5 text-[0.78rem] text-text-primary focus:border-accent focus:outline-none"
          />
          <input
            type="text"
            placeholder="Name"
            aria-label="Participant Name"
            value={p.name}
            onChange={(e) => onUpdateParticipantInfo(p.id, { name: e.target.value })}
            className="rounded-[7px] border border-subtle bg-app px-2 py-1.5 text-[0.78rem] text-text-primary focus:border-accent focus:outline-none"
          />
          <input
            type="text"
            placeholder="Centro / Position"
            aria-label="Participant Centro or Position"
            value={p.centroOrPosition ?? ''}
            onChange={(e) => onUpdateParticipantInfo(p.id, { centroOrPosition: e.target.value })}
            className="rounded-[7px] border border-subtle bg-app px-2 py-1.5 text-[0.78rem] text-text-primary focus:border-accent focus:outline-none"
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
      className="flex shrink-0 flex-col border-t border-subtle bg-panel"
    >
      {/* Collapsible Header + Tab Bar */}
      <div
        onClick={handleToggle}
        className={cn(
          'flex cursor-pointer select-none items-center justify-between gap-2.5 px-3.5 py-2',
          open ? 'bg-slate-900/55' : 'bg-panel'
        )}
      >
        <div className="flex flex-wrap items-center gap-2">
          <Users size={15} color="#38bdf8" />
          <h2 id={titleId} className="m-0 text-[0.84rem] font-bold">
            Video Feeds
          </h2>
          {open && (
            <div
              onClick={(e) => e.stopPropagation()}
              className="ml-1.5 inline-flex items-center gap-1.5"
            >
              <button
                type="button"
                onClick={() => selectTabOnly('guests')}
                className={cn(
                  'inline-flex items-center gap-[5px] rounded-[7px] border border-subtle px-2.5 py-1 text-[0.76rem] font-semibold transition-colors',
                  activeTab === 'guests'
                    ? 'bg-blue-600 text-white'
                    : 'bg-panel-elevated text-text-primary hover:bg-hover'
                )}
              >
                <Users size={12} /> Green Room ({participants.length})
              </button>
              <button
                type="button"
                onClick={() => selectTabOnly('overflow')}
                className={cn(
                  'inline-flex items-center gap-[5px] rounded-[7px] border border-subtle px-2.5 py-1 text-[0.76rem] font-semibold transition-colors',
                  activeTab === 'overflow'
                    ? 'bg-emerald-600 text-white'
                    : 'bg-panel-elevated text-text-primary hover:bg-hover'
                )}
              >
                <Camera size={12} /> Centro Cam {overflowConfig?.enabled ? '• ON' : ''}
              </button>
            </div>
          )}
        </div>

        <div
          onClick={(e) => e.stopPropagation()}
          className="flex items-center gap-1.5"
        >
          {(overflowAngles.length > 0 || overflowCameras.length > 0) &&
            onTogglePreviewCameras && (
              <button
                type="button"
                onClick={onTogglePreviewCameras}
                className={cn(
                  'inline-flex items-center gap-[5px] rounded-[7px] border px-[9px] py-1 text-[0.75rem] font-semibold transition-colors',
                  previewCamerasOn
                    ? 'border-sky-400/55 bg-sky-500/20 text-sky-300'
                    : 'border-subtle bg-panel-elevated text-text-primary hover:bg-hover'
                )}
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
            className="inline-flex items-center gap-[5px] rounded-[7px] border border-subtle bg-panel-elevated px-[9px] py-1 text-[0.75rem] transition-colors hover:bg-hover"
            title="Open Settings (Displays, Local Remote, Online Relay)"
          >
            <Settings2 size={12} /> Relay &amp; QR
          </button>
          <button
            type="button"
            onClick={handleToggle}
            aria-label={open ? 'Collapse Video Feeds' : 'Expand Video Feeds'}
            aria-expanded={open}
            className="inline-flex items-center justify-center rounded-[7px] border border-subtle bg-panel-elevated px-[7px] py-1 transition-colors hover:bg-hover"
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
            className={cn(
              'inline-flex items-center justify-center rounded-[7px] border px-[7px] py-1 transition-colors',
              minimized
                ? 'border-sky-400/50 bg-sky-400/18 text-sky-300'
                : 'border-subtle bg-panel-elevated text-text-primary hover:bg-hover'
            )}
          >
            {minimized ? <Maximize2 size={15} /> : <Minus size={15} />}
          </button>
        </div>
      </div>

      {!minimized &&
        !open &&
        (participants.length > 0 || overflowAngles.length > 0 || overflowCameras.length > 0) && (
          <div className="flex items-stretch gap-2.5 overflow-x-auto border-t border-subtle px-3.5 py-2.5">
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
                  className={cn(
                    'flex w-[68px] shrink-0 flex-col items-center justify-center gap-1.5 rounded-[10px] border px-1.5 py-2 transition-colors',
                    isAuto
                      ? 'border-blue-500 bg-blue-600/22 text-blue-300'
                      : 'border-subtle bg-panel-elevated text-text-secondary hover:bg-hover'
                  )}
                >
                  <Radio size={16} />
                  <span className="text-[0.74rem] font-bold">Auto</span>
                  <span
                    className={cn(
                      'rounded-full px-1.5 py-px text-[0.62rem] font-bold',
                      isAuto
                        ? 'bg-blue-600 text-white'
                        : 'bg-slate-400/16 text-text-muted'
                    )}
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
                  className={cn(
                    'flex w-[142px] shrink-0 flex-col gap-1.5 rounded-[10px] border bg-panel-elevated p-1.5',
                    isLive ? 'border-emerald-500' : 'border-subtle'
                  )}
                >
                  <div className="relative">
                    <MutedPreviewVideo
                      stream={camStream}
                      videoOff={!camStream}
                      offlineLabel="Camera Off"
                    />
                    {isLive && (
                      <span
                        className={cn(
                          'absolute top-1 left-1 rounded px-[5px] py-px text-[0.62rem] font-bold text-white',
                          isStandbyForLiveGuest ? 'bg-amber-600/90' : 'bg-emerald-600'
                        )}
                      >
                        {isStandbyForLiveGuest ? 'STANDBY' : 'ACTIVE'}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center justify-between gap-1.5">
                    <span
                      className="flex-1 truncate text-[0.74rem] font-semibold text-text-primary"
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
                        className="shrink-0 rounded-[5px] border-0 bg-blue-600 px-1.5 py-0.5 text-[0.68rem] font-bold text-white hover:bg-blue-500"
                      >
                        Show
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={handleToggleCam}
                      className={cn(
                        'shrink-0 rounded-[5px] border-0 px-[7px] py-0.5 text-[0.68rem] font-bold transition-colors',
                        isLive
                          ? 'bg-red-500/22 text-red-300 hover:bg-red-500/32'
                          : 'bg-emerald-600 text-white hover:bg-emerald-500'
                      )}
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
                  className="mx-0.5 my-1 w-px shrink-0 self-stretch bg-subtle"
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
                  className={cn(
                    'flex w-[142px] shrink-0 flex-col gap-1.5 rounded-[10px] border bg-panel-elevated p-1.5',
                    isLive ? 'border-red-500/65' : 'border-subtle'
                  )}
                >
                  <div className="relative">
                    <MutedPreviewVideo stream={stream} videoOff={isVideoOff} />
                    {isLive && (
                      <span className="absolute top-1 left-1 rounded bg-red-600 px-[5px] py-px text-[0.62rem] font-bold text-white">
                        LIVE
                      </span>
                    )}
                    <div className="absolute right-1 bottom-1 flex items-center gap-1">
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
                            className={cn(
                              'inline-flex items-center rounded-[5px] border border-slate-400/30 px-[5px] py-[3px] text-white',
                              returnAudioManualUnmute ? 'bg-emerald-600/88' : 'bg-amber-600/88'
                            )}
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
                          className={cn(
                            'inline-flex items-center rounded-[5px] border border-slate-400/30 px-[5px] py-[3px] text-white',
                            monitoredParticipantIds.includes(p.id)
                              ? 'bg-sky-500/85'
                              : 'bg-slate-900/78'
                          )}
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
                        className={cn(
                          'inline-flex items-center rounded-[5px] border border-slate-400/30 px-[5px] py-[3px] text-white',
                          p.mutedByOperator ? 'bg-red-600/85' : 'bg-slate-900/78'
                        )}
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
                        className={cn(
                          'inline-flex items-center rounded-[5px] border border-slate-400/30 px-[5px] py-[3px] text-white',
                          p.videoHiddenByOperator ? 'bg-red-600/85' : 'bg-slate-900/78'
                        )}
                      >
                        {p.videoHiddenByOperator ? <CameraOff size={11} /> : <Camera size={11} />}
                      </button>
                    </div>
                  </div>
                  <div className="flex items-center justify-between gap-1.5">
                    <span
                      className="flex-1 truncate text-[0.74rem] font-semibold text-text-primary"
                      title={p.name}
                    >
                      {p.name}
                    </span>
                    {isLive && overflowConfig?.feedSource === 'camera' && onUpdateOverflowConfig && (
                      <button
                        type="button"
                        onClick={() => onUpdateOverflowConfig({ feedSource: 'auto' })}
                        title="Switch Overflow back to this guest's camera without turning off Centro Cam"
                        className="shrink-0 rounded-[5px] border-0 bg-blue-600 px-1.5 py-0.5 text-[0.68rem] font-bold text-white hover:bg-blue-500"
                      >
                        Show
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() =>
                        onModerate(p.id, isLive ? 'MOVE_TO_GREEN_ROOM' : 'PUT_LIVE')
                      }
                      className={cn(
                        'shrink-0 rounded-[5px] border-0 px-[7px] py-0.5 text-[0.68rem] font-bold transition-colors',
                        isLive
                          ? 'bg-red-500/22 text-red-300 hover:bg-red-500/32'
                          : 'bg-green-600 text-white hover:bg-green-500'
                      )}
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
        <div className="flex max-h-[42vh] flex-col gap-4 overflow-y-auto border-t border-subtle px-4 py-3.5">

        {activeTab === 'guests' ? (
          <>
        {/* Stage Layout Controls */}
        <section className="flex flex-wrap items-center justify-between gap-2.5 rounded-[10px] border border-subtle bg-panel-elevated px-3 py-2.5">
          <div className="flex items-center gap-1.5">
            <span className="mr-1 text-[0.78rem] text-text-secondary">
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
                className={cn(
                  'inline-flex items-center gap-[5px] rounded-[7px] border border-subtle px-2.5 py-[5px] text-[0.78rem] font-semibold transition-colors',
                  stageConfig.layout === opt.id
                    ? 'bg-blue-600 text-white'
                    : 'bg-transparent text-text-primary hover:bg-hover'
                )}
              >
                {opt.icon}
                {opt.label}
              </button>
            ))}
          </div>

          {stageConfig.layout === 'full' && (
            <label className="inline-flex cursor-pointer items-center gap-1.5 text-[0.76rem] text-text-secondary">
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
            className="inline-flex items-center gap-[5px] rounded-[7px] border border-sky-400/50 bg-sky-400/14 px-2.5 py-[5px] text-[0.78rem] font-semibold text-sky-300 transition-colors hover:bg-sky-400/22"
          >
            <Sliders size={13} /> Customize Studio
          </button>

          {liveParticipants.length > 0 && (
            <button
              type="button"
              onClick={onClearAllLive}
              className="rounded-[7px] border border-red-500/40 bg-red-600/14 px-2.5 py-[5px] text-[0.76rem] font-semibold text-red-300 transition-colors hover:bg-red-600/24"
            >
              Clear Screen
            </button>
          )}

          <label className="inline-flex cursor-pointer items-center gap-1.5 text-[0.76rem] text-text-secondary">
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
                  className={cn(
                    'inline-flex h-4 w-4 shrink-0 cursor-pointer items-center justify-center rounded-full border-0 p-0 transition-colors',
                    isOpen
                      ? 'bg-sky-400/25 text-sky-400'
                      : 'bg-transparent text-text-muted hover:text-text-secondary'
                  )}
                >
                  <HelpCircle size={13} />
                </button>
              );
            };

            return (
              <section className="flex flex-col gap-2 rounded-[10px] border border-subtle bg-panel-elevated px-3 py-2.5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-[0.78rem] font-bold text-text-primary">
                    Centro Cam Return Feed (Sent to Remote Speakers)
                  </span>
                  <div className="inline-flex items-center gap-[5px]">
                    <label className="inline-flex cursor-pointer items-center gap-1.5 text-[0.75rem] text-text-secondary">
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

                <div className="flex flex-wrap items-center gap-2.5">
                  <div className="inline-flex items-center gap-[5px]">
                    <label className="inline-flex items-center gap-1.5 text-[0.75rem] text-text-secondary">
                      Return Audio:
                      <select
                        value={returnFeedConfig.audioDeviceId}
                        onChange={(e) => onUpdateReturnFeedConfig({ audioDeviceId: e.target.value })}
                        className="rounded-md border border-subtle bg-app px-2 py-1 text-[0.76rem] text-text-primary focus:border-accent focus:outline-none"
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

                  <div className="inline-flex items-center gap-[5px]">
                    <label className="inline-flex cursor-pointer items-center gap-1.5 text-[0.75rem] text-text-secondary">
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
                        className={cn(
                          'cursor-pointer rounded-md border border-subtle px-2.5 py-1 text-[0.74rem] font-bold transition-colors',
                          returnAudioManualUnmute
                            ? 'bg-emerald-600/22 text-emerald-300'
                            : 'bg-amber-500/18 text-amber-300'
                        )}
                      >
                        {returnAudioManualUnmute
                          ? 'Return Audio: Live (Re-mute)'
                          : 'Return Audio: Auto-Muted (Unmute)'}
                      </button>
                    )}
                </div>

                {(onSelectMonitorOutputDevice || onSelectWhisperInputDevice) && (
                  <div className="flex flex-wrap items-center gap-2.5 border-t border-subtle pt-1.5">
                    {onSelectWhisperInputDevice && (
                      <div className="inline-flex items-center gap-[5px]">
                        <label className="inline-flex items-center gap-1.5 text-[0.75rem] text-text-secondary">
                          Whisper Input (Mic):
                          <select
                            value={whisperInputDeviceId}
                            onChange={(e) => onSelectWhisperInputDevice(e.target.value)}
                            className="rounded-md border border-subtle bg-app px-2 py-1 text-[0.76rem] text-text-primary focus:border-accent focus:outline-none"
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
                      <div className="inline-flex items-center gap-[5px]">
                        <label className="inline-flex items-center gap-1.5 text-[0.75rem] text-text-secondary">
                          Whisper Output:
                          <select
                            value={monitorOutputDeviceId}
                            onChange={(e) => onSelectMonitorOutputDevice(e.target.value)}
                            className="rounded-md border border-subtle bg-app px-2 py-1 text-[0.76rem] text-text-primary focus:border-accent focus:outline-none"
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

                    <span className="text-[0.71rem] text-text-muted">
                      2-way private audio with whispered speakers while LIVE audio stays on System Default.
                    </span>
                  </div>
                )}

                {activeReturnFeedHelp && RETURN_FEED_HELP[activeReturnFeedHelp] && (
                  <div className="flex items-start justify-between gap-2.5 rounded-lg border border-sky-400/35 bg-sky-500/12 px-2.5 py-2 text-[0.74rem] text-sky-200">
                    <div>
                      <strong className="text-sky-100">
                        {RETURN_FEED_HELP[activeReturnFeedHelp].title}:{' '}
                      </strong>
                      {RETURN_FEED_HELP[activeReturnFeedHelp].text}
                    </div>
                    <button
                      type="button"
                      onClick={() => setActiveReturnFeedHelp(null)}
                      aria-label="Close help"
                      className="shrink-0 cursor-pointer border-0 bg-transparent px-0.5 py-0 text-sky-300 hover:text-sky-100"
                    >
                      <X size={13} />
                    </button>
                  </div>
                )}
              </section>
            );
          })()}

        {/* Live On Screen */}
        <section className="flex flex-col gap-2">
          <div className="flex items-center gap-1.5 text-[0.82rem] font-bold text-red-300">
            <Radio size={14} />
            <span>Live On Screen ({liveParticipants.length})</span>
          </div>
          {liveParticipants.length === 0 ? (
            <div className="py-2 text-[0.82rem] text-text-secondary">
              No participants are currently live on screen.
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              {liveParticipants.map(renderCard)}
            </div>
          )}
        </section>

        {/* Green Room */}
        <section className="flex flex-col gap-2">
          <div className="text-[0.82rem] font-bold text-yellow-300">
            Green Room — Waiting ({greenRoomParticipants.length})
          </div>
          {greenRoomParticipants.length === 0 ? (
            <div className="py-2 text-[0.82rem] text-text-secondary">
              No guests waiting in the Green Room. Share the Invite QR &amp; Relay link to invite speakers.
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              {greenRoomParticipants.map(renderCard)}
            </div>
          )}
        </section>
          </>
        ) : (
          overflowConfig &&
          onUpdateOverflowConfig && (
            <section className="flex flex-col gap-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-[0.84rem] text-text-secondary">
                  Main Congregation Room Camera (Muted — Sound System Handles Audio)
                </span>
                <label className="inline-flex cursor-pointer items-center gap-1.5 text-[0.82rem] font-semibold">
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

              <div className="flex items-center justify-between gap-2.5 rounded-[10px] border border-subtle bg-panel-elevated px-3 py-2.5">
                <div className="flex flex-col gap-0.5">
                  <span className="text-[0.8rem] font-bold text-text-primary">
                    Overflow Feed Source
                  </span>
                  <span className="text-[0.72rem] text-text-muted">
                    Switch Overflow between Remote Guest (when live) and Centro Cam
                  </span>
                </div>
                <div className="inline-flex shrink-0 rounded-lg border border-subtle bg-app p-[3px]">
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
                        className={cn(
                          'rounded-md border-0 px-2.5 py-[5px] text-[0.76rem] font-semibold transition-colors',
                          active
                            ? 'bg-blue-600 text-white'
                            : 'bg-transparent text-text-secondary hover:text-text-primary'
                        )}
                      >
                        {opt.label}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="flex flex-col gap-3 rounded-xl border border-subtle bg-panel-elevated p-3">
                <div className="flex flex-col gap-2">
                  <div className="flex items-center justify-between">
                    <span className="text-[0.78rem] font-bold text-text-secondary">
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
                        className="rounded-md border border-subtle bg-app px-[9px] py-1 text-[0.74rem] font-semibold transition-colors hover:bg-hover"
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
                        className="grid grid-cols-[minmax(110px,0.8fr)_1fr_auto_auto] items-center gap-1.5"
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
                          className="rounded-[7px] border border-subtle bg-app px-2 py-[5px] text-[0.76rem] text-text-primary focus:border-accent focus:outline-none"
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
                          className="rounded-[7px] border border-subtle bg-app px-2 py-[5px] text-[0.76rem] text-text-primary focus:border-accent focus:outline-none"
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
                          className={cn(
                            'rounded-[7px] border-0 px-[9px] py-[5px] text-[0.74rem] font-semibold text-white transition-colors',
                            isActive ? 'bg-emerald-600' : 'bg-slate-700 hover:bg-slate-600'
                          )}
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
                            className="inline-flex rounded-[7px] border border-red-500/35 bg-transparent px-1.5 py-[5px] text-red-400 transition-colors hover:bg-red-500/15"
                          >
                            <Trash2 size={13} />
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>

                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => onUpdateStageConfig({ layout: 'full' })}
                      className={cn(
                        'inline-flex items-center gap-[5px] rounded-[7px] border border-subtle px-2.5 py-[5px] text-[0.78rem] font-semibold transition-colors',
                        stageConfig.layout === 'full'
                          ? 'bg-blue-600 text-white'
                          : 'bg-transparent text-text-primary hover:bg-hover'
                      )}
                    >
                      <Maximize2 size={13} /> Full
                    </button>
                    <button
                      type="button"
                      onClick={() => onUpdateStageConfig({ layout: 'custom' })}
                      className={cn(
                        'inline-flex items-center gap-[5px] rounded-[7px] border border-subtle px-2.5 py-[5px] text-[0.78rem] font-semibold transition-colors',
                        stageConfig.layout === 'custom'
                          ? 'bg-blue-600 text-white'
                          : 'bg-transparent text-text-primary hover:bg-hover'
                      )}
                    >
                      <LayoutTemplate size={13} /> Studio
                    </button>
                    {stageConfig.layout === 'full' && (
                      <label className="inline-flex cursor-pointer items-center gap-1.5 text-[0.76rem] text-text-secondary">
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
                        className="inline-flex items-center gap-[5px] rounded-[7px] border border-sky-400/50 bg-sky-400/14 px-2.5 py-[5px] text-[0.78rem] font-semibold text-sky-300 transition-colors hover:bg-sky-400/22"
                      >
                        <Sliders size={13} /> Customize Studio
                      </button>
                    )}
                  </div>
                </div>

                {displays.length > 0 && onSelectOverflowDisplay && (
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-[0.76rem] text-text-secondary">HDMI Display:</span>
                    {displays.map((d) => (
                      <button
                        key={`overflow-${d.id}`}
                        type="button"
                        onClick={() => onSelectOverflowDisplay(d.id)}
                        className="inline-flex items-center gap-[5px] rounded-[7px] border border-subtle bg-app px-2.5 py-[5px] text-[0.76rem] font-semibold transition-colors hover:bg-hover"
                      >
                        <Monitor size={12} /> {d.label}
                      </button>
                    ))}
                    {overflowScreenOpen && onCloseOverflowScreen && (
                      <button
                        type="button"
                        onClick={onCloseOverflowScreen}
                        className="rounded-[7px] border-0 bg-red-600 px-2.5 py-[5px] text-[0.76rem] font-semibold text-white transition-colors hover:bg-red-500"
                      >
                        Close Overflow Screen
                      </button>
                    )}
                  </div>
                )}

                <div className="flex flex-wrap items-center gap-3.5">
                  {overflowQrDataUrl && (
                    <img
                      src={overflowQrDataUrl}
                      alt="Overflow Room QR Code"
                      className="h-28 w-28 shrink-0 rounded-lg bg-slate-50 p-1"
                    />
                  )}
                  <div className="flex min-w-[200px] flex-1 flex-col gap-1.5">
                    <div className="text-[0.76rem] text-text-secondary">
                      LAN Browser Overflow URL:
                    </div>
                    <code className="block break-all rounded-lg border border-subtle bg-app px-2.5 py-[7px] text-[0.75rem] text-emerald-300">
                      {overflowUrl}
                    </code>
                    <div className="text-[0.73rem] text-text-muted">
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
