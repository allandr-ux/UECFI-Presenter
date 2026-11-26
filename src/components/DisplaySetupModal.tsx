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

  const tabBtnStyle = (active: boolean): React.CSSProperties => ({
    display: 'inline-flex',
    alignItems: 'center',
    gap: '7px',
    padding: '9px 14px',
    border: 'none',
    borderBottom: `2px solid ${active ? 'var(--accent)' : 'transparent'}`,
    background: 'transparent',
    color: active ? 'var(--text-primary)' : 'var(--text-muted)',
    fontSize: '0.84rem',
    fontWeight: 600,
    cursor: 'pointer',
    whiteSpace: 'nowrap'
  });

  const inputStyle: React.CSSProperties = {
    padding: '7px 10px',
    borderRadius: '7px',
    border: '1px solid var(--border-subtle)',
    background: 'var(--bg-app)',
    color: 'var(--text-primary)',
    fontSize: '0.8rem',
    width: '100%'
  };

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby={titleId}
      style={{ maxWidth: '720px', width: 'min(94vw, 720px)' }}
      onClose={() => {
        if (dialogRef.current) {
          dialogRef.current.returnValue = '';
        }
        onClose();
      }}
    >
      <div style={{ display: 'flex', flexDirection: 'column' }}>
        {/* Header */}
        <div
          style={{
            padding: '16px 22px',
            borderBottom: '1px solid var(--border-subtle)',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            gap: '12px'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '9px' }}>
            <Settings size={18} color="#93c5fd" />
            <h2 id={titleId} style={{ margin: 0, fontSize: '1.08rem', fontWeight: 700 }}>
              Settings
            </h2>
          </div>
          <form method="dialog" style={{ margin: 0 }}>
            <button
              type="submit"
              value="close"
              aria-label="Close"
              style={{
                background: 'transparent',
                border: '1px solid var(--border-subtle)',
                borderRadius: '8px',
                padding: '6px',
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center'
              }}
            >
              <X size={16} />
            </button>
          </form>
        </div>

        {/* Consolidated Settings Tabs */}
        <div
          role="tablist"
          aria-label="Settings sections"
          style={{
            display: 'flex',
            gap: '6px',
            padding: '6px 22px 0',
            borderBottom: '1px solid var(--border-subtle)',
            background: 'rgba(15, 23, 42, 0.35)',
            overflowX: 'auto'
          }}
        >
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'displays'}
            onClick={() => setActiveTab('displays')}
            style={tabBtnStyle(activeTab === 'displays')}
          >
            <Monitor size={14} />
            <span>Displays</span>
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'remote'}
            onClick={() => setActiveTab('remote')}
            style={tabBtnStyle(activeTab === 'remote')}
          >
            <QrCode size={14} />
            <span>Local Wi-Fi Remote</span>
            {(remoteInfo?.connectedClients ?? 0) > 0 && (
              <span
                style={{
                  background: '#1d4ed8',
                  color: '#fff',
                  borderRadius: '999px',
                  padding: '1px 6px',
                  fontSize: '0.7rem',
                  fontWeight: 700
                }}
              >
                {remoteInfo?.connectedClients}
              </span>
            )}
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'relay'}
            onClick={() => setActiveTab('relay')}
            style={tabBtnStyle(activeTab === 'relay')}
          >
            <Globe size={14} />
            <span>Online Guest Relay</span>
          </button>
        </div>

        {/* Tab Body */}
        <div style={{ padding: '20px 22px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {activeTab === 'displays' && (
            <section style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: '0.84rem', color: 'var(--text-secondary)' }}>
                  Assign physical monitors for your {t.screens.mainScreen} and Overflow Room output.
                </span>
                <button
                  type="button"
                  onClick={onRefreshDisplays}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '6px',
                    background: 'var(--bg-panel-elevated)',
                    border: '1px solid var(--border-subtle)',
                    borderRadius: '8px',
                    padding: '5px 10px',
                    fontSize: '0.78rem',
                    fontWeight: 600
                  }}
                >
                  <RefreshCw size={13} />
                  Refresh
                </button>
              </div>

              {displays.length === 0 ? (
                <div
                  style={{
                    padding: '14px',
                    borderRadius: '10px',
                    background: 'var(--bg-panel-elevated)',
                    color: 'var(--text-secondary)',
                    fontSize: '0.85rem'
                  }}
                >
                  Running in browser preview mode. Launch the desktop app to assign physical displays.
                </div>
              ) : (
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
                    gap: '10px'
                  }}
                >
                  {displays.map((d) => {
                    const isOverflow = assignedOverflowDisplayId === d.id;
                    return (
                      <div
                        key={d.id}
                        style={{
                          padding: '12px',
                          borderRadius: '10px',
                          border: '1px solid',
                          borderColor: d.isMainScreen
                            ? 'var(--accent)'
                            : isOverflow
                              ? '#8b5cf6'
                              : 'var(--border-subtle)',
                          background: d.isMainScreen
                            ? 'rgba(59,130,246,0.12)'
                            : isOverflow
                              ? 'rgba(139,92,246,0.12)'
                              : 'var(--bg-panel-elevated)',
                          display: 'flex',
                          flexDirection: 'column',
                          gap: '8px'
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontWeight: 600, fontSize: '0.88rem' }}>
                            <Monitor size={15} />
                            <span>{d.label}</span>
                          </div>
                          {d.isMainScreen && (
                            <span style={{ fontSize: '0.7rem', color: '#60a5fa', fontWeight: 700 }}>
                              Main
                            </span>
                          )}
                          {!d.isMainScreen && isOverflow && (
                            <span style={{ fontSize: '0.7rem', color: '#c084fc', fontWeight: 700 }}>
                              Overflow
                            </span>
                          )}
                        </div>
                        <div style={{ fontSize: '0.76rem', color: 'var(--text-secondary)' }}>
                          {d.bounds.width} × {d.bounds.height} {d.isPrimary ? '• Primary' : '• Secondary'}
                        </div>
                        <div style={{ display: 'flex', gap: '6px', marginTop: '2px' }}>
                          <button
                            type="button"
                            onClick={() => onSelectMainDisplay(d.id)}
                            style={{
                              flex: 1,
                              padding: '5px 8px',
                              borderRadius: '7px',
                              border: '1px solid',
                              borderColor: d.isMainScreen ? 'var(--accent)' : 'var(--border-subtle)',
                              background: d.isMainScreen ? 'var(--accent)' : 'var(--bg-app)',
                              color: d.isMainScreen ? '#fff' : 'var(--text-secondary)',
                              fontSize: '0.74rem',
                              fontWeight: 600
                            }}
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
                              style={{
                                flex: 1,
                                padding: '5px 8px',
                                borderRadius: '7px',
                                border: '1px solid',
                                borderColor: isOverflow ? '#8b5cf6' : 'var(--border-subtle)',
                                background: isOverflow ? '#7c3aed' : 'var(--bg-app)',
                                color: isOverflow ? '#fff' : 'var(--text-secondary)',
                                fontSize: '0.74rem',
                                fontWeight: 600
                              }}
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
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <section style={{ display: 'flex', gap: '18px', alignItems: 'center', flexWrap: 'wrap' }}>
                {qrDataUrl && (
                  <div
                    style={{
                      background: '#f8fafc',
                      padding: '8px',
                      borderRadius: '10px',
                      display: 'inline-flex'
                    }}
                  >
                    <img src={qrDataUrl} alt="Local Network Remote Viewer QR Code" width={136} height={136} />
                  </div>
                )}

                <div style={{ flex: 1, minWidth: '220px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {remoteInfo?.serverError && (
                    <div
                      style={{
                        padding: '8px 10px',
                        borderRadius: '8px',
                        background: 'rgba(220, 38, 38, 0.16)',
                        border: '1px solid rgba(239, 68, 68, 0.4)',
                        color: '#fca5a5',
                        fontSize: '0.8rem'
                      }}
                    >
                      LAN Remote Server error: {remoteInfo.serverError}
                    </div>
                  )}
                  <div style={{ fontSize: '0.82rem', color: 'var(--text-secondary)' }}>
                    Open on any phone, tablet, or Android browser on the same Wi-Fi:
                  </div>
                  <code
                    style={{
                      display: 'block',
                      padding: '8px 10px',
                      borderRadius: '8px',
                      background: 'var(--bg-app)',
                      border: '1px solid var(--border-subtle)',
                      fontSize: '0.8rem',
                      wordBreak: 'break-all',
                      color: '#93c5fd'
                    }}
                  >
                    {remoteInfo?.localUrl ?? 'http://localhost:4850/?view=remote'}
                  </code>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '16px', flexWrap: 'wrap', fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                    <span>
                      {t.remote.connectedDevices}: <strong>{remoteInfo?.connectedClients ?? 0}</strong>
                    </span>
                    {remoteInfo?.localPin && (
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                        Remote Control PIN:{' '}
                        <strong style={{ color: '#fbbf24', letterSpacing: '0.08em', fontFamily: 'monospace', fontSize: '0.88rem' }}>
                          {remoteInfo.localPin}
                        </strong>
                        {onRegenerateRemotePin && (
                          <button
                            type="button"
                            onClick={onRegenerateRemotePin}
                            title="Generate a new permanent Remote Control PIN"
                            style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '4px',
                              padding: '3px 7px',
                              borderRadius: '6px',
                              border: '1px solid var(--border-subtle)',
                              background: 'var(--bg-app)',
                              color: 'var(--text-secondary)',
                              fontSize: '0.72rem',
                              fontWeight: 600,
                              cursor: 'pointer'
                            }}
                          >
                            <RefreshCw size={11} />
                            New PIN
                          </button>
                        )}
                      </span>
                    )}
                  </div>
                  <div style={{ fontSize: '0.74rem', color: 'var(--text-muted)' }}>
                    Remotes can&apos;t connect? Make sure both devices are on the same Wi-Fi and UECFI Presenter is allowed through Windows Firewall (Private &amp; Public networks).
                  </div>
                </div>
              </section>

              {window.presenterAPI && (
                <section
                  style={{
                    borderTop: '1px solid var(--border-subtle)',
                    paddingTop: '14px',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '8px'
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '7px', fontWeight: 700, fontSize: '0.88rem' }}>
                    <ShieldCheck size={15} />
                    <span>Whitelisted Devices ({whitelistedDevices.length})</span>
                  </div>
                  {whitelistedDevices.length === 0 ? (
                    <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                      No paired devices yet. Devices that unlock with the PIN are remembered automatically until revoked.
                    </div>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', maxHeight: '160px', overflowY: 'auto' }}>
                      {whitelistedDevices.map((device) => (
                        <div
                          key={device.id}
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            gap: '10px',
                            padding: '8px 10px',
                            borderRadius: '8px',
                            background: 'var(--bg-panel-elevated)',
                            border: '1px solid var(--border-subtle)'
                          }}
                        >
                          <div style={{ minWidth: 0 }}>
                            <div style={{ fontSize: '0.82rem', fontWeight: 600, color: 'var(--text-primary)' }}>
                              {device.name}
                            </div>
                            <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                              Last seen: {new Date(device.lastSeenAt).toLocaleString()}
                            </div>
                          </div>
                          <button
                            type="button"
                            onClick={() => {
                              window.presenterAPI?.revokeWhitelistedDevice(device.id).then(setWhitelistedDevices);
                            }}
                            style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '4px',
                              padding: '5px 9px',
                              borderRadius: '6px',
                              border: '1px solid rgba(239, 68, 68, 0.4)',
                              background: 'rgba(220, 38, 38, 0.14)',
                              color: '#fca5a5',
                              fontSize: '0.75rem',
                              fontWeight: 600,
                              cursor: 'pointer'
                            }}
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
            <section style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {onSaveParticipantSettings && (
                <div
                  style={{
                    background: 'var(--bg-panel-elevated)',
                    border: '1px solid var(--border-subtle)',
                    borderRadius: '12px',
                    padding: '14px',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '10px'
                  }}
                >
                  <div style={{ fontSize: '0.82rem', color: 'var(--text-secondary)' }}>
                    Configure the Internet signaling relay used by remote speakers joining outside your local Wi-Fi.
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: '10px' }}>
                    <label style={{ display: 'flex', flexDirection: 'column', gap: '4px', fontSize: '0.74rem', color: 'var(--text-muted)' }}>
                      <span>Signaling Relay URL</span>
                      <input
                        type="text"
                        placeholder="wss://relay.example.com"
                        value={relayDraft.signalingRelayUrl}
                        onChange={(e) => setRelayDraft((d) => ({ ...d, signalingRelayUrl: e.target.value }))}
                        style={inputStyle}
                      />
                    </label>
                    <label style={{ display: 'flex', flexDirection: 'column', gap: '4px', fontSize: '0.74rem', color: 'var(--text-muted)' }}>
                      <span>Centro Code</span>
                      <input
                        type="text"
                        placeholder="e.g. UECFI-ABCDE"
                        value={relayDraft.onlineSessionCode}
                        onChange={(e) => setRelayDraft((d) => ({ ...d, onlineSessionCode: e.target.value.toUpperCase() }))}
                        style={inputStyle}
                      />
                    </label>
                    <label style={{ display: 'flex', flexDirection: 'column', gap: '4px', fontSize: '0.74rem', color: 'var(--text-muted)' }}>
                      <span>Access Code</span>
                      <input
                        type="text"
                        placeholder="1905"
                        value={relayDraft.onlinePin}
                        onChange={(e) => setRelayDraft((d) => ({ ...d, onlinePin: e.target.value }))}
                        style={inputStyle}
                      />
                    </label>
                  </div>

                  <details style={{ marginTop: '4px' }}>
                    <summary style={{ cursor: 'pointer', fontSize: '0.78rem', fontWeight: 600, color: 'var(--text-secondary)' }}>
                      Advanced: STUN / TURN Server (Optional)
                    </summary>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '8px', marginTop: '10px' }}>
                      <input
                        type="text"
                        placeholder="STUN URL"
                        value={relayDraft.stunUrl}
                        onChange={(e) => setRelayDraft((d) => ({ ...d, stunUrl: e.target.value }))}
                        style={inputStyle}
                      />
                      <input
                        type="text"
                        placeholder="TURN URL (optional)"
                        value={relayDraft.turnUrl}
                        onChange={(e) => setRelayDraft((d) => ({ ...d, turnUrl: e.target.value }))}
                        style={inputStyle}
                      />
                      <input
                        type="text"
                        placeholder="TURN Username"
                        value={relayDraft.turnUsername}
                        onChange={(e) => setRelayDraft((d) => ({ ...d, turnUsername: e.target.value }))}
                        style={inputStyle}
                      />
                      <input
                        type="password"
                        placeholder="TURN Credential"
                        value={relayDraft.turnCredential}
                        onChange={(e) => setRelayDraft((d) => ({ ...d, turnCredential: e.target.value }))}
                        style={inputStyle}
                      />
                    </div>
                  </details>

                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px', marginTop: '4px' }}>
                    <span style={{ fontSize: '0.74rem', color: settingsSaved ? '#4ade80' : 'var(--text-muted)' }}>
                      {settingsSaved ? 'Saved & applied.' : 'Leave Relay URL empty to use Local Wi-Fi only.'}
                    </span>
                    <button
                      type="button"
                      onClick={() => {
                        onSaveParticipantSettings(relayDraft);
                        setSettingsSaved(true);
                        setTimeout(() => setSettingsSaved(false), 2000);
                      }}
                      style={{
                        padding: '7px 14px',
                        borderRadius: '7px',
                        border: 'none',
                        background: '#2563eb',
                        color: '#fff',
                        fontSize: '0.78rem',
                        fontWeight: 600
                      }}
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
