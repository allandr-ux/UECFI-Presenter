import React, { useEffect, useId, useRef, useState } from 'react';
import QRCode from 'qrcode';
import { Globe, Monitor, QrCode, RefreshCw, ShieldCheck, Trash2, Video, X } from 'lucide-react';
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
  onRegenerateRemotePin?: () => void;
}

export const DisplaySetupModal: React.FC<DisplaySetupModalProps> = ({
  open,
  onClose,
  displays,
  remoteInfo,
  participantSettings,
  onSaveParticipantSettings,
  onRefreshDisplays,
  onSelectMainDisplay,
  onRegenerateRemotePin
}) => {
  const t = useTerminology();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const [qrDataUrl, setQrDataUrl] = useState<string>('');
  const [whitelistedDevices, setWhitelistedDevices] = useState<WhitelistedDevice[]>([]);
  const [relayDraft, setRelayDraft] = useState<ParticipantNetworkSettings>(() => ({
    signalingRelayUrl: participantSettings?.signalingRelayUrl ?? 'wss://remote.uecfi.net/ws',
    onlineSessionCode: participantSettings?.onlineSessionCode ?? '',
    onlinePin: participantSettings?.onlinePin ?? '',
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

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby={titleId}
      onClose={() => {
        if (dialogRef.current) {
          dialogRef.current.returnValue = '';
        }
        onClose();
      }}
    >
      <div style={{ padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: '20px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h2 id={titleId} style={{ margin: 0, fontSize: '1.15rem', fontWeight: 700 }}>
            {t.screens.displaySetup} & {t.remote.title}
          </h2>
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

        {/* Display Setup Section */}
        <section style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h3 style={{ margin: 0, fontSize: '0.9rem', color: 'var(--text-secondary)' }}>
              {t.screens.mainScreen} ({t.screens.displaySetup})
            </h3>
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
                fontSize: '0.8rem'
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
              Running in browser preview mode. Launch Electron desktop app to assign physical displays.
            </div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '10px' }}>
              {displays.map((d) => (
                <button
                  key={d.id}
                  type="button"
                  onClick={() => onSelectMainDisplay(d.id)}
                  style={{
                    textAlign: 'left',
                    padding: '12px',
                    borderRadius: '10px',
                    border: '1px solid',
                    borderColor: d.isMainScreen ? 'var(--accent)' : 'var(--border-subtle)',
                    background: d.isMainScreen ? 'rgba(59,130,246,0.14)' : 'var(--bg-panel-elevated)',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '4px'
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontWeight: 600 }}>
                    <Monitor size={15} />
                    <span>{d.label}</span>
                  </div>
                  <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>
                    {d.bounds.width} × {d.bounds.height} {d.isPrimary ? '• Primary' : '• Secondary'}
                  </div>
                  {d.isMainScreen && (
                    <span style={{ fontSize: '0.72rem', color: '#60a5fa', fontWeight: 700 }}>
                      Assigned: {t.screens.mainScreen}
                    </span>
                  )}
                </button>
              ))}
            </div>
          )}
        </section>

        {/* Remote Viewer (Local Network) */}
        <section
          style={{
            borderTop: '1px solid var(--border-subtle)',
            paddingTop: '16px',
            display: 'flex',
            gap: '18px',
            alignItems: 'center',
            flexWrap: 'wrap'
          }}
        >
          {qrDataUrl && (
            <div
              style={{
                background: '#f8fafc',
                padding: '8px',
                borderRadius: '10px',
                display: 'inline-flex'
              }}
            >
              <img src={qrDataUrl} alt="Local Network Remote Viewer QR Code" width={140} height={140} />
            </div>
          )}

          <div style={{ flex: 1, minWidth: '220px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontWeight: 700, fontSize: '0.95rem' }}>
              <QrCode size={16} />
              <span>
                {t.remote.title} — {t.remote.localNetwork}
              </span>
            </div>
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

        {/* Remote Participants (Internet Signaling Relay) */}
        <section
          style={{
            borderTop: '1px solid var(--border-subtle)',
            paddingTop: '14px',
            display: 'flex',
            flexDirection: 'column',
            gap: '12px'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '7px', fontWeight: 700, fontSize: '0.9rem' }}>
            <Video size={16} color="#38bdf8" />
            <span>Remote Participants — Online Signaling</span>
          </div>

          {onSaveParticipantSettings && (
            <div
              style={{
                background: 'var(--bg-panel-elevated)',
                border: '1px solid var(--border-subtle)',
                borderRadius: '12px',
                padding: '12px',
                display: 'flex',
                flexDirection: 'column',
                gap: '8px'
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.84rem', fontWeight: 700 }}>
                <Globe size={14} color="#c084fc" />
                <span>Internet Signaling Relay &amp; STUN/TURN (Optional)</span>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '8px' }}>
                <input
                  type="text"
                  placeholder="Relay URL (wss://relay.example.com)"
                  value={relayDraft.signalingRelayUrl}
                  onChange={(e) => setRelayDraft((d) => ({ ...d, signalingRelayUrl: e.target.value }))}
                  style={{ padding: '7px 10px', borderRadius: '7px', border: '1px solid var(--border-subtle)', background: 'var(--bg-app)', color: 'var(--text-primary)', fontSize: '0.78rem' }}
                />
                <input
                  type="text"
                  placeholder="Session Code (e.g. UECFI-SUN)"
                  value={relayDraft.onlineSessionCode}
                  onChange={(e) => setRelayDraft((d) => ({ ...d, onlineSessionCode: e.target.value.toUpperCase() }))}
                  style={{ padding: '7px 10px', borderRadius: '7px', border: '1px solid var(--border-subtle)', background: 'var(--bg-app)', color: 'var(--text-primary)', fontSize: '0.78rem' }}
                />
                <input
                  type="text"
                  placeholder="Online PIN"
                  value={relayDraft.onlinePin}
                  onChange={(e) => setRelayDraft((d) => ({ ...d, onlinePin: e.target.value }))}
                  style={{ padding: '7px 10px', borderRadius: '7px', border: '1px solid var(--border-subtle)', background: 'var(--bg-app)', color: 'var(--text-primary)', fontSize: '0.78rem' }}
                />
                <input
                  type="text"
                  placeholder="STUN URL"
                  value={relayDraft.stunUrl}
                  onChange={(e) => setRelayDraft((d) => ({ ...d, stunUrl: e.target.value }))}
                  style={{ padding: '7px 10px', borderRadius: '7px', border: '1px solid var(--border-subtle)', background: 'var(--bg-app)', color: 'var(--text-primary)', fontSize: '0.78rem' }}
                />
                <input
                  type="text"
                  placeholder="TURN URL (optional)"
                  value={relayDraft.turnUrl}
                  onChange={(e) => setRelayDraft((d) => ({ ...d, turnUrl: e.target.value }))}
                  style={{ padding: '7px 10px', borderRadius: '7px', border: '1px solid var(--border-subtle)', background: 'var(--bg-app)', color: 'var(--text-primary)', fontSize: '0.78rem' }}
                />
                <input
                  type="text"
                  placeholder="TURN Username"
                  value={relayDraft.turnUsername}
                  onChange={(e) => setRelayDraft((d) => ({ ...d, turnUsername: e.target.value }))}
                  style={{ padding: '7px 10px', borderRadius: '7px', border: '1px solid var(--border-subtle)', background: 'var(--bg-app)', color: 'var(--text-primary)', fontSize: '0.78rem' }}
                />
                <input
                  type="password"
                  placeholder="TURN Credential"
                  value={relayDraft.turnCredential}
                  onChange={(e) => setRelayDraft((d) => ({ ...d, turnCredential: e.target.value }))}
                  style={{ padding: '7px 10px', borderRadius: '7px', border: '1px solid var(--border-subtle)', background: 'var(--bg-app)', color: 'var(--text-primary)', fontSize: '0.78rem' }}
                />
              </div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' }}>
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
                    padding: '6px 12px',
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

        {/* Paired / Whitelisted Remote Devices */}
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
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', maxHeight: '150px', overflowY: 'auto' }}>
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
    </dialog>
  );
};
