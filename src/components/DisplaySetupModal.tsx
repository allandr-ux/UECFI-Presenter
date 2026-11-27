import React, { useEffect, useId, useState } from 'react';
import {
  Camera,
  Check,
  ChevronDown,
  Copy,
  Globe,
  Headphones,
  HelpCircle,
  Link,
  Monitor,
  Plus,
  Radio,
  RefreshCw,
  Settings,
  ShieldCheck,
  Trash2,
  Video,
  X
} from 'lucide-react';
import type {
  DisplayInfo,
  OverflowCameraAngle,
  OverflowStageConfig,
  ParticipantNetworkSettings,
  RemoteConnectionInfo,
  RemoteReturnFeedConfig,
  WhitelistedDevice
} from '../../shared/types';
import { useTerminology } from '../hooks/useTerminology';
import { cn } from '../utils/cn';

interface DisplaySetupModalProps {
  open: boolean;
  onClose: () => void;
  displays: DisplayInfo[];
  remoteInfo: RemoteConnectionInfo | null;
  participantSettings?: ParticipantNetworkSettings;
  onSaveParticipantSettings?: (settings: ParticipantNetworkSettings) => void;
  onRefreshDisplays: () => void;
  onSelectMainDisplay: (displayId: number) => void;
  onSelectOverflowDisplay?: (displayId: number) => void;
  onRegenerateRemotePin?: () => void;
  // Green Room (Return Feed & Whisper) settings
  hasLiveParticipants?: boolean;
  returnAudioDevices?: Array<{ deviceId: string; label: string }>;
  returnFeedConfig?: RemoteReturnFeedConfig;
  returnAudioManualUnmute?: boolean;
  onToggleReturnAudioManualUnmute?: () => void;
  onUpdateReturnFeedConfig?: (next: Partial<RemoteReturnFeedConfig>) => void;
  audioOutputDevices?: Array<{ deviceId: string; label: string }>;
  monitorOutputDeviceId?: string;
  onSelectMonitorOutputDevice?: (deviceId: string) => void;
  whisperInputDeviceId?: string;
  onSelectWhisperInputDevice?: (deviceId: string) => void;
  // Centro Cam settings
  overflowConfig?: OverflowStageConfig;
  overflowCameras?: Array<{ deviceId: string; label: string }>;
  overflowAngles?: OverflowCameraAngle[];
  activeOverflowAngleId?: string;
  onSelectOverflowAngle?: (angleId: string) => void;
  onUpdateOverflowAngles?: (angles: OverflowCameraAngle[]) => void;
}

type SettingsTab = 'general' | 'videoFeeds';

export const DisplaySetupModal: React.FC<DisplaySetupModalProps> = ({
  open,
  onClose,
  displays,
  remoteInfo,
  participantSettings,
  onSaveParticipantSettings,
  onRefreshDisplays,
  onSelectMainDisplay,
  onSelectOverflowDisplay,
  onRegenerateRemotePin,
  hasLiveParticipants = false,
  returnAudioDevices = [],
  returnFeedConfig = {
    sendVideo: true,
    audioDeviceId: '',
    autoMuteWhenLive: true,
    echoCancellation: true
  },
  returnAudioManualUnmute = false,
  onToggleReturnAudioManualUnmute,
  onUpdateReturnFeedConfig,
  audioOutputDevices = [],
  monitorOutputDeviceId = '',
  onSelectMonitorOutputDevice,
  whisperInputDeviceId = 'default',
  onSelectWhisperInputDevice,
  overflowConfig,
  overflowCameras = [],
  overflowAngles = [],
  activeOverflowAngleId = '',
  onSelectOverflowAngle,
  onUpdateOverflowAngles
}) => {
  const t = useTerminology();
  const titleId = useId();
  const [activeTab, setActiveTab] = useState<SettingsTab>('general');
  const [activeReturnFeedHelp, setActiveReturnFeedHelp] = useState<string | null>(null);
  const [obsUrlCopied, setObsUrlCopied] = useState(false);
  const [whitelistedDevices, setWhitelistedDevices] = useState<WhitelistedDevice[]>([]);
  const [assignedOverflowDisplayId, setAssignedOverflowDisplayId] = useState<number | null>(null);
  const [relayDraft, setRelayDraft] = useState<ParticipantNetworkSettings>(() => ({
    signalingRelayUrl: participantSettings?.signalingRelayUrl ?? 'wss://remote.uecfi.net/ws',
    onlineSessionCode: participantSettings?.onlineSessionCode ?? '',
    onlinePin: participantSettings?.onlinePin || '1905',
    stunUrl: participantSettings?.stunUrl ?? 'stun:stun.l.google.com:19302',
    turnUrl: participantSettings?.turnUrl ?? '',
    turnUsername: participantSettings?.turnUsername ?? '',
    turnCredential: participantSettings?.turnCredential ?? ''
  }));
  const [settingsSaved, setSettingsSaved] = useState(false);

  useEffect(() => {
    if (participantSettings) {
      setRelayDraft(participantSettings);
    }
  }, [participantSettings]);

  useEffect(() => {
    const api = window.presenterAPI;
    if (!api) return;
    if (open) {
      api.getWhitelistedDevices().then(setWhitelistedDevices).catch(() => {});
    }
    const unsub = api.onWhitelistChange((devices) => {
      setWhitelistedDevices(devices);
    });
    return () => unsub();
  }, [open]);

  const tabBtnCls = (active: boolean) =>
    cn(
      'inline-flex cursor-pointer items-center gap-[7px] whitespace-nowrap border-0 border-b-2 bg-transparent px-3.5 py-[9px] text-[0.84rem] font-semibold transition-colors',
      active
        ? 'border-b-accent text-text-primary'
        : 'border-b-transparent text-text-muted hover:text-text-secondary'
    );

  const inputCls =
    'w-full rounded-[7px] border border-subtle bg-app px-2.5 py-[7px] text-[0.8rem] text-text-primary focus:border-accent focus:outline-none';

  return (
    <section
      aria-labelledby={titleId}
      className="flex min-h-0 flex-1 flex-col overflow-hidden bg-app"
    >
      <div className="flex min-h-0 flex-1 flex-col">
        {/* Header */}
        <div className="flex items-center justify-between gap-3 border-b border-subtle bg-panel px-[22px] py-3.5">
          <div className="flex items-center gap-[9px]">
            <Settings size={18} color="#93c5fd" />
            <h2 id={titleId} className="m-0 text-[1.05rem] font-bold">
              Settings
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close Settings"
            className="inline-flex items-center justify-center rounded-lg border border-subtle bg-transparent p-1.5 transition-colors hover:bg-hover"
          >
            <X size={16} />
          </button>
        </div>

        {/* Consolidated Settings Tabs */}
        <div
          role="tablist"
          aria-label="Settings sections"
          className="flex gap-1.5 overflow-x-auto border-b border-subtle bg-slate-900/35 px-[22px] pt-1.5"
        >
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'general'}
            onClick={() => setActiveTab('general')}
            className={tabBtnCls(activeTab === 'general')}
          >
            <Monitor size={14} />
            <span>General</span>
            {(remoteInfo?.connectedClients ?? 0) > 0 && (
              <span className="rounded-full bg-blue-700 px-1.5 py-px text-[0.7rem] font-bold text-white">
                {remoteInfo?.connectedClients}
              </span>
            )}
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'videoFeeds'}
            onClick={() => setActiveTab('videoFeeds')}
            className={tabBtnCls(activeTab === 'videoFeeds')}
          >
            <Video size={14} />
            <span>Video Feeds{overflowConfig?.enabled ? ' • ON' : ''}</span>
          </button>
        </div>

        {/* Tab Body */}
        <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-[22px] py-5">
          {activeTab === 'general' && (
            <div className="flex flex-col gap-4">
              {/* Section 1: Display Output */}
              <section className="flex flex-col gap-3.5 rounded-xl border border-subtle bg-panel-elevated p-4">
                <div className="flex flex-wrap items-start justify-between gap-2 border-b border-subtle pb-3">
                  <div className="flex items-start gap-2.5">
                    <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-blue-500/15 text-blue-400">
                      <Monitor size={16} />
                    </div>
                    <div>
                      <h3 className="m-0 text-[0.9rem] font-bold text-text-primary">
                        Display Output
                      </h3>
                      <p className="m-0 mt-0.5 text-[0.76rem] text-text-secondary">
                        Assign physical monitors for your {t.screens.mainScreen} and Overflow Room output.
                      </p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={onRefreshDisplays}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-subtle bg-app px-2.5 py-1.5 text-[0.76rem] font-semibold transition-colors hover:bg-hover"
                  >
                    <RefreshCw size={13} />
                    Refresh
                  </button>
                </div>

                {displays.length === 0 ? (
                  <div className="rounded-[10px] border border-subtle bg-app/45 p-3.5 text-[0.84rem] text-text-secondary">
                    Running in browser preview mode. Launch the desktop app to assign physical displays.
                  </div>
                ) : (
                  <div className="grid grid-cols-[repeat(auto-fit,minmax(220px,1fr))] gap-2.5">
                    {displays.map((d) => {
                      const isOverflow = assignedOverflowDisplayId === d.id;
                      return (
                        <div
                          key={d.id}
                          className={cn(
                            'flex flex-col gap-2 rounded-[10px] border p-3',
                            d.isMainScreen
                              ? 'border-accent bg-blue-500/12'
                              : isOverflow
                                ? 'border-violet-500 bg-violet-500/12'
                                : 'border-subtle bg-app/45'
                          )}
                        >
                          <div className="flex items-center justify-between gap-2">
                            <div className="flex items-center gap-2 text-[0.88rem] font-semibold">
                              <Monitor size={15} />
                              <span>{d.label}</span>
                            </div>
                            {d.isMainScreen && (
                              <span className="text-[0.7rem] font-bold text-blue-400">
                                Main
                              </span>
                            )}
                            {!d.isMainScreen && isOverflow && (
                              <span className="text-[0.7rem] font-bold text-purple-400">
                                Overflow
                              </span>
                            )}
                          </div>
                          <div className="text-[0.76rem] text-text-secondary">
                            {d.bounds.width} × {d.bounds.height} {d.isPrimary ? '• Primary' : '• Secondary'}
                          </div>
                          <div className="mt-0.5 flex gap-1.5">
                            <button
                              type="button"
                              onClick={() => onSelectMainDisplay(d.id)}
                              className={cn(
                                'flex-1 rounded-[7px] border px-2 py-[5px] text-[0.74rem] font-semibold transition-colors',
                                d.isMainScreen
                                  ? 'border-accent bg-accent text-white'
                                  : 'border-subtle bg-app text-text-secondary hover:bg-hover'
                              )}
                            >
                              Set Main
                            </button>
                            {onSelectOverflowDisplay && (
                              <button
                                type="button"
                                onClick={() => {
                                  setAssignedOverflowDisplayId(d.id);
                                  onSelectOverflowDisplay(d.id);
                                }}
                                className={cn(
                                  'flex-1 rounded-[7px] border px-2 py-[5px] text-[0.74rem] font-semibold transition-colors',
                                  isOverflow
                                    ? 'border-violet-500 bg-violet-600 text-white'
                                    : 'border-subtle bg-app text-text-secondary hover:bg-hover'
                                )}
                              >
                                Set Overflow
                              </button>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </section>

              {/* Section 2: OBS Setup */}
              <section className="flex flex-col gap-3 rounded-xl border border-subtle bg-panel-elevated p-4">
                <div className="flex items-start gap-2.5 border-b border-subtle pb-3">
                  <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-violet-500/15 text-violet-400">
                    <Link size={16} />
                  </div>
                  <div>
                    <h3 className="m-0 text-[0.9rem] font-bold text-text-primary">
                      OBS Setup
                    </h3>
                    <p className="m-0 mt-0.5 text-[0.76rem] text-text-secondary">
                      Add this URL as a Browser Source in OBS Studio for live streaming or recording.
                    </p>
                  </div>
                </div>

                {remoteInfo?.serverError && (
                  <div className="rounded-lg border border-red-500/40 bg-red-600/16 px-2.5 py-2 text-[0.8rem] text-red-300">
                    LAN Remote Server error: {remoteInfo.serverError}
                  </div>
                )}

                <div className="flex flex-col gap-1.5">
                  <span className="text-[0.74rem] font-semibold text-text-secondary">
                    OBS Browser Source URL
                  </span>
                  <div className="flex items-center gap-2">
                    <code className="min-w-0 flex-1 break-all rounded-lg border border-subtle bg-app px-2.5 py-2 text-[0.8rem] text-blue-300">
                      {remoteInfo?.localUrl ?? 'http://localhost:4850/'}
                    </code>
                    <button
                      type="button"
                      onClick={() => {
                        const url = remoteInfo?.localUrl ?? 'http://localhost:4850/';
                        navigator.clipboard?.writeText(url).catch(() => {});
                        setObsUrlCopied(true);
                        setTimeout(() => setObsUrlCopied(false), 2000);
                      }}
                      className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-subtle bg-app px-3 py-2 text-[0.76rem] font-semibold text-text-primary transition-colors hover:bg-hover"
                    >
                      {obsUrlCopied ? (
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
                </div>
              </section>

              {/* Section 3: Remote Devices */}
              <section className="flex flex-col gap-3 rounded-xl border border-subtle bg-panel-elevated p-4">
                <div className="flex flex-wrap items-start justify-between gap-2 border-b border-subtle pb-3">
                  <div className="flex items-start gap-2.5">
                    <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-emerald-500/15 text-emerald-400">
                      <ShieldCheck size={16} />
                    </div>
                    <div>
                      <h3 className="m-0 text-[0.9rem] font-bold text-text-primary">
                        Remote Devices
                      </h3>
                      <p className="m-0 mt-0.5 text-[0.76rem] text-text-secondary">
                        Manage companion tablets, Remote Control PIN, and paired device access.
                      </p>
                    </div>
                  </div>
                  <span className="rounded-full bg-app px-2.5 py-0.5 text-[0.72rem] font-semibold text-text-secondary border border-subtle">
                    {t.remote.connectedDevices}: <strong>{remoteInfo?.connectedClients ?? 0}</strong>
                  </span>
                </div>

                {remoteInfo?.localPin && (
                  <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-subtle bg-app/45 px-3 py-2.5 text-[0.78rem]">
                    <span className="inline-flex items-center gap-2 text-text-secondary">
                      Remote Control PIN:
                      <strong className="font-mono text-[0.92rem] tracking-[0.08em] text-amber-400">
                        {remoteInfo.localPin}
                      </strong>
                    </span>
                    {onRegenerateRemotePin && (
                      <button
                        type="button"
                        onClick={onRegenerateRemotePin}
                        title="Generate a new permanent Remote Control PIN"
                        className="inline-flex cursor-pointer items-center gap-1 rounded-md border border-subtle bg-app px-2.5 py-1 text-[0.74rem] font-semibold text-text-secondary transition-colors hover:bg-hover"
                      >
                        <RefreshCw size={12} />
                        New PIN
                      </button>
                    )}
                  </div>
                )}

                <div className="text-[0.74rem] text-text-muted">
                  Remotes can&apos;t connect? Make sure both devices are on the same Wi-Fi and UECFI Presenter is allowed through Windows Firewall (Private &amp; Public networks).
                </div>

                {window.presenterAPI && (
                  <div className="flex flex-col gap-2 border-t border-subtle pt-3">
                    <div className="flex items-center gap-[7px] text-[0.82rem] font-bold text-text-primary">
                      <span>Whitelisted Devices ({whitelistedDevices.length})</span>
                    </div>
                    {whitelistedDevices.length === 0 ? (
                      <div className="text-[0.78rem] text-text-muted">
                        No paired devices yet. Devices that unlock with the PIN are remembered automatically until revoked.
                      </div>
                    ) : (
                      <div className="flex flex-col gap-1.5">
                        {whitelistedDevices.map((device) => (
                          <div
                            key={device.id}
                            className="flex items-center justify-between gap-2.5 rounded-lg border border-subtle bg-app/45 px-2.5 py-2"
                          >
                            <div className="min-w-0">
                              <div className="text-[0.82rem] font-semibold text-text-primary">
                                {device.name}
                              </div>
                              <div className="text-[0.72rem] text-text-muted">
                                Last seen: {new Date(device.lastSeenAt).toLocaleString()}
                              </div>
                            </div>
                            <button
                              type="button"
                              onClick={() => {
                                window.presenterAPI?.revokeWhitelistedDevice(device.id).then(setWhitelistedDevices);
                              }}
                              className="inline-flex cursor-pointer items-center gap-1 rounded-md border border-red-500/40 bg-red-600/14 px-[9px] py-[5px] text-[0.75rem] font-semibold text-red-300 transition-colors hover:bg-red-600/24"
                            >
                              <Trash2 size={12} />
                              Revoke
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </section>
            </div>
          )}

          {activeTab === 'videoFeeds' && (
            <div className="flex flex-col gap-4">
              {onSaveParticipantSettings && (
                <section className="flex flex-col gap-3.5 rounded-xl border border-subtle bg-panel-elevated p-4">
                  <div className="flex flex-wrap items-start justify-between gap-2 border-b border-subtle pb-3">
                    <div className="flex items-start gap-2.5">
                      <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-blue-500/15 text-blue-400">
                        <Globe size={16} />
                      </div>
                      <div>
                        <h3 className="m-0 text-[0.9rem] font-bold text-text-primary">
                          Online Guest Connection
                        </h3>
                        <p className="m-0 mt-0.5 text-[0.76rem] text-text-secondary">
                          Let remote speakers outside your local Wi-Fi join using your Centro Code and Access Code.
                        </p>
                      </div>
                    </div>
                    <span
                      className={cn(
                        'rounded-full px-2.5 py-0.5 text-[0.7rem] font-semibold',
                        relayDraft.signalingRelayUrl.trim()
                          ? 'bg-emerald-500/15 text-emerald-300'
                          : 'bg-slate-500/15 text-text-muted'
                      )}
                    >
                      {relayDraft.signalingRelayUrl.trim() ? 'Online Relay Enabled' : 'Local Wi-Fi Only'}
                    </span>
                  </div>

                  <div className="grid grid-cols-[repeat(auto-fit,minmax(180px,1fr))] gap-3">
                    <label className="flex flex-col gap-1">
                      <span className="text-[0.75rem] font-semibold text-text-secondary">
                        Centro Code
                      </span>
                      <input
                        type="text"
                        placeholder="e.g. UECFI-ABCDE"
                        value={relayDraft.onlineSessionCode}
                        onChange={(e) =>
                          setRelayDraft((d) => ({ ...d, onlineSessionCode: e.target.value.toUpperCase() }))
                        }
                        className={inputCls}
                      />
                      <span className="text-[0.69rem] text-text-muted">
                        Share this code with remote speakers
                      </span>
                    </label>
                    <label className="flex flex-col gap-1">
                      <span className="text-[0.75rem] font-semibold text-text-secondary">
                        Access Code (PIN)
                      </span>
                      <input
                        type="text"
                        placeholder="1905"
                        value={relayDraft.onlinePin}
                        onChange={(e) => setRelayDraft((d) => ({ ...d, onlinePin: e.target.value }))}
                        className={inputCls}
                      />
                      <span className="text-[0.69rem] text-text-muted">
                        Required to enter the Green Room
                      </span>
                    </label>
                    <label className="flex flex-col gap-1">
                      <span className="text-[0.75rem] font-semibold text-text-secondary">
                        Relay Server URL
                      </span>
                      <input
                        type="text"
                        placeholder="wss://remote.uecfi.net/ws"
                        value={relayDraft.signalingRelayUrl}
                        onChange={(e) =>
                          setRelayDraft((d) => ({ ...d, signalingRelayUrl: e.target.value }))
                        }
                        className={inputCls}
                      />
                      <span className="text-[0.69rem] text-text-muted">
                        Leave empty for Local Wi-Fi only
                      </span>
                    </label>
                  </div>

                  <details className="rounded-lg border border-subtle bg-app/50 px-3 py-2">
                    <summary className="cursor-pointer select-none text-[0.76rem] font-semibold text-text-secondary hover:text-text-primary">
                      Advanced: STUN / TURN Server (Optional)
                    </summary>
                    <div className="mt-2.5 grid grid-cols-[repeat(auto-fit,minmax(175px,1fr))] gap-2.5">
                      <label className="flex flex-col gap-1 text-[0.72rem] text-text-muted">
                        <span>STUN Server URL</span>
                        <input
                          type="text"
                          placeholder="stun:stun.l.google.com:19302"
                          value={relayDraft.stunUrl}
                          onChange={(e) => setRelayDraft((d) => ({ ...d, stunUrl: e.target.value }))}
                          className={inputCls}
                        />
                      </label>
                      <label className="flex flex-col gap-1 text-[0.72rem] text-text-muted">
                        <span>TURN Server URL</span>
                        <input
                          type="text"
                          placeholder="turn:relay.example.com:3478"
                          value={relayDraft.turnUrl}
                          onChange={(e) => setRelayDraft((d) => ({ ...d, turnUrl: e.target.value }))}
                          className={inputCls}
                        />
                      </label>
                      <label className="flex flex-col gap-1 text-[0.72rem] text-text-muted">
                        <span>TURN Username</span>
                        <input
                          type="text"
                          placeholder="Optional"
                          value={relayDraft.turnUsername}
                          onChange={(e) =>
                            setRelayDraft((d) => ({ ...d, turnUsername: e.target.value }))
                          }
                          className={inputCls}
                        />
                      </label>
                      <label className="flex flex-col gap-1 text-[0.72rem] text-text-muted">
                        <span>TURN Password</span>
                        <input
                          type="password"
                          placeholder="Optional"
                          value={relayDraft.turnCredential}
                          onChange={(e) =>
                            setRelayDraft((d) => ({ ...d, turnCredential: e.target.value }))
                          }
                          className={inputCls}
                        />
                      </label>
                    </div>
                  </details>

                  <div className="flex items-center justify-end gap-2.5">
                    {settingsSaved && (
                      <span className="inline-flex items-center gap-1 text-[0.76rem] font-semibold text-emerald-400">
                        <Check size={14} /> Saved &amp; applied
                      </span>
                    )}
                    <button
                      type="button"
                      onClick={() => {
                        onSaveParticipantSettings(relayDraft);
                        setSettingsSaved(true);
                        setTimeout(() => setSettingsSaved(false), 2000);
                      }}
                      className="inline-flex items-center gap-1.5 rounded-lg border-0 bg-blue-600 px-3.5 py-2 text-[0.78rem] font-semibold text-white transition-colors hover:bg-blue-500"
                    >
                      Save Connection Settings
                    </button>
                  </div>
                </section>
              )}
              {onUpdateReturnFeedConfig &&
                (() => {
                  const RETURN_FEED_HELP: Record<string, { title: string; text: string }> = {
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
                    <section className="flex flex-col gap-3.5 rounded-xl border border-subtle bg-panel-elevated p-4">
                      <div className="flex items-start gap-2.5 border-b border-subtle pb-3">
                        <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-emerald-500/15 text-emerald-400">
                          <Radio size={16} />
                        </div>
                        <div>
                          <h3 className="m-0 text-[0.9rem] font-bold text-text-primary">
                            Room Return Feed &amp; Backstage Whisper
                          </h3>
                          <p className="m-0 mt-0.5 text-[0.76rem] text-text-secondary">
                            Choose what remote speakers see and hear from the room, plus your private headset for backstage talk.
                          </p>
                        </div>
                      </div>

                      {/* Room Return Feed Block */}
                      <div className="flex flex-col gap-3 rounded-lg border border-subtle bg-app/45 p-3">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <span className="text-[0.78rem] font-bold text-text-primary">
                            Sent to Remote Speakers
                          </span>
                          <div className="flex flex-wrap items-center gap-2">
                            <button
                              type="button"
                              role="switch"
                              aria-checked={returnFeedConfig.autoMuteWhenLive}
                              aria-label="Auto-mute when speaker is LIVE"
                              onClick={() =>
                                onUpdateReturnFeedConfig({
                                  autoMuteWhenLive: !returnFeedConfig.autoMuteWhenLive
                                })
                              }
                              className={cn(
                                'relative inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full border-0 p-0.5 transition-colors duration-200',
                                returnFeedConfig.autoMuteWhenLive
                                  ? 'bg-green-600'
                                  : 'bg-slate-500/75'
                              )}
                            >
                              <span
                                className={cn(
                                  'pointer-events-none inline-block h-4 w-4 rounded-full bg-white transition-transform duration-200',
                                  returnFeedConfig.autoMuteWhenLive
                                    ? 'translate-x-4'
                                    : 'translate-x-0'
                                )}
                              />
                            </button>
                            <span
                              onClick={() =>
                                onUpdateReturnFeedConfig({
                                  autoMuteWhenLive: !returnFeedConfig.autoMuteWhenLive
                                })
                              }
                              className="cursor-pointer text-[0.76rem] text-text-secondary"
                            >
                              Auto-mute when speaker is LIVE
                            </span>
                            {renderHelpBtn('autoMute')}
                          </div>
                        </div>

                        <div className="flex flex-wrap items-center gap-2">
                          <button
                            type="button"
                            role="switch"
                            aria-checked={returnFeedConfig.echoCancellation !== false}
                            aria-label="Echo Cancellation (auto-off during songs)"
                            onClick={() =>
                              onUpdateReturnFeedConfig({
                                echoCancellation: returnFeedConfig.echoCancellation === false
                              })
                            }
                            className={cn(
                              'relative inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full border-0 p-0.5 transition-colors duration-200',
                              returnFeedConfig.echoCancellation !== false
                                ? 'bg-green-600'
                                : 'bg-slate-500/75'
                            )}
                          >
                            <span
                              className={cn(
                                'pointer-events-none inline-block h-4 w-4 rounded-full bg-white transition-transform duration-200',
                                returnFeedConfig.echoCancellation !== false
                                  ? 'translate-x-4'
                                  : 'translate-x-0'
                              )}
                            />
                          </button>
                          <span
                            onClick={() =>
                              onUpdateReturnFeedConfig({
                                echoCancellation: returnFeedConfig.echoCancellation === false
                              })
                            }
                            className="cursor-pointer text-[0.76rem] text-text-secondary"
                          >
                            Echo Cancellation (auto-off during songs)
                          </span>
                        </div>

                        <div className="flex flex-wrap items-end gap-3">
                          <label className="flex min-w-[220px] flex-1 flex-col gap-1">
                            <span className="inline-flex items-center gap-1.5 text-[0.74rem] font-semibold text-text-secondary">
                              Room Audio Input (Return Audio)
                              {renderHelpBtn('returnAudio')}
                            </span>
                            <div className="relative">
                              <select
                                value={returnFeedConfig.audioDeviceId}
                                onChange={(e) =>
                                  onUpdateReturnFeedConfig({ audioDeviceId: e.target.value })
                                }
                                className={cn(inputCls, 'appearance-none pr-8')}
                              >
                                <option value="">Off (Muted)</option>
                                <option value="default">Default Microphone</option>
                                {returnAudioDevices.map((mic) => (
                                  <option key={mic.deviceId} value={mic.deviceId}>
                                    {mic.label}
                                  </option>
                                ))}
                              </select>
                              <ChevronDown
                                size={14}
                                className="pointer-events-none absolute top-1/2 right-2.5 -translate-y-1/2 text-text-muted"
                              />
                            </div>
                          </label>

                          {hasLiveParticipants &&
                            returnFeedConfig.audioDeviceId &&
                            returnFeedConfig.autoMuteWhenLive &&
                            onToggleReturnAudioManualUnmute && (
                              <button
                                type="button"
                                onClick={onToggleReturnAudioManualUnmute}
                                className={cn(
                                  'cursor-pointer rounded-lg border border-subtle px-3 py-[7px] text-[0.76rem] font-bold transition-colors',
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
                      </div>

                      {/* Backstage Whisper Block */}
                      {(onSelectMonitorOutputDevice || onSelectWhisperInputDevice) && (
                        <div className="flex flex-col gap-2.5 rounded-lg border border-subtle bg-app/45 p-3">
                          <div className="flex items-center justify-between gap-2">
                            <span className="inline-flex items-center gap-1.5 text-[0.78rem] font-bold text-text-primary">
                              <Headphones size={14} className="text-sky-400" />
                              Private 2-Way Backstage Whisper
                            </span>
                            <span className="text-[0.7rem] text-text-muted">
                              LIVE audio stays on System Default
                            </span>
                          </div>

                          <div className="grid grid-cols-[repeat(auto-fit,minmax(210px,1fr))] gap-3">
                            {onSelectWhisperInputDevice && (
                              <label className="flex flex-col gap-1">
                                <span className="inline-flex items-center gap-1.5 text-[0.74rem] font-semibold text-text-secondary">
                                  Operator Microphone
                                  {renderHelpBtn('whisperInput')}
                                </span>
                                <div className="relative">
                                  <select
                                    value={whisperInputDeviceId}
                                    onChange={(e) => onSelectWhisperInputDevice(e.target.value)}
                                    className={cn(inputCls, 'appearance-none pr-8')}
                                  >
                                    <option value="">Off (Listen Only)</option>
                                    <option value="default">Default Microphone</option>
                                    {returnAudioDevices.map((mic) => (
                                      <option key={mic.deviceId} value={mic.deviceId}>
                                        {mic.label}
                                      </option>
                                    ))}
                                  </select>
                                  <ChevronDown
                                    size={14}
                                    className="pointer-events-none absolute top-1/2 right-2.5 -translate-y-1/2 text-text-muted"
                                  />
                                </div>
                              </label>
                            )}

                            {onSelectMonitorOutputDevice && (
                              <label className="flex flex-col gap-1">
                                <span className="inline-flex items-center gap-1.5 text-[0.74rem] font-semibold text-text-secondary">
                                  Operator Headphones
                                  {renderHelpBtn('whisperOutput')}
                                </span>
                                <div className="relative">
                                  <select
                                    value={monitorOutputDeviceId}
                                    onChange={(e) => onSelectMonitorOutputDevice(e.target.value)}
                                    className={cn(inputCls, 'appearance-none pr-8')}
                                  >
                                    <option value="">System Default</option>
                                    {audioOutputDevices.map((out) => (
                                      <option key={out.deviceId} value={out.deviceId}>
                                        {out.label}
                                      </option>
                                    ))}
                                  </select>
                                  <ChevronDown
                                    size={14}
                                    className="pointer-events-none absolute top-1/2 right-2.5 -translate-y-1/2 text-text-muted"
                                  />
                                </div>
                              </label>
                            )}
                          </div>
                        </div>
                      )}

                      {activeReturnFeedHelp && RETURN_FEED_HELP[activeReturnFeedHelp] && (
                        <div className="flex items-start justify-between gap-2.5 rounded-lg border border-sky-400/35 bg-sky-500/12 px-3 py-2 text-[0.76rem] text-sky-200">
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

              <section className="flex flex-col gap-3 rounded-xl border border-subtle bg-panel-elevated p-4">
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-subtle pb-3">
                  <div className="flex items-start gap-2.5">
                    <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-violet-500/15 text-violet-400">
                      <Camera size={16} />
                    </div>
                    <div>
                      <h3 className="m-0 text-[0.9rem] font-bold text-text-primary">
                        Centro Camera Angles ({overflowAngles.length})
                      </h3>
                      <p className="m-0 mt-0.5 text-[0.76rem] text-text-secondary">
                        Name your camera angles and assign which physical camera each one uses.
                      </p>
                    </div>
                  </div>
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
                      className="inline-flex items-center gap-1.5 rounded-lg border border-subtle bg-app px-3 py-1.5 text-[0.76rem] font-semibold text-text-primary transition-colors hover:bg-hover"
                    >
                      <Plus size={14} /> Add Angle
                    </button>
                  )}
                </div>

                <div className="flex flex-col gap-2">
                  {overflowAngles.map((angle) => {
                    const isActive = Boolean(overflowConfig?.enabled && angle.id === activeOverflowAngleId);
                    const canRemove = overflowAngles.length > 1 && Boolean(onUpdateOverflowAngles);
                    return (
                      <div
                        key={angle.id}
                        className={cn(
                          'grid items-center gap-2 rounded-lg border p-2',
                          canRemove
                            ? 'grid-cols-[minmax(120px,0.75fr)_1fr_auto]'
                            : 'grid-cols-[minmax(120px,0.75fr)_1fr]',
                          isActive
                            ? 'border-emerald-500/45 bg-emerald-500/8'
                            : 'border-subtle bg-app/45'
                        )}
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
                          className={inputCls}
                        />
                        <div className="relative">
                          <select
                            value={angle.deviceId}
                            onChange={(e) => {
                              onUpdateOverflowAngles?.(
                                overflowAngles.map((a) =>
                                  a.id === angle.id ? { ...a, deviceId: e.target.value } : a
                                )
                              );
                            }}
                            className={cn(inputCls, 'appearance-none pr-8')}
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
                          <ChevronDown
                            size={14}
                            className="pointer-events-none absolute top-1/2 right-2.5 -translate-y-1/2 text-text-muted"
                          />
                        </div>
                        {canRemove && (
                          <button
                            type="button"
                            title="Remove angle"
                            onClick={() => {
                              const remaining = overflowAngles.filter((a) => a.id !== angle.id);
                              onUpdateOverflowAngles?.(remaining);
                              if (angle.id === activeOverflowAngleId && remaining[0]) {
                                onSelectOverflowAngle?.(remaining[0].id);
                              }
                            }}
                            className="inline-flex rounded-[7px] border border-red-500/35 bg-transparent p-2 text-red-400 transition-colors hover:bg-red-500/15"
                          >
                            <Trash2 size={13} />
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>
              </section>
            </div>
          )}
        </div>
      </div>
    </section>
  );
};
