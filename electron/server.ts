import http from 'node:http';
import net from 'node:net';
import dgram from 'node:dgram';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { WebSocketServer, WebSocket } from 'ws';
import {
  PROTOCOL_VERSION,
  type LiveState,
  type ParticipantSignalMessage,
  type RemoteCommandMessage,
  type WhitelistedDevice
} from '../shared/types';
export type { RemoteCommandMessage };

const DISCOVERY_PORT = 4851;
const DISCOVERY_REQUEST = 'UECFI_PRESENTER_DISCOVER';
const MAX_MEDIA_FILE_BYTES = 50 * 1024 * 1024; // 50 MB
const IMAGE_MEDIA_EXTENSIONS = new Set(['.png', '.jpg', '.jpeg', '.jfif', '.webp', '.gif', '.bmp']);
const MODEL_MEDIA_EXTENSIONS = new Set(['.glb']);
const ALLOWED_MEDIA_EXTENSIONS = new Set([
  ...IMAGE_MEDIA_EXTENSIONS,
  ...MODEL_MEDIA_EXTENSIONS,
  '.mp3',
  '.wav',
  '.m4a',
  '.ogg',
  '.aac'
]);

export const MIME_TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.jfif': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.bmp': 'image/bmp',
  '.glb': 'model/gltf-binary',
  '.ico': 'image/x-icon',
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav',
  '.m4a': 'audio/mp4',
  '.ogg': 'audio/ogg',
  '.aac': 'audio/aac'
};

// Match macOS/Linux virtual interfaces as well as Windows virtual/VPN/hotspot adapters
// (e.g. Hyper-V/WSL vEthernet, VMware, VirtualBox, Bluetooth PAN, Mobile Hotspot, OpenVPN/WireGuard).
const VIRTUAL_IFACE_PATTERN =
  /^(utun|tun|tap|wg|tailscale|zt|zerotier|docker|veth|br-|vmnet|vboxnet|awdl|llw|bridge)|vethernet|virtualbox|vmware|hyper-v|bluetooth|npcap|loopback|local area connection\*|tap-|openvpn|wintun|wireguard|nordlynx|wsl/i;

function isPrivateLanIpv4(ip: string): boolean {
  if (ip.startsWith('192.168.') || ip.startsWith('10.')) return true;
  if (ip.startsWith('172.')) {
    const second = Number(ip.split('.')[1]);
    return second >= 16 && second <= 31;
  }
  return false;
}

function getAllLocalIPv4s(): string[] {
  const interfaces = os.networkInterfaces();
  const candidates: Array<{ address: string; score: number }> = [];

  for (const name of Object.keys(interfaces)) {
    const entries = interfaces[name];
    if (!entries) continue;
    for (const iface of entries) {
      if (iface.family !== 'IPv4' || iface.internal) continue;
      if (iface.address.startsWith('169.254.')) continue;

      let score = 0;
      if (!VIRTUAL_IFACE_PATTERN.test(name)) score += 100;
      if (isPrivateLanIpv4(iface.address)) score += 50;
      if (/^(en\d+|eth\d+|wlan\d*|wi-?fi|ethernet)/i.test(name)) score += 20;
      if (iface.address.startsWith('192.168.')) score += 10;

      candidates.push({ address: iface.address, score });
    }
  }

  candidates.sort((a, b) => b.score - a.score);
  return candidates.map((c) => c.address);
}

/**
 * Returns the best non-internal LAN IPv4 address for QR code / URL sharing,
 * preferring physical Wi-Fi/Ethernet interfaces over VPN/tunnel/virtual adapters.
 */
export function getLocalIPv4(): string {
  return getAllLocalIPv4s()[0] ?? '127.0.0.1';
}

const ALLOWED_REMOTE_ACTIONS = new Set<RemoteCommandMessage['action']>([
  'NEXT',
  'PREV',
  'SELECT_BLOCK',
  'SELECT_ITEM',
  'TOGGLE_BLACKOUT',
  'TOGGLE_CLEAR_TEXT',
  'TOGGLE_LOGO',
  'CLEAR_OVERRIDE',
  'AUDIO_TOGGLE_PLAY',
  'AUDIO_STOP',
  'AUDIO_RESTART',
  'AUDIO_SET_VOLUME',
  'TOGGLE_RETURN_AUDIO'
]);

interface StoredWhitelistRecord extends WhitelistedDevice {
  tokenHash: string;
}

/**
 * Built-in Local Network HTTP + WebSocket server for Browser & Android Remote Viewers.
 */
export class LocalRemoteServer {
  private server: http.Server | null = null;
  private wss: WebSocketServer | null = null;
  private discoverySocket: dgram.Socket | null = null;
  private currentState: LiveState | null = null;
  private lastBroadcastAtMs = 0;
  private lastStructuralKey = '';
  private lastAudioTimeSec: number | undefined = undefined;
  private lastActiveBlockIndex = -1;
  private authenticatedClients = new WeakSet<WebSocket>();
  private clientDeviceIds = new WeakMap<WebSocket, string>();
  private viewerSockets = new Map<string, WebSocket>();
  private socketViewerIds = new WeakMap<WebSocket, string>();
  private whitelist: StoredWhitelistRecord[] = [];
  private whitelistPath: string;
  private pin: string;
  private pinPath: string;
  private port: number;
  private distDir: string;
  private mediaDir: string;
  private isDev: boolean;
  private onClientCountChange?: (count: number) => void;
  private onRemoteCommand?: (cmd: RemoteCommandMessage) => void;
  private onWhitelistChange?: (devices: WhitelistedDevice[]) => void;
  private onParticipantSignal?: (msg: ParticipantSignalMessage) => void;

  constructor(options: {
    port?: number;
    distDir: string;
    mediaDir?: string;
    whitelistPath?: string;
    isDev: boolean;
    onClientCountChange?: (count: number) => void;
    onRemoteCommand?: (cmd: RemoteCommandMessage) => void;
    onWhitelistChange?: (devices: WhitelistedDevice[]) => void;
    onParticipantSignal?: (msg: ParticipantSignalMessage) => void;
  }) {
    this.port = options.port ?? 4850;
    this.distDir = options.distDir;
    this.mediaDir = options.mediaDir ?? path.join(os.tmpdir(), 'uecfi-presenter-media');
    fs.mkdirSync(this.mediaDir, { recursive: true });
    this.whitelistPath =
      options.whitelistPath ?? path.join(path.dirname(this.mediaDir), 'whitelisted-devices.json');
    this.pinPath = path.join(path.dirname(this.whitelistPath), 'remote-pin.json');
    this.pin = this.loadOrCreatePin();
    this.whitelist = this.loadWhitelist();
    this.isDev = options.isDev;
    this.onClientCountChange = options.onClientCountChange;
    this.onRemoteCommand = options.onRemoteCommand;
    this.onWhitelistChange = options.onWhitelistChange;
    this.onParticipantSignal = options.onParticipantSignal;
  }

  /**
   * Loads the persisted 6-digit Remote Control PIN, or auto-generates and saves one on first run.
   */
  private loadOrCreatePin(): string {
    try {
      if (fs.existsSync(this.pinPath)) {
        const raw = JSON.parse(fs.readFileSync(this.pinPath, 'utf8')) as { pin?: unknown };
        if (typeof raw?.pin === 'string' && /^\d{6}$/.test(raw.pin)) {
          return raw.pin;
        }
      }
    } catch {
      // Fall through to generate a fresh PIN if file is missing or unreadable
    }
    const freshPin = String(crypto.randomInt(100000, 1000000));
    this.savePin(freshPin);
    return freshPin;
  }

  private savePin(pin: string) {
    try {
      fs.mkdirSync(path.dirname(this.pinPath), { recursive: true });
      fs.writeFileSync(this.pinPath, JSON.stringify({ pin }, null, 2), { mode: 0o600 });
    } catch {
      // Ignore persistence errors
    }
  }

  public getConnectionInfo(): {
    port: number;
    localUrl: string;
    wsUrl: string;
    localPin: string;
  } {
    const ip = getLocalIPv4();
    return {
      port: this.port,
      localUrl: this.isDev
        ? `http://${ip}:5173/?view=remote&wsPort=${this.port}&pin=${this.pin}`
        : `http://${ip}:${this.port}/?view=remote&pin=${this.pin}`,
      wsUrl: `ws://${ip}:${this.port}`,
      localPin: this.pin
    };
  }

  /**
   * Manually generates and persists a new 6-digit Remote Control PIN when requested by the operator.
   */
  public regeneratePin(): {
    port: number;
    localUrl: string;
    wsUrl: string;
    localPin: string;
  } {
    let nextPin = String(crypto.randomInt(100000, 1000000));
    if (nextPin === this.pin) {
      nextPin = String(crypto.randomInt(100000, 1000000));
    }
    this.pin = nextPin;
    this.savePin(nextPin);
    return this.getConnectionInfo();
  }

  private loadWhitelist(): StoredWhitelistRecord[] {
    try {
      if (!fs.existsSync(this.whitelistPath)) return [];
      const raw = JSON.parse(fs.readFileSync(this.whitelistPath, 'utf8'));
      if (!Array.isArray(raw)) return [];
      return raw.filter(
        (d): d is StoredWhitelistRecord =>
          Boolean(d && typeof d.id === 'string' && typeof d.tokenHash === 'string')
      );
    } catch {
      return [];
    }
  }

  private saveWhitelist() {
    try {
      fs.mkdirSync(path.dirname(this.whitelistPath), { recursive: true });
      fs.writeFileSync(this.whitelistPath, JSON.stringify(this.whitelist, null, 2), { mode: 0o600 });
    } catch {
      // Ignore persistence errors
    }
  }

  public getWhitelistedDevices(): WhitelistedDevice[] {
    return this.whitelist.map(({ id, name, createdAt, lastSeenAt }) => ({
      id,
      name,
      createdAt,
      lastSeenAt
    }));
  }

  public revokeDevice(deviceId: string): WhitelistedDevice[] {
    const before = this.whitelist.length;
    this.whitelist = this.whitelist.filter((d) => d.id !== deviceId);
    if (this.whitelist.length !== before) {
      this.saveWhitelist();
    }

    if (this.wss) {
      for (const client of this.wss.clients) {
        if (this.clientDeviceIds.get(client) === deviceId) {
          this.authenticatedClients.delete(client);
          this.clientDeviceIds.delete(client);
          if (client.readyState === WebSocket.OPEN) {
            client.send(
              JSON.stringify({
                type: 'AUTH_REQUIRED',
                revoked: true,
                error: 'Device access was revoked. Enter PIN to re-pair.'
              })
            );
          }
        }
      }
    }

    const list = this.getWhitelistedDevices();
    this.onWhitelistChange?.(list);
    return list;
  }

  private hashToken(token: string): string {
    return crypto.createHash('sha256').update(token).digest('hex');
  }

  private issueDeviceToken(deviceName?: string): { deviceId: string; deviceToken: string } {
    const deviceId = crypto.randomUUID();
    const deviceToken = crypto.randomBytes(32).toString('hex');
    const now = Date.now();
    const cleanName =
      typeof deviceName === 'string' && deviceName.trim()
        ? deviceName.trim().slice(0, 60)
        : 'Remote Device';
    this.whitelist.push({
      id: deviceId,
      name: cleanName,
      tokenHash: this.hashToken(deviceToken),
      createdAt: now,
      lastSeenAt: now
    });
    this.saveWhitelist();
    this.onWhitelistChange?.(this.getWhitelistedDevices());
    return { deviceId, deviceToken };
  }

  private verifyDeviceToken(candidate: unknown, deviceName?: string): StoredWhitelistRecord | null {
    if (typeof candidate !== 'string') return null;
    const trimmed = candidate.trim();
    if (!trimmed) return null;
    const candidateBuf = Buffer.from(this.hashToken(trimmed), 'hex');
    for (const record of this.whitelist) {
      try {
        const storedBuf = Buffer.from(record.tokenHash, 'hex');
        if (
          storedBuf.length === candidateBuf.length &&
          crypto.timingSafeEqual(storedBuf, candidateBuf)
        ) {
          record.lastSeenAt = Date.now();
          if (typeof deviceName === 'string' && deviceName.trim()) {
            record.name = deviceName.trim().slice(0, 60);
          }
          this.saveWhitelist();
          this.onWhitelistChange?.(this.getWhitelistedDevices());
          return record;
        }
      } catch {
        // Ignore malformed record
      }
    }
    return null;
  }

  public saveMediaFile(name: string, data: Uint8Array): { fileName: string; url: string } {
    if (!(data instanceof Uint8Array) || data.byteLength === 0) {
      throw new Error('Media file is empty or invalid.');
    }
    if (data.byteLength > MAX_MEDIA_FILE_BYTES) {
      throw new Error(`Media file exceeds ${MAX_MEDIA_FILE_BYTES / (1024 * 1024)} MB limit.`);
    }
    const rawExt = path.extname(String(name ?? '')).toLowerCase().replace(/[^a-z0-9.]/g, '');
    if (!ALLOWED_MEDIA_EXTENSIONS.has(rawExt)) {
      throw new Error(`Unsupported media file type: ${rawExt || '(none)'}`);
    }
    // Normalize Windows browser .jfif JPEG files to .jpg for universal browser/Android support
    const ext = rawExt === '.jfif' ? '.jpg' : rawExt;
    const hash = crypto.createHash('sha1').update(data).digest('hex');
    const fileName = `${hash}${ext}`;
    const targetPath = path.join(this.mediaDir, fileName);
    if (!fs.existsSync(targetPath)) {
      fs.writeFileSync(targetPath, data);
    } else {
      const now = new Date();
      fs.utimesSync(targetPath, now, now);
    }
    return {
      fileName,
      url: `uecfi-media://local/${fileName}`
    };
  }

  public listMediaImages(): Array<{ fileName: string; url: string; mtimeMs: number }> {
    try {
      const entries = fs.readdirSync(this.mediaDir, { withFileTypes: true });
      const items: Array<{ fileName: string; url: string; mtimeMs: number }> = [];
      for (const entry of entries) {
        if (!entry.isFile()) continue;
        const ext = path.extname(entry.name).toLowerCase();
        if (!IMAGE_MEDIA_EXTENSIONS.has(ext)) continue;
        const fullPath = path.join(this.mediaDir, entry.name);
        const stat = fs.statSync(fullPath);
        items.push({
          fileName: entry.name,
          url: `uecfi-media://local/${entry.name}`,
          mtimeMs: stat.mtimeMs
        });
      }
      items.sort((a, b) => b.mtimeMs - a.mtimeMs);
      return items;
    } catch {
      return [];
    }
  }

  public deleteMediaFile(fileName: string): boolean {
    const safeName = path.basename(String(fileName ?? ''));
    if (!safeName || safeName !== fileName) return false;
    const targetPath = path.join(this.mediaDir, safeName);
    if (!fs.existsSync(targetPath)) return false;
    fs.unlinkSync(targetPath);
    return true;
  }

  private verifyPin(candidate: unknown): boolean {
    if (typeof candidate !== 'string') return false;
    const trimmed = candidate.trim();
    if (trimmed.length !== this.pin.length) return false;
    return crypto.timingSafeEqual(Buffer.from(trimmed), Buffer.from(this.pin));
  }

  private isAllowedWsOrigin(originHeader: string | undefined): boolean {
    // Native clients (e.g. Android OkHttp) do not send an Origin header.
    if (!originHeader) return true;
    try {
      const originUrl = new URL(originHeader);
      const allowedHosts = new Set(['localhost', '127.0.0.1', ...getAllLocalIPv4s()]);
      if (!allowedHosts.has(originUrl.hostname)) return false;
      const originPort = originUrl.port || (originUrl.protocol === 'https:' ? '443' : '80');
      const allowedPorts = new Set([String(this.port), ...(this.isDev ? ['5173'] : [])]);
      return allowedPorts.has(originPort);
    } catch {
      return false;
    }
  }

  private getAllWsClients(): WebSocket[] {
    return this.wss ? Array.from(this.wss.clients) : [];
  }

  public sendParticipantSignalFromDesktop(msg: ParticipantSignalMessage) {
    const raw = JSON.stringify(msg);
    if (msg.type === 'PARTICIPANT_STATE') {
      for (const client of this.getAllWsClients()) {
        if (client.readyState === WebSocket.OPEN) {
          client.send(raw);
        }
      }
      return;
    }

    if (msg.type === 'RTC_OFFER' || msg.type === 'RTC_ANSWER' || msg.type === 'RTC_ICE') {
      const viewerWs = this.viewerSockets.get(msg.toId);
      if (viewerWs && viewerWs.readyState === WebSocket.OPEN) {
        viewerWs.send(raw);
      }
    }
  }

  private attachWsHandlers(wss: WebSocketServer) {
    wss.on('connection', (ws: WebSocket, req) => {
      // Allow optional ?pin=... query param on WS handshake
      try {
        const wsReqUrl = new URL(req.url ?? '/', `http://localhost:${this.port}`);
        if (this.verifyPin(wsReqUrl.searchParams.get('pin'))) {
          this.authenticatedClients.add(ws);
        }
      } catch {
        // Ignore malformed request URL
      }

      // Send current live state immediately on connect (view-only is allowed without PIN)
      if (this.currentState) {
        ws.send(JSON.stringify({ type: 'LIVE_STATE', payload: this.currentState }));
      }
      ws.send(
        JSON.stringify({
          type: 'AUTH_RESULT',
          ok: this.authenticatedClients.has(ws)
        })
      );
      this.notifyClientCount();

      ws.on('message', (raw) => {
        try {
          const parsed = JSON.parse(raw.toString()) as {
            type?: string;
            pin?: string;
            token?: string;
            rememberDevice?: boolean;
            deviceName?: string;
            action?: RemoteCommandMessage['action'];
            blockIndex?: number;
            itemId?: string;
            volume?: number;
            name?: string;
            audioEnabled?: boolean;
            videoEnabled?: boolean;
            participantId?: string;
            viewerId?: string;
            fromId?: string;
            toId?: string;
            sdp?: unknown;
            candidate?: unknown;
          };

          if (parsed.type === 'RTC_SUBSCRIBE' && typeof parsed.viewerId === 'string' && typeof parsed.participantId === 'string') {
            this.viewerSockets.set(parsed.viewerId, ws);
            this.socketViewerIds.set(ws, parsed.viewerId);
            this.onParticipantSignal?.({
              type: 'RTC_SUBSCRIBE',
              viewerId: parsed.viewerId,
              participantId: parsed.participantId
            });
            return;
          }

          if (
            (parsed.type === 'RTC_OFFER' || parsed.type === 'RTC_ANSWER' || parsed.type === 'RTC_ICE') &&
            typeof parsed.fromId === 'string' &&
            typeof parsed.toId === 'string'
          ) {
            const signalMsg = parsed as unknown as ParticipantSignalMessage;
            const viewerWs = this.viewerSockets.get(parsed.toId);
            if (viewerWs && viewerWs.readyState === WebSocket.OPEN) {
              viewerWs.send(raw.toString());
            } else {
              this.onParticipantSignal?.(signalMsg);
            }
            return;
          }

          if (parsed.type === 'AUTH') {
            if (parsed.token) {
              const matched = this.verifyDeviceToken(parsed.token, parsed.deviceName);
              if (matched) {
                this.authenticatedClients.add(ws);
                this.clientDeviceIds.set(ws, matched.id);
                ws.send(
                  JSON.stringify({
                    type: 'AUTH_RESULT',
                    ok: true,
                    deviceId: matched.id
                  })
                );
              } else {
                ws.send(
                  JSON.stringify({
                    type: 'AUTH_RESULT',
                    ok: false,
                    revoked: true,
                    error: 'Device access was revoked or invalid. Enter PIN to re-pair.'
                  })
                );
              }
              return;
            }

            const ok = this.verifyPin(parsed.pin);
            if (ok) {
              this.authenticatedClients.add(ws);
              const issued = parsed.rememberDevice
                ? this.issueDeviceToken(parsed.deviceName)
                : null;
              if (issued) {
                this.clientDeviceIds.set(ws, issued.deviceId);
              }
              ws.send(
                JSON.stringify({
                  type: 'AUTH_RESULT',
                  ok: true,
                  ...(issued ?? {})
                })
              );
            } else {
              ws.send(
                JSON.stringify({
                  type: 'AUTH_RESULT',
                  ok: false,
                  error: 'Invalid PIN'
                })
              );
            }
            return;
          }
          if (
            parsed.type === 'REMOTE_CMD' &&
            parsed.action &&
            ALLOWED_REMOTE_ACTIONS.has(parsed.action) &&
            this.onRemoteCommand
          ) {
            if (!this.authenticatedClients.has(ws)) {
              const matched = parsed.token
                ? this.verifyDeviceToken(parsed.token, parsed.deviceName)
                : null;
              if (matched) {
                this.authenticatedClients.add(ws);
                this.clientDeviceIds.set(ws, matched.id);
                ws.send(
                  JSON.stringify({ type: 'AUTH_RESULT', ok: true, deviceId: matched.id })
                );
              } else if (this.verifyPin(parsed.pin)) {
                this.authenticatedClients.add(ws);
                ws.send(JSON.stringify({ type: 'AUTH_RESULT', ok: true }));
              } else {
                ws.send(
                  JSON.stringify({
                    type: 'AUTH_REQUIRED',
                    error: 'PIN required to control presenter'
                  })
                );
                return;
              }
            }
            this.onRemoteCommand({
              action: parsed.action,
              blockIndex: parsed.blockIndex,
              itemId: parsed.itemId,
              volume: parsed.volume
            });
          }
        } catch {
          // Ignore malformed messages from clients
        }
      });

      ws.on('close', () => {
        const vid = this.socketViewerIds.get(ws);
        if (vid) {
          this.viewerSockets.delete(vid);
          this.socketViewerIds.delete(ws);
        }
        this.notifyClientCount();
      });
    });
  }

  public start(): Promise<{ port: number; localUrl: string; wsUrl: string; localPin: string }> {
    return new Promise((resolve, reject) => {
      this.server = http.createServer((req, res) => {
        this.handleHttpRequest(req, res);
      });
      // Disable Nagle's algorithm so small WS control/state frames flush immediately.
      this.server.on('connection', (socket) => {
        socket.setNoDelay(true);
      });

      this.wss = new WebSocketServer({
        server: this.server,
        verifyClient: (info, done) => {
          if (!this.isAllowedWsOrigin(info.origin)) {
            done(false, 403, 'Forbidden origin');
            return;
          }
          done(true);
        }
      });
      this.attachWsHandlers(this.wss);

      const candidatePorts = Array.from(new Set([this.port, 4852, 4853, 4854, 4855, 4856, 0]));
      let attemptIdx = 0;

      const tryListen = () => {
        if (!this.server) return;
        const portToTry = candidatePorts[attemptIdx];
        this.server.listen(portToTry, '0.0.0.0');
      };

      this.server.on('error', (err: NodeJS.ErrnoException) => {
        if (err.code === 'EADDRINUSE' && attemptIdx + 1 < candidatePorts.length) {
          attemptIdx += 1;
          tryListen();
          return;
        }
        reject(err);
      });

      this.server.on('listening', () => {
        const addr = this.server?.address() as net.AddressInfo | null;
        if (addr && typeof addr.port === 'number') {
          this.port = addr.port;
        }
        this.startUdpDiscovery();
        const ip = getLocalIPv4();
        resolve({
          port: this.port,
          localUrl: this.isDev
            ? `http://${ip}:5173/?view=remote&wsPort=${this.port}&pin=${this.pin}`
            : `http://${ip}:${this.port}/?view=remote&pin=${this.pin}`,
          wsUrl: `ws://${ip}:${this.port}`,
          localPin: this.pin
        });
      });

      tryListen();
    });
  }

  private handleHttpRequest(req: http.IncomingMessage, res: http.ServerResponse) {
    const reqUrl = new URL(req.url ?? '/', `http://localhost:${this.port}`);
    if (reqUrl.pathname === '/api/health') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true, clients: this.getClientCount() }));
      return;
    }

    if (reqUrl.pathname.startsWith('/media/')) {
      const safeFile = path.basename(reqUrl.pathname.slice('/media/'.length));
      const mediaPath = path.join(this.mediaDir, safeFile);
      if (!safeFile || !fs.existsSync(mediaPath) || fs.statSync(mediaPath).isDirectory()) {
        res.writeHead(404);
        res.end('Not Found');
        return;
      }
      const ext = path.extname(mediaPath).toLowerCase();
      if (!ALLOWED_MEDIA_EXTENSIONS.has(ext)) {
        res.writeHead(415);
        res.end('Unsupported Media Type');
        return;
      }
      const contentType = MIME_TYPES[ext] ?? 'application/octet-stream';
      const stat = fs.statSync(mediaPath);
      const rangeHeader = req.headers.range;
      if (rangeHeader) {
        const match = /^bytes=(\d+)-(\d*)$/.exec(rangeHeader);
        if (match) {
          const start = Number(match[1]);
          const end = match[2] ? Math.min(Number(match[2]), stat.size - 1) : stat.size - 1;
          if (
            stat.size === 0 ||
            !Number.isSafeInteger(start) ||
            !Number.isSafeInteger(end) ||
            start < 0 ||
            start >= stat.size ||
            end < start
          ) {
            res.writeHead(416, {
              'Content-Range': `bytes */${stat.size}`,
              'Accept-Ranges': 'bytes'
            });
            res.end();
            return;
          }
          res.writeHead(206, {
            'Access-Control-Allow-Origin': '*',
            'Content-Range': `bytes ${start}-${end}/${stat.size}`,
            'Accept-Ranges': 'bytes',
            'Content-Length': String(end - start + 1),
            'Content-Type': contentType,
            'X-Content-Type-Options': 'nosniff',
            'Cache-Control': 'public, max-age=31536000, immutable'
          });
          fs.createReadStream(mediaPath, { start, end }).pipe(res);
          return;
        }
      }
      res.writeHead(200, {
        'Access-Control-Allow-Origin': '*',
        'Content-Type': contentType,
        'X-Content-Type-Options': 'nosniff',
        'Content-Length': String(stat.size),
        'Accept-Ranges': 'bytes',
        'Cache-Control': 'public, max-age=31536000, immutable'
      });
      fs.createReadStream(mediaPath).pipe(res);
      return;
    }

    const isTls = Boolean((req.socket as { encrypted?: boolean }).encrypted);
    const hasBuiltDist = fs.existsSync(path.join(this.distDir, 'index.html'));
    const isDistAsset =
      reqUrl.pathname.startsWith('/assets/') &&
      fs.existsSync(path.join(this.distDir, reqUrl.pathname));

    const serveBuiltDist =
      !this.isDev ||
      isDistAsset ||
      (isTls && hasBuiltDist) ||
      (reqUrl.searchParams.get('static') === '1' && hasBuiltDist);

    if (!serveBuiltDist) {
      // In dev mode, redirect browser requests to Vite dev server while preserving query params
      const ip = getLocalIPv4();
      const targetUrl = new URL(`http://${ip}:5173/`);
      reqUrl.searchParams.forEach((value, key) => targetUrl.searchParams.set(key, value));
      if (!targetUrl.searchParams.has('view')) {
        targetUrl.searchParams.set('view', 'remote');
      }
      targetUrl.searchParams.set('wsPort', String(this.port));
      res.writeHead(302, {
        Location: targetUrl.toString()
      });
      res.end();
      return;
    }

    // Default root requests on the LAN HTTP/HTTPS server to ?view=remote (unless ?view=participant) so browsers never land on OperatorConsole.
    const requestedView = reqUrl.searchParams.get('view');
    if (reqUrl.pathname === '/' && requestedView !== 'remote' && requestedView !== 'participant') {
      const redirectParams = new URLSearchParams(reqUrl.searchParams);
      redirectParams.set('view', 'remote');
      res.writeHead(302, { Location: `/?${redirectParams.toString()}` });
      res.end();
      return;
    }

    // Serve static SPA from distDir with explicit containment check to prevent path traversal on all OSes
    const resolvedDistDir = path.resolve(this.distDir);
    const requestedRelPath = reqUrl.pathname === '/' ? 'index.html' : reqUrl.pathname.replace(/^\/+/, '');
    let filePath = path.resolve(resolvedDistDir, requestedRelPath);
    const isInsideDist =
      filePath === resolvedDistDir || filePath.startsWith(resolvedDistDir + path.sep);
    if (!isInsideDist || !fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
      filePath = path.join(resolvedDistDir, 'index.html');
    }

    const ext = path.extname(filePath).toLowerCase();
    const contentType = MIME_TYPES[ext] ?? 'application/octet-stream';
    fs.readFile(filePath, (err, content) => {
      if (err) {
        res.writeHead(500);
        res.end('Internal Server Error');
        return;
      }
      // Prevent WebView from caching index.html across rebuilds so it always loads the latest hashed JS bundle.
      res.writeHead(200, {
        'Content-Type': contentType,
        ...(ext === '.html' ? { 'Cache-Control': 'no-cache, no-store, must-revalidate' } : {})
      });
      res.end(content);
    });
  }

  /**
   * Rewrites desktop media URLs (`uecfi-media://local/...` or `http://127.0.0.1:<port>/media/...`)
   * to the desktop's LAN HTTP media endpoint so mobile & remote viewers can fetch media assets.
   */
  private rewriteLocalMediaUrl(rawUrl: string | undefined): string | undefined {
    if (!rawUrl) return rawUrl;

    const lanPrefix = `http://${getLocalIPv4()}:${this.port}/media/`;
    return rawUrl
      .replaceAll('uecfi-media://local/', lanPrefix)
      .replace(/http:\/\/127\.0\.0\.1:\d+\/media\//g, lanPrefix);
  }

  /**
   * Strips desktop-only audio fields and rewrites local media URLs to the LAN IP
   * before broadcasting an item over WebSocket.
   */
  private externalizeMediaInItem(item: LiveState['activeItem']): LiveState['activeItem'] {
    if (!item) return item;
    return {
      ...item,
      // Remote viewers and the Main Screen never play audio.
      audioUrl: undefined,
      audioFileName: undefined,
      themeBackground: this.rewriteLocalMediaUrl(item.themeBackground),
      verseStackedThemeBackground: this.rewriteLocalMediaUrl(item.verseStackedThemeBackground),
      blocks: item.blocks.map((block) => ({
        ...block,
        background: this.rewriteLocalMediaUrl(block.background),
        ...(block.canvasElements
          ? {
              canvasElements: block.canvasElements.map((el) => ({
                ...el,
                imageSrc: this.rewriteLocalMediaUrl(el.imageSrc),
                modelSrc: this.rewriteLocalMediaUrl(el.modelSrc)
              }))
            }
          : {})
      }))
    };
  }

  public broadcastTimeSync(timeSec: number | undefined, activeBlockIndex: number) {
    const now = Date.now();
    const blockChanged = activeBlockIndex !== this.lastActiveBlockIndex;
    const timeChanged = timeSec !== this.lastAudioTimeSec;
    if (!blockChanged && !timeChanged) return;
    if (!blockChanged && now - this.lastBroadcastAtMs < 100) return;

    this.lastAudioTimeSec = timeSec;
    this.lastActiveBlockIndex = activeBlockIndex;
    this.lastBroadcastAtMs = now;

    if (this.currentState) {
      this.currentState = {
        ...this.currentState,
        audioCurrentTimeSec: timeSec,
        activeBlockIndex
      };
    }

    const tickMsg = JSON.stringify({
      type: 'TIME_SYNC',
      audioCurrentTimeSec: timeSec ?? null,
      activeBlockIndex
    });
    for (const client of this.getAllWsClients()) {
      if (client.readyState === WebSocket.OPEN) {
        client.send(tickMsg);
      }
    }
  }

  public broadcastState(state: LiveState) {
    // In timed lyrics mode, block transitions happen continuously as audio time advances.
    // Excluding activeBlockIndex from structuralKey during timed lyrics avoids re-sending
    // the full LIVE_STATE payload on every lyric line/block change; instead, activeBlockIndex
    // is piggybacked onto the lightweight TIME_SYNC frame.
    const isTimedSong = state.lyricsMode === 'timed' && state.activeItem?.type === 'song';
    // Serialize all structural/style fields (excluding audioCurrentTimeSec, updatedAt, and
    // timed-song activeBlockIndex) so ANY live customization reflects immediately on all screens.
    const structuralKey = JSON.stringify({
      ...state,
      activeBlockIndex: isTimedSong ? -1 : state.activeBlockIndex,
      audioCurrentTimeSec: undefined,
      updatedAt: undefined
    });

    if (structuralKey === this.lastStructuralKey) {
      this.broadcastTimeSync(state.audioCurrentTimeSec, state.activeBlockIndex);
      return;
    }

    const now = Date.now();

    const slimState: LiveState = {
      ...state,
      protocolVersion: PROTOCOL_VERSION,
      activeItem: this.externalizeMediaInItem(state.activeItem),
      logoSlide: this.externalizeMediaInItem(state.logoSlide ?? null),
      participants: state.participants
        ? {
            ...state.participants,
            studioBackground: this.rewriteLocalMediaUrl(state.participants.studioBackground),
            studioElements: state.participants.studioElements?.map((el) => ({
              ...el,
              imageSrc: this.rewriteLocalMediaUrl(el.imageSrc),
              modelSrc: this.rewriteLocalMediaUrl(el.modelSrc)
            }))
          }
        : undefined,
      overflow: state.overflow
        ? {
            ...state.overflow,
            studioBackground: this.rewriteLocalMediaUrl(state.overflow.studioBackground),
            studioElements: state.overflow.studioElements?.map((el) => ({
              ...el,
              imageSrc: this.rewriteLocalMediaUrl(el.imageSrc),
              modelSrc: this.rewriteLocalMediaUrl(el.modelSrc)
            }))
          }
        : undefined
    };
    this.currentState = slimState;
    this.lastStructuralKey = structuralKey;
    this.lastAudioTimeSec = state.audioCurrentTimeSec;
    this.lastActiveBlockIndex = state.activeBlockIndex;
    this.lastBroadcastAtMs = now;

    const msg = JSON.stringify({ type: 'LIVE_STATE', payload: slimState });
    for (const client of this.getAllWsClients()) {
      if (client.readyState === WebSocket.OPEN) {
        client.send(msg);
      }
    }
  }

  public getClientCount(): number {
    return this.wss ? this.wss.clients.size : 0;
  }

  private notifyClientCount() {
    if (this.onClientCountChange) {
      this.onClientCountChange(this.getClientCount());
    }
  }

  private startUdpDiscovery() {
    try {
      const socket = dgram.createSocket({ type: 'udp4', reuseAddr: true });
      socket.on('error', () => {
        // Discovery is best-effort; never fail the main server if UDP 4851 is unavailable.
      });
      socket.on('message', (msg, rinfo) => {
        if (msg.toString('utf8').trim() !== DISCOVERY_REQUEST) return;
        const ip = getLocalIPv4();
        const payload = JSON.stringify({
          type: 'UECFI_PRESENTER_HERE',
          name: os.hostname(),
          ip,
          wsPort: this.port,
          wsUrl: `ws://${ip}:${this.port}`
        });
        socket.send(payload, rinfo.port, rinfo.address);
      });
      socket.bind(DISCOVERY_PORT, '0.0.0.0', () => {
        socket.setBroadcast(true);
      });
      this.discoverySocket = socket;
    } catch {
      // Ignore UDP discovery startup errors
    }
  }

  public stop() {
    this.discoverySocket?.close();
    this.discoverySocket = null;
    this.wss?.close();
    this.server?.close();
  }
}
