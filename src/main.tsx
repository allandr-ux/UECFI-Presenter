import React, { useEffect, useRef, useState } from 'react';
import ReactDOM from 'react-dom/client';
import type { LiveState } from '../shared/types';
import { OperatorConsole } from './components/OperatorConsole';
import { RemoteViewer } from './components/RemoteViewer';
import { FittedMainScreenFrame } from './components/ScaledMainScreenPreview';
import { HtmlTooltipLayer } from './components/HtmlTooltipLayer';
import { ScreenStreamReceiver, buildIceServers } from './utils/webrtcRoom';
import { MAIN_ROOM_CAMERA_ID, buildOverflowLiveState } from './utils/overflowState';
import appIconAbout from './assets/app-icon-about.png';
import './fonts';
import './index.css';

/**
 * Prevents an unexpected render exception (e.g. a GPU/WebGL error on a slide element)
 * from permanently blanking the Main Screen or Overflow Screen window.
 * Automatically resets whenever `resetKey` changes (e.g. advancing to the next slide).
 */
class ScreenErrorBoundary extends React.Component<
  { resetKey: string; children: React.ReactNode },
  { hasError: boolean }
> {
  constructor(props: { resetKey: string; children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(): { hasError: boolean } {
    return { hasError: true };
  }

  componentDidUpdate(prevProps: { resetKey: string }) {
    if (this.state.hasError && prevProps.resetKey !== this.props.resetKey) {
      this.setState({ hasError: false });
    }
  }

  componentDidCatch(error: unknown) {
    console.error('[ScreenErrorBoundary] Render error caught on output screen:', error);
  }

  render() {
    if (this.state.hasError) {
      return <div style={{ width: '100%', height: '100%', background: '#000' }} />;
    }
    return this.props.children;
  }
}

const MainScreenWindowApp: React.FC = () => {
  const [liveState, setLiveState] = useState<LiveState | null>(null);
  const [participantStreams, setParticipantStreams] = useState<Map<string, MediaStream>>(new Map());
  const receiverRef = useRef<ScreenStreamReceiver | null>(null);

  useEffect(() => {
    const api = window.presenterAPI;
    if (!api) return;

    const receiver = new ScreenStreamReceiver({
      viewerId: 'screen:main',
      iceServers: buildIceServers(),
      sendSignal: (msg) => api.sendParticipantSignal(msg),
      onStreamsChange: setParticipantStreams
    });
    receiverRef.current = receiver;

    const unsubSignal = api.onParticipantSignal((msg) => {
      receiver.handleSignal(msg);
    });

    api.getInitialLiveState().then((initial) => {
      if (initial) setLiveState(initial);
    });
    const unsubState = api.onLiveStateUpdate((state) => {
      setLiveState(state);
    });
    const unsubTime = api.onAudioTimeUpdate(({ timeSec, activeBlockIndex }) => {
      setLiveState((prev) =>
        prev
          ? {
              ...prev,
              audioCurrentTimeSec: timeSec,
              activeBlockIndex
            }
          : prev
      );
    });
    return () => {
      unsubSignal?.();
      unsubState?.();
      unsubTime?.();
      receiver.dispose();
      receiverRef.current = null;
    };
  }, []);

  const allParticipantIdsKey = (liveState?.participantList ?? []).map((p) => p.id).join(',');
  useEffect(() => {
    const ids = allParticipantIdsKey ? allParticipantIdsKey.split(',') : [];
    receiverRef.current?.syncSubscriptions(ids);
  }, [allParticipantIdsKey]);

  // Allow pressing Escape to close the fullscreen Main Screen on both macOS and Windows
  // (especially helpful on single-monitor setups where always-on-top covers the console).
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        void window.presenterAPI?.closeMainScreen();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  const boundaryResetKey = `${liveState?.activeItem?.id ?? ''}:${liveState?.activeBlockIndex ?? -1}:${liveState?.override ?? ''}`;

  // Wrap physical Main Screen output in FittedMainScreenFrame so 720p, 1080p, 4K,
  // 16:10, and 4:3 displays all render with normalized 1080p reference proportions.
  return (
    <div style={{ width: '100vw', height: '100vh', background: '#000', overflow: 'hidden' }}>
      <ScreenErrorBoundary resetKey={boundaryResetKey}>
        <FittedMainScreenFrame
          liveState={liveState}
          participantStreams={participantStreams}
          // Live remote participant audio is played authoritatively by OperatorConsole
          // (matching song audio) so it works whether Main Screen is open or closed with zero double-audio.
          enableParticipantAudio={false}
        />
      </ScreenErrorBoundary>
    </div>
  );
};

const OverflowScreenWindowApp: React.FC = () => {
  const [liveState, setLiveState] = useState<LiveState | null>(null);
  const [participantStreams, setParticipantStreams] = useState<Map<string, MediaStream>>(new Map());
  const receiverRef = useRef<ScreenStreamReceiver | null>(null);

  useEffect(() => {
    const api = window.presenterAPI;
    if (!api) return;

    const receiver = new ScreenStreamReceiver({
      viewerId: 'screen:overflow',
      iceServers: buildIceServers(),
      sendSignal: (msg) => api.sendParticipantSignal(msg),
      onStreamsChange: setParticipantStreams
    });
    receiverRef.current = receiver;

    const unsubSignal = api.onParticipantSignal((msg) => {
      receiver.handleSignal(msg);
    });

    api.getInitialLiveState().then((initial) => {
      if (initial) setLiveState(initial);
    });
    const unsubState = api.onLiveStateUpdate((state) => {
      setLiveState(state);
    });
    const unsubTime = api.onAudioTimeUpdate(({ timeSec, activeBlockIndex }) => {
      setLiveState((prev) =>
        prev
          ? {
              ...prev,
              audioCurrentTimeSec: timeSec,
              activeBlockIndex
            }
          : prev
      );
    });
    return () => {
      unsubSignal?.();
      unsubState?.();
      unsubTime?.();
      receiver.dispose();
      receiverRef.current = null;
    };
  }, []);

  const subscriptionIdsKey = [
    ...(liveState?.participantList ?? []).map((p) => p.id),
    ...(liveState?.overflow?.enabled ? [MAIN_ROOM_CAMERA_ID] : [])
  ].join(',');
  useEffect(() => {
    const ids = subscriptionIdsKey ? subscriptionIdsKey.split(',') : [];
    receiverRef.current?.syncSubscriptions(ids);
  }, [subscriptionIdsKey]);

  // Allow pressing Escape to close the fullscreen Overflow Screen on both macOS and Windows.
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        void window.presenterAPI?.closeOverflowScreen();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  const effectiveState = buildOverflowLiveState(liveState);
  const boundaryResetKey = `${effectiveState?.activeItem?.id ?? ''}:${effectiveState?.activeBlockIndex ?? -1}:${effectiveState?.override ?? ''}`;

  return (
    <div style={{ width: '100vw', height: '100vh', background: '#000', overflow: 'hidden' }}>
      <ScreenErrorBoundary resetKey={boundaryResetKey}>
        <FittedMainScreenFrame
          liveState={effectiveState}
          participantStreams={participantStreams}
          enableParticipantAudio={false}
        />
      </ScreenErrorBoundary>
    </div>
  );
};

const AboutWindowApp: React.FC<{ version: string }> = ({ version }) => {
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        window.close();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  return (
    <div
      style={{
        width: '100vw',
        height: '100vh',
        boxSizing: 'border-box',
        background: '#111622',
        color: '#f8fafc',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '20px 24px',
        textAlign: 'center',
        userSelect: 'none',
        fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Inter, sans-serif"
      }}
    >
      <img
        src={appIconAbout}
        alt="UECFI Presenter"
        draggable={false}
        style={{ width: '80px', height: '80px', marginBottom: '12px' }}
      />
      <div style={{ fontSize: '1.05rem', fontWeight: 700, letterSpacing: '-0.01em' }}>
        UECFI Presenter
      </div>
      <div style={{ fontSize: '0.78rem', color: '#94a3b8', marginTop: '4px' }}>
        Version {version}
      </div>
      <a
        href="https://apps.uecfi.net"
        target="_blank"
        rel="noreferrer"
        style={{
          marginTop: '12px',
          fontSize: '0.84rem',
          fontWeight: 500,
          color: '#60a5fa',
          textDecoration: 'underline',
          cursor: 'pointer'
        }}
      >
        apps.uecfi.net
      </a>
      <div style={{ fontSize: '0.74rem', color: '#64748b', marginTop: '14px' }}>
        Copyright © 2026 by Kurog
      </div>
    </div>
  );
};

const params = new URLSearchParams(window.location.search);
const isElectron = Boolean(window.presenterAPI?.isElectron);
const requestedView = params.get('view');
const appVersionParam = params.get('version') || '1.0.0';
const view = isElectron ? requestedView || 'operator' : 'remote';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    {view === 'mainScreen' ? (
      <MainScreenWindowApp />
    ) : view === 'overflow' ? (
      <OverflowScreenWindowApp />
    ) : view === 'about' ? (
      <AboutWindowApp version={appVersionParam} />
    ) : view === 'operator' ? (
      <>
        <OperatorConsole />
        <HtmlTooltipLayer />
      </>
    ) : (
      <>
        <RemoteViewer />
        <HtmlTooltipLayer />
      </>
    )}
  </React.StrictMode>
);
