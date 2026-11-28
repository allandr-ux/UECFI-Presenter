/**
 * UECFI Presenter - WebRTC Signaling & Remote Guest Server
 * 
 * WHY THIS EXISTS:
 * This server acts as the central signaling broker between the UECFI Presenter
 * desktop application (Host) and remote speakers/elders (Guests). It allows
 * participants to join via any mobile or desktop web browser, enter a private
 * Green Room (backstage), communicate with the operator via private intercom,
 * and be switched "Live on Stage" to the centro projector.
 * 
 * DEPLOYMENT COMPATIBILITY:
 * - Render.com (via process.env.PORT)
 * - NGINX / Apache (reverse proxy to local port)
 * - cPanel Application Manager / Passenger
 */

const express = require('express');
const http = require('http');
const { WebSocketServer, WebSocket } = require('ws');
const path = require('path');
const cors = require('cors');
const { createTemplatesRouter } = require('./templatesRouter');

const app = express();
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(createTemplatesRouter());

// Serve the responsive Remote Guest Web Portal from public/
app.use(
  express.static(path.join(__dirname, 'public'), {
    setHeaders: (res) => {
      res.setHeader('Cache-Control', 'no-cache');
    }
  })
);

// Health check endpoint for Render.com and monitoring services
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    activeRooms: rooms.size
  });
});

// Optional API to check if a specific room is active before connecting
app.get('/api/room/:roomId', (req, res) => {
  const room = rooms.get(req.params.roomId.toLowerCase().trim());
  if (!room) {
    return res.status(404).json({ exists: false, message: 'Room not found or host is offline.' });
  }
  return res.json({
    exists: true,
    hasHost: !!room.host,
    guestCount: room.guests.size
  });
});

// Provide WebRTC ICE server configuration (STUN + optional Cloudflare/env TURN for strict NATs)
app.get('/api/ice-config', async (req, res) => {
  const iceServers = [
    { urls: 'stun:stun.cloudflare.com:3478' },
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' }
  ];

  // Optional Cloudflare Realtime TURN credentials (short-lived)
  if (process.env.CLOUDFLARE_TURN_KEY_ID && process.env.CLOUDFLARE_TURN_API_TOKEN) {
    try {
      const turnRes = await fetch(
        `https://rtc.live.cloudflare.com/v1/turn/keys/${process.env.CLOUDFLARE_TURN_KEY_ID}/credentials/generate-ice-servers`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${process.env.CLOUDFLARE_TURN_API_TOKEN}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ ttl: 86400 })
        }
      );
      if (turnRes.ok) {
        const turnData = await turnRes.json();
        if (Array.isArray(turnData.iceServers)) {
          iceServers.push(...turnData.iceServers);
        } else if (turnData.iceServers) {
          iceServers.push(turnData.iceServers);
        }
      }
    } catch (e) {
      console.warn('[ICE] Failed to fetch Cloudflare TURN credentials:', e.message);
    }
  }

  if (process.env.TURN_SERVERS_JSON) {
    try {
      const parsed = JSON.parse(process.env.TURN_SERVERS_JSON);
      if (Array.isArray(parsed)) {
        iceServers.push(...parsed);
      }
    } catch (e) {
      console.warn('[ICE] Invalid TURN_SERVERS_JSON env var:', e.message);
    }
  } else if (process.env.TURN_URL) {
    const turnEntry = { urls: process.env.TURN_URL };
    if (process.env.TURN_USERNAME) turnEntry.username = process.env.TURN_USERNAME;
    if (process.env.TURN_CREDENTIAL) turnEntry.credential = process.env.TURN_CREDENTIAL;
    iceServers.push(turnEntry);
  }

  res.setHeader('Cache-Control', 'no-store');
  res.json({ iceServers });
});

const server = http.createServer(app);

// WebSocket server running on /ws path to support clean proxying
const wss = new WebSocketServer({ server, path: '/ws' });

/**
 * In-memory room store.
 * Map<string, {
 *   roomId: string,
 *   secretKey: string,
 *   host: { ws: WebSocket, id: string, name: string } | null,
 *   guests: Map<string, { ws: WebSocket, guestId: string, guestName: string, onStage: boolean }>
 * }>
 */
const rooms = new Map();

/**
 * Safely send a JSON payload over a WebSocket if the connection is currently OPEN.
 */
function safeSend(ws, data) {
  if (ws && ws.readyState === WebSocket.OPEN) {
    try {
      ws.send(JSON.stringify(data));
    } catch (err) {
      console.error('[WS] Send error:', err);
    }
  }
}

wss.on('connection', (ws, req) => {
  ws.isAlive = true;
  ws.sessionMeta = null; // Stored upon joining: { role, roomId, id, name }

  ws.on('pong', () => {
    ws.isAlive = true;
  });

  ws.on('message', (messageRaw) => {
    let msg;
    try {
      msg = JSON.parse(messageRaw);
    } catch (e) {
      console.error('[WS] Failed to parse message JSON:', messageRaw);
      return;
    }

    const { type, roomId, secretKey } = msg;
    const cleanRoomId = roomId ? String(roomId).toLowerCase().trim() : null;

    switch (type) {
      // -------------------------------------------------------------------
      // 1. HOST JOIN (UECFI Presenter Desktop App)
      // -------------------------------------------------------------------
      case 'join-host': {
        if (!cleanRoomId || !secretKey) {
          return safeSend(ws, { type: 'error', message: 'Centro Code and Access Code are required.' });
        }

        let room = rooms.get(cleanRoomId);
        if (!room) {
          // Initialize new centro room session
          room = {
            roomId: cleanRoomId,
            secretKey: String(secretKey).trim(),
            host: null,
            guests: new Map(),
            lastProgramState: null
          };
          rooms.set(cleanRoomId, room);
        } else {
          // Verify Secret Key if room already exists
          if (room.secretKey !== String(secretKey).trim()) {
            return safeSend(ws, { type: 'error', message: 'Incorrect Access Code for this Centro.' });
          }
        }

        // Clean up any previous host socket to avoid race condition upon close
        if (room.host && room.host.ws !== ws) {
          try {
            room.host.ws.sessionMeta = null;
            room.host.ws.close();
          } catch (e) {}
        }

        // Register host
        room.host = { ws, id: 'host', name: msg.hostName || 'UECFI Presenter' };
        ws.sessionMeta = { role: 'host', roomId: cleanRoomId, id: 'host' };

        console.log(`[ROOM] Host joined room: ${cleanRoomId}`);

        // Send confirmation to host with list of currently waiting guests (if any)
        const guestList = Array.from(room.guests.values()).map(g => ({
          guestId: g.guestId,
          guestName: g.guestName,
          centroOrPosition: g.centroOrPosition || '',
          onStage: g.onStage
        }));

        safeSend(ws, {
          type: 'host-joined',
          roomId: cleanRoomId,
          guests: guestList
        });

        // Notify all waiting guests that the host is now online
        for (const guest of room.guests.values()) {
          safeSend(guest.ws, { type: 'host-status', online: true });
        }
        break;
      }

      // -------------------------------------------------------------------
      // 2. GUEST JOIN (Remote Speaker / Elder via Browser)
      // -------------------------------------------------------------------
      case 'join-guest': {
        const guestId = msg.guestId || `guest_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
        const guestName = (msg.guestName || 'Remote Participant').trim();
        const centroOrPosition = String(msg.centroOrPosition || '').trim();

        if (!cleanRoomId || !secretKey) {
          return safeSend(ws, { type: 'error', message: 'Centro Code and Access Code are required.' });
        }

        const room = rooms.get(cleanRoomId);
        if (!room) {
          return safeSend(ws, {
            type: 'error',
            message: 'Room not found. Please ensure the centro presenter host is online.'
          });
        }

        if (room.secretKey !== String(secretKey).trim()) {
          return safeSend(ws, { type: 'error', message: 'Invalid Passcode/Secret Key.' });
        }

        // Clean up any stale socket for this guest ID if reconnecting
        const existingGuest = room.guests.get(guestId);
        if (existingGuest && existingGuest.ws !== ws) {
          try {
            existingGuest.ws.sessionMeta = null;
            existingGuest.ws.close();
          } catch (e) {}
        }

        // Register guest in the Green Room (initially onStage = false)
        const guestObj = {
          ws,
          guestId,
          guestName,
          centroOrPosition,
          onStage: false
        };
        room.guests.set(guestId, guestObj);
        ws.sessionMeta = { role: 'guest', roomId: cleanRoomId, id: guestId, name: guestName };

        console.log(`[ROOM] Guest ${guestName} (${guestId}) joined room: ${cleanRoomId}`);

        // Confirm to guest that they are in the Green Room
        safeSend(ws, {
          type: 'guest-joined',
          guestId,
          guestName,
          centroOrPosition,
          roomId: cleanRoomId,
          onStage: false,
          hostOnline: !!room.host,
          programState: room.lastProgramState
        });

        // Notify host that a new guest is waiting in the Green Room
        if (room.host) {
          safeSend(room.host.ws, {
            type: 'guest-joined',
            guestId,
            guestName,
            centroOrPosition,
            onStage: false
          });
        }
        break;
      }

      // -------------------------------------------------------------------
      // 3. WEBRTC SIGNALING ROUTING (SDP Offers, Answers, ICE Candidates)
      // -------------------------------------------------------------------
      case 'sdp-offer':
      case 'sdp-answer':
      case 'ice-candidate': {
        const room = ws.sessionMeta ? rooms.get(ws.sessionMeta.roomId) : null;
        if (!room) return;

        if (ws.sessionMeta.role === 'guest') {
          // Guest sending signal to Host
          if (room.host) {
            safeSend(room.host.ws, {
              type: msg.type,
              guestId: ws.sessionMeta.id,
              data: msg.data
            });
          }
        } else if (ws.sessionMeta.role === 'host') {
          // Host sending signal to specific Guest
          const targetGuest = room.guests.get(msg.targetGuestId);
          if (targetGuest) {
            safeSend(targetGuest.ws, {
              type: msg.type,
              from: 'host',
              data: msg.data
            });
          }
        }
        break;
      }

      // -------------------------------------------------------------------
      // 4. STAGE STATUS TOGGLE (Host commands guest to Go Live or Backstage)
      // -------------------------------------------------------------------
      case 'set-stage-status': {
        const room = ws.sessionMeta ? rooms.get(ws.sessionMeta.roomId) : null;
        if (!room || ws.sessionMeta.role !== 'host') return;

        const targetGuest = room.guests.get(msg.targetGuestId);
        if (targetGuest) {
          const onStage = Boolean(msg.onStage);
          targetGuest.onStage = onStage;

          console.log(`[STAGE] Guest ${targetGuest.guestName} stage status set to: ${onStage ? 'LIVE' : 'BACKSTAGE'}`);

          // Notify the guest directly so their UI changes to LIVE / GREEN ROOM
          safeSend(targetGuest.ws, {
            type: 'stage-status-changed',
            onStage
          });

          // Acknowledge back to host
          safeSend(ws, {
            type: 'stage-status-ack',
            guestId: targetGuest.guestId,
            onStage
          });
        }
        break;
      }

      case 'operator-moderation': {
        const room = ws.sessionMeta ? rooms.get(ws.sessionMeta.roomId) : null;
        if (!room || ws.sessionMeta.role !== 'host') return;
        const targetGuest = room.guests.get(msg.targetGuestId);
        if (targetGuest) {
          safeSend(targetGuest.ws, {
            type: 'operator-moderation',
            mutedByOperator: Boolean(msg.mutedByOperator),
            videoHiddenByOperator: Boolean(msg.videoHiddenByOperator)
          });
        }
        break;
      }

      case 'return-audio-override': {
        const room = ws.sessionMeta ? rooms.get(ws.sessionMeta.roomId) : null;
        if (!room) return;
        if (ws.sessionMeta.role === 'host') {
          const forceUnmute = Boolean(msg.forceUnmute);
          const mutedByHost = Boolean(msg.mutedByHost);
          const targets = msg.targetGuestId
            ? [room.guests.get(msg.targetGuestId)].filter(Boolean)
            : Array.from(room.guests.values());
          for (const targetGuest of targets) {
            safeSend(targetGuest.ws, {
              type: 'return-audio-override',
              forceUnmute,
              mutedByHost
            });
          }
        } else if (ws.sessionMeta.role === 'guest' && room.host) {
          safeSend(room.host.ws, {
            type: 'guest-return-audio',
            guestId: ws.sessionMeta.guestId,
            muted: Boolean(msg.muted)
          });
        }
        break;
      }

      // -------------------------------------------------------------------
      // 5. PRIVATE INTERCOM CHAT (Between Operator & Guest)
      // -------------------------------------------------------------------
      case 'intercom-chat': {
        const room = ws.sessionMeta ? rooms.get(ws.sessionMeta.roomId) : null;
        if (!room) return;

        const chatPayload = {
          type: 'intercom-chat',
          fromRole: ws.sessionMeta.role,
          fromId: ws.sessionMeta.id,
          fromName: ws.sessionMeta.name || (ws.sessionMeta.role === 'host' ? 'Operator' : 'Guest'),
          text: String(msg.text || '').trim(),
          timestamp: Date.now()
        };

        if (ws.sessionMeta.role === 'guest') {
          // Route private message to operator
          if (room.host) {
            safeSend(room.host.ws, chatPayload);
          }
        } else if (ws.sessionMeta.role === 'host') {
          // Route message to specific guest, or all guests
          if (msg.targetGuestId) {
            const targetGuest = room.guests.get(msg.targetGuestId);
            if (targetGuest) safeSend(targetGuest.ws, chatPayload);
          } else {
            for (const guest of room.guests.values()) {
              safeSend(guest.ws, chatPayload);
            }
          }
        }
        break;
      }

      // -------------------------------------------------------------------
      // 5b. SPEAKER ATTENTION ALERT (Guest -> Operator persistent toast)
      // -------------------------------------------------------------------
      case 'alert-operator': {
        const room = ws.sessionMeta ? rooms.get(ws.sessionMeta.roomId) : null;
        if (!room || ws.sessionMeta.role !== 'guest') return;
        const guest = room.guests.get(ws.sessionMeta.id);
        if (room.host) {
          safeSend(room.host.ws, {
            type: 'operator-alert',
            guestId: ws.sessionMeta.id,
            guestName: (guest && guest.guestName) || ws.sessionMeta.name || 'Remote Speaker',
            centroOrPosition: (guest && guest.centroOrPosition) || '',
            timestamp: Date.now()
          });
        }
        break;
      }

      // -------------------------------------------------------------------
      // 6. PROGRAM RETURN / CONFIDENCE MONITOR UPDATES
      // -------------------------------------------------------------------
      case 'program-update': {
        const room = ws.sessionMeta ? rooms.get(ws.sessionMeta.roomId) : null;
        if (!room || ws.sessionMeta.role !== 'host') return;

        room.lastProgramState = msg.programState;
        // Broadcast slide/verse information to all guests in the green room
        for (const guest of room.guests.values()) {
          safeSend(guest.ws, {
            type: 'program-update',
            programState: msg.programState
          });
        }
        break;
      }

      // -------------------------------------------------------------------
      // 7. EXPLICIT GUEST LEAVE
      // -------------------------------------------------------------------
      case 'leave-guest': {
        const room = ws.sessionMeta ? rooms.get(ws.sessionMeta.roomId) : null;
        if (!room) return;
        const guestId = (ws.sessionMeta && ws.sessionMeta.id) || msg.guestId;
        console.log(`[ROOM] Explicit leave from guest ${guestId}`);
        room.guests.delete(guestId);
        if (room.host) {
          safeSend(room.host.ws, {
            type: 'guest-left',
            guestId
          });
        }
        ws.sessionMeta = null;
        try { ws.close(); } catch (e) {}
        break;
      }

      // -------------------------------------------------------------------
      // 8. HEARTBEAT KEEP-ALIVE
      // -------------------------------------------------------------------
      case 'heartbeat': {
        ws.isAlive = true;
        safeSend(ws, { type: 'heartbeat-ack' });
        break;
      }

      default:
        console.warn('[WS] Unhandled message type:', msg.type);
    }
  });

  // Handle client disconnection
  ws.on('close', () => {
    if (!ws.sessionMeta) return;

    const { role, roomId, id } = ws.sessionMeta;
    const room = rooms.get(roomId);
    if (!room) return;

    if (role === 'host') {
      // CRITICAL: Only mark host offline if this closing socket is actually the active one!
      // This prevents stale/superseded sockets from falsely disconnecting the host.
      if (room.host && room.host.ws === ws) {
        console.log(`[ROOM] Active Host disconnected from room: ${roomId}`);
        room.host = null;
        // Notify all guests that the host went offline
        for (const guest of room.guests.values()) {
          safeSend(guest.ws, { type: 'host-status', online: false });
        }
        // If no guests remain, clean up the empty room after 5 minutes
        if (room.guests.size === 0) {
          setTimeout(() => {
            const currentRoom = rooms.get(roomId);
            if (currentRoom && !currentRoom.host && currentRoom.guests.size === 0) {
              rooms.delete(roomId);
              console.log(`[ROOM] Pruned inactive room: ${roomId}`);
            }
          }, 5 * 60 * 1000);
        }
      } else {
        console.log(`[ROOM] Superseded host socket closed for room: ${roomId} (active host untouched).`);
      }
    } else if (role === 'guest') {
      const currentGuest = room.guests.get(id);
      // Only remove guest if this closing socket is actually the active one!
      if (currentGuest && currentGuest.ws === ws) {
        console.log(`[ROOM] Active Guest ${id} disconnected from room: ${roomId}`);
        room.guests.delete(id);
        // Notify host that guest left
        if (room.host) {
          safeSend(room.host.ws, {
            type: 'guest-left',
            guestId: id
          });
        }
      } else {
        console.log(`[ROOM] Superseded guest socket closed for guest: ${id} (active session untouched).`);
      }
    }
  });

  ws.on('error', (err) => {
    console.error('[WS] Socket error:', err.message);
  });
});

// Heartbeat ping interval to keep WebSockets alive through cloud proxies (Render, Cloudflare, etc.)
const interval = setInterval(() => {
  wss.clients.forEach((ws) => {
    if (ws.isAlive === false) return ws.terminate();
    ws.isAlive = false;
    ws.ping();
  });
}, 30000);

wss.on('close', () => {
  clearInterval(interval);
});

// Port configuration (Default 3000, or process.env.PORT for cloud environments)
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`====================================================`);
  console.log(` UECFI Signaling & Remote Guest Server running on:`);
  console.log(` http://localhost:${PORT}`);
  console.log(` WebSocket Path: ws://localhost:${PORT}/ws`);
  console.log(`====================================================`);
});
