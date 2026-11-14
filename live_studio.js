/**
 * Live Studio & Remote Guests Green Room Manager for UECFI Presenter
 * 
 * WHY THIS CODE EXISTS:
 * This module manages:
 * 1. Local USB/HDMI church camera capture via navigator.mediaDevices.
 * 2. WebRTC host signaling connection to uecfi-signaling.onrender.com.
 * 3. Multi-guest "Green Room" (backstage) queue:
 *    - Private operator-to-guest intercom audio (Push-to-Talk)
 *    - Private real-time text chat
 *    - Audio VU metering for each guest
 *    - Isolation of backstage audio from the church sanctuary soundboard
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
      selectedMicId: 'uecfi_operator_mic_id'
    };

    // Default configuration
    this.serverUrl = localStorage.getItem(this.STORAGE_KEYS.serverUrl) || 'wss://uecfi-signaling.onrender.com/ws';
    this.roomId = localStorage.getItem(this.STORAGE_KEYS.roomId) || 'uecfi-sanctuary';
    this.secretKey = localStorage.getItem(this.STORAGE_KEYS.secretKey) || '1234';

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
   * Initialize audio context and studio UI bindings
   */
  init() {
    this.initAudioContext();
    this.enumerateCameras();
    this.updateHeaderBadge();
    console.log('[LIVE STUDIO] Initialized.');
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
  // 1. LOCAL CHURCH CAMERA CAPTURE
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

      // Pre-warm operator microphone stream in background so talkback is instant
      this.ensureOperatorMic().catch(() => {});
    } catch (e) {
      console.warn('[LIVE STUDIO] Could not enumerate devices:', e);
    }
  }

  /**
   * Start capturing selected camera feed with automatic fallback
   */
  async startCamera(deviceId = null) {
    if (this.cameraStream) {
      this.stopCamera();
    }

    const targetDeviceId = deviceId || document.getElementById('studioCameraSelect')?.value || this.cameraDeviceId;

    try {
      // First attempt: Ideal 1080p without strict min bounds (handles webcams and USB HDMI capture cards)
      const constraints = {
        video: targetDeviceId
          ? { deviceId: { exact: targetDeviceId }, width: { ideal: 1920 }, height: { ideal: 1080 } }
          : { width: { ideal: 1920 }, height: { ideal: 1080 } },
        audio: false // Church house audio is managed independently by soundboard
      };
      this.cameraStream = await navigator.mediaDevices.getUserMedia(constraints);
    } catch (idealErr) {
      console.warn('[LIVE STUDIO] Ideal camera constraints failed, attempting fallback { video: true }:', idealErr);
      try {
        const fallbackConstraints = {
          video: targetDeviceId ? { deviceId: { exact: targetDeviceId } } : true,
          audio: false
        };
        this.cameraStream = await navigator.mediaDevices.getUserMedia(fallbackConstraints);
      } catch (fallbackErr) {
        console.error('[LIVE STUDIO] All camera constraints failed:', fallbackErr);
        alert('Could not start camera: ' + (fallbackErr.message || fallbackErr.name));
        this.updateCameraStatusUI(false);
        return;
      }
    }

    this.cameraDeviceId = targetDeviceId;
    if (targetDeviceId) {
      localStorage.setItem(this.STORAGE_KEYS.selectedCameraId, targetDeviceId);
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
    console.log('[LIVE STUDIO] Camera started successfully.');
  }

  /**
   * Stop capturing camera
   */
  stopCamera() {
    if (this.cameraStream) {
      this.cameraStream.getTracks().forEach(t => t.stop());
      this.cameraStream = null;
    }
    const previewEl = document.getElementById('studioCameraPreview');
    if (previewEl) previewEl.srcObject = null;
    this.updateCameraStatusUI(false);
  }

  updateCameraStatusUI(isActive) {
    const statusDot = document.getElementById('studioCameraDot');
    const statusText = document.getElementById('studioCameraStatusText');
    const btnToggle = document.getElementById('btnStudioToggleCamera');

    if (statusDot) statusDot.className = isActive ? 'w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse' : 'w-2.5 h-2.5 rounded-full bg-slate-400';
    if (statusText) statusText.textContent = isActive ? 'Active (Ready)' : 'Inactive';
    if (btnToggle) {
      btnToggle.textContent = isActive ? 'Stop Camera' : 'Start Camera';
      btnToggle.className = isActive
        ? 'px-3 py-1.5 text-xs font-semibold rounded-lg bg-rose-50 text-rose-700 hover:bg-rose-100 border border-rose-200 transition'
        : 'px-3 py-1.5 text-xs font-semibold rounded-lg bg-blue-600 text-white hover:bg-blue-500 transition shadow-sm';
    }
  }

  // ===========================================================================
  // 2. WEBRTC SIGNALING HOST CLIENT (CONNECTS TO uecfi-signaling)
  // ===========================================================================

  connect() {
    this.initAudioContext();
    if (this.socket && this.socket.readyState === WebSocket.OPEN) return;

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

    // Normalize ws:// or wss:// URL
    let wsUrl = this.serverUrl;
    if (wsUrl.startsWith('http://')) wsUrl = wsUrl.replace('http://', 'ws://');
    if (wsUrl.startsWith('https://')) wsUrl = wsUrl.replace('https://', 'wss://');
    if (!wsUrl.endsWith('/ws')) {
      wsUrl = wsUrl.replace(/\/+$/, '') + '/ws';
    }

    this.updateHostConnectionUI('connecting', 'Connecting...');

    try {
      this.socket = new WebSocket(wsUrl);

      this.socket.onopen = () => {
        console.log('[LIVE STUDIO] Connected to signaling server:', wsUrl);
        // Identify as Host to claim room
        this.socket.send(JSON.stringify({
          type: 'join-host',
          roomId: this.roomId,
          secretKey: this.secretKey,
          hostName: 'UECFI Presenter Sanctuary'
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
        this.updateHostConnectionUI('offline', 'Disconnected');
      };
    } catch (err) {
      console.error('[LIVE STUDIO] Failed to connect WebSocket:', err);
      this.updateHostConnectionUI('error', 'Failed');
    }
  }

  disconnect() {
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
      }
    };

    // Crucial: ensure operator mic is attached upfront to peer connection before answer
    // so bidirectional sendrecv audio is negotiated in initial SDP. Track starts muted (enabled = false).
    await this.ensureOperatorMic();
    if (this.operatorMicStream && this.operatorMicTrack) {
      guestObj.audioSender = pc.addTrack(this.operatorMicTrack, this.operatorMicStream);
    } else {
      pc.addTransceiver('audio', { direction: 'sendrecv' });
    }
  }

  async handleGuestOffer(guestId, offer) {
    let guestObj = this.guests.get(guestId);
    if (!guestObj) {
      this.registerGuest(guestId, 'Remote Speaker');
      guestObj = this.guests.get(guestId);
    }

    try {
      const pc = guestObj.peerConnection;

      // Ensure operator mic track is attached if not already
      await this.ensureOperatorMic();
      if (pc && this.operatorMicStream && this.operatorMicTrack) {
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

    // Local operator headset audio element
    if (!guestObj.audioEl) {
      guestObj.audioEl = document.createElement('audio');
      guestObj.audioEl.autoplay = true;
      document.body.appendChild(guestObj.audioEl);
    }
    guestObj.audioEl.srcObject = guestObj.stream;

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
    await this.ensureOperatorMic(deviceId);
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
        if (!this.operatorMicStream) return;
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
    this.updateTalkbackUI(true);
    console.log('[LIVE STUDIO] Operator talkback LIVE (mic unmuted to Green Room).');
  }

  /**
   * Stop operator microphone talkback
   */
  stopOperatorTalkback() {
    this.isOperatorTalking = false;
    if (this.operatorMicTrack) {
      this.operatorMicTrack.enabled = false;
    }
    this.updateTalkbackUI(false);
    console.log('[LIVE STUDIO] Operator talkback muted.');
  }

  updateTalkbackUI(isLive) {
    const btn = document.getElementById('btnStudioTalkback');
    const icon = document.getElementById('studioTalkbackIcon');
    const btnText = document.getElementById('studioTalkbackBtnText');
    const statusText = document.getElementById('studioTalkbackStatus');

    if (btn) {
      btn.className = isLive
        ? 'px-4 py-2 text-xs font-bold rounded-xl bg-rose-600 text-white shadow-lg shadow-rose-600/30 flex items-center gap-2 select-none animate-pulse cursor-pointer'
        : 'px-4 py-2 text-xs font-bold rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 flex items-center gap-2 select-none transition cursor-pointer shadow-xs';
    }
    if (icon) {
      icon.className = isLive ? 'fa-solid fa-microphone-lines text-white' : 'fa-solid fa-microphone text-slate-300';
    }
    if (btnText) {
      btnText.textContent = isLive ? 'Mute Intercom' : 'Tap to Talk (Intercom)';
    }
    if (statusText) {
      statusText.textContent = isLive ? 'TALKING (Live to Green Room)' : 'Intercom: Muted';
      statusText.className = isLive ? 'text-[11px] font-bold text-rose-600' : 'text-[11px] font-bold text-slate-600';
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
   * Take church camera to stage
   */
  putCameraOnStage() {
    if (!this.cameraStream) {
      return alert('Please start the church camera first.');
    }

    // Take any guest off stage
    this.guests.forEach((g) => {
      if (g.onStage) this.putGuestBackstage(g.guestId);
    });

    this.activeStageSource = {
      type: 'camera',
      id: 'church_camera',
      name: 'Sanctuary Camera',
      stream: this.cameraStream
    };

    this.notifyStageSourceChanged();
    console.log('[LIVE STUDIO] Church Camera is now LIVE ON STAGE.');
  }

  clearStageVideo() {
    this.guests.forEach((g) => {
      if (g.onStage) this.putGuestBackstage(g.guestId);
    });
    this.activeStageSource = null;
    this.notifyStageSourceChanged();
  }

  /**
   * Dispatches stage source change event to presentation window & layouts
   */
  notifyStageSourceChanged() {
    const event = new CustomEvent('uecfi-stage-source-changed', {
      detail: this.activeStageSource
    });
    window.dispatchEvent(event);

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
    const isHidden = modal.classList.contains('hidden');
    if (isHidden) {
      modal.classList.remove('hidden');
      this.enumerateCameras();
      // Auto-connect if not connected
      if (!this.isConnected && !this.socket) {
        this.connect();
      }
    } else {
      modal.classList.add('hidden');
    }
  }

  closeModal() {
    const modal = document.getElementById('liveStudioModal');
    if (modal) modal.classList.add('hidden');
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
      card.className = guest.onStage
        ? 'bg-rose-50/70 border-2 border-rose-500 rounded-2xl p-3 shadow-md transition flex flex-col gap-2 relative'
        : 'bg-white border border-slate-200 rounded-2xl p-3 shadow-xs hover:border-slate-300 transition flex flex-col gap-2 relative';

      card.innerHTML = `
        <!-- Video Feed Thumbnail -->
        <div class="relative w-full aspect-video bg-black rounded-xl overflow-hidden border border-slate-800">
          <video id="guestVideo_${guest.guestId}" autoplay playsinline class="w-full h-full object-cover"></video>
          
          <!-- Tally Overlay Badge -->
          <div class="absolute top-2 left-2 px-2 py-0.5 rounded-full text-[10px] font-extrabold uppercase tracking-wide ${
            guest.onStage ? 'bg-rose-600 text-white animate-pulse' : 'bg-amber-500/90 text-white'
          }">
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
                ? `<button onclick="window.liveStudio.putGuestBackstage('${guest.guestId}')" class="px-3 py-1.5 text-xs font-bold rounded-lg bg-amber-500 text-white hover:bg-amber-600 transition shadow-xs">
                     Backstage
                   </button>`
                : `<button onclick="window.liveStudio.putGuestOnStage('${guest.guestId}')" class="px-3 py-1.5 text-xs font-bold rounded-lg bg-rose-600 text-white hover:bg-rose-500 transition shadow-xs flex items-center gap-1">
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
