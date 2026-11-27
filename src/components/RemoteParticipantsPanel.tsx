import React, { useEffect, useId, useRef, useState } from 'react';
import QRCode from 'qrcode';
import {
  Camera,
  CameraOff,
  Check,
  ChevronDown,
  ChevronUp,
  Copy,
  Megaphone,
  Mic,
  MicOff,
  Paintbrush,
  Pencil,
  Radio,
  Trash2,
  UserPlus,
  Users,
  Volume2,
  VolumeX,
  X
} from 'lucide-react';
import type {
  OverflowCameraAngle,
  OverflowStageConfig,
  ParticipantModerationAction,
  ParticipantNetworkSettings,
  RemoteParticipant,
  RemoteReturnFeedConfig
} from '../../shared/types';
import { cn } from '../utils/cn';

const FlatMuiSwitch: React.FC<{
  checked: boolean;
  onChange: () => void;
  ariaLabel: string;
}> = ({ checked, onChange, ariaLabel }) => (
  <button
    type="button"
    role="switch"
    aria-checked={checked}
    aria-label={ariaLabel}
    onClick={onChange}
    className={cn(
      'relative inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full border-0 p-0.5 transition-colors duration-200',
      checked ? 'bg-green-600' : 'bg-slate-500/75'
    )}
  >
    <span
      className={cn(
        'pointer-events-none inline-block h-4 w-4 rounded-full bg-white transition-transform duration-200',
        checked ? 'translate-x-4' : 'translate-x-0'
      )}
    />
  </button>
);

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
    <div className="relative h-[72px] w-full shrink-0 overflow-hidden rounded-lg border border-subtle bg-slate-950">
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
  onOpenStudioEditor: () => void;
  participants: RemoteParticipant[];
  streams: Map<string, MediaStream>;
  onModerate: (participantId: string, action: ParticipantModerationAction, value?: boolean) => void;
  onUpdateParticipantInfo: (
    participantId: string,
    info: { title?: string; name?: string; centroOrPosition?: string }
  ) => void;
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
  returnFeedConfig?: RemoteReturnFeedConfig;
  returnAudioManualUnmute?: boolean;
  onToggleReturnAudioManualUnmute?: () => void;
  monitoredParticipantIds?: string[];
  onToggleMonitorParticipant?: (participantId: string) => void;
  participantSettings?: ParticipantNetworkSettings;
}

export const RemoteParticipantsPanel: React.FC<RemoteParticipantsPanelProps> = ({
  onOpenStudioEditor,
  participants,
  streams,
  onModerate,
  onUpdateParticipantInfo,
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
  returnFeedConfig = { sendVideo: true, audioDeviceId: '', autoMuteWhenLive: true },
  returnAudioManualUnmute = false,
  onToggleReturnAudioManualUnmute,
  monitoredParticipantIds = [],
  onToggleMonitorParticipant,
  participantSettings
}) => {
  const titleId = useId();
  const [minimized, setMinimized] = useState(false);
  const [editingParticipantId, setEditingParticipantId] = useState<string | null>(null);
  const [inviteModalOpen, setInviteModalOpen] = useState(false);
  const [inviteQrDataUrl, setInviteQrDataUrl] = useState('');
  const [copiedField, setCopiedField] = useState<'link' | 'message' | null>(null);

  const relayBaseUrl = (() => {
    const raw = (participantSettings?.signalingRelayUrl ?? 'wss://remote.uecfi.net/ws').trim();
    if (!raw) return 'https://remote.uecfi.net';
    return raw
      .replace(/^wss:\/\//i, 'https://')
      .replace(/^ws:\/\//i, 'http://')
      .replace(/\/ws\/?$/i, '');
  })();
  const centroCode = participantSettings?.onlineSessionCode?.trim() ?? '';
  const accessCode = participantSettings?.onlinePin?.trim() || '1905';
  const inviteUrl = centroCode
    ? `${relayBaseUrl}/?room=${encodeURIComponent(centroCode)}&pin=${encodeURIComponent(accessCode)}`
    : relayBaseUrl;

  useEffect(() => {
    if (!inviteModalOpen) return;
    QRCode.toDataURL(inviteUrl, {
      width: 180,
      margin: 1,
      color: { dark: '#0f172a', light: '#f8fafc' }
    })
      .then(setInviteQrDataUrl)
      .catch(() => setInviteQrDataUrl(''));
  }, [inviteModalOpen, inviteUrl]);

  const handleCopyInvite = (kind: 'link' | 'message') => {
    const text =
      kind === 'link'
        ? inviteUrl
        : centroCode
          ? `Join as a Remote Speaker:\nLink: ${inviteUrl}\nCentro Code: ${centroCode}\nAccess Code: ${accessCode}`
          : `Join as a Remote Speaker:\nLink: ${inviteUrl}\nAccess Code: ${accessCode}`;
    navigator.clipboard?.writeText(text).catch(() => {});
    setCopiedField(kind);
    setTimeout(() => setCopiedField((prev) => (prev === kind ? null : prev)), 2000);
  };

  const liveParticipants = participants.filter((p) => p.status === 'live');
  const editingParticipant = editingParticipantId
    ? participants.find((p) => p.id === editingParticipantId) ?? null
    : null;

  return (
    <section
      aria-labelledby={titleId}
      className="flex shrink-0 flex-col border-t border-subtle bg-panel"
    >
      {/* Collapsible Header */}
      <div
        onClick={() => setMinimized((m) => !m)}
        className="flex cursor-pointer select-none items-center justify-between gap-2.5 bg-panel px-3.5 py-2"
      >
        <div className="flex flex-wrap items-center gap-2">
          <Users size={15} color="#38bdf8" />
          <h2 id={titleId} className="m-0 text-[0.84rem] font-bold">
            Video Feeds
          </h2>
          {(overflowAngles.length > 0 || overflowCameras.length > 0) &&
            onTogglePreviewCameras && (
              <div
                onClick={(e) => e.stopPropagation()}
                title={
                  previewCamerasOn
                    ? 'Stop local camera previews (when no camera is live)'
                    : 'Turn on all camera previews without going live'
                }
                className="ml-1 inline-flex items-center gap-1"
              >
                <Camera
                  size={14}
                  className={cn(
                    'transition-colors',
                    previewCamerasOn ? 'text-emerald-400' : 'text-text-secondary'
                  )}
                />
                <FlatMuiSwitch
                  checked={previewCamerasOn}
                  onChange={onTogglePreviewCameras}
                  ariaLabel="Preview Cameras"
                />
              </div>
            )}
        </div>

        <div
          onClick={(e) => e.stopPropagation()}
          className="flex items-center gap-1.5"
        >
          <button
            type="button"
            onClick={() => setInviteModalOpen(true)}
            className="inline-flex items-center gap-[5px] rounded-[7px] border border-emerald-400/45 bg-emerald-400/14 px-[9px] py-1 text-[0.75rem] font-semibold text-emerald-300 transition-colors hover:bg-emerald-400/22"
            title="Invite a remote guest speaker"
          >
            <UserPlus size={12} /> Invite Guest
          </button>
          <button
            type="button"
            onClick={onOpenStudioEditor}
            className="inline-flex items-center gap-[5px] rounded-[7px] border border-sky-400/45 bg-sky-400/14 px-[9px] py-1 text-[0.75rem] font-semibold text-sky-300 transition-colors hover:bg-sky-400/22"
            title="Customize Video Stage Studio Layout"
          >
            <Paintbrush size={12} /> Customize Studio
          </button>
          <button
            type="button"
            onClick={() => setMinimized((m) => !m)}
            aria-label={minimized ? 'Restore Video Feeds' : 'Minimize Video Feeds'}
            title={minimized ? 'Show Video Feeds' : 'Minimize Video Feeds (top bar only)'}
            className={cn(
              'inline-flex items-center justify-center rounded-[7px] border px-[7px] py-1 transition-colors',
              minimized
                ? 'border-sky-400/50 bg-sky-400/18 text-sky-300'
                : 'border-subtle bg-panel-elevated text-text-primary hover:bg-hover'
            )}
          >
            {minimized ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
          </button>
        </div>
      </div>

      {!minimized &&
        (participants.length > 0 || overflowAngles.length > 0 || overflowCameras.length > 0) && (
          <div className="flex items-stretch gap-2 overflow-x-auto border-t border-subtle px-2 py-1.5">
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
                    'flex w-[64px] shrink-0 flex-col items-center justify-center gap-1 rounded-[10px] border px-1 py-1 transition-colors',
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
                    'flex w-[142px] shrink-0 flex-col gap-1 rounded-[10px] border bg-panel-elevated p-1',
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
                    <FlatMuiSwitch
                      checked={isLive}
                      onChange={handleToggleCam}
                      ariaLabel={`Toggle ${cam.label || 'Camera'}`}
                    />
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
                    'flex w-[142px] shrink-0 flex-col gap-1 rounded-[10px] border bg-panel-elevated p-1',
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
                    <button
                      type="button"
                      title="Edit participant details"
                      aria-label={`Edit ${p.name}`}
                      onClick={() => setEditingParticipantId(p.id)}
                      className="absolute top-1 right-1 inline-flex items-center justify-center rounded-[5px] border border-slate-400/30 bg-slate-900/80 p-1 text-white transition-colors hover:bg-blue-600"
                    >
                      <Pencil size={11} />
                    </button>
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

      {inviteModalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs"
          onClick={() => setInviteModalOpen(false)}
        >
          <div
            className="flex w-full max-w-[440px] flex-col gap-3.5 rounded-2xl border border-subtle bg-panel p-4 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-sm font-bold text-text-primary">
                <UserPlus size={15} className="text-emerald-400" />
                <span>Invite Remote Guest</span>
              </div>
              <button
                type="button"
                onClick={() => setInviteModalOpen(false)}
                className="rounded-lg border-0 bg-transparent p-1 text-text-secondary transition-colors hover:bg-hover hover:text-text-primary"
                aria-label="Close"
              >
                <X size={16} />
              </button>
            </div>

            <div className="flex items-center gap-3.5 rounded-xl border border-subtle bg-panel-elevated p-3">
              {inviteQrDataUrl && (
                <div className="inline-flex shrink-0 rounded-lg bg-slate-50 p-1.5">
                  <img src={inviteQrDataUrl} alt="Guest Invite QR Code" width={110} height={110} />
                </div>
              )}
              <div className="flex min-w-0 flex-1 flex-col gap-2 text-xs">
                <div className="flex flex-col gap-0.5">
                  <span className="text-[0.7rem] font-semibold text-text-muted">Remote Portal</span>
                  <span className="truncate font-mono text-xs font-semibold text-blue-300" title={relayBaseUrl}>
                    {relayBaseUrl}
                  </span>
                </div>
                <div className="flex flex-col gap-0.5">
                  <span className="text-[0.7rem] font-semibold text-text-muted">Centro Code</span>
                  <span className="font-mono text-sm font-bold text-text-primary">
                    {centroCode || 'Not set'}
                  </span>
                </div>
                <div className="flex flex-col gap-0.5">
                  <span className="text-[0.7rem] font-semibold text-text-muted">Access Code (PIN)</span>
                  <span className="font-mono text-sm font-bold text-amber-400">{accessCode}</span>
                </div>
              </div>
            </div>

            <div className="flex flex-col gap-1.5">
              <span className="text-[0.72rem] font-semibold text-text-secondary">
                Guest Join Link
              </span>
              <div className="flex items-center gap-1.5">
                <code className="min-w-0 flex-1 truncate rounded-lg border border-subtle bg-app px-2.5 py-2 text-[0.75rem] text-blue-300">
                  {inviteUrl}
                </code>
                <button
                  type="button"
                  onClick={() => handleCopyInvite('link')}
                  className="inline-flex shrink-0 items-center gap-1 rounded-lg border border-subtle bg-panel-elevated px-2.5 py-2 text-xs font-semibold text-text-primary transition-colors hover:bg-hover"
                >
                  {copiedField === 'link' ? (
                    <>
                      <Check size={13} className="text-emerald-400" /> Copied
                    </>
                  ) : (
                    <>
                      <Copy size={13} /> Copy
                    </>
                  )}
                </button>
              </div>
              {!centroCode && (
                <span className="text-[0.71rem] text-amber-300">
                  Tip: Set your Centro Code in Settings → Video Feeds to include it in the invite.
                </span>
              )}
            </div>

            <div className="flex items-center justify-between gap-2 pt-1">
              <button
                type="button"
                onClick={() => handleCopyInvite('message')}
                className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-500/40 bg-emerald-500/15 px-3 py-1.5 text-xs font-semibold text-emerald-300 transition-colors hover:bg-emerald-500/25"
              >
                {copiedField === 'message' ? (
                  <>
                    <Check size={13} /> Invite Message Copied
                  </>
                ) : (
                  <>
                    <Copy size={13} /> Copy Invite Message
                  </>
                )}
              </button>
              <button
                type="button"
                onClick={() => setInviteModalOpen(false)}
                className="rounded-lg border-0 bg-blue-600 px-4 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-blue-500"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}

      {editingParticipant && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs"
          onClick={() => setEditingParticipantId(null)}
        >
          <div
            className="flex w-full max-w-[380px] flex-col gap-3 rounded-2xl border border-subtle bg-panel p-4 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-sm font-bold text-text-primary">
                <Pencil size={14} className="text-blue-400" />
                <span>Edit Participant</span>
              </div>
              <button
                type="button"
                onClick={() => setEditingParticipantId(null)}
                className="rounded-lg border-0 bg-transparent p-1 text-text-secondary transition-colors hover:bg-hover hover:text-text-primary"
                aria-label="Close"
              >
                <X size={16} />
              </button>
            </div>

            <div className="flex flex-col gap-2.5">
              <label className="flex flex-col gap-1 text-xs font-semibold text-text-secondary">
                Title
                <input
                  type="text"
                  placeholder="Title"
                  value={editingParticipant.title ?? ''}
                  onChange={(e) =>
                    onUpdateParticipantInfo(editingParticipant.id, { title: e.target.value })
                  }
                  className="rounded-lg border border-subtle bg-app px-2.5 py-1.5 text-sm text-text-primary focus:border-accent focus:outline-none"
                />
              </label>
              <label className="flex flex-col gap-1 text-xs font-semibold text-text-secondary">
                Name
                <input
                  type="text"
                  placeholder="Name"
                  value={editingParticipant.name}
                  onChange={(e) =>
                    onUpdateParticipantInfo(editingParticipant.id, { name: e.target.value })
                  }
                  className="rounded-lg border border-subtle bg-app px-2.5 py-1.5 text-sm text-text-primary focus:border-accent focus:outline-none"
                />
              </label>
              <label className="flex flex-col gap-1 text-xs font-semibold text-text-secondary">
                Centro / Position
                <input
                  type="text"
                  placeholder="Centro / Position"
                  value={editingParticipant.centroOrPosition ?? ''}
                  onChange={(e) =>
                    onUpdateParticipantInfo(editingParticipant.id, {
                      centroOrPosition: e.target.value
                    })
                  }
                  className="rounded-lg border border-subtle bg-app px-2.5 py-1.5 text-sm text-text-primary focus:border-accent focus:outline-none"
                />
              </label>
            </div>

            <div className="flex items-center justify-between pt-1">
              <button
                type="button"
                onClick={() => {
                  onModerate(editingParticipant.id, 'KICK');
                  setEditingParticipantId(null);
                }}
                className="inline-flex items-center gap-1.5 rounded-lg border border-red-500/35 bg-transparent px-2.5 py-1.5 text-xs font-semibold text-red-400 transition-colors hover:bg-red-500/15"
              >
                <Trash2 size={13} />
                Disconnect
              </button>
              <button
                type="button"
                onClick={() => setEditingParticipantId(null)}
                className="rounded-lg border-0 bg-blue-600 px-4 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-blue-500"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
};
