/**
 * Live Studio & Remote Guests Green Room Manager for UECFI Presenter
 * 
 * WHY THIS CODE EXISTS:
 * This module manages:
 * 1. Local USB/HDMI centro camera capture via navigator.mediaDevices.
 * 2. WebRTC host signaling connection to uecfi-signaling.onrender.com.
 * 3. Multi-guest "Green Room" (backstage) queue:
 *    - Private operator-to-guest intercom audio (Push-to-Talk)
 *    - Private real-time text chat
 *    - Audio VU metering for each guest
 *    - Isolation of backstage audio from the centro soundboard
 * 4. "Go Live / Put on Stage" switcher controls to route video/audio to projection.
 */

class LiveStudioManager {
  constructor() {
    // Persistent configuration keys
    this.STORAGE_KEYS = {
      serverUrl: 'uecfi_signaling_url',
      roomId: 'uecfi_signaling_room',
      secretKey: 'uecfi_signaling_key',
      selectedCameraId: 'uecfi_camera_device_id',
      selectedMicId: 'uecfi_operator_mic_id',
      stageLayout: 'uecfi_stage_layout'
    };

    // Default configuration
    this.serverUrl = localStorage.getItem(this.STORAGE_KEYS.serverUrl) || 'wss://uecfi-signaling.onrender.com/ws';
    this.roomId = localStorage.getItem(this.STORAGE_KEYS.roomId) || 'uecfi-centro';
    this.secretKey = localStorage.getItem(this.STORAGE_KEYS.secretKey) || '1234';
    this.stageLayout = localStorage.getItem(this.STORAGE_KEYS.stageLayout) || 'full';

    // WebSocket & Signaling State
    this.socket = null;
    this.isConnected = false;
    this.reconnectTimer = null;

    // WebRTC & Audio Context
    this.audioCtx = null;
    this.operatorMicStream = null;
    this.operatorMicTrack = null;
    this.isOperatorTalking = false;

    // Multi-guest Map: guestId -> { guestId, guestName, peerConnection, stream, onStage, analyser, audioEl }
    this.guests = new Map();

    // Active Stage Video & Audio Source: null | { type: 'guest'|'camera', id, stream }
    this.activeStageSource = null;
    this._suppressFullPromptUntilLayoutChange = false;
    this._layoutPromptKeyHandler = null;

    // Local Camera Stream
    this.cameraStream = null;
    this.cameraDeviceId = localStorage.getItem(this.STORAGE_KEYS.selectedCameraId) || '';
    this.operatorMicId = localStorage.getItem(this.STORAGE_KEYS.selectedMicId) || '';

    // Public STUN servers for WebRTC direct peer-to-peer connection
    this.rtcConfig = {
      iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' },
        { urls: 'stun:stun2.l.google.com:19302' }
      ]
    };

    // Bind methods
    this.init = this.init.bind(this);
    this.connect = this.connect.bind(this);
    this.disconnect = this.disconnect.bind(this);
  }

  /**
   * Initialize studio UI bindings (lazy audio context to prevent speaker buzz/static)
   */
  init() {
    // AudioContext is initialized lazily only when audio playback/capture is actively needed,
    // preventing sound card DAC activation and ground buzz on idle app startup.
    this.enumerateCameras();
    this.updateHeaderBadge();
    this.updateLayoutUI();
    this.setupKeyboardShortcuts();
    console.log('[LIVE STUDIO] Initialized.');
  }

  setupKeyboardShortcuts() {
    // Hold Spacebar to Talk (Push-to-Talk) when studio modal is active
    window.addEventListener('keydown', (e) => {
      const modal = document.getElementById('liveStudioModal');
      if (!modal || modal.classList.contains('hidden')) return;

      const activeTag = document.activeElement ? document.activeElement.tagName.toLowerCase() : '';
      if (activeTag === 'input' || activeTag === 'textarea') return;

      if (e.code === 'Space' && !e.repeat && !this.isOperatorTalking) {
        e.preventDefault();
        this.startOperatorTalkback();
      }
    });

    window.addEventListener('keyup', (e) => {
      if (e.code === 'Space') {
        const activeTag = document.activeElement ? document.activeElement.tagName.toLowerCase() : '';
        if (activeTag === 'input' || activeTag === 'textarea') return;
        if (this.isOperatorTalking) {
          e.preventDefault();
          this.stopOperatorTalkback();
        }
      }
    });
  }

  initAudioContext() {
    try {
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      if (!this.audioCtx && AudioContextClass) {
        this.audioCtx = new AudioContextClass();
      }
      if (this.audioCtx && this.audioCtx.state === 'suspended') {
        this.audioCtx.resume();
      }
    } catch (e) {
      console.warn('[LIVE STUDIO] AudioContext initialization skipped:', e);
    }
  }

  // ===========================================================================
  // 1. LOCAL CENTRO CAMERA CAPTURE
  // ===========================================================================

  /**
   * Enumerate connected video and audio input devices
   */
  async enumerateCameras() {
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      
      // Video Inputs (Cameras, Capture Cards)
      const videoInputs = devices.filter(d => d.kind === 'videoinput');
      const camSelect = document.getElementById('studioCameraSelect');

      if (camSelect) {
        camSelect.innerHTML = '';
        if (videoInputs.length === 0) {
          camSelect.innerHTML = '<option value="">No cameras found</option>';
        } else {
          videoInputs.forEach((dev, idx) => {
            const opt = document.createElement('option');
            opt.value = dev.deviceId;
            opt.textContent = dev.label || `Camera ${idx + 1}`;
            if (dev.deviceId === this.cameraDeviceId || (!this.cameraDeviceId && idx === 0)) {
              opt.selected = true;
            }
            camSelect.appendChild(opt);
          });
        }
      }

      // Audio Inputs (Operator Microphone)
      const audioInputs = devices.filter(d => d.kind === 'audioinput');
      const micSelect = document.getElementById('studioMicSelect');
      if (micSelect) {
        micSelect.innerHTML = '';
        if (audioInputs.length === 0) {
          micSelect.innerHTML = '<option value="">Default Microphone</option>';
        } else {
          audioInputs.forEach((dev, idx) => {
            const opt = document.createElement('option');
            opt.value = dev.deviceId;
            opt.textContent = dev.label || `Microphone ${idx + 1}`;
            if (dev.deviceId === this.operatorMicId || (!this.operatorMicId && idx === 0)) {
              opt.selected = true;
            }
            micSelect.appendChild(opt);
          });
        }
      }

      // Note: Microphone stream is acquired lazily ONLY when operator presses Talkback
      // to avoid continuous hardware mic capture, audio preamp hiss, and speaker static buzz.
    } catch (e) {
      console.warn('[LIVE STUDIO] Could not enumerate devices:', e);
    }
  }

  /**
   * Toggle camera capture ON / OFF
   */
  toggleCamera() {
    if (this.cameraStream) {
      this.stopCamera();
    } else {
      const select = document.getElementById('studioCameraSelect');
      const devId = (select && select.value) ? select.value : this.cameraDeviceId;
      this.startCamera(devId);
    }
  }

  /**
   * Start capturing selected camera feed with automatic fallback
   */
  async startCamera(deviceId = null) {
    if (this.cameraStream) {
      this.stopCamera();
    }

    const selectEl = document.getElementById('studioCameraSelect');
    // Grab explicit deviceId parameter, or current select value, or saved deviceId
    const targetDeviceId = deviceId || (selectEl && selectEl.value) || this.cameraDeviceId || null;

    try {
      // First attempt: Ideal 1080p with ideal deviceId (never strict exact, so USB capture cards and webcams always connect)
      const constraints = {
        video: targetDeviceId
          ? { deviceId: { ideal: targetDeviceId }, width: { ideal: 1920 }, height: { ideal: 1080 } }
          : { width: { ideal: 1920 }, height: { ideal: 1080 } },
        audio: false // Centro house audio is managed independently by soundboard
      };
      this.cameraStream = await navigator.mediaDevices.getUserMedia(constraints);
    } catch (idealErr) {
      console.warn('[LIVE STUDIO] Ideal camera constraints failed, attempting fallback { video: true }:', idealErr);
      try {
        const fallbackConstraints = {
          video: targetDeviceId ? { deviceId: { ideal: targetDeviceId } } : true,
          audio: false
        };
        this.cameraStream = await navigator.mediaDevices.getUserMedia(fallbackConstraints);
      } catch (fallbackErr) {
        console.warn('[LIVE STUDIO] Device-specific fallback failed, attempting generic video:', fallbackErr);
        try {
          this.cameraStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
        } catch (finalErr) {
          console.error('[LIVE STUDIO] All camera constraints failed:', finalErr);
          alert('Could not start camera: ' + (finalErr.message || finalErr.name));
          this.updateCameraStatusUI(false);
          return;
        }
      }
    }

    // Determine actual active camera deviceId from track settings
    const activeVideoTrack = this.cameraStream.getVideoTracks()[0];
    if (activeVideoTrack) {
      activeVideoTrack.addEventListener('ended', () => {
        console.warn('[LIVE STUDIO] Camera video track ended unexpectedly.');
        this.stopCamera();
      });
    }
    const actualDeviceId = activeVideoTrack?.getSettings()?.deviceId || targetDeviceId;
    if (actualDeviceId) {
      this.cameraDeviceId = actualDeviceId;
      localStorage.setItem(this.STORAGE_KEYS.selectedCameraId, actualDeviceId);
      if (selectEl && selectEl.value !== actualDeviceId) {
        selectEl.value = actualDeviceId;
      }
    }

    const previewEl = document.getElementById('studioCameraPreview');
    if (previewEl) {
      previewEl.muted = true;
      previewEl.playsInline = true;
      previewEl.autoplay = true;
      previewEl.srcObject = this.cameraStream;
      previewEl.onloadedmetadata = () => {
        previewEl.play().catch(e => console.warn('[LIVE STUDIO] Camera preview play deferred:', e));
      };
      previewEl.play().catch(() => {});
    }

    this.updateCameraStatusUI(true);
    // Refresh device list in case labels were previously unpopulated before getUserMedia permission
    this.enumerateCameras().catch(() => {});
    console.log('[LIVE STUDIO] Camera started successfully.');
  }

  /**
   * Stop capturing camera
   */
  stopCamera() {
    const wasCameraOnStage = Boolean(this.activeStageSource && this.activeStageSource.id === 'church_camera');
    if (this.cameraStream) {
      this.cameraStream.getTracks().forEach(t => t.stop());
      this.cameraStream = null;
    }
    const previewEl = document.getElementById('studioCameraPreview');
    if (previewEl) previewEl.srcObject = null;
    this.updateCameraStatusUI(false);

    if (wasCameraOnStage) {
      this.activeStageSource = null;
      this.notifyStageSourceChanged();
    } else {
      // Revert to dual verse mode whenever camera feed ends
      if (typeof window !== 'undefined' && typeof window.setBibleDisplayMode === 'function') {
        window.setBibleDisplayMode('dual');
      }
    }
  }

  updateCameraStatusUI(isActive) {
    const statusDot = document.getElementById('studioCameraDot');
    const statusText = document.getElementById('studioCameraStatusText');
    const btnToggle = document.getElementById('btnStudioToggleCamera');

    if (statusDot) {
      statusDot.style.backgroundColor = isActive ? '#10b981' : '#94a3b8';
      statusDot.className = isActive ? 'w-2.5 h-2.5 rounded-full animate-pulse' : 'w-2.5 h-2.5 rounded-full';
    }
    if (statusText) {
      statusText.textContent = isActive ? 'Active (Ready)' : 'Inactive';
      statusText.style.color = isActive ? '#059669' : '#64748b';
    }
    if (btnToggle) {
      if (isActive) {
        btnToggle.innerHTML = '<i class="fa-solid fa-video-slash mr-1"></i> Stop Camera';
        btnToggle.style.backgroundColor = '#ffe4e6'; // Rose 100
        btnToggle.style.color = '#be123c';           // Rose 700
        btnToggle.style.border = '1px solid #fda4af';
      } else {
        btnToggle.innerHTML = '<i class="fa-solid fa-video mr-1"></i> Start Camera';
        btnToggle.style.backgroundColor = '#2563eb'; // Blue 600
        btnToggle.style.color = '#ffffff';
        btnToggle.style.border = '1px solid #1d4ed8';
      }
    }
  }

  // ===========================================================================
  // 2. WEBRTC SIGNALING HOST CLIENT (CONNECTS TO uecfi-signaling)
  // ===========================================================================

  connect() {
    this.initAudioContext();
    if (this.socket && (this.socket.readyState === WebSocket.OPEN || this.socket.readyState === WebSocket.CONNECTING)) return;

    // Load current UI inputs or fallback to stored
    const urlInput = document.getElementById('studioServerUrl')?.value?.trim() || this.serverUrl;
    const roomInput = document.getElementById('studioRoomId')?.value?.trim() || this.roomId;
    const keyInput = document.getElementById('studioSecretKey')?.value?.trim() || this.secretKey;

    this.serverUrl = urlInput;
    this.roomId = roomInput;
    this.secretKey = keyInput;

    localStorage.setItem(this.STORAGE_KEYS.serverUrl, this.serverUrl);
    localStorage.setItem(this.STORAGE_KEYS.roomId, this.roomId);
    localStorage.setItem(this.STORAGE_KEYS.secretKey, this.secretKey);

    // Refresh ICE/TURN server list from signaling server if configured (non-blocking)
    this.refreshIceConfig();

    // Normalize ws:// or wss:// URL
    let wsUrl = this.serverUrl;
    if (wsUrl.startsWith('http://')) wsUrl = wsUrl.replace('http://', 'ws://');
    if (wsUrl.startsWith('https://')) wsUrl = wsUrl.replace('https://', 'wss://');
    if (!wsUrl.endsWith('/ws')) {
      wsUrl = wsUrl.replace(/\/+$/, '') + '/ws';
    }

    this.updateHostConnectionUI('connecting', 'Connecting...');
    this.isManualDisconnect = false;

    // Start 15-second heartbeat ping to prevent cloud proxy idle disconnects
    if (!this.heartbeatTimer) {
      this.heartbeatTimer = setInterval(() => {
        if (this.socket && this.socket.readyState === WebSocket.OPEN) {
          try { this.socket.send(JSON.stringify({ type: 'heartbeat' })); } catch (e) {}
        }
      }, 15000);
    }

    try {
      this.socket = new WebSocket(wsUrl);

      this.socket.onopen = () => {
        console.log('[LIVE STUDIO] Connected to signaling server:', wsUrl);
        // Identify as Host to claim room
        this.socket.send(JSON.stringify({
          type: 'join-host',
          roomId: this.roomId,
          secretKey: this.secretKey,
          hostName: 'UECFI Presenter Centro'
        }));
      };

      this.socket.onmessage = (event) => {
        let msg;
        try {
          msg = JSON.parse(event.data);
        } catch (e) {
          return console.error('[LIVE STUDIO] Bad JSON:', event.data);
        }
        this.handleSignalingMessage(msg);
      };

      this.socket.onerror = (err) => {
        console.error('[LIVE STUDIO] WebSocket error:', err);
        this.updateHostConnectionUI('error', 'Connection Error');
      };

      this.socket.onclose = () => {
        console.warn('[LIVE STUDIO] WebSocket closed.');
        this.isConnected = false;
        this.updateHostConnectionUI('offline', 'Reconnecting...');

        // Auto-reconnect if not explicitly disconnected by user
        if (!this.isManualDisconnect) {
          clearTimeout(this.reconnectTimer);
          this.reconnectTimer = setTimeout(() => {
            console.log('[LIVE STUDIO] Attempting automatic host reconnect...');
            this.connect();
          }, 3000);
        }
      };
    } catch (err) {
      console.error('[LIVE STUDIO] Failed to connect WebSocket:', err);
      this.updateHostConnectionUI('error', 'Failed');
    }
  }

  /**
   * Fetch optional TURN/STUN ICE configuration from the signaling server
   */
  async refreshIceConfig() {
    try {
      const httpBase = this.serverUrl
        .replace(/^ws(s)?:\/\//i, 'http$1://')
        .replace(/\/ws\/?$/i, '')
        .replace(/\/+$/, '');
      const res = await fetch(`${httpBase}/api/ice-config`, { cache: 'no-store' });
      if (!res.ok) return;
      const data = await res.json();
      if (data && Array.isArray(data.iceServers) && data.iceServers.length > 0) {
        this.rtcConfig = { iceServers: data.iceServers };
      }
    } catch (e) {
      // Keep default STUN rtcConfig if signaling server doesn't expose /api/ice-config
    }
  }

  disconnect() {
    this.isManualDisconnect = true;
    clearTimeout(this.reconnectTimer);
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
    if (this.socket) {
      this.socket.close();
      this.socket = null;
    }
    // Clean up all guest peer connections
    this.guests.forEach((g) => {
      if (g.peerConnection) g.peerConnection.close();
      if (g.audioEl) {
        g.audioEl.srcObject = null;
        g.audioEl.remove();
      }
    });
    this.guests.clear();
    this.renderGuestList();
    this.updateHeaderBadge();
    this.updateHostConnectionUI('offline', 'Offline');
  }

  handleSignalingMessage(msg) {
    switch (msg.type) {
      case 'error':
        alert('[Signaling Error] ' + msg.message);
        this.updateHostConnectionUI('error', msg.message);
        break;

      case 'host-joined':
        this.isConnected = true;
        this.updateHostConnectionUI('online', `Live (${this.roomId})`);
        console.log('[LIVE STUDIO] Host confirmed. Existing guests:', msg.guests);
        // If any guests were already waiting in the room, populate them
        if (Array.isArray(msg.guests)) {
          msg.guests.forEach(g => this.registerGuest(g.guestId, g.guestName, g.onStage));
        }
        break;

      case 'guest-joined':
        console.log(`[LIVE STUDIO] Guest joined Green Room: ${msg.guestName} (${msg.guestId})`);
        this.registerGuest(msg.guestId, msg.guestName, msg.onStage || false);
        this.playNotificationSound();
        this.addIntercomMessage('System', `${msg.guestName} entered the Green Room.`, 'text-emerald-500');
        break;

      case 'guest-left':
        console.log(`[LIVE STUDIO] Guest left: ${msg.guestId}`);
        this.removeGuest(msg.guestId);
        break;

      case 'sdp-offer':
        this.handleGuestOffer(msg.guestId, msg.data);
        break;

      case 'sdp-answer':
        this.handleGuestAnswer(msg.guestId, msg.data);
        break;

      case 'ice-candidate':
        this.handleGuestCandidate(msg.guestId, msg.data);
        break;

      case 'intercom-chat':
        this.addIntercomMessage(msg.fromName, msg.text, 'text-amber-500');
        break;
    }
  }

  // ===========================================================================
  // 3. WEBRTC PEER CONNECTION HANDLING PER GUEST
  // ===========================================================================

  registerGuest(guestId, guestName, onStage = false) {
    if (this.guests.has(guestId)) return;

    const guestObj = {
      guestId,
      guestName: guestName || 'Remote Speaker',
      onStage: Boolean(onStage),
      peerConnection: null,
      stream: null,
      audioEl: null,
      audioAnalyser: null,
      audioGainNode: null
    };

    this.guests.set(guestId, guestObj);
    this.renderGuestList();
    this.updateHeaderBadge();
    this.initGuestPeerConnection(guestObj);
  }

  async initGuestPeerConnection(guestObj) {
    const pc = new RTCPeerConnection(this.rtcConfig);
    guestObj.peerConnection = pc;

    // Send host ICE candidates to guest
    pc.onicecandidate = (event) => {
      if (event.candidate && this.socket && this.socket.readyState === WebSocket.OPEN) {
        this.socket.send(JSON.stringify({
          type: 'ice-candidate',
          targetGuestId: guestObj.guestId,
          data: event.candidate
        }));
      }
    };

    // Automatically detect WebRTC disconnect/failure and clean up stale presence
    pc.onconnectionstatechange = () => {
      console.log(`[LIVE STUDIO] PeerConnection for ${guestObj.guestName} changed to: ${pc.connectionState}`);
      if (pc.connectionState === 'failed' || pc.connectionState === 'closed') {
        this.removeGuest(guestObj.guestId);
      }
    };

    pc.oniceconnectionstatechange = () => {
      console.log(`[LIVE STUDIO] ICE connection state for ${guestObj.guestName}: ${pc.iceConnectionState}`);
      if (pc.iceConnectionState === 'disconnected' || pc.iceConnectionState === 'failed') {
        setTimeout(() => {
          if (pc.iceConnectionState === 'disconnected' || pc.iceConnectionState === 'failed') {
            const currentGuest = this.guests.get(guestObj.guestId);
            if (currentGuest && currentGuest.peerConnection === pc) {
              console.log(`[LIVE STUDIO] Pruning inactive WebRTC peer for ${guestObj.guestName}`);
              this.removeGuest(guestObj.guestId);
            }
          }
        }, 5000);
      }
    };

    // Handle incoming video and audio tracks from guest
    pc.ontrack = (event) => {
      console.log(`[LIVE STUDIO] Received track (${event.track.kind}) from guest ${guestObj.guestName}`);
      if (event.streams && event.streams[0]) {
        guestObj.stream = event.streams[0];

        // Attach stream to guest's video card in operator dashboard
        const videoEl = document.getElementById(`guestVideo_${guestObj.guestId}`);
        if (videoEl) {
          videoEl.srcObject = guestObj.stream;
          videoEl.play().catch(() => {});
        }

        // Setup audio routing and visual VU meter
        this.setupGuestAudioRouting(guestObj);

        // If guest is currently active on stage, immediately update stage video
        if (this.activeStageSource && this.activeStageSource.id === guestObj.guestId) {
          this.activeStageSource.stream = guestObj.stream;
          this.syncStageVideo();
        }
      }
    };

    // Negotiate bidirectional sendrecv audio in SDP without prematurely opening physical microphone
    if (this.isOperatorTalking && this.operatorMicStream && this.operatorMicTrack) {
      guestObj.audioSender = pc.addTrack(this.operatorMicTrack, this.operatorMicStream);
    } else {
      const hasAudio = pc.getTransceivers ? pc.getTransceivers().some(t => t.receiver && t.receiver.track && t.receiver.track.kind === 'audio') : false;
      if (!hasAudio && typeof pc.addTransceiver === 'function') {
        pc.addTransceiver('audio', { direction: 'sendrecv' });
      }
    }
  }

  async handleGuestOffer(guestId, offer) {
    let guestObj = this.guests.get(guestId);
    if (!guestObj) {
      this.registerGuest(guestId, 'Remote Speaker');
      guestObj = this.guests.get(guestId);
    }

    try {
      let pc = guestObj.peerConnection;
      // If peer connection was missing or in an unstable state, recreate it freshly
      if (!pc || pc.signalingState !== 'stable') {
        if (pc) {
          try { pc.close(); } catch (e) {}
        }
        await this.initGuestPeerConnection(guestObj);
        pc = guestObj.peerConnection;
      }

      // Attach operator mic track only if actively talking
      if (this.isOperatorTalking && pc && this.operatorMicStream && this.operatorMicTrack) {
        const senders = pc.getSenders();
        const hasAudioSender = senders.some(s => s.track && s.track.kind === 'audio');
        if (!hasAudioSender) {
          guestObj.audioSender = pc.addTrack(this.operatorMicTrack, this.operatorMicStream);
        }
      }

      await pc.setRemoteDescription(new RTCSessionDescription(offer));

      // Create answer back to guest
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);

      this.socket.send(JSON.stringify({
        type: 'sdp-answer',
        targetGuestId: guestId,
        data: answer
      }));
    } catch (err) {
      console.error(`[LIVE STUDIO] Error answering offer from ${guestId}:`, err);
    }
  }

  async handleGuestAnswer(guestId, answer) {
    const guestObj = this.guests.get(guestId);
    if (!guestObj || !guestObj.peerConnection) return;
    try {
      await guestObj.peerConnection.setRemoteDescription(new RTCSessionDescription(answer));
    } catch (err) {
      console.error(`[LIVE STUDIO] Error handling answer from ${guestId}:`, err);
    }
  }

  async handleGuestCandidate(guestId, candidate) {
    const guestObj = this.guests.get(guestId);
    if (!guestObj || !guestObj.peerConnection || !candidate) return;
    try {
      await guestObj.peerConnection.addIceCandidate(new RTCIceCandidate(candidate));
    } catch (err) {
      console.error(`[LIVE STUDIO] Error adding ICE candidate from ${guestId}:`, err);
    }
  }

  removeGuest(guestId) {
    const guestObj = this.guests.get(guestId);
    if (!guestObj) return;

    if (guestObj.peerConnection) guestObj.peerConnection.close();
    if (guestObj.audioEl) {
      guestObj.audioEl.srcObject = null;
      guestObj.audioEl.remove();
    }

    // If this guest was on stage, reset stage source
    if (this.activeStageSource && this.activeStageSource.id === guestId) {
      this.activeStageSource = null;
      this.notifyStageSourceChanged();
    }

    this.guests.delete(guestId);
    this.renderGuestList();
    this.updateHeaderBadge();
    this.addIntercomMessage('System', `${guestObj.guestName} disconnected.`, 'text-slate-400');
  }

  // ===========================================================================
  // 4. AUDIO ROUTING (ISOLATES GREEN ROOM FROM HOUSE SOUND)
  // ===========================================================================

  /**
   * Routes guest audio so that:
   * - In GREEN ROOM: audio plays ONLY in operator's local headset (<audio> element)
   * - ON STAGE: audio is marked active for house sound output / projection window
   */
  setupGuestAudioRouting(guestObj) {
    if (!guestObj.stream) return;

    // Local operator headset audio element (muted while guest is live on stage to avoid double audio with projector)
    if (!guestObj.audioEl) {
      guestObj.audioEl = document.createElement('audio');
      guestObj.audioEl.autoplay = true;
      document.body.appendChild(guestObj.audioEl);
    }
    guestObj.audioEl.srcObject = guestObj.stream;
    guestObj.audioEl.muted = Boolean(guestObj.onStage);

    // Web Audio VU Meter
    try {
      this.initAudioContext();
      if (this.audioCtx) {
        const audioSource = this.audioCtx.createMediaStreamSource(guestObj.stream);
        const analyser = this.audioCtx.createAnalyser();
        analyser.fftSize = 256;
        audioSource.connect(analyser);
        guestObj.audioAnalyser = analyser;

        this.startVUMeterLoop(guestObj);
      }
    } catch (e) {
      console.warn('[LIVE STUDIO] Audio VU meter setup failed:', e);
    }
  }

  startVUMeterLoop(guestObj) {
    const bufferLength = guestObj.audioAnalyser.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);

    const checkMeter = () => {
      if (!this.guests.has(guestObj.guestId)) return;
      guestObj.audioAnalyser.getByteFrequencyData(dataArray);

      let sum = 0;
      for (let i = 0; i < bufferLength; i++) sum += dataArray[i];
      const avg = sum / bufferLength;
      const percent = Math.min(100, Math.round((avg / 128) * 100));

      const meterBar = document.getElementById(`meter_${guestObj.guestId}`);
      if (meterBar) {
        meterBar.style.width = percent + '%';
        if (percent > 65) meterBar.className = 'h-full bg-rose-500 transition-all duration-75';
        else if (percent > 35) meterBar.className = 'h-full bg-amber-400 transition-all duration-75';
        else meterBar.className = 'h-full bg-emerald-500 transition-all duration-75';
      }

      requestAnimationFrame(checkMeter);
    };
    requestAnimationFrame(checkMeter);
  }

  // ===========================================================================
  // 5. OPERATOR TALKBACK INTERCOM (TAP-TO-TALK & MIC SELECTION)
  // ===========================================================================

  /**
   * Acquire or switch operator microphone stream, pre-warm track, and bind VU meter
   */
  async ensureOperatorMic(deviceId = null) {
    const targetMicId = deviceId || document.getElementById('studioMicSelect')?.value || this.operatorMicId;

    // If stream is already active with the desired device, reuse it
    if (this.operatorMicStream && this.operatorMicTrack && (!targetMicId || this.operatorMicId === targetMicId)) {
      return this.operatorMicStream;
    }

    if (this.operatorMicStream) {
      this.operatorMicStream.getTracks().forEach(t => t.stop());
      this.operatorMicStream = null;
    }

    try {
      const constraints = {
        audio: targetMicId
          ? {
              deviceId: { exact: targetMicId },
              echoCancellation: true,
              noiseSuppression: true,
              autoGainControl: true
            }
          : {
              echoCancellation: true,
              noiseSuppression: true,
              autoGainControl: true
            },
        video: false
      };

      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      this.operatorMicStream = stream;
      this.operatorMicTrack = stream.getAudioTracks()[0];
      this.operatorMicId = targetMicId;
      if (targetMicId) {
        localStorage.setItem(this.STORAGE_KEYS.selectedMicId, targetMicId);
      }

      // Track starts MUTED by default unless operator is actively talking
      this.operatorMicTrack.enabled = Boolean(this.isOperatorTalking);

      // Instantly update audio tracks across all connected guest peer connections
      this.guests.forEach((g) => {
        if (g.peerConnection) {
          const senders = g.peerConnection.getSenders();
          const audioSender = senders.find(s => s.track && s.track.kind === 'audio');
          if (audioSender) {
            audioSender.replaceTrack(this.operatorMicTrack);
          } else {
            g.audioSender = g.peerConnection.addTrack(this.operatorMicTrack, this.operatorMicStream);
          }
        }
      });

      // Hook up operator mic VU meter so operator can see mic activity
      this.setupOperatorMicMeter(stream);
      return stream;
    } catch (err) {
      console.warn('[LIVE STUDIO] Operator microphone access failed:', err);
      return null;
    }
  }

  async changeOperatorMic(deviceId) {
    this.operatorMicId = deviceId || '';
    if (deviceId) {
      localStorage.setItem(this.STORAGE_KEYS.selectedMicId, deviceId);
    }
    // Only acquire microphone hardware if talkback is actively in progress
    if (this.isOperatorTalking) {
      await this.ensureOperatorMic(deviceId);
    }
  }

  setupOperatorMicMeter(stream) {
    try {
      this.initAudioContext();
      if (!this.audioCtx) return;

      const source = this.audioCtx.createMediaStreamSource(stream);
      const analyser = this.audioCtx.createAnalyser();
      analyser.fftSize = 256;
      source.connect(analyser);

      const bufferLength = analyser.frequencyBinCount;
      const dataArray = new Uint8Array(bufferLength);

      const updateOpMeter = () => {
        // Exit loop immediately if microphone is not actively streaming
        if (!this.operatorMicStream || !this.isOperatorTalking) {
          const meterBar = document.getElementById('studioOperatorMicMeter');
          if (meterBar) meterBar.style.width = '0%';
          return;
        }
        analyser.getByteFrequencyData(dataArray);

        let sum = 0;
        for (let i = 0; i < bufferLength; i++) sum += dataArray[i];
        const avg = sum / bufferLength;
        const percent = Math.min(100, Math.round((avg / 128) * 100));

        const meterBar = document.getElementById('studioOperatorMicMeter');
        if (meterBar) {
          meterBar.style.width = percent + '%';
          if (percent > 65) meterBar.className = 'h-full bg-rose-500 transition-all duration-75';
          else if (percent > 35) meterBar.className = 'h-full bg-amber-400 transition-all duration-75';
          else meterBar.className = 'h-full bg-emerald-500 transition-all duration-75';
        }
        requestAnimationFrame(updateOpMeter);
      };
      requestAnimationFrame(updateOpMeter);
    } catch (e) {
      console.warn('[LIVE STUDIO] Operator VU meter setup failed:', e);
    }
  }

  /**
   * Release microphone hardware completely to prevent ground loops and speaker buzzing
   */
  stopOperatorMic() {
    if (this.operatorMicStream) {
      try {
        this.operatorMicStream.getTracks().forEach((t) => {
          t.stop();
        });
      } catch (e) {}
      this.operatorMicStream = null;
      this.operatorMicTrack = null;
    }
    // Detach track from all active guest peer connections
    this.guests.forEach((g) => {
      if (g.peerConnection) {
        try {
          const senders = g.peerConnection.getSenders();
          const audioSender = senders.find(s => s.track && s.track.kind === 'audio');
          if (audioSender) {
            audioSender.replaceTrack(null);
          }
        } catch (e) {}
      }
    });
    const meterBar = document.getElementById('studioOperatorMicMeter');
    if (meterBar) meterBar.style.width = '0%';
  }

  /**
   * Toggle Talkback ON/OFF (Tap to Talk)
   */
  async toggleOperatorTalkback() {
    if (this.isOperatorTalking) {
      this.stopOperatorTalkback();
    } else {
      await this.startOperatorTalkback();
    }
  }

  /**
   * Start operator microphone talkback (instant, zero renegotiation)
   */
  async startOperatorTalkback() {
    await this.ensureOperatorMic();
    if (!this.operatorMicTrack) return;

    this.isOperatorTalking = true;
    this.operatorMicTrack.enabled = true;

    // Attach operator mic track to all active peer connections
    this.guests.forEach((g) => {
      if (g.peerConnection) {
        try {
          const senders = g.peerConnection.getSenders();
          const audioSender = senders.find(s => s.track && s.track.kind === 'audio');
          if (audioSender) {
            audioSender.replaceTrack(this.operatorMicTrack);
          } else {
            g.audioSender = g.peerConnection.addTrack(this.operatorMicTrack, this.operatorMicStream);
          }
        } catch (e) {}
      }
    });

    this.updateTalkbackUI(true);
    console.log('[LIVE STUDIO] Operator talkback LIVE (mic unmuted to Green Room).');
  }

  /**
   * Stop operator microphone talkback and fully release microphone hardware
   */
  stopOperatorTalkback() {
    this.isOperatorTalking = false;
    this.stopOperatorMic();
    this.updateTalkbackUI(false);
    console.log('[LIVE STUDIO] Operator talkback stopped and microphone released.');
  }

  updateTalkbackUI(isLive) {
    const btn = document.getElementById('btnStudioTalkback');
    const icon = document.getElementById('studioTalkbackIcon');
    const btnText = document.getElementById('studioTalkbackBtnText');
    const statusText = document.getElementById('studioTalkbackStatus');

    if (btn) {
      if (isLive) {
        btn.style.backgroundColor = '#e11d48'; // Vivid red
        btn.style.color = '#ffffff';
        btn.style.borderColor = '#be123c';
        btn.style.boxShadow = '0 0 16px rgba(225, 29, 72, 0.45)';
        btn.style.transform = 'scale(0.97)';
      } else {
        btn.style.backgroundColor = '#1e293b'; // Slate 800
        btn.style.color = '#f8fafc';
        btn.style.borderColor = '#334155';
        btn.style.boxShadow = '0 1px 2px rgba(0,0,0,0.05)';
        btn.style.transform = 'scale(1)';
      }
    }
    if (icon) {
      icon.className = isLive ? 'fa-solid fa-microphone-lines text-white' : 'fa-solid fa-microphone text-slate-300';
    }
    if (btnText) {
      btnText.textContent = isLive ? 'Talking to Backstage...' : 'Hold to Talk';
    }
    if (statusText) {
      statusText.textContent = isLive ? 'TALKING (Live to Green Room)' : 'Intercom: Muted';
      statusText.style.color = isLive ? '#e11d48' : '#475569';
    }
  }

  // ===========================================================================
  // 6. STAGE SWITCHING: "PUT ON STAGE" / "BACKSTAGE"
  // ===========================================================================

  /**
   * Promotes a remote guest from Green Room to LIVE on stage
   */
  putGuestOnStage(guestId) {
    const guestObj = this.guests.get(guestId);
    if (!guestObj) return;

    // Take any other guest off stage first (1 active speaker on stage)
    this.guests.forEach((g) => {
      if (g.guestId !== guestId && g.onStage) {
        this.putGuestBackstage(g.guestId);
      }
    });

    guestObj.onStage = true;
    if (guestObj.audioEl) {
      guestObj.audioEl.muted = true; // House sound is routed via projector stageVideo
    }

    // Notify signaling server so guest's mobile UI turns RED "YOU ARE LIVE"
    if (this.socket && this.socket.readyState === WebSocket.OPEN) {
      this.socket.send(JSON.stringify({
        type: 'set-stage-status',
        targetGuestId: guestId,
        onStage: true
      }));
    }

    // Set active stage source
    this.activeStageSource = {
      type: 'guest',
      id: guestId,
      name: guestObj.guestName,
      stream: guestObj.stream
    };

    this.renderGuestList();
    this.notifyStageSourceChanged();
    console.log(`[LIVE STUDIO] ${guestObj.guestName} is now LIVE ON STAGE.`);
  }

  /**
   * Demotes a guest back to Green Room
   */
  putGuestBackstage(guestId) {
    const guestObj = this.guests.get(guestId);
    if (!guestObj) return;

    guestObj.onStage = false;
    if (guestObj.audioEl) {
      guestObj.audioEl.muted = false; // Restore backstage headset monitoring
    }

    // Notify signaling server
    if (this.socket && this.socket.readyState === WebSocket.OPEN) {
      this.socket.send(JSON.stringify({
        type: 'set-stage-status',
        targetGuestId: guestId,
        onStage: false
      }));
    }

    if (this.activeStageSource && this.activeStageSource.id === guestId) {
      this.activeStageSource = null;
      this.notifyStageSourceChanged();
    }

    this.renderGuestList();
    console.log(`[LIVE STUDIO] ${guestObj.guestName} returned to Green Room.`);
  }

  /**
   * Take centro camera to stage (or toggle off if already on stage)
   */
  putCameraOnStage() {
    // If centro camera is already on stage, toggle it off back to slide-only
    if (this.activeStageSource && this.activeStageSource.id === 'church_camera') {
      console.log('[LIVE STUDIO] Toggling centro camera off stage.');
      this.clearStageVideo();
      return;
    }

    if (!this.cameraStream) {
      return alert('Please start the centro camera first.');
    }

    // Take any guest off stage
    this.guests.forEach((g) => {
      if (g.onStage) this.putGuestBackstage(g.guestId);
    });

    this.activeStageSource = {
      type: 'camera',
      id: 'church_camera',
      name: 'Centro Camera',
      stream: this.cameraStream
    };

    this.notifyStageSourceChanged();
    console.log('[LIVE STUDIO] Centro Camera is now LIVE ON STAGE.');
  }

  clearStageVideo() {
    this.guests.forEach((g) => {
      if (g.onStage) this.putGuestBackstage(g.guestId);
    });
    this.activeStageSource = null;
    this.notifyStageSourceChanged();

    // Whenever stage video is cleared (no video on stage), all projection screens must be in dual verse mode
    console.log('[LIVE STUDIO] Cleared stage video: reverting back to dual verse mode.');
    if (typeof window !== 'undefined' && typeof window.setBibleDisplayMode === 'function') {
      window.setBibleDisplayMode('dual');
    }
  }

  /**
   * Dispatches stage source change event to presentation window & layouts
   */
  notifyStageSourceChanged() {
    const hadVideo = Boolean(this._lastStageSourceType);
    const hasVideoNow = Boolean(this.activeStageSource && this.activeStageSource.stream);
    this._lastStageSourceType = hasVideoNow ? this.activeStageSource.type : null;

    // Synchronize video stream directly to external projection window and live monitor preview
    this.syncStageVideo();

    // When video feed ends (no video on stage), revert all projection screens back to dual verse mode
    if (hadVideo && !hasVideoNow) {
      console.log('[LIVE STUDIO] Video feed ended: reverting all projection screens to dual verse mode.');
      if (typeof window !== 'undefined' && typeof window.setBibleDisplayMode === 'function') {
        window.setBibleDisplayMode('dual');
      }
    }

    const event = new CustomEvent('uecfi-stage-source-changed', {
      detail: this.activeStageSource
    });
    window.dispatchEvent(event);

    // Update Stage button state for camera
    const btnCameraStage = document.getElementById('btnStudioCameraToStage');
    if (btnCameraStage) {
      if (this.activeStageSource && this.activeStageSource.id === 'church_camera') {
        btnCameraStage.innerHTML = '<i class="fa-solid fa-tower-broadcast text-[11px] mr-1"></i> Live';
        btnCameraStage.style.backgroundColor = '#dc2626';
        btnCameraStage.style.color = '#ffffff';
        btnCameraStage.style.borderColor = '#b91c1c';
      } else {
        btnCameraStage.innerHTML = '<i class="fa-solid fa-tower-broadcast text-[11px] mr-1"></i> Stage';
        btnCameraStage.style.backgroundColor = '#f1f5f9';
        btnCameraStage.style.color = '#334155';
        btnCameraStage.style.borderColor = '#cbd5e1';
      }
    }

    // Update active source label in Studio UI
    const activeLabel = document.getElementById('studioActiveStageLabel');
    if (activeLabel) {
      if (this.activeStageSource) {
        activeLabel.textContent = `LIVE: ${this.activeStageSource.name}`;
        activeLabel.className = 'text-xs font-bold text-rose-600 bg-rose-50 border border-rose-200 px-2.5 py-1 rounded-full animate-pulse';
      } else {
        activeLabel.textContent = 'Slide-Only (No Video Live)';
        activeLabel.className = 'text-xs font-medium text-slate-500 bg-slate-100 px-2.5 py-1 rounded-full';
      }
    }
  }

  /**
   * Synchronizes active stage video stream to both the external projector window
   * and the live monitor preview iframe in the operator workspace.
   */
  syncStageVideo() {
    // 1. External Projector Window
    try {
      if (typeof presentWindowOpen !== 'undefined' && presentWindowOpen && typeof newWindow !== 'undefined' && newWindow && newWindow.window && !newWindow.window.closed) {
        this.syncStageVideoToWindow(newWindow.window, false /* isExternalProjector */);
      }
    } catch (e) {
      console.warn('[LIVE STUDIO] Error syncing video to projector window:', e);
    }

    // 2. Live preview frame in operator workspace
    try {
      const frame = document.getElementById('livePreviewFrame');
      if (frame && frame.contentWindow) {
        this.syncStageVideoToWindow(frame.contentWindow, true /* isPreview */);
      }
    } catch (e) {
      console.warn('[LIVE STUDIO] Error syncing video to live preview frame:', e);
    }
  }

  /**
   * Switches the active projection layout ('full', 'pip', 'split', 'lower-third')
   */
  setLayout(layout) {
    if (!['full', 'pip', 'split', 'lower-third'].includes(layout)) layout = 'full';
    const wasLowerThird = (this.stageLayout === 'lower-third');
    const isSwitchingAwayFromLowerThird = wasLowerThird && (layout !== 'lower-third');

    this.stageLayout = layout;
    this._suppressFullPromptUntilLayoutChange = false;
    try {
      localStorage.setItem(this.STORAGE_KEYS.stageLayout, layout);
    } catch (e) {}

    this.updateLayoutUI();
    this.syncStageVideo();

    // When switching away from lower third to a different layout, switch back to dual verse mode
    if (isSwitchingAwayFromLowerThird) {
      console.log(`[LIVE STUDIO] Switched away from lower-third to ${layout}: switching back to dual verse mode.`);
      if (typeof window !== 'undefined' && typeof window.setBibleDisplayMode === 'function') {
        window.setBibleDisplayMode('dual');
      }
    } else if (layout === 'lower-third') {
      // Lower third should always be single version only. Prompt user to choose Version 1 or Version 2.
      if (typeof window.promptLowerThirdVersion === 'function' && window.bibleDisplayMode === 'dual') {
        window.promptLowerThirdVersion();
      } else if (window.bibleDisplayMode === 'dual') {
        if (typeof window.setBibleDisplayMode === 'function') window.setBibleDisplayMode('v1');
      }
    }

    // Trigger presentation update to recalculate font sizing and text bounds
    try {
      if (typeof presentWindowOpen !== 'undefined' && presentWindowOpen && typeof newWindow !== 'undefined' && newWindow && newWindow.window && !newWindow.window.closed) {
        if (typeof newWindow.window.updatePresentation === 'function') newWindow.window.updatePresentation();
        if (typeof newWindow.window.updateContent2 === 'function') newWindow.window.updateContent2();
      }
      const frame = document.getElementById('livePreviewFrame');
      if (frame && frame.contentWindow) {
        if (typeof frame.contentWindow.updatePresentation === 'function') frame.contentWindow.updatePresentation();
        if (typeof frame.contentWindow.updateContent2 === 'function') frame.contentWindow.updateContent2();
      }
    } catch (e) {}

    console.log(`[LIVE STUDIO] Projection layout switched to: ${layout}`);
  }

  /**
   * Prompts operator to select a stage layout when projecting a slide while
   * any video feed (centro camera or remote guest) is currently in full screen.
   */
  promptLayoutForSlideProjection() {
    if (window.isAdvancingSlide) return false;
    if (!this.activeStageSource || !this.activeStageSource.stream) return false;
    const currentLayout = this.stageLayout || 'full';
    if (currentLayout !== 'full') return false;
    if (this._suppressFullPromptUntilLayoutChange) return false;

    const modal = document.getElementById('stageLayoutPromptModal');
    if (!modal) return false;

    // Update source badge in modal header
    const badge = document.getElementById('promptStageSourceBadge');
    if (badge) {
      const srcName = this.activeStageSource.name || (this.activeStageSource.type === 'guest' ? 'Remote Guest' : 'Centro Camera');
      badge.textContent = `${srcName} Full Screen`;
    }

    modal.style.display = 'flex';
    modal.classList.remove('hidden');

    // Attach keyboard shortcut listener (keys 1-4, S/P/L/O, and Esc)
    if (this._layoutPromptKeyHandler) {
      window.removeEventListener('keydown', this._layoutPromptKeyHandler, true);
    }
    this._layoutPromptKeyHandler = (e) => {
      if (modal.style.display === 'none') return;
      if (e.key === '1' || e.key.toLowerCase() === 's') {
        e.preventDefault(); e.stopPropagation();
        this.chooseLayoutFromPrompt('split');
      } else if (e.key === '2' || e.key.toLowerCase() === 'p') {
        e.preventDefault(); e.stopPropagation();
        this.chooseLayoutFromPrompt('pip');
      } else if (e.key === '3' || e.key.toLowerCase() === 'l') {
        e.preventDefault(); e.stopPropagation();
        this.chooseLayoutFromPrompt('lower-third');
      } else if (e.key === '4' || e.key.toLowerCase() === 'o') {
        e.preventDefault(); e.stopPropagation();
        this.chooseLayoutFromPrompt('slide-only');
      } else if (e.key === 'Escape' || e.key.toLowerCase() === 'k') {
        e.preventDefault(); e.stopPropagation();
        this.cancelLayoutPrompt();
      }
    };
    window.addEventListener('keydown', this._layoutPromptKeyHandler, true);

    return true;
  }

  /**
   * Handles layout selection from the prompt modal
   */
  chooseLayoutFromPrompt(layout) {
    this.closeLayoutPromptModal();
    this._suppressFullPromptUntilLayoutChange = false;

    if (layout === 'slide-only') {
      this.clearStageVideo();
    } else if (layout === 'lower-third') {
      this.setLayout('lower-third');
      if (typeof window.promptLowerThirdVersion === 'function') {
        window.promptLowerThirdVersion();
      }
      return;
    } else {
      this.setLayout(layout);
    }

    // Refresh projection views with the chosen layout
    try {
      if (typeof passVariable === 'function') passVariable();
      if (typeof newWindow !== 'undefined' && newWindow && newWindow.window) {
        if (typeof newWindow.window.passVariable === 'function') newWindow.window.passVariable();
        if (typeof newWindow.window.updatePresentation === 'function') newWindow.window.updatePresentation();
        if (typeof newWindow.window.updateContent2 === 'function') newWindow.window.updateContent2();
      }
      if (typeof pushSidebarPreview === 'function') pushSidebarPreview();
    } catch (e) {
      console.warn('[LIVE STUDIO] Error refreshing projection after layout selection:', e);
    }
  }

  /**
   * Cancels the layout prompt, keeping full-screen video
   */
  cancelLayoutPrompt() {
    this.closeLayoutPromptModal();
    this._suppressFullPromptUntilLayoutChange = true;
  }

  closeLayoutPromptModal() {
    const modal = document.getElementById('stageLayoutPromptModal');
    if (modal) {
      modal.style.display = 'none';
      modal.classList.add('hidden');
    }
    if (this._layoutPromptKeyHandler) {
      window.removeEventListener('keydown', this._layoutPromptKeyHandler, true);
      this._layoutPromptKeyHandler = null;
    }
  }

  /**
   * Updates button states across the main monitor quick-layout toolbar
   */
  updateLayoutUI() {
    const layout = this.stageLayout || 'full';

    const quickBtns = [
      { id: 'quickBtnLayoutFull', mode: 'full' },
      { id: 'quickBtnLayoutPip', mode: 'pip' },
      { id: 'quickBtnLayoutSplit', mode: 'split' },
      { id: 'quickBtnLayoutLowerThird', mode: 'lower-third' }
    ];

    quickBtns.forEach(({ id, mode }) => {
      const btn = document.getElementById(id);
      if (!btn) return;
      const isActive = (layout === mode);
      if (isActive) {
        btn.className = 'px-2 py-0.5 rounded text-[10px] font-bold bg-blue-600 text-white shadow-xs cursor-pointer';
      } else {
        btn.className = 'px-2 py-0.5 rounded text-[10px] font-bold text-slate-400 hover:text-white hover:bg-slate-800 transition cursor-pointer';
      }
    });

    const dot = document.getElementById('quickLayoutIndicatorDot');
    if (dot) {
      dot.className = this.activeStageSource
        ? 'w-2 h-2 rounded-full bg-emerald-400 animate-pulse'
        : 'w-2 h-2 rounded-full bg-slate-600';
    }
  }

  /**
   * Applies the active stage video source to a specific target window (projector or preview)
   */
  syncStageVideoToWindow(targetWin, isPreview = false) {
    if (!targetWin || !targetWin.document) return;

    try {
      const doc = targetWin.document;
      let videoLayer = doc.getElementById('videoLayer');
      let stageVideo = doc.getElementById('stageVideo');
      const bgLayer = doc.getElementById('backgroundLayer');
      const contentLayer = doc.getElementById('contentLayer');
      const layout = this.stageLayout || 'full';

      // Dynamically instantiate videoLayer if not already present in the target window DOM
      if (!videoLayer) {
        videoLayer = doc.createElement('div');
        videoLayer.id = 'videoLayer';
        videoLayer.style.cssText = 'display: none; position: absolute; left: 0px; top: 0px; width: 100%; height: 100%; z-index: 4; background: #000000; overflow: hidden;';
        
        stageVideo = doc.createElement('video');
        stageVideo.id = 'stageVideo';
        stageVideo.autoplay = true;
        stageVideo.playsInline = true;
        stageVideo.style.cssText = 'width: 100%; height: 100%; object-fit: contain; background: #000000; display: block;';
        
        const lowerThird = doc.createElement('div');
        lowerThird.id = 'stageLowerThird';
        lowerThird.style.cssText = 'display: none; position: absolute; bottom: 6%; left: 5%; background: rgba(15, 23, 42, 0.88); backdrop-filter: blur(8px); border-left: 6px solid #2563eb; border-radius: 0 12px 12px 0; padding: 12px 24px; box-shadow: 0 10px 25px rgba(0,0,0,0.5); font-family: sans-serif; transition: all 0.3s ease; z-index: 10;';
        lowerThird.innerHTML = `
          <div id="stageLowerThirdName" style="font-size: 26px; font-weight: 800; color: #ffffff; line-height: 1.2;">Speaker Name</div>
          <div id="stageLowerThirdRole" style="font-size: 14px; font-weight: 600; color: #93c5fd; text-transform: uppercase; letter-spacing: 0.05em; margin-top: 2px;">Live Video Feed</div>
        `;

        videoLayer.appendChild(stageVideo);
        videoLayer.appendChild(lowerThird);

        const logoLayer = doc.getElementById('logoLayer');
        if (logoLayer && logoLayer.parentNode) {
          logoLayer.parentNode.insertBefore(videoLayer, logoLayer);
        } else {
          doc.body.appendChild(videoLayer);
        }
      }

      // Main centro projection screen rule:
      // We do NOT want the centro camera to be fed to the centro projection screen.
      // Only remote guest video feeds should be projected to the congregation.
      // Operator preview monitor (isPreview === true) and remote audience streams can still receive the camera.
      const isSanctuaryProjector = !isPreview || Boolean(targetWin.isSanctuaryProjector) || targetWin.name === 'UECFI_Presentation';
      const isExcludedCamera = isSanctuaryProjector && this.activeStageSource && this.activeStageSource.type === 'camera';
      const shouldFeedVideoToWindow = Boolean(this.activeStageSource && this.activeStageSource.stream && !isExcludedCamera);

      if (shouldFeedVideoToWindow) {
        // Bind stream
        if (stageVideo.srcObject !== this.activeStageSource.stream) {
          stageVideo.srcObject = this.activeStageSource.stream;
        }

        // Preview monitor is always muted to prevent audio feedback; projector un-mutes guest audio for house PA
        stageVideo.muted = isPreview || (this.activeStageSource.type === 'camera');
        
        stageVideo.play().catch(err => {
          console.warn('[LIVE STUDIO] stageVideo play() error in window:', err);
        });

        // ---------------------------------------------------------------------
        // PHASE 3: PROJECTION LAYOUT ENGINE APPLICATION
        // ---------------------------------------------------------------------
        videoLayer.style.display = 'block';

        if (layout === 'full') {
          // 1. FULL VIDEO MODE: Video covers entire projection window
          videoLayer.style.position = 'absolute';
          videoLayer.style.left = '0px';
          videoLayer.style.top = '0px';
          videoLayer.style.right = 'auto';
          videoLayer.style.bottom = 'auto';
          videoLayer.style.width = '100%';
          videoLayer.style.height = '100%';
          videoLayer.style.zIndex = '12'; // Above contentLayer to cover slides
          videoLayer.style.borderRadius = '0px';
          videoLayer.style.border = 'none';
          videoLayer.style.boxShadow = 'none';
          videoLayer.style.background = '#000000';

          stageVideo.style.width = '100%';
          stageVideo.style.height = '100%';
          stageVideo.style.objectFit = 'contain';
          stageVideo.style.objectPosition = 'center';
        } else if (layout === 'pip') {
          // 2. PICTURE-IN-PICTURE (PiP) MODE: Slides full screen, video in bottom-right box
          videoLayer.style.position = 'absolute';
          videoLayer.style.left = 'auto';
          videoLayer.style.top = 'auto';
          videoLayer.style.right = '32px';
          videoLayer.style.bottom = '32px';
          videoLayer.style.width = '28%';
          videoLayer.style.aspectRatio = '16 / 9';
          videoLayer.style.height = 'auto';
          videoLayer.style.zIndex = '12'; // Floating over slide in corner
          videoLayer.style.borderRadius = '16px';
          videoLayer.style.border = '3px solid rgba(255, 255, 255, 0.45)';
          videoLayer.style.boxShadow = '0 20px 35px -5px rgba(0, 0, 0, 0.75), 0 0 0 1px rgba(0, 0, 0, 0.2)';
          videoLayer.style.background = '#000000';

          stageVideo.style.width = '100%';
          stageVideo.style.height = '100%';
          stageVideo.style.objectFit = 'cover';
          stageVideo.style.objectPosition = 'center';
        } else if (layout === 'split') {
          // 3. SPLIT SCREEN (50/50) MODE: Video on Left half (cropped in center), Slides on Right half
          videoLayer.style.position = 'absolute';
          videoLayer.style.left = '0px';
          videoLayer.style.top = '0px';
          videoLayer.style.right = 'auto';
          videoLayer.style.bottom = 'auto';
          videoLayer.style.width = '50%';
          videoLayer.style.height = '100%';
          videoLayer.style.zIndex = '2'; // Behind contentLayer
          videoLayer.style.borderRadius = '0px';
          videoLayer.style.border = 'none';
          videoLayer.style.borderRight = '2px solid rgba(255, 255, 255, 0.15)';
          videoLayer.style.boxShadow = 'none';
          videoLayer.style.background = '#000000';

          stageVideo.style.width = '100%';
          stageVideo.style.height = '100%';
          stageVideo.style.objectFit = 'cover'; // Crop in the middle as requested!
          stageVideo.style.objectPosition = 'center';
        } else if (layout === 'lower-third') {
          // 4. LOWER-THIRD MODE: Video full screen in background, slides on bottom third
          videoLayer.style.position = 'absolute';
          videoLayer.style.left = '0px';
          videoLayer.style.top = '0px';
          videoLayer.style.right = 'auto';
          videoLayer.style.bottom = 'auto';
          videoLayer.style.width = '100%';
          videoLayer.style.height = '100%';
          videoLayer.style.zIndex = '2'; // Behind contentLayer
          videoLayer.style.borderRadius = '0px';
          videoLayer.style.border = 'none';
          videoLayer.style.boxShadow = 'none';
          videoLayer.style.background = '#000000';

          stageVideo.style.width = '100%';
          stageVideo.style.height = '100%';
          stageVideo.style.objectFit = 'contain';
          stageVideo.style.objectPosition = 'center';
        }

        // Keep contentLayer full screen at z-index 10 across all modes
        if (contentLayer) {
          contentLayer.style.position = 'absolute';
          contentLayer.style.left = '0px';
          contentLayer.style.top = '0px';
          contentLayer.style.right = 'auto';
          contentLayer.style.bottom = 'auto';
          contentLayer.style.width = '100%';
          contentLayer.style.height = '100%';
          contentLayer.style.zIndex = '10';
          contentLayer.style.display = 'block';
          contentLayer.style.background = 'transparent';
          contentLayer.style.backdropFilter = 'none';
        }

        // Trigger presentation update so slide text positions adjust for the active layout
        if (typeof targetWin.updatePresentation === 'function') {
          try { targetWin.updatePresentation(); } catch (e) {}
        }
        if (typeof targetWin.updateContent2 === 'function') {
          try { targetWin.updateContent2(); } catch (e) {}
        }

        // Lower-Third graphic handling for remote speakers
        const lowerThird = doc.getElementById('stageLowerThird');
        const nameEl = doc.getElementById('stageLowerThirdName');
        const roleEl = doc.getElementById('stageLowerThirdRole');

        if (lowerThird && nameEl && roleEl) {
          if (this.activeStageSource.type === 'guest') {
            nameEl.textContent = this.activeStageSource.name || 'Remote Guest Speaker';
            roleEl.textContent = 'Live Remote Speaker';

            if (layout === 'pip') {
              // Compact bottom badge inside PiP box
              lowerThird.style.display = 'block';
              lowerThird.style.opacity = '1';
              lowerThird.style.bottom = '0px';
              lowerThird.style.left = '0px';
              lowerThird.style.right = '0px';
              lowerThird.style.padding = '4px 8px';
              lowerThird.style.borderRadius = '0 0 13px 13px';
              lowerThird.style.textAlign = 'center';
              nameEl.style.fontSize = '12px';
              roleEl.style.display = 'none';
            } else if (layout === 'lower-third') {
              // Hide speaker name lower-third in lower-third mode so it doesn't clash with scripture/lyrics
              lowerThird.style.display = 'none';
            } else {
              // Full or Split mode: Standard broadcast lower-third
              lowerThird.style.display = 'block';
              lowerThird.style.opacity = '1';
              lowerThird.style.bottom = '6%';
              lowerThird.style.left = '5%';
              lowerThird.style.right = 'auto';
              lowerThird.style.padding = '12px 24px';
              lowerThird.style.borderRadius = '0 12px 12px 0';
              lowerThird.style.textAlign = 'left';
              nameEl.style.fontSize = '26px';
              roleEl.style.display = 'block';

              // Auto-hide lower-third after 7 seconds for clean presentation
              if (targetWin._ltTimeout) clearTimeout(targetWin._ltTimeout);
              targetWin._ltTimeout = setTimeout(() => {
                try {
                  if (lowerThird) {
                    lowerThird.style.transition = 'opacity 0.8s ease';
                    lowerThird.style.opacity = '0';
                    setTimeout(() => { if (lowerThird) lowerThird.style.display = 'none'; }, 800);
                  }
                } catch (e) {}
              }, 7000);
            }
          } else {
            // Centro Camera feed does not show guest lower-third
            lowerThird.style.display = 'none';
          }
        }
      } else {
        // No active video on stage (or centro camera excluded from centro projector):
        // hide video layer and reset presentation layers only if previously showing video
        if (videoLayer.style.display !== 'none') {
          videoLayer.style.display = 'none';
          if (stageVideo) {
            stageVideo.srcObject = null;
          }
          if (bgLayer) {
            bgLayer.style.display = 'block';
            bgLayer.style.left = '0px';
            bgLayer.style.width = '100%';
          }
          if (contentLayer) {
            contentLayer.style.position = 'absolute';
            contentLayer.style.left = '0px';
            contentLayer.style.top = '0px';
            contentLayer.style.right = 'auto';
            contentLayer.style.bottom = 'auto';
            contentLayer.style.width = '100%';
            contentLayer.style.height = '100%';
            contentLayer.style.background = 'transparent';
            contentLayer.style.backdropFilter = 'none';
          }
          const lowerThird = doc.getElementById('stageLowerThird');
          if (lowerThird) lowerThird.style.display = 'none';

          // Trigger presentation update so slides recalculate full bounds on projector
          if (typeof targetWin.updatePresentation === 'function') {
            try { targetWin.updatePresentation(); } catch (e) {}
          }
          if (typeof targetWin.updateContent2 === 'function') {
            try { targetWin.updateContent2(); } catch (e) {}
          }
        }
      }
    } catch (err) {
      console.error('[LIVE STUDIO] Failed to sync stage video to target window:', err);
    }
  }

  // ===========================================================================
  // 7. INTERCOM PRIVATE CHAT
  // ===========================================================================

  sendIntercomMessage(text, targetGuestId = null) {
    if (!text || !this.socket || this.socket.readyState !== WebSocket.OPEN) return;

    this.socket.send(JSON.stringify({
      type: 'intercom-chat',
      targetGuestId,
      text
    }));

    this.addIntercomMessage('Operator (You)', text, 'text-blue-600');
  }

  addIntercomMessage(sender, text, colorClass = 'text-slate-800') {
    const container = document.getElementById('studioChatMessages');
    if (!container) return;

    const div = document.createElement('div');
    div.className = 'p-2 rounded-xl bg-white border border-slate-200 shadow-2xs text-xs';
    const time = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

    div.innerHTML = `
      <div class="flex items-center justify-between mb-0.5">
        <span class="font-bold text-[11px] ${colorClass}">${this.escapeHtml(sender)}</span>
        <span class="text-[10px] text-slate-400 font-mono">${time}</span>
      </div>
      <div class="text-xs text-slate-700 leading-snug">${this.escapeHtml(text)}</div>
    `;
    container.appendChild(div);
    container.scrollTop = container.scrollHeight;
  }

  // ===========================================================================
  // 8. UI RENDERING & HELPERS
  // ===========================================================================

  toggleModal() {
    const modal = document.getElementById('liveStudioModal');
    if (!modal) return;
    const isHidden = modal.classList.contains('hidden') || modal.style.display === 'none';
    if (isHidden) {
      modal.classList.remove('hidden');
      modal.style.display = 'flex';
      this.enumerateCameras();
      this.updateLayoutUI();
      // Auto-connect if not connected
      if (!this.isConnected && !this.socket) {
        this.connect();
      }
    } else {
      this.closeModal();
    }
  }

  closeModal() {
    const modal = document.getElementById('liveStudioModal');
    if (modal) {
      modal.classList.add('hidden');
      modal.style.display = 'none';
    }
    if (this.isOperatorTalking) {
      this.stopOperatorTalkback();
    } else {
      this.stopOperatorMic();
    }
  }

  renderGuestList() {
    const container = document.getElementById('studioGuestGrid');
    const emptyState = document.getElementById('studioGuestEmptyState');
    if (!container) return;

    if (this.guests.size === 0) {
      if (emptyState) emptyState.classList.remove('hidden');
      container.innerHTML = '';
      return;
    }

    if (emptyState) emptyState.classList.add('hidden');
    container.innerHTML = '';

    this.guests.forEach((guest) => {
      const card = document.createElement('div');
      card.style.cssText = guest.onStage
        ? 'background: #fff1f2; border: 2px solid #e11d48; border-radius: 16px; padding: 12px; display: flex; flex-direction: column; gap: 8px; position: relative; box-shadow: 0 4px 6px -1px rgba(225, 29, 72, 0.2);'
        : 'background: #ffffff; border: 1px solid #e2e8f0; border-radius: 16px; padding: 12px; display: flex; flex-direction: column; gap: 8px; position: relative; box-shadow: 0 1px 3px rgba(0,0,0,0.05);';

      card.innerHTML = `
        <!-- Video Feed Thumbnail (Strict 16:9 Aspect Ratio) -->
        <div style="width: 100%; aspect-ratio: 16 / 9; background: #000000; position: relative; border-radius: 12px; overflow: hidden; border: 1px solid #1e293b; display: flex; align-items: center; justify-content: center;">
          <video id="guestVideo_${guest.guestId}" autoplay playsinline muted style="width: 100%; height: 100%; object-fit: contain; background: #000000; display: block;"></video>
          
          <!-- Tally Overlay Badge -->
          <div class="absolute top-2 left-2 px-2 py-0.5 rounded-full text-[10px] font-extrabold uppercase tracking-wide" style="background-color: ${
            guest.onStage ? '#e11d48' : 'rgba(245, 158, 11, 0.95)'
          }; color: #ffffff;">
            ${guest.onStage ? '● LIVE ON STAGE' : 'Standby (Green Room)'}
          </div>

          <!-- Audio Meter Bar -->
          <div class="absolute bottom-2 left-2 right-2 h-1.5 bg-slate-900/80 rounded-full overflow-hidden">
            <div id="meter_${guest.guestId}" class="h-full bg-emerald-500 w-0 transition-all duration-75"></div>
          </div>
        </div>

        <!-- Guest Info & Stage Buttons -->
        <div class="flex items-center justify-between mt-1">
          <div>
            <h4 class="text-xs font-bold text-slate-900 truncate max-w-[140px]">${this.escapeHtml(guest.guestName)}</h4>
            <span class="text-[10px] text-slate-500 font-mono">${guest.guestId}</span>
          </div>

          <div class="flex items-center gap-1.5">
            ${
              guest.onStage
                ? `<button onclick="window.liveStudio.putGuestBackstage('${guest.guestId}')" style="padding: 6px 12px; font-size: 11px; font-weight: 700; border-radius: 8px; background-color: #f59e0b; color: #ffffff; border: none; cursor: pointer;">
                     Backstage
                   </button>`
                : `<button onclick="window.liveStudio.putGuestOnStage('${guest.guestId}')" style="padding: 6px 12px; font-size: 11px; font-weight: 700; border-radius: 8px; background-color: #e11d48; color: #ffffff; border: none; cursor: pointer; display: flex; align-items: center; gap: 4px;">
                     <i class="fa-solid fa-tower-broadcast text-[10px]"></i> Go Live
                   </button>`
            }
          </div>
        </div>
      `;
      container.appendChild(card);

      // Re-bind video stream if already active
      const videoEl = card.querySelector(`#guestVideo_${guest.guestId}`);
      if (videoEl && guest.stream) {
        videoEl.srcObject = guest.stream;
        videoEl.play().catch(() => {});
      }
    });
  }

  updateHostConnectionUI(status, label) {
    const dot = document.getElementById('studioConnectionDot');
    const text = document.getElementById('studioConnectionStatus');
    const btn = document.getElementById('btnStudioConnect');

    if (dot) {
      if (status === 'online') dot.className = 'w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse';
      else if (status === 'connecting') dot.className = 'w-2.5 h-2.5 rounded-full bg-amber-500 animate-ping';
      else dot.className = 'w-2.5 h-2.5 rounded-full bg-rose-500';
    }
    if (text) text.textContent = label;
    if (btn) {
      btn.textContent = status === 'online' ? 'Disconnect' : 'Connect';
      btn.onclick = status === 'online' ? () => this.disconnect() : () => this.connect();
    }
  }

  updateHeaderBadge() {
    const badge = document.getElementById('remoteGuestBadge');
    if (!badge) return;
    const count = this.guests.size;
    if (count > 0) {
      badge.textContent = count;
      badge.classList.remove('hidden');
    } else {
      badge.classList.add('hidden');
    }
  }

  copyGuestInviteLink() {
    // Generate clean link pointing to Render portal
    let base = this.serverUrl.replace(/^ws(s)?:\/\//, 'http$1://').replace(/\/ws$/, '');
    const inviteUrl = `${base}/?room=${encodeURIComponent(this.roomId)}&key=${encodeURIComponent(this.secretKey)}`;
    navigator.clipboard.writeText(inviteUrl).then(() => {
      alert(`Guest Invite Link copied to clipboard!\n\n${inviteUrl}\n\nSend this to the speaker to join from their phone or laptop.`);
    }).catch(() => {
      prompt('Copy this invite link for the remote speaker:', inviteUrl);
    });
  }

  playNotificationSound() {
    try {
      this.initAudioContext();
      if (!this.audioCtx) return;
      const osc = this.audioCtx.createOscillator();
      const gain = this.audioCtx.createGain();
      osc.frequency.setValueAtTime(587.33, this.audioCtx.currentTime); // D5
      osc.frequency.setValueAtTime(880, this.audioCtx.currentTime + 0.1); // A5
      gain.gain.setValueAtTime(0.12, this.audioCtx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, this.audioCtx.currentTime + 0.35);
      osc.connect(gain);
      gain.connect(this.audioCtx.destination);
      osc.start();
      osc.stop(this.audioCtx.currentTime + 0.35);
    } catch (e) {}
  }

  escapeHtml(str) {
    if (!str) return '';
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }
}

// Instantiate globally
window.liveStudio = new LiveStudioManager();
window.addEventListener('DOMContentLoaded', () => {
  window.liveStudio.init();
});
