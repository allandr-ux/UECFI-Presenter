import React, { useEffect, useRef, useState } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  Eraser,
  EyeOff,
  Image as ImageIcon,
  Maximize2,
  Menu,
  Minimize2,
  Monitor,
  RotateCcw,
  Settings,
  X
} from 'lucide-react';
import type {
  LiveState,
  ParticipantSignalMessage,
  RemoteCommandAction,
  RemoteViewMode
} from '../../shared/types';
import { useTerminology } from '../hooks/useTerminology';
import { FittedMainScreenFrame } from './ScaledMainScreenPreview';
import { ScreenStreamReceiver, buildIceServers } from '../utils/webrtcRoom';
import { MAIN_ROOM_CAMERA_ID, buildOverflowLiveState } from '../utils/overflowState';

export { FittedMainScreenFrame };

const DEVICE_TOKEN_STORAGE = 'uecfi_remote_device_token';

function getBrowserDeviceName(): string {
  const ua = navigator.userAgent || '';
  if (/iPhone/i.test(ua)) return 'iPhone Browser';
  if (/iPad/i.test(ua)) return 'iPad Browser';
  if (/Android/i.test(ua)) return 'Android Browser';
  if (/Mac/i.test(ua)) return 'Mac Browser';
  if (/Windows/i.test(ua)) return 'Windows Browser';
  return 'Web Browser';
}

/**
 * Browser & Android Remote Viewer.
 * Connects over WebSocket to the Local Network server (or Online relay)
 * and renders either the browser remote viewer or the full-screen kiosk controller (?kiosk=1).
 */
export const RemoteViewer: React.FC = () => {
  const t = useTerminology();
  const initialParams = new URLSearchParams(window.location.search);
  const kiosk = initialParams.get('kiosk') === '1';
  const chromeless = initialParams.get('chromeless') === '1';
  const isAndroidApp =
    initialParams.get('noWs') === '1' ||
    Boolean((window as Window & { AndroidPresenterBridge?: unknown }).AndroidPresenterBridge);
  const requestedMode = initialParams.get('viewMode');
  const initialMode: RemoteViewMode =
    kiosk || (chromeless && requestedMode === 'mainScreen') ? 'mainScreen' : 'overflow';

  const [viewMode] = useState<RemoteViewMode>(initialMode);
  const [liveState, setLiveState] = useState<LiveState | null>(null);
  const [connected, setConnected] = useState(false);
  const [pinInput] = useState(
    () => initialParams.get('pin') || sessionStorage.getItem('uecfi_remote_pin') || ''
  );
  const [programDrawerOpen, setProgramDrawerOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [participantStreams, setParticipantStreams] = useState<Map<string, MediaStream>>(new Map());
  const [isFullscreen, setIsFullscreen] = useState(() => Boolean(document.fullscreenElement));

  useEffect(() => {
    const onFsChange = () => setIsFullscreen(Boolean(document.fullscreenElement));
    document.addEventListener('fullscreenchange', onFsChange);
    return () => document.removeEventListener('fullscreenchange', onFsChange);
  }, []);

  // Keep screen awake in browser remote viewer (Main Screen / Stage View / Overflow)
  useEffect(() => {
    if (isAndroidApp) return;
    const nav = navigator as Navigator & {
      wakeLock?: { request: (type: 'screen') => Promise<{ release: () => Promise<void> }> };
    };

    let wakeLock: { release: () => Promise<void> } | null = null;
    let disposed = false;

    const acquire = async () => {
      if (disposed || document.visibilityState !== 'visible' || !nav.wakeLock) return;
      try {
        wakeLock = await nav.wakeLock.request('screen');
      } catch {
        // Ignore if blocked by battery saver or browser policy
      }
    };

    const onVisibility = () => {
      if (document.visibilityState === 'visible') {
        void acquire();
      }
    };

    void acquire();
    document.addEventListener('visibilitychange', onVisibility);

    // Fallback for mobile browsers over plain HTTP LAN (where navigator.wakeLock is unavailable):
    // a 1fps 2x2 muted <video> fed by canvas.captureStream(1) keeps mobile screens awake.
    let keepAwakeVideo: HTMLVideoElement | null = null;
    let keepAwakeStream: MediaStream | null = null;
    const startKeepAwakeVideo = () => {
      if (disposed || keepAwakeVideo) return;
      try {
        const canvas = document.createElement('canvas');
        canvas.width = 2;
        canvas.height = 2;
        const ctx = canvas.getContext('2d');
        ctx?.fillRect(0, 0, 2, 2);
        const capStream = (canvas as HTMLCanvasElement & { captureStream?: (fps?: number) => MediaStream }).captureStream?.(1);
        if (!capStream) return;
        keepAwakeStream = capStream;
        const vid = document.createElement('video');
        vid.muted = true;
        vid.playsInline = true;
        vid.loop = true;
        vid.autoplay = true;
        vid.srcObject = capStream;
        vid.style.position = 'fixed';
        vid.style.width = '1px';
        vid.style.height = '1px';
        vid.style.opacity = '0.001';
        vid.style.pointerEvents = 'none';
        vid.style.bottom = '0';
        vid.style.right = '0';
        document.body.appendChild(vid);
        keepAwakeVideo = vid;
        vid.play().catch(() => {});
      } catch {
        // Ignore if captureStream is unsupported
      }
    };

    const resumeOnGesture = () => {
      if (!keepAwakeVideo) {
        startKeepAwakeVideo();
      } else if (keepAwakeVideo.paused) {
        keepAwakeVideo.play().catch(() => {});
      }
      void acquire();
    };

    startKeepAwakeVideo();
    window.addEventListener('pointerdown', resumeOnGesture, { passive: true });
    window.addEventListener('touchstart', resumeOnGesture, { passive: true });

    return () => {
      disposed = true;
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('pointerdown', resumeOnGesture);
      window.removeEventListener('touchstart', resumeOnGesture);
      keepAwakeStream?.getTracks().forEach((t) => t.stop());
      if (keepAwakeVideo) {
        keepAwakeVideo.pause();
        keepAwakeVideo.srcObject = null;
        keepAwakeVideo.remove();
      }
      void wakeLock?.release().catch(() => {});
    };
  }, [isAndroidApp]);

  const handleToggleFullscreen = () => {
    if (document.fullscreenElement) {
      document.exitFullscreen().catch(() => {});
    } else {
      document.documentElement.requestFullscreen?.().catch(() => {});
    }
  };

  const socketRef = useRef<WebSocket | null>(null);
  const receiverRef = useRef<ScreenStreamReceiver | null>(null);
  const viewerIdRef = useRef(`screen:remote:${Math.random().toString(36).slice(2, 10)}`);
  const pinRef = useRef(pinInput);
  pinRef.current = pinInput;

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const noWs = params.get('noWs') === '1';

    // Expose global bridge callbacks for the Android host WebView so structural state
    // updates and 10Hz audio time ticks can be delivered without opening a duplicate
    // WebSocket connection inside the WebView or re-parsing full state JSON at 10Hz.
    const win = window as Window & {
      __setAndroidLiveState?: (state: LiveState) => void;
      __pullAndroidLiveState?: () => void;
      __setAndroidAudioTime?: (timeSec: number | null, blockIndex?: number | null) => void;
      AndroidPresenterBridge?: { getLatestState?: () => string | null };
    };

    const pullFromBridge = () => {
      try {
        const raw = win.AndroidPresenterBridge?.getLatestState?.();
        if (raw) {
          setLiveState(JSON.parse(raw) as LiveState);
          setConnected(true);
        }
      } catch {
        // Ignore malformed bridge payloads
      }
    };

    win.__setAndroidLiveState = (nextState: LiveState) => {
      if (nextState) {
        setLiveState(nextState);
        setConnected(true);
      }
    };

    win.__pullAndroidLiveState = pullFromBridge;

    // Lightweight 10Hz audio clock & block index updater invoked by Android during timed lyrics.
    win.__setAndroidAudioTime = (timeSec: number | null, blockIndex?: number | null) => {
      setLiveState((prev) =>
        prev
          ? {
              ...prev,
              audioCurrentTimeSec: typeof timeSec === 'number' ? timeSec : undefined,
              ...(typeof blockIndex === 'number' ? { activeBlockIndex: blockIndex } : {})
            }
          : prev
      );
    };

    // Hydrate initial state immediately if running inside the Android WebView bridge.
    pullFromBridge();

    // When loaded by the Android native app with ?noWs=1, skip opening a second WebSocket
    // connection inside the WebView because PresenterWsClient already maintains the socket.
    if (noWs) {
      return () => {
        delete win.__setAndroidLiveState;
        delete win.__pullAndroidLiveState;
        delete win.__setAndroidAudioTime;
      };
    }

    const customWs = params.get('ws');
    const wsPort = params.get('wsPort') || window.location.port || '4850';
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = customWs || `${protocol}//${window.location.hostname}:${wsPort}`;

    let socket: WebSocket | null = null;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
    let disposed = false;

    const connect = () => {
      if (disposed) return;
      socket = new WebSocket(wsUrl);
      socketRef.current = socket;

      receiverRef.current?.dispose();
      receiverRef.current = new ScreenStreamReceiver({
        viewerId: viewerIdRef.current,
        iceServers: buildIceServers(),
        sendSignal: (outMsg) => {
          if (socket?.readyState === WebSocket.OPEN) {
            socket.send(JSON.stringify(outMsg));
          }
        },
        onStreamsChange: setParticipantStreams
      });

      socket.onopen = () => {
        setConnected(true);
        const savedToken = localStorage.getItem(DEVICE_TOKEN_STORAGE)?.trim();
        const deviceName = getBrowserDeviceName();
        if (savedToken) {
          socket?.send(JSON.stringify({ type: 'AUTH', token: savedToken, deviceName }));
          return;
        }
        const currentPin = pinRef.current.trim();
        if (currentPin) {
          sessionStorage.setItem('uecfi_remote_pin', currentPin);
          socket?.send(
            JSON.stringify({ type: 'AUTH', pin: currentPin, rememberDevice: true, deviceName })
          );
        }
      };
      socket.onclose = () => {
        if (socketRef.current === socket) {
          socketRef.current = null;
        }
        setConnected(false);
        if (!disposed) {
          reconnectTimer = setTimeout(connect, 1000);
        }
      };
      socket.onerror = () => {
        socket?.close();
      };
      socket.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data);
          if (msg.type === 'LIVE_STATE') {
            setLiveState(msg.payload as LiveState);
          } else if (msg.type === 'RTC_OFFER' || msg.type === 'RTC_ICE') {
            receiverRef.current?.handleSignal(msg as ParticipantSignalMessage);
          } else if (msg.type === 'TIME_SYNC') {
            setLiveState((prev) =>
              prev
                ? {
                    ...prev,
                    audioCurrentTimeSec:
                      typeof msg.audioCurrentTimeSec === 'number'
                        ? msg.audioCurrentTimeSec
                        : undefined,
                    ...(typeof msg.activeBlockIndex === 'number'
                      ? { activeBlockIndex: msg.activeBlockIndex }
                      : {})
                  }
                : prev
            );
          }
        } catch {
          // Ignore malformed messages
        }
      };
    };

    connect();

    return () => {
      disposed = true;
      delete win.__setAndroidLiveState;
      delete win.__pullAndroidLiveState;
      delete win.__setAndroidAudioTime;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      receiverRef.current?.dispose();
      receiverRef.current = null;
      socket?.close();
      socketRef.current = null;
    };
  }, []);

  const allParticipantIdsKey = isAndroidApp
    ? ''
    : [
        ...(liveState?.participantList ?? []).map((p) => p.id),
        ...(viewMode === 'overflow' && liveState?.overflow?.enabled ? [MAIN_ROOM_CAMERA_ID] : [])
      ].join(',');
  useEffect(() => {
    if (isAndroidApp) return;
    const ids = allParticipantIdsKey ? allParticipantIdsKey.split(',') : [];
    receiverRef.current?.syncSubscriptions(ids);
  }, [allParticipantIdsKey, connected, isAndroidApp]);

  const renderedLiveState: LiveState | null = isAndroidApp
    ? liveState
      ? { ...liveState, participants: undefined, participantList: undefined, overflow: undefined }
      : null
    : viewMode === 'overflow'
      ? buildOverflowLiveState(liveState)
      : liveState;
  const renderedParticipantStreams = isAndroidApp ? undefined : participantStreams;

  const sendRemoteCommand = (
    action: RemoteCommandAction,
    itemId?: string
  ) => {
    const socket = socketRef.current;
    if (!socket || socket.readyState !== WebSocket.OPEN) return;
    socket.send(
      JSON.stringify({
        type: 'REMOTE_CMD',
        action,
        ...(pinRef.current.trim() ? { pin: pinRef.current.trim() } : {}),
        ...(itemId ? { itemId } : {})
      })
    );
  };

  if (kiosk) {
    const programItems = liveState?.programItems ?? [];
    const activeItemId = liveState?.activeItemId;
    const currentOverride = liveState?.override ?? 'none';
    const androidHost = (window as Window & { AndroidHost?: { openSettings?: () => void } })
      .AndroidHost;

    return (
      <div
        style={{
          width: '100vw',
          height: '100vh',
          background: '#000',
          position: 'relative',
          overflow: 'hidden',
          userSelect: 'none',
          WebkitUserSelect: 'none'
        }}
      >
        <FittedMainScreenFrame liveState={renderedLiveState} participantStreams={renderedParticipantStreams} />

        {/* Top-right Settings + Program pills */}
        <div
          style={{
            position: 'absolute',
            top: '12px',
            right: '14px',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            zIndex: 20
          }}
        >
          <button
            type="button"
            onClick={() => setSettingsOpen(true)}
            aria-label="Settings"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '7px',
              padding: '8px 12px',
              borderRadius: '999px',
              background: 'rgba(0, 0, 0, 0.52)',
              border: '1px solid rgba(255, 255, 255, 0.16)',
              color: '#f8fafc',
              cursor: 'pointer'
            }}
          >
            <span
              style={{
                width: '8px',
                height: '8px',
                borderRadius: '50%',
                background: connected ? '#10b981' : '#f43f5e'
              }}
            />
            <Settings size={17} />
          </button>

          <button
            type="button"
            onClick={() => setProgramDrawerOpen(true)}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '8px',
              padding: '8px 14px',
              borderRadius: '999px',
              background: 'rgba(0, 0, 0, 0.52)',
              border: '1px solid rgba(255, 255, 255, 0.16)',
              color: '#f8fafc',
              fontSize: '13px',
              fontWeight: 600,
              cursor: 'pointer'
            }}
          >
            <span>Program</span>
            <Menu size={17} />
          </button>
        </div>

        {/* Bottom-left PREV overlay */}
        <button
          type="button"
          disabled={!connected}
          onClick={() => sendRemoteCommand('PREV')}
          style={{
            position: 'absolute',
            bottom: '16px',
            left: '16px',
            height: '52px',
            padding: '0 18px',
            borderRadius: '16px',
            background: connected ? 'rgba(0, 0, 0, 0.56)' : 'rgba(0, 0, 0, 0.25)',
            border: '1px solid rgba(255, 255, 255, 0.2)',
            color: connected ? '#f8fafc' : 'rgba(148, 163, 184, 0.45)',
            display: 'inline-flex',
            alignItems: 'center',
            gap: '8px',
            fontSize: '15px',
            fontWeight: 800,
            letterSpacing: '0.5px',
            zIndex: 20,
            cursor: connected ? 'pointer' : 'default'
          }}
        >
          <ArrowLeft size={19} />
          <span>PREV</span>
        </button>

        {/* Bottom-right NEXT overlay */}
        <button
          type="button"
          disabled={!connected}
          onClick={() => sendRemoteCommand('NEXT')}
          style={{
            position: 'absolute',
            bottom: '16px',
            right: '16px',
            height: '52px',
            padding: '0 18px',
            borderRadius: '16px',
            background: connected ? 'rgba(56, 189, 248, 0.9)' : 'rgba(0, 0, 0, 0.25)',
            border: connected
              ? '1px solid #38bdf8'
              : '1px solid rgba(255, 255, 255, 0.1)',
            color: connected ? '#090d16' : 'rgba(148, 163, 184, 0.45)',
            display: 'inline-flex',
            alignItems: 'center',
            gap: '8px',
            fontSize: '15px',
            fontWeight: 800,
            letterSpacing: '0.5px',
            zIndex: 20,
            cursor: connected ? 'pointer' : 'default'
          }}
        >
          <span>NEXT</span>
          <ArrowRight size={19} />
        </button>

        {/* Right-side Program Items Drawer */}
        {programDrawerOpen && (
          <div
            onClick={() => setProgramDrawerOpen(false)}
            style={{
              position: 'fixed',
              inset: 0,
              background: 'rgba(0, 0, 0, 0.55)',
              zIndex: 40,
              display: 'flex',
              justifyContent: 'flex-end'
            }}
          >
            <aside
              onClick={(e) => e.stopPropagation()}
              style={{
                width: 'min(340px, 84vw)',
                height: '100%',
                background: '#131b2e',
                borderLeft: '1px solid #2b3a55',
                display: 'flex',
                flexDirection: 'column',
                padding: '16px',
                gap: '12px',
                color: '#f8fafc'
              }}
            >
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: '8px'
                }}
              >
                <div style={{ minWidth: 0 }}>
                  <div
                    style={{
                      fontWeight: 700,
                      fontSize: '16px',
                      whiteSpace: 'nowrap',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis'
                    }}
                  >
                    {liveState?.programName || 'Program Items'}
                  </div>
                  <div style={{ fontSize: '12px', color: '#94a3b8' }}>
                    {programItems.length} item{programItems.length === 1 ? '' : 's'}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setProgramDrawerOpen(false)}
                  aria-label="Close program panel"
                  style={{
                    background: 'transparent',
                    border: 'none',
                    color: '#94a3b8',
                    cursor: 'pointer',
                    padding: '4px'
                  }}
                >
                  <X size={20} />
                </button>
              </div>

              <div style={{ height: '1px', background: 'rgba(43, 58, 85, 0.7)' }} />

              <div
                style={{
                  flex: 1,
                  minHeight: 0,
                  overflowY: 'auto',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '8px'
                }}
              >
                {programItems.length === 0 ? (
                  <div
                    style={{
                      flex: 1,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      color: '#94a3b8',
                      fontSize: '13px',
                      textAlign: 'center',
                      padding: '16px'
                    }}
                  >
                    {connected
                      ? 'No items in the current program.'
                      : 'Reconnecting to desktop presenter...'}
                  </div>
                ) : (
                  programItems.map((item) => {
                    const isActive = item.id === activeItemId;
                    return (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => {
                          sendRemoteCommand('SELECT_ITEM', item.id);
                          setProgramDrawerOpen(false);
                        }}
                        style={{
                          textAlign: 'left',
                          width: '100%',
                          padding: '11px 12px',
                          borderRadius: '12px',
                          background: isActive ? 'rgba(56, 189, 248, 0.16)' : '#1b263b',
                          border: isActive
                            ? '1.5px solid #38bdf8'
                            : '1px solid rgba(43, 58, 85, 0.7)',
                          color: '#f8fafc',
                          cursor: 'pointer',
                          display: 'flex',
                          flexDirection: 'column',
                          gap: '4px'
                        }}
                      >
                        <div
                          style={{
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center',
                            fontSize: '11px',
                            fontWeight: 700
                          }}
                        >
                          <span style={{ color: isActive ? '#38bdf8' : '#94a3b8' }}>
                            {item.type.toUpperCase()}
                          </span>
                          <span style={{ color: isActive ? '#10b981' : '#94a3b8' }}>
                            {isActive
                              ? 'LIVE'
                              : `${item.blockCount} slide${item.blockCount === 1 ? '' : 's'}`}
                          </span>
                        </div>
                        <div
                          style={{
                            fontSize: '14px',
                            fontWeight: isActive ? 700 : 600,
                            lineHeight: 1.3
                          }}
                        >
                          {item.title}
                        </div>
                        {item.subtitle && (
                          <div
                            style={{
                              fontSize: '12px',
                              color: '#94a3b8',
                              whiteSpace: 'nowrap',
                              overflow: 'hidden',
                              textOverflow: 'ellipsis'
                            }}
                          >
                            {item.subtitle}
                          </div>
                        )}
                      </button>
                    );
                  })
                )}
              </div>
            </aside>
          </div>
        )}

        {/* Settings & Screen Overrides Modal */}
        {settingsOpen && (
          <div
            onClick={() => setSettingsOpen(false)}
            style={{
              position: 'fixed',
              inset: 0,
              background: 'rgba(0, 0, 0, 0.65)',
              zIndex: 50,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: '16px'
            }}
          >
            <div
              onClick={(e) => e.stopPropagation()}
              style={{
                width: 'min(420px, 92vw)',
                background: '#131b2e',
                border: '1px solid #2b3a55',
                borderRadius: '18px',
                padding: '18px',
                display: 'flex',
                flexDirection: 'column',
                gap: '14px',
                color: '#f8fafc'
              }}
            >
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between'
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontWeight: 700 }}>
                  <span
                    style={{
                      width: '8px',
                      height: '8px',
                      borderRadius: '50%',
                      background: connected ? '#10b981' : '#f43f5e'
                    }}
                  />
                  <span>Settings</span>
                </div>
                <button
                  type="button"
                  onClick={() => setSettingsOpen(false)}
                  aria-label="Close settings"
                  style={{
                    background: 'transparent',
                    border: 'none',
                    color: '#94a3b8',
                    cursor: 'pointer'
                  }}
                >
                  <X size={20} />
                </button>
              </div>

              <div style={{ height: '1px', background: 'rgba(43, 58, 85, 0.7)' }} />

              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <div style={{ fontSize: '11px', fontWeight: 700, color: '#38bdf8' }}>
                  SCREEN OVERRIDES
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '8px' }}>
                  {[
                    {
                      label: 'Clear',
                      action: 'TOGGLE_CLEAR_TEXT' as const,
                      active: currentOverride === 'clearText',
                      color: '#f59e0b',
                      icon: <Eraser size={15} />
                    },
                    {
                      label: 'Blackout',
                      action: 'TOGGLE_BLACKOUT' as const,
                      active: currentOverride === 'blackout',
                      color: '#f43f5e',
                      icon: <EyeOff size={15} />
                    },
                    {
                      label: 'Logo',
                      action: 'TOGGLE_LOGO' as const,
                      active: currentOverride === 'showLogo',
                      color: '#38bdf8',
                      icon: <ImageIcon size={15} />
                    }
                  ].map((btn) => (
                    <button
                      key={btn.action}
                      type="button"
                      disabled={!connected}
                      onClick={() => sendRemoteCommand(btn.action)}
                      style={{
                        height: '42px',
                        borderRadius: '10px',
                        background: btn.active ? `${btn.color}33` : '#1b263b',
                        border: `1px solid ${btn.active ? btn.color : '#2b3a55'}`,
                        color: btn.active ? btn.color : '#f8fafc',
                        fontSize: '12px',
                        fontWeight: btn.active ? 700 : 500,
                        display: 'inline-flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: '5px',
                        cursor: connected ? 'pointer' : 'default'
                      }}
                    >
                      {btn.icon}
                      <span>{btn.label}</span>
                    </button>
                  ))}
                </div>

                {currentOverride !== 'none' && (
                  <button
                    type="button"
                    disabled={!connected}
                    onClick={() => sendRemoteCommand('CLEAR_OVERRIDE')}
                    style={{
                      height: '40px',
                      borderRadius: '10px',
                      background: 'rgba(16, 185, 129, 0.2)',
                      border: '1px solid rgba(16, 185, 129, 0.5)',
                      color: '#10b981',
                      fontSize: '13px',
                      fontWeight: 600,
                      display: 'inline-flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '6px',
                      cursor: 'pointer'
                    }}
                  >
                    <RotateCcw size={15} />
                    <span>Restore Live Screen</span>
                  </button>
                )}
              </div>

              {androidHost?.openSettings && (
                <>
                  <div style={{ height: '1px', background: 'rgba(43, 58, 85, 0.7)' }} />
                  <button
                    type="button"
                    onClick={() => {
                      setSettingsOpen(false);
                      androidHost.openSettings?.();
                    }}
                    style={{
                      height: '42px',
                      borderRadius: '10px',
                      background: '#1b263b',
                      border: '1px solid #2b3a55',
                      color: '#38bdf8',
                      fontSize: '13px',
                      fontWeight: 600,
                      cursor: 'pointer'
                    }}
                  >
                    Change Desktop Server / Scan LAN
                  </button>
                </>
              )}
            </div>
          </div>
        )}
      </div>
    );
  }

  if (chromeless) {
    return (
      <div style={{ width: '100vw', height: '100vh', background: '#000', overflow: 'hidden' }}>
        <FittedMainScreenFrame liveState={renderedLiveState} participantStreams={renderedParticipantStreams} />
      </div>
    );
  }

  return (
    <div style={{ width: '100vw', height: '100vh', background: '#000', overflow: 'hidden', position: 'relative' }}>
      <button
        type="button"
        onClick={handleToggleFullscreen}
        title={isFullscreen ? 'Exit Fullscreen' : 'Enter Fullscreen'}
        style={{
          position: 'absolute',
          top: '12px',
          right: '12px',
          zIndex: 60,
          display: 'inline-flex',
          alignItems: 'center',
          gap: '6px',
          padding: '6px 10px',
          borderRadius: '8px',
          border: '1px solid rgba(148, 163, 184, 0.35)',
          background: 'rgba(15, 23, 42, 0.55)',
          color: '#f8fafc',
          fontSize: '0.75rem',
          fontWeight: 600,
          opacity: isFullscreen ? 0.45 : 0.75
        }}
      >
        {isFullscreen ? <Minimize2 size={14} /> : <Maximize2 size={14} />}
      </button>
      <FittedMainScreenFrame liveState={renderedLiveState} participantStreams={renderedParticipantStreams} />
    </div>
  );
};
