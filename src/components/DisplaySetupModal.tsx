import React, { useEffect, useId, useRef, useState } from 'react';
import QRCode from 'qrcode';
import {
  Globe,
  Monitor,
  QrCode,
  RefreshCw,
  Settings,
  ShieldCheck,
  Trash2,
  X
} from 'lucide-react';
import type {
  DisplayInfo,
  ParticipantNetworkSettings,
  RemoteConnectionInfo,
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
}

type SettingsTab = 'displays' | 'remote' | 'relay';

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
  onRegenerateRemotePin
}) => {
  const t = useTerminology();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const [activeTab, setActiveTab] = useState<SettingsTab>('displays');
  const [qrDataUrl, setQrDataUrl] = useState<string>('');
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

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    if (open && !dialog.open) {
      dialog.showModal();
    } else if (!open && dialog.open) {
      dialog.close();
    }
  }, [open]);

  useEffect(() => {
    if (!remoteInfo?.localUrl) return;
    QRCode.toDataURL(remoteInfo.localUrl, {
      width: 180,
      margin: 1,
      color: { dark: '#0f172a', light: '#f8fafc' }
    })
      .then(setQrDataUrl)
      .catch(() => setQrDataUrl(''));
  }, [remoteInfo?.localUrl]);

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
    <dialog
      ref={dialogRef}
      aria-labelledby={titleId}
      className="w-[min(94vw,720px)] max-w-[720px]"
      onClose={() => {
        if (dialogRef.current) {
          dialogRef.current.returnValue = '';
        }
        onClose();
      }}
    >
      <div className="flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between gap-3 border-b border-subtle px-[22px] py-4">
          <div className="flex items-center gap-[9px]">
            <Settings size={18} color="#93c5fd" />
            <h2 id={titleId} className="m-0 text-[1.08rem] font-bold">
              Settings
            </h2>
          </div>
          <form method="dialog" className="m-0">
            <button
              type="submit"
              value="close"
              aria-label="Close"
              className="inline-flex items-center justify-center rounded-lg border border-subtle bg-transparent p-1.5 transition-colors hover:bg-hover"
            >
              <X size={16} />
            </button>
          </form>
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
            aria-selected={activeTab === 'displays'}
            onClick={() => setActiveTab('displays')}
            className={tabBtnCls(activeTab === 'displays')}
          >
            <Monitor size={14} />
            <span>Displays</span>
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'remote'}
            onClick={() => setActiveTab('remote')}
            className={tabBtnCls(activeTab === 'remote')}
          >
            <QrCode size={14} />
            <span>Local Wi-Fi Remote</span>
            {(remoteInfo?.connectedClients ?? 0) > 0 && (
              <span className="rounded-full bg-blue-700 px-1.5 py-px text-[0.7rem] font-bold text-white">
                {remoteInfo?.connectedClients}
              </span>
            )}
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'relay'}
            onClick={() => setActiveTab('relay')}
            className={tabBtnCls(activeTab === 'relay')}
          >
            <Globe size={14} />
            <span>Online Guest Relay</span>
          </button>
        </div>

        {/* Tab Body */}
        <div className="flex flex-col gap-4 px-[22px] py-5">
          {activeTab === 'displays' && (
            <section className="flex flex-col gap-3.5">
              <div className="flex items-center justify-between">
                <span className="text-[0.84rem] text-text-secondary">
                  Assign physical monitors for your {t.screens.mainScreen} and Overflow Room output.
                </span>
                <button
                  type="button"
                  onClick={onRefreshDisplays}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-subtle bg-panel-elevated px-2.5 py-[5px] text-[0.78rem] font-semibold transition-colors hover:bg-hover"
                >
                  <RefreshCw size={13} />
                  Refresh
                </button>
              </div>

              {displays.length === 0 ? (
                <div className="rounded-[10px] bg-panel-elevated p-3.5 text-[0.85rem] text-text-secondary">
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
                              : 'border-subtle bg-panel-elevated'
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
          )}

          {activeTab === 'remote' && (
            <div className="flex flex-col gap-4">
              <section className="flex flex-wrap items-center gap-[18px]">
                {qrDataUrl && (
                  <div className="inline-flex rounded-[10px] bg-slate-50 p-2">
                    <img src={qrDataUrl} alt="Local Network Remote Viewer QR Code" width={136} height={136} />
                  </div>
                )}

                <div className="flex min-w-[220px] flex-1 flex-col gap-2">
                  {remoteInfo?.serverError && (
                    <div className="rounded-lg border border-red-500/40 bg-red-600/16 px-2.5 py-2 text-[0.8rem] text-red-300">
                      LAN Remote Server error: {remoteInfo.serverError}
                    </div>
                  )}
                  <div className="text-[0.82rem] text-text-secondary">
                    Open on any phone, tablet, or Android browser on the same Wi-Fi:
                  </div>
                  <code className="block break-all rounded-lg border border-subtle bg-app px-2.5 py-2 text-[0.8rem] text-blue-300">
                    {remoteInfo?.localUrl ?? 'http://localhost:4850/?view=remote'}
                  </code>
                  <div className="flex flex-wrap items-center gap-4 text-[0.78rem] text-text-muted">
                    <span>
                      {t.remote.connectedDevices}: <strong>{remoteInfo?.connectedClients ?? 0}</strong>
                    </span>
                    {remoteInfo?.localPin && (
                      <span className="inline-flex items-center gap-1.5">
                        Remote Control PIN:{' '}
                        <strong className="font-mono text-[0.88rem] tracking-[0.08em] text-amber-400">
                          {remoteInfo.localPin}
                        </strong>
                        {onRegenerateRemotePin && (
                          <button
                            type="button"
                            onClick={onRegenerateRemotePin}
                            title="Generate a new permanent Remote Control PIN"
                            className="inline-flex cursor-pointer items-center gap-1 rounded-md border border-subtle bg-app px-[7px] py-[3px] text-[0.72rem] font-semibold text-text-secondary transition-colors hover:bg-hover"
                          >
                            <RefreshCw size={11} />
                            New PIN
                          </button>
                        )}
                      </span>
                    )}
                  </div>
                  <div className="text-[0.74rem] text-text-muted">
                    Remotes can&apos;t connect? Make sure both devices are on the same Wi-Fi and UECFI Presenter is allowed through Windows Firewall (Private &amp; Public networks).
                  </div>
                </div>
              </section>

              {window.presenterAPI && (
                <section className="flex flex-col gap-2 border-t border-subtle pt-3.5">
                  <div className="flex items-center gap-[7px] text-[0.88rem] font-bold">
                    <ShieldCheck size={15} />
                    <span>Whitelisted Devices ({whitelistedDevices.length})</span>
                  </div>
                  {whitelistedDevices.length === 0 ? (
                    <div className="text-[0.78rem] text-text-muted">
                      No paired devices yet. Devices that unlock with the PIN are remembered automatically until revoked.
                    </div>
                  ) : (
                    <div className="flex max-h-40 flex-col gap-1.5 overflow-y-auto">
                      {whitelistedDevices.map((device) => (
                        <div
                          key={device.id}
                          className="flex items-center justify-between gap-2.5 rounded-lg border border-subtle bg-panel-elevated px-2.5 py-2"
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
                </section>
              )}
            </div>
          )}

          {activeTab === 'relay' && (
            <section className="flex flex-col gap-3">
              {onSaveParticipantSettings && (
                <div className="flex flex-col gap-2.5 rounded-xl border border-subtle bg-panel-elevated p-3.5">
                  <div className="text-[0.82rem] text-text-secondary">
                    Configure the Internet signaling relay used by remote speakers joining outside your local Wi-Fi.
                  </div>
                  <div className="grid grid-cols-[repeat(auto-fit,minmax(190px,1fr))] gap-2.5">
                    <label className="flex flex-col gap-1 text-[0.74rem] text-text-muted">
                      <span>Signaling Relay URL</span>
                      <input
                        type="text"
                        placeholder="wss://relay.example.com"
                        value={relayDraft.signalingRelayUrl}
                        onChange={(e) => setRelayDraft((d) => ({ ...d, signalingRelayUrl: e.target.value }))}
                        className={inputCls}
                      />
                    </label>
                    <label className="flex flex-col gap-1 text-[0.74rem] text-text-muted">
                      <span>Centro Code</span>
                      <input
                        type="text"
                        placeholder="e.g. UECFI-ABCDE"
                        value={relayDraft.onlineSessionCode}
                        onChange={(e) => setRelayDraft((d) => ({ ...d, onlineSessionCode: e.target.value.toUpperCase() }))}
                        className={inputCls}
                      />
                    </label>
                    <label className="flex flex-col gap-1 text-[0.74rem] text-text-muted">
                      <span>Access Code</span>
                      <input
                        type="text"
                        placeholder="1905"
                        value={relayDraft.onlinePin}
                        onChange={(e) => setRelayDraft((d) => ({ ...d, onlinePin: e.target.value }))}
                        className={inputCls}
                      />
                    </label>
                  </div>

                  <details className="mt-1">
                    <summary className="cursor-pointer text-[0.78rem] font-semibold text-text-secondary">
                      Advanced: STUN / TURN Server (Optional)
                    </summary>
                    <div className="mt-2.5 grid grid-cols-[repeat(auto-fit,minmax(180px,1fr))] gap-2">
                      <input
                        type="text"
                        placeholder="STUN URL"
                        value={relayDraft.stunUrl}
                        onChange={(e) => setRelayDraft((d) => ({ ...d, stunUrl: e.target.value }))}
                        className={inputCls}
                      />
                      <input
                        type="text"
                        placeholder="TURN URL (optional)"
                        value={relayDraft.turnUrl}
                        onChange={(e) => setRelayDraft((d) => ({ ...d, turnUrl: e.target.value }))}
                        className={inputCls}
                      />
                      <input
                        type="text"
                        placeholder="TURN Username"
                        value={relayDraft.turnUsername}
                        onChange={(e) => setRelayDraft((d) => ({ ...d, turnUsername: e.target.value }))}
                        className={inputCls}
                      />
                      <input
                        type="password"
                        placeholder="TURN Credential"
                        value={relayDraft.turnCredential}
                        onChange={(e) => setRelayDraft((d) => ({ ...d, turnCredential: e.target.value }))}
                        className={inputCls}
                      />
                    </div>
                  </details>

                  <div className="mt-1 flex items-center justify-between gap-2">
                    <span className={cn('text-[0.74rem]', settingsSaved ? 'text-green-400' : 'text-text-muted')}>
                      {settingsSaved ? 'Saved & applied.' : 'Leave Relay URL empty to use Local Wi-Fi only.'}
                    </span>
                    <button
                      type="button"
                      onClick={() => {
                        onSaveParticipantSettings(relayDraft);
                        setSettingsSaved(true);
                        setTimeout(() => setSettingsSaved(false), 2000);
                      }}
                      className="rounded-[7px] border-0 bg-blue-600 px-3.5 py-[7px] text-[0.78rem] font-semibold text-white transition-colors hover:bg-blue-500"
                    >
                      Save Relay Settings
                    </button>
                  </div>
                </div>
              )}
            </section>
          )}
        </div>
      </div>
    </dialog>
  );
};
