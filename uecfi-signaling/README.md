# UECFI Presenter - WebRTC Signaling & Remote Speaker Portal

A lightweight, high-performance WebRTC signaling server and mobile-friendly **Green Room** portal for **UECFI Presenter**.

Allows remote pastors, elders, and speakers to connect from their smartphone or laptop browser, enter a private **Green Room (Backstage)**, speak privately with the centro operator, and be switched live to the centro projector on cue.

---

## Architecture Overview

* **Host**: The UECFI Presenter desktop software in the centro.
* **Guests**: Remote participants connecting via web browser (iPhone/Safari, Android/Chrome, Mac/PC).
* **Transport**: Direct peer-to-peer WebRTC video/audio stream.
* **Signaling**: Lightweight Node.js WebSocket engine for handshakes, stage tally, and private intercom chat.

---

## Deploying to Render.com (Recommended)

This repository is pre-configured for **1-click automatic deployment** on Render.com free web service tier.

1. **Push to GitHub**:
   Push this folder to your repository:
   ```bash
   git init
   git add .
   git commit -m "Initial commit for UECFI Signaling & Guest Portal"
   git remote add origin https://github.com/allandr-ux/uecfi-signaling.git
   git branch -M main
   git push -u origin main
   ```

2. **Connect to Render.com**:
   * Log into [Render.com](https://dashboard.render.com/).
   * Click **New +** -> **Web Service**.
   * Connect your GitHub repository: `allandr-ux/uecfi-signaling`.
   * Name: `uecfi-signaling` (URL will be `https://uecfi-signaling.onrender.com`).
   * Environment: `Node`.
   * Build Command: `npm install`.
   * Start Command: `npm start`.
   * Plan: `Free`.
   * Click **Create Web Service**.

---

## Deploying on Other Environments

### A. NGINX Reverse Proxy (Ubuntu / VPS)
Place this block inside your NGINX server configuration:

```nginx
server {
    listen 80;
    server_name signaling.yourchurch.org;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        
        # Crucial for WebSocket /ws connection
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
        
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

### B. Apache Reverse Proxy (with `mod_proxy_wstunnel`)
Ensure `proxy`, `proxy_http`, and `proxy_wstunnel` modules are enabled:

```apache
<VirtualHost *:80>
    ServerName signaling.yourchurch.org

    # WebSocket upgrade path
    ProxyPass /ws ws://127.0.0.1:3000/ws
    ProxyPassReverse /ws ws://127.0.0.1:3000/ws

    # Standard HTTP traffic
    ProxyPass / http://127.0.0.1:3000/
    ProxyPassReverse / http://127.0.0.1:3000/
</VirtualHost>
```

### C. cPanel (Setup Node.js App)
1. Open **Setup Node.js App** in cPanel.
2. Click **Create Application**.
3. Set **Node.js version** to 18.x or 20.x.
4. Set **Application root** to the directory where these files are uploaded.
5. Set **Application startup file** to `server.js`.
6. Click **Run NPM Install** then **Start App**.

---

## Running Locally for Development

```bash
cd uecfi-signaling
npm install
npm start
```

* **Guest Portal**: Open [http://localhost:3000](http://localhost:3000)
* **WebSocket Path**: `ws://localhost:3000/ws`
* **Direct Invite Links**: You can pre-populate the join form with query parameters:
  `http://localhost:3000/?room=centro&key=1234&name=Pastor%20John`

---

## Protocol Specification

| Message Type | Direction | Payload Description |
| :--- | :--- | :--- |
| `join-host` | Host -> Server | `{ type: 'join-host', roomId, secretKey }` |
| `join-guest` | Guest -> Server | `{ type: 'join-guest', roomId, secretKey, guestName, guestId }` |
| `sdp-offer` | Guest <-> Host | WebRTC Session Description Offer |
| `sdp-answer` | Host <-> Guest | WebRTC Session Description Answer |
| `ice-candidate` | Guest <-> Host | ICE Candidate routing for NAT traversal |
| `set-stage-status` | Host -> Server | `{ type: 'set-stage-status', targetGuestId, onStage: true/false }` |
| `stage-status-changed` | Server -> Guest | Tells guest whether they are Backstage or Live |
| `intercom-chat` | Host <-> Guest | Private two-way text chat with operator |
| `program-update` | Host -> Guests | Live title/verse display on guest confidence monitor |
