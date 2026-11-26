/**
 * UECFI Presenter - Remote Speaker WebRTC Client
 * 
 * WHY THIS EXISTS:
 * Runs in the remote speaker's browser (iPhone, Android, or desktop).
 * Handles camera/microphone capture, real-time audio VU metering,
 * WebRTC peer connection to the centro host, Green Room standby state,
 * stage tally notifications, and operator private intercom chat.
 */

// Application State
const state = {
  localStream: null,
  peerConnection: null,
  socket: null,
  roomId: '',
  secretKey: '',
  guestName: '',
  centroOrPosition: '',
  guestId: 'guest_' + Math.random().toString(36).substring(2, 9),
  facingMode: 'user',
  audioMuted: false,
  videoMuted: false,
  mutedByOperator: false,
  videoHiddenByOperator: false,
  onStage: false,
  liveStartedAt: null,
  liveTimerInterval: null,
  signalInterval: null,
  iceRecoveryTimer: null,
  landscapeDismissed: false,
  selectedCameraId: '',
  selectedMicId: '',
  wakeLock: null,
  audioContext: null,
  analyser: null,
  microphone: null,
  javascriptNode: null,
  returnVideoTrack: null,
  returnAudioTrack: null,
  returnAudioMuted: false
};

// DOM Elements
const el = {
  joinCard: document.getElementById('joinCard'),
  roomView: document.getElementById('roomView'),
  joinForm: document.getElementById('joinForm'),
  inputName: document.getElementById('inputName'),
  inputCentro: document.getElementById('inputCentro'),
  inputRoomId: document.getElementById('inputRoomId'),
  inputSecretKey: document.getElementById('inputSecretKey'),
  joinError: document.getElementById('joinError'),
  previewVideo: document.getElementById('previewVideo'),
  mediaPermissionPrompt: document.getElementById('mediaPermissionPrompt'),
  btnRequestPermission: document.getElementById('btnRequestPermission'),
  liveVideo: document.getElementById('liveVideo'),
  micMeter: document.getElementById('micMeter'),
  btnFlipCamera: document.getElementById('btnFlipCamera'),
  btnToggleAudio: document.getElementById('btnToggleAudio'),
  btnToggleVideo: document.getElementById('btnToggleVideo'),
  btnLeave: document.getElementById('btnLeave'),
  iconMicOn: document.getElementById('iconMicOn'),
  iconMicOff: document.getElementById('iconMicOff'),
  iconVideoOn: document.getElementById('iconVideoOn'),
  iconVideoOff: document.getElementById('iconVideoOff'),
  connectionBadge: document.getElementById('connectionBadge'),
  connectionText: document.getElementById('connectionText'),
  tallyBanner: document.getElementById('tallyBanner'),
  tallyDot: document.getElementById('tallyDot'),
  tallyTitle: document.getElementById('tallyTitle'),
  tallySubtitle: document.getElementById('tallySubtitle'),
  tallyBadge: document.getElementById('tallyBadge'),
  currentSlideDisplay: document.getElementById('currentSlideDisplay'),
  slideBodyDisplay: document.getElementById('slideBodyDisplay'),
  chatMessages: document.getElementById('chatMessages'),
  chatForm: document.getElementById('chatForm'),
  chatInput: document.getElementById('chatInput'),
  operatorAudio: document.getElementById('operatorAudio'),
  videoContainer: document.getElementById('videoContainer'),
  signalBadge: document.getElementById('signalBadge'),
  signalDot: document.getElementById('signalDot'),
  signalText: document.getElementById('signalText'),
  landscapeTip: document.getElementById('landscapeTip'),
  btnDismissLandscape: document.getElementById('btnDismissLandscape'),
  joinDeviceSelectors: document.getElementById('joinDeviceSelectors'),
  selectCamera: document.getElementById('selectCamera'),
  selectMic: document.getElementById('selectMic'),
  btnToggleDevices: document.getElementById('btnToggleDevices'),
  roomDeviceBar: document.getElementById('roomDeviceBar'),
  roomSelectCamera: document.getElementById('roomSelectCamera'),
  roomSelectMic: document.getElementById('roomSelectMic'),
  liveTimer: document.getElementById('liveTimer'),
  operatorModBanner: document.getElementById('operatorModBanner'),
  operatorModText: document.getElementById('operatorModText'),
  intercomPanel: document.getElementById('intercomPanel'),
  btnShowIntercomMobile: document.getElementById('btnShowIntercomMobile'),
  returnFeedCard: document.getElementById('returnFeedCard'),
  returnVideoWrapper: document.getElementById('returnVideoWrapper'),
  returnVideo: document.getElementById('returnVideo'),
  btnToggleReturnAudio: document.getElementById('btnToggleReturnAudio'),
  btnAlertOperator: document.getElementById('btnAlertOperator'),
  btnAlertOperatorText: document.getElementById('btnAlertOperatorText')
};

// WebRTC ICE Servers (Public STUN servers, augmented with TURN via /api/ice-config if configured)
const rtcConfig = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'stun:stun2.l.google.com:19302' }
  ]
};

async function refreshIceConfig() {
  try {
    const res = await fetch('/api/ice-config', { cache: 'no-store' });
    if (!res.ok) return;
    const data = await res.json();
    if (data && Array.isArray(data.iceServers) && data.iceServers.length > 0) {
      rtcConfig.iceServers = data.iceServers;
    }
  } catch (e) {
    // Keep default STUN servers if /api/ice-config is unavailable
  }
}

// -----------------------------------------------------------------------------
// 1. INITIALIZATION & CAMERA PREVIEW
// -----------------------------------------------------------------------------

// Local storage keys for persisting guest credentials across visits & after leaving
const STORAGE_KEY_NAME = 'uecfi_guest_name';
const STORAGE_KEY_CENTRO = 'uecfi_guest_centro';
const STORAGE_KEY_ROOM = 'uecfi_guest_room';
const STORAGE_KEY_PIN = 'uecfi_guest_pin';

async function acquireWakeLock() {
  if (!('wakeLock' in navigator) || !navigator.wakeLock || !navigator.wakeLock.request) return;
  try {
    if (state.wakeLock) return;
    state.wakeLock = await navigator.wakeLock.request('screen');
    state.wakeLock.addEventListener('release', () => {
      state.wakeLock = null;
    });
  } catch (e) {
    // Ignore Wake Lock errors on unsupported/background tabs
  }
}

function releaseWakeLock() {
  if (state.wakeLock) {
    try {
      state.wakeLock.release();
    } catch (e) {}
    state.wakeLock = null;
  }
}

document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && state.socket && !state.hasLeft) {
    acquireWakeLock();
  }
});

async function initPreview() {
  // Pre-fill query parameters if present (e.g., ?room=main&key=1234&name=Pastor),
  // otherwise fallback to previously stored credentials in localStorage.
  const urlParams = new URLSearchParams(window.location.search);

  // 1. Display Name
  if (urlParams.get('name')) {
    el.inputName.value = urlParams.get('name');
  } else {
    try {
      const savedName = localStorage.getItem(STORAGE_KEY_NAME);
      if (savedName) el.inputName.value = savedName;
    } catch (e) {}
  }

  // 1b. Centro / Position
  if (el.inputCentro) {
    if (urlParams.get('centro')) {
      el.inputCentro.value = urlParams.get('centro');
    } else {
      try {
        const savedCentro = localStorage.getItem(STORAGE_KEY_CENTRO);
        if (savedCentro) el.inputCentro.value = savedCentro;
      } catch (e) {}
    }
  }

  // 2. Centro Code
  const urlRoom = urlParams.get('centro') || urlParams.get('room');
  if (urlRoom) {
    el.inputRoomId.value = urlRoom;
  } else {
    try {
      const savedRoom = localStorage.getItem(STORAGE_KEY_ROOM);
      if (savedRoom) el.inputRoomId.value = savedRoom;
    } catch (e) {}
  }

  // 3. Access Code
  const urlAccess = urlParams.get('code') || urlParams.get('key');
  if (urlAccess) {
    el.inputSecretKey.value = urlAccess;
  } else {
    try {
      const savedPin = localStorage.getItem(STORAGE_KEY_PIN);
      el.inputSecretKey.value = savedPin || '1905';
    } catch (e) {
      el.inputSecretKey.value = '1905';
    }
  }

  // Check Secure Context requirement: Camera & Mic are blocked by browsers on plain HTTP
  const isLocalhost = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
  if (!window.isSecureContext && !isLocalhost) {
    showError('⚠️ Camera and Microphone require a secure HTTPS connection. Please use https://uecfi-signaling.onrender.com to connect.');
    return;
  }

  // Attempt to fetch TURN/ICE config and start preview; if browser blocks without click gesture, overlay button is ready
  refreshIceConfig();
  await startMediaStream();
}

/**
 * Capture camera and microphone and attach to preview video element
 */
async function startMediaStream() {
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    const isLocalhost = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
    if (!window.isSecureContext && !isLocalhost) {
      showError('⚠️ Insecure HTTP connection detected. Browsers strictly require HTTPS (or localhost) for camera & mic permissions.');
    } else {
      showError('Your browser does not support mediaDevices.getUserMedia. Please open in modern Chrome, Safari, or Edge.');
    }
    return false;
  }

  if (state.localStream) {
    state.localStream.getTracks().forEach(track => track.stop());
    state.localStream = null;
  }

  // Attempt 1: Ideal HD constraints without strict min bounds (handles portrait phones and webcams)
  try {
    const constraints = {
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true
      },
      video: {
        facingMode: state.facingMode,
        width: { ideal: 1280 },
        height: { ideal: 720 },
        frameRate: { ideal: 30 }
      }
    };
    const stream = await navigator.mediaDevices.getUserMedia(constraints);
    return onMediaStreamSuccess(stream);
  } catch (err1) {
    console.warn('Ideal media constraints failed, attempting fallback { video: true, audio: true }:', err1);
    
    // Attempt 2: Minimal fallback constraints (handles mobile devices or older webcams)
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
      return onMediaStreamSuccess(stream);
    } catch (err2) {
      console.warn('Combined audio+video failed, attempting single-track fallback:', err2);

      // Attempt 3: Single-track fallback (in case machine has camera without mic, or mic without camera)
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
        return onMediaStreamSuccess(stream);
      } catch (err3) {
        try {
          const stream = await navigator.mediaDevices.getUserMedia({ video: false, audio: true });
          return onMediaStreamSuccess(stream);
        } catch (err4) {
          console.error('All media constraints failed:', err2);
          if (err2.name === 'NotAllowedError' || err2.name === 'PermissionDeniedError') {
            showError('Camera/Microphone permission was not allowed. Please allow camera and mic permissions in your browser address bar.');
          } else if (err2.name === 'NotFoundError' || err2.name === 'DevicesNotFoundError') {
            showError('No camera or microphone found on this device.');
          } else {
            showError(`Camera access error: ${err2.message || err2.name}`);
          }
          return false;
        }
      }
    }
  }
}

/**
 * Robust helper to dismiss the permission prompt across all browsers and CSS ordering
 */
function hidePermissionPrompt() {
  if (el.mediaPermissionPrompt) {
    el.mediaPermissionPrompt.classList.add('hidden');
    el.mediaPermissionPrompt.classList.remove('flex');
    el.mediaPermissionPrompt.style.setProperty('display', 'none', 'important');
  }
}

function showPermissionPrompt() {
  if (el.mediaPermissionPrompt) {
    el.mediaPermissionPrompt.classList.remove('hidden');
    el.mediaPermissionPrompt.classList.add('flex');
    el.mediaPermissionPrompt.style.display = 'flex';
  }
}

function onMediaStreamSuccess(stream) {
  state.localStream = stream;
  hideError();

  // Hide permission overlay now that access is active
  hidePermissionPrompt();

  // Mirror effect for front camera, normal for rear
  if (state.facingMode === 'user') {
    el.previewVideo.classList.add('-scale-x-100');
    el.liveVideo.classList.add('-scale-x-100');
  } else {
    el.previewVideo.classList.remove('-scale-x-100');
    el.liveVideo.classList.remove('-scale-x-100');
  }

  el.previewVideo.muted = true;
  el.previewVideo.playsInline = true;
  el.previewVideo.srcObject = stream;
  el.previewVideo.play().catch(e => console.warn('Preview video play deferred:', e));
  el.liveVideo.srcObject = stream;

  setupMicMeter(stream);
  populateDevicePickers();
  return true;
}

// -----------------------------------------------------------------------------
// LANDSCAPE TIP & DEVICE SWITCHING (Camera / Mic Dropdowns)
// -----------------------------------------------------------------------------
function updateLandscapeTip() {
  if (!el.landscapeTip || state.landscapeDismissed) return;
  const isPortraitMobile = window.innerHeight > window.innerWidth && window.innerWidth < 820;
  el.landscapeTip.classList.toggle('hidden', !isPortraitMobile);
}

if (el.btnDismissLandscape) {
  el.btnDismissLandscape.addEventListener('click', () => {
    state.landscapeDismissed = true;
    if (el.landscapeTip) el.landscapeTip.classList.add('hidden');
  });
}
window.addEventListener('resize', updateLandscapeTip);
window.addEventListener('orientationchange', updateLandscapeTip);

async function populateDevicePickers() {
  if (!navigator.mediaDevices || !navigator.mediaDevices.enumerateDevices) return;
  try {
    const devs = await navigator.mediaDevices.enumerateDevices();
    const cams = devs.filter(d => d.kind === 'videoinput' && d.deviceId);
    const mics = devs.filter(d => d.kind === 'audioinput' && d.deviceId);

    const activeVideoId = state.localStream?.getVideoTracks()[0]?.getSettings?.().deviceId || state.selectedCameraId;
    const activeAudioId = state.localStream?.getAudioTracks()[0]?.getSettings?.().deviceId || state.selectedMicId;

    const fillSelect = (selectEl, list, currentId, fallbackPrefix) => {
      if (!selectEl) return;
      selectEl.innerHTML = '';
      list.forEach((d, idx) => {
        const opt = document.createElement('option');
        opt.value = d.deviceId;
        opt.textContent = d.label || `${fallbackPrefix} ${idx + 1}`;
        if (d.deviceId === currentId) opt.selected = true;
        selectEl.appendChild(opt);
      });
    };

    fillSelect(el.selectCamera, cams, activeVideoId, 'Camera');
    fillSelect(el.roomSelectCamera, cams, activeVideoId, 'Camera');
    fillSelect(el.selectMic, mics, activeAudioId, 'Microphone');
    fillSelect(el.roomSelectMic, mics, activeAudioId, 'Microphone');

    if (el.joinDeviceSelectors && (cams.length > 1 || mics.length > 1)) {
      el.joinDeviceSelectors.classList.remove('hidden');
    }
  } catch (e) {}
}

async function switchMediaDevice(kind, deviceId) {
  if (!deviceId || !navigator.mediaDevices?.getUserMedia) return;
  try {
    const constraints = kind === 'video'
      ? { video: { deviceId: { exact: deviceId }, width: { ideal: 1280 }, height: { ideal: 720 } }, audio: false }
      : { audio: { deviceId: { exact: deviceId }, echoCancellation: true, noiseSuppression: true, autoGainControl: true }, video: false };

    const newStream = await navigator.mediaDevices.getUserMedia(constraints);
    const newTrack = kind === 'video' ? newStream.getVideoTracks()[0] : newStream.getAudioTracks()[0];
    if (!newTrack) return;

    if (kind === 'video') {
      state.selectedCameraId = deviceId;
      newTrack.enabled = !state.videoMuted;
      if (el.selectCamera) el.selectCamera.value = deviceId;
      if (el.roomSelectCamera) el.roomSelectCamera.value = deviceId;
    } else {
      state.selectedMicId = deviceId;
      newTrack.enabled = !state.audioMuted;
      if (el.selectMic) el.selectMic.value = deviceId;
      if (el.roomSelectMic) el.roomSelectMic.value = deviceId;
    }

    if (state.localStream) {
      const oldTracks = kind === 'video' ? state.localStream.getVideoTracks() : state.localStream.getAudioTracks();
      oldTracks.forEach(t => {
        state.localStream.removeTrack(t);
        t.stop();
      });
      state.localStream.addTrack(newTrack);
    } else {
      state.localStream = newStream;
    }

    if (state.peerConnection) {
      const sender = state.peerConnection.getSenders().find(s => s.track && s.track.kind === kind);
      if (sender) {
        await sender.replaceTrack(newTrack);
      }
    }

    el.previewVideo.srcObject = state.localStream;
    el.liveVideo.srcObject = state.localStream;
    if (kind === 'audio') setupMicMeter(state.localStream);
  } catch (e) {
    console.warn('[Media] Failed to switch ' + kind + ' device:', e);
  }
}

[el.selectCamera, el.roomSelectCamera].forEach(sel => {
  if (sel) sel.addEventListener('change', e => switchMediaDevice('video', e.target.value));
});
[el.selectMic, el.roomSelectMic].forEach(sel => {
  if (sel) sel.addEventListener('change', e => switchMediaDevice('audio', e.target.value));
});
if (el.btnToggleDevices && el.roomDeviceBar) {
  el.btnToggleDevices.addEventListener('click', () => {
    populateDevicePickers();
    el.roomDeviceBar.classList.toggle('hidden');
  });
}
if (el.btnShowIntercomMobile && el.intercomPanel) {
  el.btnShowIntercomMobile.addEventListener('click', () => {
    const isHidden = el.intercomPanel.classList.contains('hidden');
    el.intercomPanel.classList.toggle('hidden', !isHidden);
    el.btnShowIntercomMobile.textContent = isHidden ? 'Hide Operator Intercom' : 'Show Operator Intercom';
  });
}

// Alert Operator button: sends a persistent visual attention alert to the Operator Console
if (el.btnAlertOperator) {
  let alertCooldownTimer = null;
  el.btnAlertOperator.addEventListener('click', () => {
    if (!state.socket || state.socket.readyState !== WebSocket.OPEN) return;
    state.socket.send(JSON.stringify({
      type: 'alert-operator',
      roomId: state.roomId
    }));
    addChatMessage('System', 'Operator alerted — waiting for response.', 'text-amber-300');
    if (el.btnAlertOperatorText) {
      el.btnAlertOperatorText.textContent = '✓ Operator Alerted!';
    }
    el.btnAlertOperator.disabled = true;
    el.btnAlertOperator.classList.add('opacity-75');
    clearTimeout(alertCooldownTimer);
    alertCooldownTimer = setTimeout(() => {
      if (el.btnAlertOperatorText) {
        el.btnAlertOperatorText.textContent = 'Alert Operator (Need to Talk)';
      }
      el.btnAlertOperator.disabled = false;
      el.btnAlertOperator.classList.remove('opacity-75');
    }, 4000);
  });
}

// Local mute/unmute toggle for incoming Main Room / Operator return audio
if (el.btnToggleReturnAudio) {
  el.btnToggleReturnAudio.addEventListener('click', () => {
    state.returnAudioMuted = !state.returnAudioMuted;
    if (el.operatorAudio) {
      el.operatorAudio.muted = state.returnAudioMuted;
      if (!state.returnAudioMuted) {
        el.operatorAudio.play().catch(() => {});
      }
    }
    updateReturnFeedUI();
  });
}

/**
 * Shows/hides the Main Room Return Feed card and video frame based on whether
 * the desktop host is actively sending return video and/or room audio tracks.
 */
function updateReturnFeedUI() {
  const hasDecodedVideo = Boolean(el.returnVideo && el.returnVideo.videoWidth > 0);
  const hasActiveVideo = Boolean(
    state.returnVideoTrack &&
    state.returnVideoTrack.readyState === 'live' &&
    (!state.returnVideoTrack.muted || hasDecodedVideo)
  );
  const hasActiveAudio = Boolean(
    state.returnAudioTrack &&
    state.returnAudioTrack.readyState === 'live' &&
    !state.returnAudioTrack.muted
  );

  if (el.returnVideoWrapper) {
    el.returnVideoWrapper.classList.toggle('hidden', !hasActiveVideo);
  }
  if (el.returnFeedCard) {
    el.returnFeedCard.classList.toggle('hidden', !hasActiveVideo && !hasActiveAudio);
  }
  if (el.btnToggleReturnAudio) {
    el.btnToggleReturnAudio.classList.toggle('hidden', !hasActiveAudio);
    el.btnToggleReturnAudio.textContent = state.returnAudioMuted ? 'Room Audio Muted (Unmute)' : 'Mute Room Audio';
    el.btnToggleReturnAudio.className = state.returnAudioMuted
      ? 'px-2.5 py-1 rounded-lg text-[11px] font-semibold bg-amber-900/60 hover:bg-amber-800/70 text-amber-200 border border-amber-500/40 transition cursor-pointer shrink-0'
      : 'px-2.5 py-1 rounded-lg text-[11px] font-semibold bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 transition cursor-pointer shrink-0';
  }
}

if (el.returnVideo) {
  ['loadeddata', 'playing', 'resize'].forEach((evt) => {
    el.returnVideo.addEventListener(evt, updateReturnFeedUI);
  });
}

// Ensure video element events also clear the prompt once metadata or frames arrive
if (el.previewVideo) {
  el.previewVideo.addEventListener('loadedmetadata', () => {
    if (state.localStream && state.localStream.active) hidePermissionPrompt();
  });
  el.previewVideo.addEventListener('playing', () => {
    if (state.localStream && state.localStream.active) hidePermissionPrompt();
  });
}

// User-gesture button on preview overlay to explicitly trigger browser permission popup
if (el.btnRequestPermission) {
  el.btnRequestPermission.addEventListener('click', async (e) => {
    e.preventDefault();
    e.stopPropagation();
    const ok = await startMediaStream();
    if (ok) hidePermissionPrompt();
  });
}

/**
 * Visual mic volume meter using Web Audio API
 */
function setupMicMeter(stream) {
  try {
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    if (!state.audioContext) state.audioContext = new AudioContext();
    if (state.audioContext.state === 'suspended') state.audioContext.resume();

    const audioTrack = stream.getAudioTracks()[0];
    if (!audioTrack) return;

    state.analyser = state.audioContext.createAnalyser();
    state.analyser.fftSize = 256;
    state.microphone = state.audioContext.createMediaStreamSource(stream);
    state.microphone.connect(state.analyser);

    const bufferLength = state.analyser.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);

    function updateMeter() {
      if (!state.localStream) return;
      state.analyser.getByteFrequencyData(dataArray);

      let sum = 0;
      for (let i = 0; i < bufferLength; i++) sum += dataArray[i];
      const avg = sum / bufferLength;
      const percent = Math.min(100, Math.round((avg / 128) * 100));

      if (el.micMeter) {
        el.micMeter.style.width = percent + '%';
        if (percent > 70) {
          el.micMeter.className = 'h-full bg-rose-500 transition-all duration-75';
        } else if (percent > 40) {
          el.micMeter.className = 'h-full bg-amber-400 transition-all duration-75';
        } else {
          el.micMeter.className = 'h-full bg-emerald-500 transition-all duration-75';
        }
      }
      requestAnimationFrame(updateMeter);
    }
    updateMeter();
  } catch (e) {
    console.warn('AudioContext meter setup skipped:', e);
  }
}

// Flip Camera button (for mobile phones)
el.btnFlipCamera.addEventListener('click', async () => {
  state.facingMode = state.facingMode === 'user' ? 'environment' : 'user';
  await startMediaStream();
});

// -----------------------------------------------------------------------------
// 2. JOINING THE GREEN ROOM (WEBSOCKET & WEBRTC)
// -----------------------------------------------------------------------------

el.joinForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  state.guestName = el.inputName.value.trim();
  state.centroOrPosition = el.inputCentro ? el.inputCentro.value.trim() : '';
  state.roomId = el.inputRoomId.value.trim().toLowerCase();
  state.secretKey = el.inputSecretKey.value.trim();

  if (!state.guestName || !state.centroOrPosition || !state.roomId || !state.secretKey) {
    return showError('Please fill in all fields.');
  }

  // Persist credentials in localStorage for automatic repopulation upon return or after leaving
  try {
    localStorage.setItem(STORAGE_KEY_NAME, state.guestName);
    localStorage.setItem(STORAGE_KEY_CENTRO, state.centroOrPosition);
    localStorage.setItem(STORAGE_KEY_ROOM, state.roomId);
    localStorage.setItem(STORAGE_KEY_PIN, state.secretKey);
  } catch (e) {
    console.warn('LocalStorage save failed:', e);
  }

  // Explicit user-gesture guarantee: prompt for camera & mic permissions if not yet acquired
  if (!state.localStream || state.localStream.getTracks().length === 0) {
    const ok = await startMediaStream();
    if (!ok) {
      return; // Permission error already rendered
    }
  }

  // Keep phone/tablet screen awake while in Green Room or live on stage
  acquireWakeLock();

  // Unlock audio element on user gesture for iOS/Safari/Chrome policy
  if (el.operatorAudio) {
    el.operatorAudio.play().catch(() => {});
  }

  hideError();
  connectToSignalingServer();
});

function connectToSignalingServer() {
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  const wsUrl = `${protocol}//${window.location.host}/ws`;

  updateConnectionStatus('connecting', 'Connecting...');
  
  if (state.socket) {
    try { state.socket.close(); } catch (e) {}
    state.socket = null;
  }

  state.socket = new WebSocket(wsUrl);

  state.socket.onopen = () => {
    console.log('[WS] Connected to signaling server.');
    state.reconnectAttempts = 0;
    // Send join request as guest
    state.socket.send(JSON.stringify({
      type: 'join-guest',
      roomId: state.roomId,
      secretKey: state.secretKey,
      guestId: state.guestId,
      guestName: state.guestName,
      centroOrPosition: state.centroOrPosition
    }));
  };

  state.socket.onmessage = async (event) => {
    let msg;
    try {
      msg = JSON.parse(event.data);
    } catch (e) {
      return console.error('[WS] Bad message JSON:', event.data);
    }

    handleSignalingMessage(msg);
  };

  state.socket.onerror = (err) => {
    console.error('[WS] Connection error:', err);
  };

  state.socket.onclose = () => {
    console.warn('[WS] Socket closed.');
    if (state.hasLeft) return;

    updateConnectionStatus('error', 'Reconnecting...');
    
    // Auto-reconnect with backoff to recover from mobile sleep or network switches
    clearTimeout(state.reconnectTimer);
    state.reconnectTimer = setTimeout(() => {
      if (!state.hasLeft && state.roomId && state.secretKey) {
        console.log('[WS] Reconnecting to signaling server...');
        connectToSignalingServer();
      }
    }, 2500);
  };
}

// Keep-alive heartbeat every 15s to prevent cloud proxies (Render, Cloudflare) from dropping idle sockets
setInterval(() => {
  if (state.socket && state.socket.readyState === WebSocket.OPEN) {
    try {
      state.socket.send(JSON.stringify({ type: 'heartbeat' }));
    } catch (e) {}
  }
}, 15000);

async function handleSignalingMessage(msg) {
  switch (msg.type) {
    case 'error':
      showError(msg.message);
      if (state.socket) state.socket.close();
      break;

    case 'guest-joined':
      // Successfully joined the Green Room!
      console.log('[ROOM] Joined Green Room successfully:', msg);
      el.joinCard.classList.add('hidden');
      el.roomView.classList.remove('hidden');
      el.roomView.classList.add('flex');
      updateConnectionStatus('online', 'Connected');
      setStageStatus(msg.onStage || false);

      if (msg.programState) updateSlideDisplay(msg.programState);

      // Initialize WebRTC Peer Connection to the centro host
      initWebRTC();
      break;

    case 'host-status':
      if (msg.online) {
        addChatMessage('System', 'Centro operator is online and ready.', 'text-emerald-400');
        // Fresh negotiation pipeline to newly online host
        initWebRTC();
      } else {
        addChatMessage('System', 'Centro operator disconnected.', 'text-rose-400');
      }
      break;

    case 'sdp-offer':
      await handleRemoteOffer(msg.data);
      break;

    case 'sdp-answer':
      await handleRemoteAnswer(msg.data);
      break;

    case 'ice-candidate':
      if (state.peerConnection && msg.data) {
        try {
          await state.peerConnection.addIceCandidate(new RTCIceCandidate(msg.data));
        } catch (e) {
          console.error('[WebRTC] Error adding ICE candidate:', e);
        }
      }
      break;

    case 'stage-status-changed':
      setStageStatus(msg.onStage);
      break;

    case 'intercom-chat':
      addChatMessage(msg.fromName, msg.text, msg.fromRole === 'host' ? 'text-blue-400' : 'text-slate-200');
      break;

    case 'program-update':
      updateSlideDisplay(msg.programState);
      break;

    case 'operator-moderation':
      state.mutedByOperator = Boolean(msg.mutedByOperator);
      state.videoHiddenByOperator = Boolean(msg.videoHiddenByOperator);
      updateOperatorModBanner();
      break;
  }
}

function updateOperatorModBanner() {
  if (!el.operatorModBanner || !el.operatorModText) return;
  const parts = [];
  if (state.mutedByOperator) parts.push('Muted by Operator');
  if (state.videoHiddenByOperator) parts.push('Camera Paused by Operator');
  if (parts.length > 0) {
    el.operatorModText.textContent = parts.join(' • ');
    el.operatorModBanner.classList.remove('hidden');
  } else {
    el.operatorModBanner.classList.add('hidden');
  }
}

function stopSignalMonitor() {
  if (state.signalInterval) {
    clearInterval(state.signalInterval);
    state.signalInterval = null;
  }
  if (el.signalBadge) el.signalBadge.classList.add('hidden');
}

function startSignalMonitor() {
  stopSignalMonitor();
  if (!el.signalBadge) return;
  el.signalBadge.classList.remove('hidden');
  el.signalBadge.classList.add('flex');

  state.signalInterval = setInterval(async () => {
    const pc = state.peerConnection;
    if (!pc || pc.connectionState === 'closed') return;
    try {
      const stats = await pc.getStats();
      let rttMs = null;
      stats.forEach((report) => {
        if (report.type === 'candidate-pair' && report.state === 'succeeded' && typeof report.currentRoundTripTime === 'number') {
          rttMs = Math.round(report.currentRoundTripTime * 1000);
        }
      });
      if (rttMs === null) return;
      if (rttMs < 150) {
        el.signalDot.className = 'w-2 h-2 rounded-full bg-emerald-400';
        el.signalText.textContent = `Signal: Good (${rttMs}ms)`;
      } else if (rttMs < 350) {
        el.signalDot.className = 'w-2 h-2 rounded-full bg-amber-400';
        el.signalText.textContent = `Signal: Fair (${rttMs}ms)`;
      } else {
        el.signalDot.className = 'w-2 h-2 rounded-full bg-rose-500';
        el.signalText.textContent = `Signal: Weak (${rttMs}ms)`;
      }
    } catch (e) {}
  }, 3000);
}

// -----------------------------------------------------------------------------
// 3. WEBRTC PEER CONNECTION PIPELINE
// -----------------------------------------------------------------------------

function initWebRTC() {
  if (state.peerConnection) state.peerConnection.close();

  state.returnVideoTrack = null;
  state.returnAudioTrack = null;
  if (el.returnVideo) el.returnVideo.srcObject = null;
  if (el.operatorAudio) el.operatorAudio.srcObject = null;
  updateReturnFeedUI();

  const pc = new RTCPeerConnection(rtcConfig);
  state.peerConnection = pc;

  // Add local camera and mic tracks to peer connection
  if (state.localStream) {
    state.localStream.getTracks().forEach((track) => {
      pc.addTrack(track, state.localStream);
    });
  }

  // Handle incoming tracks from the desktop host (Main Room camera video + room/talkback audio).
  // Note: Host uses RTCRtpSender.replaceTrack() on sendrecv transceivers so event.streams may be empty;
  // always wrap event.track in a MediaStream directly.
  pc.ontrack = (event) => {
    const track = event.track;
    console.log('[WebRTC] Received remote track from host:', track.kind, 'muted:', track.muted);

    if (track.kind === 'audio') {
      state.returnAudioTrack = track;
      const audioStream = (event.streams && event.streams[0]) ? event.streams[0] : new MediaStream([track]);
      if (el.operatorAudio) {
        el.operatorAudio.srcObject = audioStream;
        el.operatorAudio.muted = state.returnAudioMuted;
        el.operatorAudio.play().catch(e => console.warn('[WebRTC] Return audio autoplay deferred:', e));
      }
      track.onunmute = () => {
        if (el.operatorAudio && !state.returnAudioMuted) {
          el.operatorAudio.play().catch(() => {});
        }
        updateReturnFeedUI();
      };
      track.onmute = () => updateReturnFeedUI();
      track.onended = () => {
        if (state.returnAudioTrack === track) state.returnAudioTrack = null;
        updateReturnFeedUI();
      };
      updateReturnFeedUI();
    } else if (track.kind === 'video') {
      state.returnVideoTrack = track;
      const videoStream = new MediaStream([track]);
      if (el.returnVideo) {
        el.returnVideo.muted = true; // Audio is played via #operatorAudio so video autoplays reliably on mobile
        el.returnVideo.srcObject = videoStream;
        el.returnVideo.play().catch(e => console.warn('[WebRTC] Return video autoplay deferred:', e));
      }
      track.onunmute = () => {
        if (el.returnVideo) el.returnVideo.play().catch(() => {});
        updateReturnFeedUI();
      };
      track.onmute = () => updateReturnFeedUI();
      track.onended = () => {
        if (state.returnVideoTrack === track) state.returnVideoTrack = null;
        updateReturnFeedUI();
      };
      updateReturnFeedUI();
    }
  };

  // Send local ICE candidates to host via WebSocket
  pc.onicecandidate = (event) => {
    if (event.candidate && state.socket && state.socket.readyState === WebSocket.OPEN) {
      state.socket.send(JSON.stringify({
        type: 'ice-candidate',
        roomId: state.roomId,
        data: event.candidate
      }));
    }
  };

  pc.oniceconnectionstatechange = () => {
    console.log('[WebRTC] ICE state:', pc.iceConnectionState);
    if (pc.iceConnectionState === 'connected' || pc.iceConnectionState === 'completed') {
      clearTimeout(state.iceRecoveryTimer);
      startSignalMonitor();
      addChatMessage('System', 'Direct WebRTC video stream established.', 'text-emerald-400');
    } else if (pc.iceConnectionState === 'failed' || pc.iceConnectionState === 'disconnected') {
      clearTimeout(state.iceRecoveryTimer);
      state.iceRecoveryTimer = setTimeout(() => {
        if (
          !state.hasLeft &&
          state.peerConnection === pc &&
          (pc.iceConnectionState === 'failed' || pc.iceConnectionState === 'disconnected')
        ) {
          addChatMessage('System', 'Reconnecting video stream...', 'text-amber-400');
          initWebRTC();
        }
      }, 4000);
    }
  };

  // Guest initiates offer to Host
  createAndSendOffer();
}

async function createAndSendOffer() {
  if (!state.peerConnection) return;
  try {
    const offer = await state.peerConnection.createOffer({
      offerToReceiveAudio: true,
      offerToReceiveVideo: true // Receive Main Room return camera feed from desktop host
    });
    await state.peerConnection.setLocalDescription(offer);

    state.socket.send(JSON.stringify({
      type: 'sdp-offer',
      roomId: state.roomId,
      data: offer
    }));
  } catch (err) {
    console.error('[WebRTC] Error creating SDP offer:', err);
  }
}

async function handleRemoteOffer(offer) {
  if (!state.peerConnection) initWebRTC();
  try {
    await state.peerConnection.setRemoteDescription(new RTCSessionDescription(offer));
    const answer = await state.peerConnection.createAnswer();
    await state.peerConnection.setLocalDescription(answer);

    state.socket.send(JSON.stringify({
      type: 'sdp-answer',
      roomId: state.roomId,
      data: answer
    }));
  } catch (err) {
    console.error('[WebRTC] Error handling remote offer:', err);
  }
}

async function handleRemoteAnswer(answer) {
  if (!state.peerConnection) return;
  try {
    await state.peerConnection.setRemoteDescription(new RTCSessionDescription(answer));
  } catch (err) {
    console.error('[WebRTC] Error setting remote description:', err);
  }
}

// -----------------------------------------------------------------------------
// 4. STAGE STATUS (BACKSTAGE VS ON-STAGE TALLY)
// -----------------------------------------------------------------------------

function stopLiveTimer() {
  if (state.liveTimerInterval) {
    clearInterval(state.liveTimerInterval);
    state.liveTimerInterval = null;
  }
  state.liveStartedAt = null;
  if (el.liveTimer) {
    el.liveTimer.classList.add('hidden');
    el.liveTimer.textContent = '00:00';
  }
}

function startLiveTimer() {
  stopLiveTimer();
  state.liveStartedAt = Date.now();
  if (el.liveTimer) {
    el.liveTimer.classList.remove('hidden');
    el.liveTimer.textContent = '00:00';
  }
  state.liveTimerInterval = setInterval(() => {
    if (!state.liveStartedAt || !el.liveTimer) return;
    const elapsedSec = Math.floor((Date.now() - state.liveStartedAt) / 1000);
    const mins = String(Math.floor(elapsedSec / 60)).padStart(2, '0');
    const secs = String(elapsedSec % 60).padStart(2, '0');
    el.liveTimer.textContent = `${mins}:${secs}`;
  }, 1000);
}

function setStageStatus(onStage) {
  state.onStage = Boolean(onStage);

  if (state.onStage) {
    // LIVE ON STAGE STATE (Distraction-Free On-Air Mode)
    el.tallyBanner.className = 'tally-live rounded-2xl p-4 flex items-center justify-between shadow-xl transition-all duration-300';
    el.tallyDot.className = 'w-3.5 h-3.5 rounded-full bg-rose-500 animate-ping';
    el.tallyTitle.className = 'text-sm md:text-base font-extrabold uppercase tracking-wide text-rose-300';
    el.tallyTitle.textContent = '🔴 YOU ARE LIVE ON STAGE';
    el.tallySubtitle.className = 'text-xs text-rose-200/90 font-medium';
    el.tallySubtitle.textContent = 'Your video and audio are broadcasting live to the centro!';
    el.tallyBadge.className = 'px-3 py-1 bg-rose-500 text-white font-black rounded-full text-xs uppercase tracking-wider shadow-lg animate-pulse';
    el.tallyBadge.textContent = 'LIVE';
    el.videoContainer.classList.add('border-rose-500', 'ring-4', 'ring-rose-500/40');
    el.videoContainer.classList.remove('border-slate-800');
    startLiveTimer();

    // Collapse intercom on small mobile screens for distraction-free speaking
    if (window.innerWidth < 768 && el.intercomPanel && el.btnShowIntercomMobile) {
      el.intercomPanel.classList.add('hidden');
      el.btnShowIntercomMobile.classList.remove('hidden');
      el.btnShowIntercomMobile.textContent = 'Show Operator Intercom';
    }

    // Play subtle notification chime
    playTone(880, 0.15); // A5 chime
  } else {
    // BACKSTAGE / GREEN ROOM STATE
    el.tallyBanner.className = 'tally-backstage rounded-2xl p-4 flex items-center justify-between shadow-xl transition-all duration-300';
    el.tallyDot.className = 'w-3.5 h-3.5 rounded-full bg-amber-400 animate-pulse';
    el.tallyTitle.className = 'text-sm md:text-base font-extrabold uppercase tracking-wide text-amber-300';
    el.tallyTitle.textContent = 'Backstage in Green Room';
    el.tallySubtitle.className = 'text-xs text-amber-200/80';
    el.tallySubtitle.textContent = 'The operator can see and talk with you. The congregation cannot see or hear you yet.';
    el.tallyBadge.className = 'px-3 py-1 bg-amber-400/20 text-amber-300 font-bold rounded-full text-xs uppercase tracking-wider border border-amber-400/30';
    el.tallyBadge.textContent = 'Standby';
    el.videoContainer.classList.remove('border-rose-500', 'ring-4', 'ring-rose-500/40');
    el.videoContainer.classList.add('border-slate-800');
    stopLiveTimer();

    if (el.intercomPanel && el.btnShowIntercomMobile) {
      el.intercomPanel.classList.remove('hidden');
      el.btnShowIntercomMobile.classList.add('hidden');
    }
  }
}

// -----------------------------------------------------------------------------
// 5. INTERCOM & PRIVATE CHAT
// -----------------------------------------------------------------------------

el.chatForm.addEventListener('submit', (e) => {
  e.preventDefault();
  const text = el.chatInput.value.trim();
  if (!text || !state.socket) return;

  state.socket.send(JSON.stringify({
    type: 'intercom-chat',
    roomId: state.roomId,
    text
  }));

  addChatMessage(state.guestName + ' (You)', text, 'text-emerald-400');
  el.chatInput.value = '';
});

// Quick Canned Message Chips
document.querySelectorAll('.quick-chip').forEach((button) => {
  button.addEventListener('click', () => {
    const text = button.textContent.trim();
    if (state.socket) {
      state.socket.send(JSON.stringify({
        type: 'intercom-chat',
        roomId: state.roomId,
        text
      }));
      addChatMessage(state.guestName + ' (You)', text, 'text-emerald-400');
    }
  });
});

function addChatMessage(sender, text, colorClass = 'text-slate-200') {
  const div = document.createElement('div');
  div.className = 'bg-slate-800/80 p-2.5 rounded-xl border border-slate-700/60 break-words';
  const time = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

  div.innerHTML = `
    <div class="flex items-center justify-between mb-0.5">
      <span class="font-bold text-[11px] ${colorClass}">${escapeHtml(sender)}</span>
      <span class="text-[10px] text-slate-500">${time}</span>
    </div>
    <div class="text-xs text-slate-200">${escapeHtml(text)}</div>
  `;
  el.chatMessages.appendChild(div);
  el.chatMessages.scrollTop = el.chatMessages.scrollHeight;
}

function updateSlideDisplay(programState) {
  if (!programState) return;
  const heading = programState.reference || programState.title || 'Live on Screen';
  el.currentSlideDisplay.textContent = heading;
  if (el.slideBodyDisplay) {
    if (programState.override === 'blackout') {
      el.slideBodyDisplay.textContent = '(Screen is currently blacked out)';
    } else if (programState.override === 'showLogo') {
      el.slideBodyDisplay.textContent = '(Church Logo Slide on Screen)';
    } else if (programState.override === 'clearText') {
      el.slideBodyDisplay.textContent = '(Text Cleared)';
    } else {
      el.slideBodyDisplay.textContent = programState.text || programState.verse || '(No active slide text)';
    }
  }
}

// -----------------------------------------------------------------------------
// 6. LOCAL MEDIA CONTROLS (MUTE MIC / VIDEO / LEAVE)
// -----------------------------------------------------------------------------

el.btnToggleAudio.addEventListener('click', () => {
  if (!state.localStream) return;
  const audioTrack = state.localStream.getAudioTracks()[0];
  if (!audioTrack) return;

  state.audioMuted = !state.audioMuted;
  audioTrack.enabled = !state.audioMuted;

  el.iconMicOn.classList.toggle('hidden', state.audioMuted);
  el.iconMicOff.classList.toggle('hidden', !state.audioMuted);
});

el.btnToggleVideo.addEventListener('click', () => {
  if (!state.localStream) return;
  const videoTrack = state.localStream.getVideoTracks()[0];
  if (!videoTrack) return;

  state.videoMuted = !state.videoMuted;
  videoTrack.enabled = !state.videoMuted;

  el.iconVideoOn.classList.toggle('hidden', state.videoMuted);
  el.iconVideoOff.classList.toggle('hidden', !state.videoMuted);
});

function leaveSession() {
  state.hasLeft = true;
  releaseWakeLock();
  stopSignalMonitor();
  stopLiveTimer();
  clearTimeout(state.iceRecoveryTimer);
  if (state.socket && state.socket.readyState === WebSocket.OPEN) {
    try {
      state.socket.send(JSON.stringify({
        type: 'leave-guest',
        roomId: state.roomId,
        guestId: state.guestId
      }));
      state.socket.close();
    } catch (e) {}
  }
  if (state.peerConnection) {
    try { state.peerConnection.close(); } catch (e) {}
  }
  if (state.localStream) {
    try { state.localStream.getTracks().forEach(t => t.stop()); } catch (e) {}
  }
  state.returnVideoTrack = null;
  state.returnAudioTrack = null;
  if (el.returnVideo) el.returnVideo.srcObject = null;
  if (el.operatorAudio) el.operatorAudio.srcObject = null;
  updateReturnFeedUI();
}

// Cleanly notify server on page close or mobile app switch
window.addEventListener('beforeunload', leaveSession);
window.addEventListener('pagehide', leaveSession);

el.btnLeave.addEventListener('click', () => {
  if (confirm('Are you sure you want to leave the Green Room?')) {
    leaveSession();
    window.location.reload();
  }
});

// -----------------------------------------------------------------------------
// 7. HELPERS
// -----------------------------------------------------------------------------

function showError(msg) {
  el.joinError.textContent = msg;
  el.joinError.classList.remove('hidden');
}

function hideError() {
  el.joinError.classList.add('hidden');
}

function updateConnectionStatus(type, label) {
  el.connectionBadge.classList.remove('hidden');
  el.connectionBadge.classList.add('flex');
  el.connectionText.textContent = label;

  if (type === 'online') {
    el.connectionBadge.className = 'flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20';
  } else if (type === 'connecting') {
    el.connectionBadge.className = 'flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-amber-500/10 text-amber-400 border border-amber-500/20';
  } else {
    el.connectionBadge.className = 'flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-rose-500/10 text-rose-400 border border-rose-500/20';
  }
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

function playTone(freq, durationSec) {
  try {
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    const ctx = state.audioContext || new AudioContext();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.frequency.value = freq;
    osc.type = 'sine';
    gain.gain.setValueAtTime(0.1, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + durationSec);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + durationSec);
  } catch (e) {}
}

// Run on page load
window.addEventListener('DOMContentLoaded', () => {
  updateLandscapeTip();
  initPreview();
});
