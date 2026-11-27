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
import { cn } from '../utils/cn';

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
  const isAndroidApp =
    initialParams.get('noWs') === '1' ||
    Boolean((window as Window & { AndroidPresenterBridge?: unknown }).AndroidPresenterBridge);
  // Browser URL viewers are strictly view-only Overflow screens (no kiosk/mainScreen/remote control).
  const kiosk = isAndroidApp && initialParams.get('kiosk') === '1';
  const chromeless = isAndroidApp && initialParams.get('chromeless') === '1';
  const requestedMode = initialParams.get('viewMode');
  const initialMode: RemoteViewMode =
    isAndroidApp && (kiosk || (chromeless && requestedMode === 'mainScreen'))
      ? 'mainScreen'
      : 'overflow';

  const [viewMode] = useState<RemoteViewMode>(initialMode);
  const [liveState, setLiveState] = useState<LiveState | null>(null);
  const [connected, setConnected] = useState(false);
  const [pinInput] = useState(() =>
    kiosk ? initialParams.get('pin') || sessionStorage.getItem('uecfi_remote_pin') || '' : ''
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
        if (!kiosk) return;
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
    if (!kiosk) return;
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
      <div className="relative h-screen w-screen select-none overflow-hidden bg-black">
        <FittedMainScreenFrame liveState={renderedLiveState} participantStreams={renderedParticipantStreams} />

        {/* Top-right Settings + Program pills */}
        <div className="absolute top-3 right-3.5 z-20 flex items-center gap-2">
          <button
            type="button"
            onClick={() => setSettingsOpen(true)}
            aria-label="Settings"
            className="inline-flex cursor-pointer items-center gap-[7px] rounded-full border border-white/16 bg-black/52 px-3 py-2 text-slate-50 transition-colors hover:bg-black/70"
          >
            <span
              className={cn(
                'h-2 w-2 rounded-full',
                connected ? 'bg-emerald-500' : 'bg-rose-500'
              )}
            />
            <Settings size={17} />
          </button>

          <button
            type="button"
            onClick={() => setProgramDrawerOpen(true)}
            className="inline-flex cursor-pointer items-center gap-2 rounded-full border border-white/16 bg-black/52 px-3.5 py-2 text-[13px] font-semibold text-slate-50 transition-colors hover:bg-black/70"
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
          className={cn(
            'absolute bottom-4 left-4 z-20 inline-flex h-[52px] items-center gap-2 rounded-2xl border border-white/20 px-[18px] text-[15px] font-extrabold tracking-[0.5px] transition-colors',
            connected
              ? 'cursor-pointer bg-black/56 text-slate-50 hover:bg-black/75'
              : 'cursor-default bg-black/25 text-slate-400/45'
          )}
        >
          <ArrowLeft size={19} />
          <span>PREV</span>
        </button>

        {/* Bottom-right NEXT overlay */}
        <button
          type="button"
          disabled={!connected}
          onClick={() => sendRemoteCommand('NEXT')}
          className={cn(
            'absolute right-4 bottom-4 z-20 inline-flex h-[52px] items-center gap-2 rounded-2xl border px-[18px] text-[15px] font-extrabold tracking-[0.5px] transition-colors',
            connected
              ? 'cursor-pointer border-sky-400 bg-sky-400/90 text-[#090d16] hover:bg-sky-400'
              : 'cursor-default border-white/10 bg-black/25 text-slate-400/45'
          )}
        >
          <span>NEXT</span>
          <ArrowRight size={19} />
        </button>

        {/* Right-side Program Items Drawer */}
        {programDrawerOpen && (
          <div
            onClick={() => setProgramDrawerOpen(false)}
            className="fixed inset-0 z-40 flex justify-end bg-black/55"
          >
            <aside
              onClick={(e) => e.stopPropagation()}
              className="flex h-full w-[min(340px,84vw)] flex-col gap-3 border-l border-[#2b3a55] bg-[#131b2e] p-4 text-slate-50"
            >
              <div className="flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <div className="truncate text-base font-bold">
                    {liveState?.programName || 'Program Items'}
                  </div>
                  <div className="text-xs text-slate-400">
                    {programItems.length} item{programItems.length === 1 ? '' : 's'}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setProgramDrawerOpen(false)}
                  aria-label="Close program panel"
                  className="cursor-pointer border-0 bg-transparent p-1 text-slate-400 hover:text-slate-100"
                >
                  <X size={20} />
                </button>
              </div>

              <div className="h-px bg-[#2b3a55]/70" />

              <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto">
                {programItems.length === 0 ? (
                  <div className="flex flex-1 items-center justify-center p-4 text-center text-[13px] text-slate-400">
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
                        className={cn(
                          'flex w-full cursor-pointer flex-col gap-1 rounded-xl px-3 py-[11px] text-left text-slate-50 transition-colors',
                          isActive
                            ? 'border-[1.5px] border-sky-400 bg-sky-400/16'
                            : 'border border-[#2b3a55]/70 bg-[#1b263b] hover:bg-[#22304a]'
                        )}
                      >
                        <div className="flex items-center justify-between text-[11px] font-bold">
                          <span className={isActive ? 'text-sky-400' : 'text-slate-400'}>
                            {item.type.toUpperCase()}
                          </span>
                          <span className={isActive ? 'text-emerald-500' : 'text-slate-400'}>
                            {isActive
                              ? 'LIVE'
                              : `${item.blockCount} slide${item.blockCount === 1 ? '' : 's'}`}
                          </span>
                        </div>
                        <div className={cn('text-sm leading-[1.3]', isActive ? 'font-bold' : 'font-semibold')}>
                          {item.title}
                        </div>
                        {item.subtitle && (
                          <div className="truncate text-xs text-slate-400">
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
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/65 p-4"
          >
            <div
              onClick={(e) => e.stopPropagation()}
              className="flex w-[min(420px,92vw)] flex-col gap-3.5 rounded-[18px] border border-[#2b3a55] bg-[#131b2e] p-[18px] text-slate-50"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 font-bold">
                  <span
                    className={cn(
                      'h-2 w-2 rounded-full',
                      connected ? 'bg-emerald-500' : 'bg-rose-500'
                    )}
                  />
                  <span>Settings</span>
                </div>
                <button
                  type="button"
                  onClick={() => setSettingsOpen(false)}
                  aria-label="Close settings"
                  className="cursor-pointer border-0 bg-transparent text-slate-400 hover:text-slate-100"
                >
                  <X size={20} />
                </button>
              </div>

              <div className="h-px bg-[#2b3a55]/70" />

              <div className="flex flex-col gap-2">
                <div className="text-[11px] font-bold text-sky-400">
                  SCREEN OVERRIDES
                </div>
                <div className="grid grid-cols-3 gap-2">
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
                      className={cn(
                        'inline-flex h-[42px] items-center justify-center gap-[5px] rounded-[10px] border text-xs transition-colors',
                        btn.active ? 'font-bold' : 'font-medium',
                        connected ? 'cursor-pointer' : 'cursor-default'
                      )}
                      style={{
                        background: btn.active ? `${btn.color}33` : '#1b263b',
                        borderColor: btn.active ? btn.color : '#2b3a55',
                        color: btn.active ? btn.color : '#f8fafc'
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
                    className="inline-flex h-10 cursor-pointer items-center justify-center gap-1.5 rounded-[10px] border border-emerald-500/50 bg-emerald-500/20 text-[13px] font-semibold text-emerald-500 transition-colors hover:bg-emerald-500/30"
                  >
                    <RotateCcw size={15} />
                    <span>Restore Live Screen</span>
                  </button>
                )}
              </div>

              {androidHost?.openSettings && (
                <>
                  <div className="h-px bg-[#2b3a55]/70" />
                  <button
                    type="button"
                    onClick={() => {
                      setSettingsOpen(false);
                      androidHost.openSettings?.();
                    }}
                    className="h-[42px] cursor-pointer rounded-[10px] border border-[#2b3a55] bg-[#1b263b] text-[13px] font-semibold text-sky-400 transition-colors hover:bg-[#22304a]"
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
      <div className="h-screen w-screen overflow-hidden bg-black">
        <FittedMainScreenFrame liveState={renderedLiveState} participantStreams={renderedParticipantStreams} />
      </div>
    );
  }

  return (
    <div className="relative h-screen w-screen overflow-hidden bg-black">
      <button
        type="button"
        onClick={handleToggleFullscreen}
        title={isFullscreen ? 'Exit Fullscreen' : 'Enter Fullscreen'}
        className={cn(
          'absolute top-3 right-3 z-60 inline-flex items-center gap-1.5 rounded-lg border border-slate-400/35 bg-slate-900/55 px-2.5 py-1.5 text-[0.75rem] font-semibold text-slate-50 transition-opacity hover:opacity-100',
          isFullscreen ? 'opacity-45' : 'opacity-75'
        )}
      >
        {isFullscreen ? <Minimize2 size={14} /> : <Maximize2 size={14} />}
      </button>
      <FittedMainScreenFrame liveState={renderedLiveState} participantStreams={renderedParticipantStreams} />
    </div>
  );
};
